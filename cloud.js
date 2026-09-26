/* Browser edition: Supabase Auth + per-user Postgres data. No private key belongs here. */
(() => {
  if (new URLSearchParams(location.search).has('token')) return;

  const config = window.PIKSEL_CLOUD || {};
  const base = String(config.url || '').replace(/\/$/, '');
  const key = String(config.publishableKey || '');
  const gate = document.getElementById('cloudGate');
  const accountButton = document.getElementById('accountBtn');
  const sessionKey = 'piksel-defter-session-v1';
  const portableKeys = new Set(['display_name', 'focus_minutes', 'break_minutes', 'theme', 'motion', 'week_start', 'accent']);
  const kinds = new Set(['task', 'event', 'habit', 'habitlog', 'note', 'drawing', 'focus', 'taskcheck']);
  let session = null;
  let refreshing = null;
  let lastLoaded = 0;

  function showGate(markup) {
    gate.hidden = false;
    document.body.classList.add('cloud-locked');
    gate.innerHTML = markup;
  }
  function hideGate() {
    gate.hidden = true;
    gate.innerHTML = '';
    document.body.classList.remove('cloud-locked');
  }
  function message(error) {
    const text = error?.message || error?.msg || error?.error_description || error?.error || 'Bağlantı kurulamadı.';
    const known = {
      'Invalid login credentials': 'E-posta veya parola hatalı.',
      'Email not confirmed': 'Önce e-postana gelen doğrulama bağlantısını aç.',
      'User already registered': 'Bu e-posta zaten kayıtlı. Giriş yapabilirsin.',
      'Failed to fetch': 'İnternet bağlantını kontrol et ve tekrar dene.'
    };
    return known[text] || text;
  }
  function validConfig() {
    try {
      const url = new URL(base);
      return url.protocol === 'https:' && /^sb_publishable_[\w-]+$/.test(key);
    } catch { return false; }
  }
  function saveSession(data) {
    if (!data?.access_token || !data?.refresh_token) throw Error('Oturum açılamadı.');
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
      user: data.user || session?.user || null
    };
    localStorage.setItem(sessionKey, JSON.stringify(session));
  }
  function forgetSession() {
    session = null;
    localStorage.removeItem(sessionKey);
    window.cloudApi = null;
    accountButton.hidden = true;
    window.state.items = [];
    window.state.settings = {};
  }
  async function rawRequest(path, {method = 'GET', body, auth = true, headers = {}} = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        apikey: key,
        ...(auth && session?.access_token ? {Authorization: `Bearer ${session.access_token}`} : {}),
        ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store'
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const error = Error(message(data));
      error.status = res.status;
      throw error;
    }
    return data;
  }
  async function refreshSession() {
    if (!session?.refresh_token) throw Error('Oturumun sona erdi. Yeniden giriş yap.');
    if (!refreshing) refreshing = rawRequest('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: {refresh_token: session.refresh_token}, auth: false
    }).then(saveSession).finally(() => { refreshing = null; });
    return refreshing;
  }
  async function request(path, options = {}) {
    if (!session) throw Error('Önce giriş yapmalısın.');
    if (session.expires_at < Date.now() + 60000) await refreshSession();
    try { return await rawRequest(path, options); }
    catch (error) {
      if (error.status !== 401) throw error;
      await refreshSession();
      return rawRequest(path, options);
    }
  }
  async function allRows(table, select = '*', filter = '') {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const part = await request(`/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1000&offset=${offset}${filter}`);
      rows.push(...part);
      if (part.length < 1000) return rows;
    }
  }
  async function items(includeDeleted = false) {
    const rows = await allRows('planner_items', 'id,kind,data,updated,deleted', includeDeleted ? '' : '&deleted=eq.false');
    return rows.map(({id, kind, data, updated, deleted}) => ({id, kind, data, updated, deleted}));
  }
  async function settings() {
    const rows = await allRows('planner_settings', 'key,value');
    return Object.fromEntries(rows.map(row => [row.key, row.value]));
  }
  async function upsert(table, data) {
    return request(`/rest/v1/${table}?on_conflict=user_id,${table === 'planner_items' ? 'id' : 'key'}`, {
      method: 'POST', body: data,
      headers: {Prefer: 'resolution=merge-duplicates,return=representation'}
    });
  }
  async function cloudApi(path, body) {
    const userId = session?.user?.id;
    if (!userId) throw Error('Hesap kimliği bulunamadı. Yeniden giriş yap.');
    switch (path) {
      case 'items': return {items: await items()};
      case 'settings': {
        if (body === undefined) return {settings: await settings()};
        const changes = Object.entries(body).filter(([name, value]) =>
          (portableKeys.has(name) || /^mood_\d{4}-\d{2}-\d{2}$/.test(name)) &&
          ['string', 'number', 'boolean'].includes(typeof value));
        if (changes.length) await upsert('planner_settings', changes.map(([name, value]) => ({user_id: userId, key: name, value})));
        return {settings: await settings()};
      }
      case 'item': {
        const id = body?.id || crypto.randomUUID();
        if (typeof id !== 'string' || id.length > 100 || !kinds.has(body?.kind) ||
            !body?.data || typeof body.data !== 'object' || Array.isArray(body.data) ||
            JSON.stringify(body.data).length > 100000) throw Error('Geçersiz kayıt.');
        const row = {user_id: userId, id, kind: body.kind, data: body.data,
          updated: Date.now() / 1000, deleted: false};
        const saved = await upsert('planner_items', row);
        return {item: saved[0]};
      }
      case 'delete': {
        if (typeof body?.id !== 'string') throw Error('Geçersiz kayıt.');
        await request(`/rest/v1/planner_items?id=eq.${encodeURIComponent(body.id)}`, {
          method: 'PATCH', body: {deleted: true, updated: Date.now() / 1000}
        });
        return {ok: true};
      }
      case 'export': return {
        format: 'piksel-defter-1', exported: new Date().toISOString(),
        items: await items(true), settings: await settings()
      };
      case 'import': {
        if (body?.format !== 'piksel-defter-1' || !Array.isArray(body.items) || body.items.length > 100000)
          throw Error('Yedek dosyası tanınmadı.');
        const existing = new Map((await items(true)).map(item => [item.id, item.updated]));
        const incoming = body.items.filter(item =>
          item && typeof item.id === 'string' && item.id.length <= 100 &&
          kinds.has(item.kind) && item.data && typeof item.data === 'object' &&
          !Array.isArray(item.data) && Number.isFinite(Number(item.updated)) &&
          Number(item.updated) > (existing.get(item.id) ?? -Infinity))
          .map(item => ({user_id: userId, id: item.id, kind: item.kind, data: item.data,
            updated: Number(item.updated), deleted: !!item.deleted}));
        for (let i = 0; i < incoming.length; i += 100) await upsert('planner_items', incoming.slice(i, i + 100));
        const portable = Object.fromEntries(Object.entries(body.settings || {}).filter(([name, value]) =>
          (portableKeys.has(name) || /^mood_\d{4}-\d{2}-\d{2}$/.test(name)) &&
          ['string', 'number', 'boolean'].includes(typeof value)));
        const oldSettings = await settings();
        const missing = Object.entries(portable).filter(([name]) => !(name in oldSettings));
        if (missing.length) await upsert('planner_settings', missing.map(([name, value]) => ({user_id: userId, key: name, value})));
        return {merged: incoming.length};
      }
      default: throw Error('Bilinmeyen işlem.');
    }
  }
  async function reloadPlanner() {
    if (!window.cloudApi) return;
    const [records, prefs] = await Promise.all([cloudApi('items'), cloudApi('settings')]);
    window.state.items = records.items;
    window.state.settings = prefs.settings;
    window.render();
    lastLoaded = Date.now();
  }
  window.refreshCloud = reloadPlanner;

  function authScreen(mode = 'login', notice = '') {
    const signup = mode === 'signup';
    const recovery = mode === 'recovery';
    showGate(`<div class="cloud-card"><img src="icon.svg" alt="" class="cloud-icon"><div class="eyebrow">PİKSEL DEFTER ✿</div>
      <h1>${recovery ? 'Yeni parola' : signup ? 'Defterini aç' : 'Tek defter, her cihazda'}</h1>
      <p>${recovery ? 'Hesabın için yeni bir parola belirle.' : 'Linux, Windows ve iPhone’da aynı planlarını görmek için hesabına giriş yap.'}</p>
      ${notice ? `<div class="cloud-notice" role="status">${window.esc(notice)}</div>` : ''}
      <form id="cloudForm">
        ${recovery ? '' : '<label>E-posta<input name="email" type="email" autocomplete="email" required></label>'}
        <label>${recovery ? 'Yeni parola' : 'Parola'}<input name="password" type="password" minlength="6" autocomplete="${signup ? 'new-password' : 'current-password'}" required></label>
        <button class="primary-btn cloud-submit" type="submit">${recovery ? 'Parolayı değiştir' : signup ? 'Hesap oluştur' : 'Giriş yap'}</button>
      </form>
      <div id="cloudError" class="cloud-error" role="alert"></div>
      ${recovery ? '' : `<div class="cloud-switch"><button type="button" id="cloudSwitch">${signup ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Oluştur'}</button>
      <button type="button" id="cloudReset">Parolamı unuttum</button></div>`}</div>`);
    document.getElementById('cloudSwitch')?.addEventListener('click', () => authScreen(signup ? 'login' : 'signup'));
    document.getElementById('cloudReset')?.addEventListener('click', resetRequest);
    document.getElementById('cloudForm').addEventListener('submit', async event => {
      event.preventDefault();
      const submit = gate.querySelector('[type=submit]');
      const errorEl = document.getElementById('cloudError');
      const form = new FormData(event.currentTarget);
      submit.disabled = true;
      errorEl.textContent = '';
      try {
        if (recovery) {
          await request('/auth/v1/user', {method: 'PUT', body: {password: form.get('password')}});
          await openPlanner();
          window.toast('Parolan değiştirildi ♡');
        } else if (signup) {
          const reply = await rawRequest(`/auth/v1/signup?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`,
            {method: 'POST', body: {email: form.get('email'), password: form.get('password')}, auth: false});
          if (reply?.access_token) { saveSession(reply); await openPlanner(); }
          else authScreen('login', 'Doğrulama e-postasını açıp ardından giriş yap.');
        } else {
          const reply = await rawRequest('/auth/v1/token?grant_type=password',
            {method: 'POST', body: {email: form.get('email'), password: form.get('password')}, auth: false});
          saveSession(reply);
          await openPlanner();
        }
      } catch (error) { errorEl.textContent = message(error); submit.disabled = false; }
    });
  }
  async function resetRequest() {
    showGate(`<div class="cloud-card"><img src="icon.svg" alt="" class="cloud-icon"><h1>Parolanı yenile</h1>
      <p>E-postana bir yenileme bağlantısı göndereceğiz.</p><form id="resetForm"><label>E-posta<input name="email" type="email" autocomplete="email" required></label>
      <button class="primary-btn cloud-submit">Bağlantı gönder</button></form><div id="cloudError" class="cloud-error" role="alert"></div>
      <button class="cloud-back" id="cloudBack">← Girişe dön</button></div>`);
    document.getElementById('cloudBack').addEventListener('click', () => authScreen());
    document.getElementById('resetForm').addEventListener('submit', async event => {
      event.preventDefault();
      try {
        await rawRequest(`/auth/v1/recover?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`,
          {method: 'POST', body: {email: new FormData(event.currentTarget).get('email')}, auth: false});
        authScreen('login', 'E-postana gelen parola yenileme bağlantısını aç.');
      } catch (error) { document.getElementById('cloudError').textContent = message(error); }
    });
  }
  async function openPlanner() {
    if (!session?.user?.id) {
      const user = await request('/auth/v1/user');
      session.user = user;
      localStorage.setItem(sessionKey, JSON.stringify(session));
    }
    window.cloudApi = cloudApi;
    accountButton.hidden = false;
    hideGate();
    await window.startPlanner();
    lastLoaded = Date.now();
  }
  accountButton.addEventListener('click', () => {
    const email = window.esc(session?.user?.email || 'Hesabım');
    window.modal(`${window.modalHead('Hesabım ☁', 'Planların bu hesaba kaydedilir.')}
      <p class="account-email">${email}</p><p class="hint">Bu bağlantıyı iPhone veya Windows’ta açıp aynı e-posta ve parolayla giriş yap.</p>
      <div class="modal-actions"><button class="soft-btn" id="accountClose">Kapat</button><button class="danger-btn" id="accountLogout">Çıkış yap</button></div>`);
    document.getElementById('accountClose').addEventListener('click', window.closeModal);
    document.getElementById('accountLogout').addEventListener('click', async () => {
      try { await request('/auth/v1/logout', {method: 'POST'}); } catch { /* local sign-out still applies */ }
      window.closeModal();
      forgetSession();
      authScreen();
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastLoaded > 30000 &&
        !document.getElementById('modalRoot').firstElementChild &&
        !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName))
      reloadPlanner().catch(error => window.toast(message(error)));
  });

  async function boot() {
    if (!validConfig()) {
      showGate(`<div class="cloud-card"><img src="icon.svg" alt="" class="cloud-icon"><h1>Çevrimiçi kurulum hazırlanıyor</h1>
        <p>Site yayımlandıktan sonra veri tabanı bağlantısı eklenecek. Masaüstündeki yerel defterin çalışmaya devam eder.</p></div>`);
      return;
    }
    try { session = JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { session = null; }
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get('access_token') && hash.get('refresh_token')) {
      saveSession({access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token'),
        expires_in: Number(hash.get('expires_in') || 3600)});
      history.replaceState(null, '', location.pathname + location.search);
      if (hash.get('type') === 'recovery') { authScreen('recovery'); return; }
    }
    if (!session) { authScreen(); return; }
    try { await openPlanner(); }
    catch (error) { forgetSession(); authScreen('login', message(error)); }
  }
  boot();
})();
