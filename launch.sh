#!/bin/sh
# Open the account-backed planner in an ordinary desktop window.
URL='https://ssuheyyo.github.io/piksel-defter/'
for browser in chromium google-chrome chromium-browser; do
  if command -v "$browser" >/dev/null 2>&1; then
    exec "$browser" --app="$URL" --window-size=1160,800 --no-first-run
  fi
done
exec xdg-open "$URL"
