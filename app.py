#!/usr/bin/env python3
"""Piksel Defter: local desktop planner and optional WebDAV sync."""
import base64
import json
import os
import secrets
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get("PIKSEL_DEFTER_DATA", Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "piksel-defter"))
DATA.mkdir(parents=True, exist_ok=True)
try:
    DATA.chmod(0o700)
except OSError:
    pass
DB = DATA / "planner.sqlite3"
TOKEN = secrets.token_urlsafe(32)
KINDS = {"task", "event", "habit", "habitlog", "note", "drawing", "focus", "taskcheck"}
MAX_BODY = 8 * 1024 * 1024


def db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, updated REAL NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)")
    conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS reminders (id TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY(id,date))")
    conn.commit()
    try:
        DB.chmod(0o600)
    except OSError:
        pass
    return conn


def all_items(include_deleted=False):
    with db() as conn:
        rows = conn.execute("SELECT id,kind,payload,updated,deleted FROM items" + ("" if include_deleted else " WHERE deleted=0")).fetchall()
    return [{"id": r["id"], "kind": r["kind"], "data": json.loads(r["payload"]), "updated": r["updated"], "deleted": bool(r["deleted"])} for r in rows]


def settings(public=True):
    with db() as conn:
        result = {r["key"]: json.loads(r["value"]) for r in conn.execute("SELECT key,value FROM settings")}
    if public:
        result.pop("sync_password", None)
        result["has_sync_password"] = bool(settings(False).get("sync_password"))
    return result


def portable_settings():
    return {k: v for k, v in settings(False).items() if k in {"display_name", "focus_minutes", "break_minutes", "theme", "motion"} or (k.startswith("mood_") and len(k) == 15)}


def merge_settings(incoming, overwrite=False):
    if not isinstance(incoming, dict):
        return
    with db() as conn:
        for key, value in incoming.items():
            if (key in {"display_name", "focus_minutes", "break_minutes", "theme", "motion"} or (key.startswith("mood_") and len(key) == 15)) and isinstance(value, (str, int, bool)):
                sql = "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value" if overwrite else "INSERT OR IGNORE INTO settings VALUES (?,?)"
                conn.execute(sql, (key, json.dumps(value, ensure_ascii=False)))


def save_item(item):
    ident = item.get("id") or secrets.token_hex(12)
    kind = item.get("kind")
    data = item.get("data")
    if not isinstance(ident, str) or len(ident) > 100 or kind not in KINDS or not isinstance(data, dict):
        raise ValueError("Geçersiz kayıt")
    if len(json.dumps(data, ensure_ascii=False)) > 100000:
        raise ValueError("Kayıt çok büyük")
    now = time.time()
    with db() as conn:
        conn.execute("INSERT INTO items VALUES (?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,payload=excluded.payload,updated=excluded.updated,deleted=0", (ident, kind, json.dumps(data, ensure_ascii=False), now))
    return {"id": ident, "kind": kind, "data": data, "updated": now, "deleted": False}


def delete_item(ident):
    with db() as conn:
        row = conn.execute("SELECT id FROM items WHERE id=?", (ident,)).fetchone()
        if row:
            conn.execute("UPDATE items SET deleted=1,updated=? WHERE id=?", (time.time(), ident))


def merge_items(incoming):
    if not isinstance(incoming, list) or len(incoming) > 100000:
        raise ValueError("Geçersiz yedek")
    changed = 0
    with db() as conn:
        for item in incoming:
            if not isinstance(item, dict) or item.get("kind") not in KINDS or not isinstance(item.get("data"), dict):
                continue
            ident = item.get("id")
            if not isinstance(ident, str) or len(ident) > 100:
                continue
            try:
                updated = float(item.get("updated", 0))
            except (TypeError, ValueError):
                continue
            row = conn.execute("SELECT updated FROM items WHERE id=?", (ident,)).fetchone()
            if row is None or updated > row["updated"]:
                conn.execute("INSERT INTO items VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,payload=excluded.payload,updated=excluded.updated,deleted=excluded.deleted", (ident, item["kind"], json.dumps(item["data"], ensure_ascii=False), updated, int(bool(item.get("deleted")))))
                changed += 1
    return changed


def sync_webdav():
    cfg = settings(False)
    url = cfg.get("sync_url", "").strip()
    if not url.startswith("https://"):
        raise ValueError("Eşitleme için HTTPS WebDAV adresi girin")
    parsed = urlparse(url)
    if not parsed.netloc or parsed.username or parsed.password or parsed.fragment:
        raise ValueError("WebDAV adresi geçersiz")
    auth = base64.b64encode((cfg.get("sync_user", "") + ":" + cfg.get("sync_password", "")).encode()).decode()
    headers = {"Authorization": "Basic " + auth, "User-Agent": "PikselDefter/1.0"}
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as response:
            remote = json.loads(response.read(MAX_BODY + 1))
        if not isinstance(remote, dict) or remote.get("format") != "piksel-defter-1":
            raise ValueError("Uzak dosyanın biçimi tanınmadı")
        merged = merge_items(remote.get("items"))
        merge_settings(remote.get("settings"))
    except urllib.error.HTTPError as error:
        if error.code == 404:
            merged = 0
        else:
            raise ValueError("WebDAV sunucusu: HTTP " + str(error.code)) from error
    payload = json.dumps({"format": "piksel-defter-1", "items": all_items(True), "settings": portable_settings()}, ensure_ascii=False).encode()
    req = urllib.request.Request(url, data=payload, method="PUT", headers={**headers, "Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=20):
            pass
    except urllib.error.HTTPError as error:
        raise ValueError("WebDAV yüklemesi: HTTP " + str(error.code)) from error
    return merged


def notify_due():
    """Show an OS reminder for scheduled items while the app is open."""
    now = datetime.now()
    today = now.date().isoformat()
    for item in all_items():
        if item["kind"] not in ("task", "event"):
            continue
        data = item["data"]
        if not data.get("reminder") or not data.get("time") or not data.get("date"):
            continue
        date = data["date"]
        repeat = data.get("repeat", "none")
        if repeat == "daily" and date <= today:
            date = today
        elif repeat == "weekly" and date <= today and datetime.fromisoformat(date).weekday() == now.weekday():
            date = today
        elif repeat == "monthly" and date <= today and int(date[-2:]) == now.day:
            date = today
        if date != today:
            continue
        if item["kind"] == "task":
            if repeat == "none" and data.get("done"):
                continue
            if repeat != "none" and any(x["kind"] == "taskcheck" and x["data"].get("taskId") == item["id"] and x["data"].get("date") == date and x["data"].get("done") for x in all_items()):
                continue
        due = datetime.fromisoformat(date + "T" + data["time"])
        lead = int(data.get("reminder", 0))
        if not (due - timedelta(minutes=lead) <= now <= due + timedelta(minutes=1)):
            continue
        with db() as conn:
            try:
                conn.execute("INSERT INTO reminders VALUES (?,?)", (item["id"], date))
            except sqlite3.IntegrityError:
                continue
        try:
            subprocess.Popen(["notify-send", "Piksel Defter ✿", data.get("title", "Plan zamanı")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except FileNotFoundError:
            pass


def reminder_loop():
    while True:
        try:
            notify_due()
        except (ValueError, TypeError, OSError):
            pass
        time.sleep(20)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, status, obj):
        raw = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(raw)

    def allowed(self):
        return self.headers.get("Host", "").split(":")[0] in ("127.0.0.1", "localhost") and self.headers.get("X-Planner-Token") == TOKEN

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/"):
            if not self.allowed():
                return self.reply(403, {"error": "Erişim reddedildi"})
            if path == "/api/items":
                return self.reply(200, {"items": all_items()})
            if path == "/api/settings":
                return self.reply(200, {"settings": settings()})
            if path == "/api/export":
                return self.reply(200, {"format": "piksel-defter-1", "exported": datetime.now(timezone.utc).isoformat(), "items": all_items(True), "settings": portable_settings()})
            return self.reply(404, {"error": "Bulunamadı"})
        file = {"/": "index.html", "/index.html": "index.html", "/style.css": "style.css", "/app.js": "app.js", "/cloud.js": "cloud.js", "/cloud-config.js": "cloud-config.js", "/manifest.webmanifest": "manifest.webmanifest", "/icon.svg": "icon.svg", "/apple-touch-icon.png": "apple-touch-icon.png", "/icon-192.png": "icon-192.png", "/icon-512.png": "icon-512.png", "/landscape-red-hd.png": "landscape-red-hd.png", "/landscape-blue-hd.png": "landscape-blue-hd.png", "/landscape-green-hd.png": "landscape-green-hd.png"}.get(path)
        if not file:
            self.send_error(404)
            return
        raw = (ROOT / file).read_bytes()
        mime = "text/html" if file.endswith("html") else "text/css" if file.endswith("css") else "application/javascript" if file.endswith("js") else "application/manifest+json" if file.endswith("webmanifest") else "image/png" if file.endswith("png") else "image/svg+xml"
        self.send_response(200)
        self.send_header("Content-Type", mime + "; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        if not self.allowed():
            return self.reply(403, {"error": "Erişim reddedildi"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 0 or size > MAX_BODY:
                raise ValueError("Dosya çok büyük")
            body = json.loads(self.rfile.read(size))
            if self.path == "/api/item":
                return self.reply(200, {"item": save_item(body)})
            if self.path == "/api/delete":
                delete_item(body.get("id", ""))
                return self.reply(200, {"ok": True})
            if self.path == "/api/settings":
                allowed = {"theme", "motion", "display_name", "week_start", "sync_url", "sync_user", "sync_password", "focus_minutes", "break_minutes", "accent"}
                with db() as conn:
                    for key, value in body.items():
                        if (key in allowed or (key.startswith("mood_") and len(key) == 15)) and isinstance(value, (str, int, bool)) and len(str(value)) < 2048:
                            conn.execute("INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, json.dumps(value, ensure_ascii=False)))
                return self.reply(200, {"settings": settings()})
            if self.path == "/api/import":
                if body.get("format") != "piksel-defter-1":
                    raise ValueError("Bu dosya Piksel Defter yedeği değil")
                merged = merge_items(body.get("items"))
                merge_settings(body.get("settings"), overwrite=True)
                return self.reply(200, {"merged": merged})
            if self.path == "/api/sync":
                return self.reply(200, {"merged": sync_webdav()})
            return self.reply(404, {"error": "Bulunamadı"})
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            return self.reply(400, {"error": str(error)})
        except (urllib.error.URLError, TimeoutError) as error:
            return self.reply(502, {"error": "Eşitleme bağlantısı kurulamadı: " + str(error.reason if hasattr(error, "reason") else error)})


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/?token={TOKEN}"
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    threading.Thread(target=reminder_loop, daemon=True).start()
    chrome = next((p for p in ("/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/chromium-browser") if Path(p).exists()), None)
    try:
        if chrome:
            # Each launch gets its own short-lived browser profile. Planner data lives in SQLite.
            # A shared profile can make Chromium hand the URL to an older process and exit early.
            with tempfile.TemporaryDirectory(prefix="browser-session-", dir=DATA) as profile:
                subprocess.run([chrome, f"--app={url}", "--window-size=1160,800", f"--user-data-dir={profile}", "--no-first-run", "--disable-background-mode", "--disable-features=TranslateUI"], check=False)
        else:
            print("Tarayıcıda açın:", url)
            webbrowser.open(url)
            while True:
                time.sleep(10)
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
