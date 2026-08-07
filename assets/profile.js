(() => {
  const PROFILE_KEY = 'galaxy_profile';
  const AUTH_KEY = 'galaxy_auth';
  const SESSIONS_KEY = 'galaxy_sessions';
  const GUEST_SEQ_KEY = 'galaxy_guest_seq';
  const RATE = 10000;
  const WIN_BONUS = { tetris: 15, 'space-arcade': 20, karate: 20, snake: 10, 2048: 10, minesweeper: 15, memory: 10, shooter: 20 };
  const GAME_NAMES = {
    tetris: 'Космический тетрис', 'space-arcade': 'Космическая аркада', karate: 'Карате чемпионат',
    snake: 'Космический змей', 2048: 'Космическое 2048', minesweeper: 'Сапёр на планетах',
    memory: 'Галактическая память', shooter: 'Астро-шутер'
  };

  const CONFIG = {
    EMAILJS: {
      enabled: false,
      serviceId: '',
      templateId: '',
      publicKey: ''
    },
    SYNC_ENDPOINT: '',
    SUPABASE: {
      url: 'https://qaxciurksxccvwwfjcaq.supabase.co',
      anonKey: 'sb_publishable_Z_QOSA1nFeF5xBPGXiNMJg_I5zqkPix'
    }
  };

  let profile = null;
  let auth = null;
  let guestId = 0;
  let session = { gameId: null, startedAt: 0, lastTick: 0 };
  let sessionResult = null;
  let listeners = [];
  let updateListeners = [];

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function load() {
    try { profile = JSON.parse(lsGet(PROFILE_KEY) || 'null'); } catch (e) { profile = null; }
    if (!profile || typeof profile !== 'object') {
      profile = { nickname: 'Гость', coins: 0, coinsFromTime: 0, coinsFromWins: 0, createdAt: Date.now(), stats: {}, statuses: [] };
      save();
    }
    if (!profile.stats) profile.stats = {};
    if (!profile.statuses) profile.statuses = [];
    if (profile.coinsFromTime === undefined) profile.coinsFromTime = 0;
    if (profile.coinsFromWins === undefined) profile.coinsFromWins = 0;
    try { auth = JSON.parse(lsGet(AUTH_KEY) || 'null'); } catch (e) { auth = null; }
    try { guestId = parseInt(lsGet(GUEST_SEQ_KEY) || '0', 10) || 0; } catch (e) { guestId = 0; }
  }
  function save() { lsSet(PROFILE_KEY, JSON.stringify(profile)); }

  function gameIdFromUrl() {
    const parts = location.pathname.split('/').filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === 'games' && parts[i + 1]) return parts[i + 1];
    }
    return null;
  }
  function getStats(g) {
    if (!g) return null;
    if (!profile.stats[g]) profile.stats[g] = { plays: 0, wins: 0, timeMs: 0 };
    return profile.stats[g];
  }
  function totalTime() { return Object.values(profile.stats).reduce((s, x) => s + (x.timeMs || 0), 0); }
  function totalWins() { return Object.values(profile.stats).reduce((s, x) => s + (x.wins || 0), 0); }

  function displayName() { return (profile && profile.nickname) || 'Гость'; }
  function getGuestNumber() {
    if (auth && auth.verified) return null;
    if (!guestId) { guestId = 1; lsSet(GUEST_SEQ_KEY, String(guestId)); }
    return guestId;
  }
  function playerLabel() {
    if (auth && auth.verified) return { type: 'registered', label: auth.nickname, email: auth.email };
    return { type: 'guest', label: 'Гость ' + getGuestNumber(), email: '' };
  }

  function emitCoins() { listeners.forEach(fn => { try { fn(profile.coins); } catch (e) {} }); }
  function emitUpdate() { updateListeners.forEach(fn => { try { fn(); } catch (e) {} }); }

  function flushTime() {
    if (!session.gameId) return;
    const now = Date.now();
    if (!session.lastTick) session.lastTick = now;
    const addMs = now - session.lastTick;
    if (addMs <= 0) { session.lastTick = now; return; }
    session.lastTick = now;
    const st = getStats(session.gameId);
    if (st) {
      st.timeMs += addMs;
      const addCoins = Math.floor(addMs / RATE);
      if (addCoins > 0) { profile.coins += addCoins; profile.coinsFromTime += addCoins; emitCoins(); }
    }
    save();
  }

  function rank() {
    const t = totalTime(), w = totalWins();
    if (w >= 100) return { level: 5, name: 'Мастер Галактики', icon: '🏆' };
    if (t >= 360 * 60000 && w >= 30) return { level: 4, name: 'Легенда', icon: '👑' };
    if (t >= 120 * 60000) return { level: 3, name: 'Ветеран', icon: '⭐' };
    if (t >= 30 * 60000) return { level: 2, name: 'Исследователь', icon: '🪐' };
    if (w >= 5) return { level: 1, name: 'Стрелок', icon: '🚀' };
    return { level: 0, name: 'Новичок', icon: '🌱' };
  }

  function checkStatuses() {
    const t = totalTime(), w = totalWins();
    const milestones = {
      'first-win': { ok: w >= 1, icon: '🎯', name: 'Первая победа' },
      'time-30m': { ok: t >= 30 * 60000, icon: '⏱', name: '30 минут в игре' },
      'time-2h': { ok: t >= 120 * 60000, icon: '⏳', name: '2 часа в игре' },
      'wins-10': { ok: w >= 10, icon: '💪', name: '10 побед' },
      'wins-50': { ok: w >= 50, icon: '🌟', name: '50 побед' },
      'boss-slayer': { ok: profile.stats.shooter && profile.stats.shooter.wins >= 1, icon: '💥', name: 'Покоритель боссов' }
    };
    let added = false;
    for (const id in milestones) {
      if (milestones[id].ok && !profile.statuses.some(s => s.id === id)) {
        profile.statuses.push({ id, icon: milestones[id].icon, name: milestones[id].name });
        added = true;
      }
    }
    if (added) { save(); emitCoins(); }
  }

  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + ' сек';
    const m = Math.floor(s / 60);
    if (m < 60) return m + ' мин';
    const h = Math.floor(m / 60);
    return h + ' ч ' + (m % 60) + ' мин';
  }

  function sync(kind, payload) {
    if (!CONFIG.SYNC_ENDPOINT) return;
    try {
      fetch(CONFIG.SYNC_ENDPOINT + '/' + kind, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ts: Date.now(), guestId, player: playerLabel(), payload })
      }).catch(() => {});
    } catch (e) {}
  }

  let deviceId = null;
  function computeDeviceId() {
    if (deviceId) return deviceId;
    let d = lsGet('galaxy_device_id');
    if (!d) {
      d = 'dev-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      lsSet('galaxy_device_id', d);
    }
    deviceId = d;
    return d;
  }
  function sbConfigured() {
    return !!(CONFIG.SUPABASE.url && CONFIG.SUPABASE.anonKey);
  }
  function sbFetch(path, init) {
    const base = (CONFIG.SUPABASE.url || '').replace(/\/+$/, '');
    if (!base || !CONFIG.SUPABASE.anonKey) return Promise.reject(new Error('supabase not configured'));
    const headers = Object.assign({
      apikey: CONFIG.SUPABASE.anonKey,
      Authorization: 'Bearer ' + CONFIG.SUPABASE.anonKey,
      'Content-Type': 'application/json'
    }, (init && init.headers) || {});
    return fetch(base + path, Object.assign({}, init, { headers }));
  }
  function sbSync(kind, payload) {
    if (!sbConfigured()) return Promise.resolve(false);
    try {
      if (kind === 'session') {
        return sbFetch('/rest/v1/sessions', {
          method: 'POST',
          body: JSON.stringify(Object.assign({ device_id: computeDeviceId() }, payload))
        }).then(r => r.ok).catch(() => false);
      }
      if (kind === 'register') {
        return sbFetch('/rest/v1/players?on_conflict=email', {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates' },
          body: JSON.stringify(Object.assign({ device_id: computeDeviceId(), verified: false }, payload))
        }).then(r => r.ok).catch(() => false);
      }
      if (kind === 'verify') {
        return sbFetch('/rest/v1/rpc/verify_player', {
          method: 'POST',
          body: JSON.stringify({ p_email: payload.email, p_code: payload.code || '' })
        }).then(r => r.ok).catch(() => false);
      }
    } catch (e) {}
    return Promise.resolve(false);
  }
  function sbSendCode(email, nickname, code) {
    return sbFetch('/functions/v1/send-code', {
      method: 'POST',
      body: JSON.stringify({ email, nickname, code: String(code) })
    }).then(r => r.ok).then(ok => ({ ok, error: ok ? '' : 'no email provider' })).catch(() => ({ ok: false, error: 'function unavailable' }));
  }

  function sendEmailCode(email, nickname, code) {
    if (CONFIG.EMAILJS.enabled && window.emailjs) {
      try {
        emailjs.send(CONFIG.EMAILJS.serviceId, CONFIG.EMAILJS.templateId, {
          to_email: email, to_name: nickname, code: String(code)
        }, { publicKey: CONFIG.EMAILJS.publicKey });
        return true;
      } catch (e) {}
    }
    return false;
  }

  function logSession() {
    if (!session.gameId) return;
    const now = Date.now();
    const durationMs = now - session.startedAt;
    flushTime();
    const rec = {
      guestId: getGuestNumber() || 0,
      type: playerLabel().type,
      nickname: playerLabel().label,
      email: playerLabel().email,
      ts: now,
      date: new Date(now).toLocaleDateString('ru-RU'),
      time: new Date(now).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      game: session.gameId,
      gameName: GAME_NAMES[session.gameId] || session.gameId,
      durationMs,
      result: sessionResult || 'не завершено'
    };
    let list = [];
    try { list = JSON.parse(lsGet(SESSIONS_KEY) || '[]'); } catch (e) {}
    list.push(rec);
    if (list.length > 2000) list = list.slice(-2000);
    lsSet(SESSIONS_KEY, JSON.stringify(list));
    sessionResult = null;
    sync('session', rec);
    sbSync('session', {
      player_email: rec.email || null,
      guest_id: rec.guestId || null,
      player_type: rec.type,
      nickname: rec.nickname,
      ts: new Date(rec.ts).toISOString(),
      date: rec.date,
      time: rec.time,
      game: rec.game,
      game_name: rec.gameName,
      duration_ms: rec.durationMs,
      result: rec.result
    });
  }

  const Galaxy = {
    init(gameId) {
      load();
      session = { gameId, startedAt: Date.now(), lastTick: Date.now() };
      save();
    },
    getDisplayName() { load(); return displayName(); },
    setNickname(n) {
      load();
      profile.nickname = (n || '').trim().slice(0, 20) || 'Гость';
      save();
      emitUpdate();
      sync('nick', { nickname: profile.nickname });
    },
    async register({ nickname, email }) {
      load();
      const nick = (nickname || '').trim().slice(0, 20);
      const mail = (email || '').trim().toLowerCase();
      if (!nick || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { ok: false, error: 'Введи ник и корректную почту' };
      const code = Math.floor(1000 + Math.random() * 9000);
      auth = { verified: false, email: mail, nickname: nick, code: String(code), registeredAt: Date.now() };
      lsSet(AUTH_KEY, JSON.stringify(auth));
      let sent = sendEmailCode(mail, nick, code);
      if (sbConfigured()) {
        sbSync('register', {
          email: mail,
          nickname: nick,
          code: String(code),
          code_expires_at: new Date(Date.now() + 10 * 60000).toISOString()
        });
        const res = await sbSendCode(mail, nick, code);
        if (res.ok) sent = true;
      }
      sync('register', { email: mail, nickname: nick, sent });
      return { ok: true, sent, code: String(code) };
    },
    verifyCode(input) {
      load();
      if (!auth) return { ok: false, error: 'Сначала запроси код' };
      if (auth.verified) return { ok: true };
      if (String(input).trim() !== auth.code) return { ok: false, error: 'Неверный код' };
      auth.verified = true;
      auth.registeredAt = auth.registeredAt || Date.now();
      lsSet(AUTH_KEY, JSON.stringify(auth));
      profile.nickname = auth.nickname;
      save();
      emitUpdate();
      sync('verify', { email: auth.email, nickname: auth.nickname });
      sbSync('verify', { email: auth.email, code: auth.code });
      return { ok: true };
    },
    getAuth() { load(); return auth ? { verified: auth.verified, email: auth.email, nickname: auth.nickname, registeredAt: auth.registeredAt } : null; },
    isAuthorized() { load(); return !!(auth && auth.verified); },
    reportPlay(gameId) {
      load();
      const st = getStats(gameId || session.gameId);
      if (st) st.plays++;
      save();
    },
    reportWin(gameId) {
      load();
      const g = gameId || session.gameId;
      const st = getStats(g);
      if (!st) return;
      st.wins++;
      const bonus = WIN_BONUS[g] || 10;
      profile.coins += bonus;
      profile.coinsFromWins += bonus;
      checkStatuses();
      save();
      emitCoins();
      sync('win', { game: g });
    },
    setResult(label) { sessionResult = label; },
    getCoins() { load(); return profile.coins; },
    getNickname() { load(); return profile.nickname; },
    getProfile() { load(); return profile; },
    getStats(gameId) { load(); return getStats(gameId); },
    getRank() { load(); return rank(); },
    getStatuses() { load(); return profile.statuses; },
    getTotalTime() { load(); return totalTime(); },
    getTotalWins() { load(); return totalWins(); },
    getSessions() {
      load();
      try { return JSON.parse(lsGet(SESSIONS_KEY) || '[]'); } catch (e) { return []; }
    },
    getDeviceId() { return computeDeviceId(); },
    isSyncEnabled() { load(); return sbConfigured(); },
    getPlayerLabel() { load(); return playerLabel(); },
    onCoins(fn) { listeners.push(fn); },
    onUpdate(fn) { updateListeners.push(fn); },
    formatTime,
    GAME_NAMES,
    CONFIG
  };
  window.Galaxy = Galaxy;

  const autoGame = gameIdFromUrl();
  if (autoGame) Galaxy.init(autoGame);

  window.addEventListener('beforeunload', () => { logSession(); });
  window.addEventListener('pagehide', () => { logSession(); });
  setInterval(() => { flushTime(); }, 5000);

  function injectBadge() {
    if (!document.body || document.getElementById('galaxyCoinsBadge')) return;
    const depth = autoGame ? '../../' : '';
    const a = document.createElement('a');
    a.id = 'galaxyCoinsBadge';
    a.href = depth + 'profile.html';
    a.title = 'Личный кабинет';
    a.style.cssText =
      'position:fixed;top:10px;right:10px;z-index:9999;' +
      'display:flex;align-items:center;gap:7px;' +
      'font-family:"Russo One",Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;' +
      'color:#ffd500;text-decoration:none;white-space:nowrap;' +
      'background:linear-gradient(135deg,rgba(255,213,0,0.16),rgba(255,94,203,0.18));' +
      'border:1px solid rgba(255,213,0,0.55);border-radius:12px;padding:7px 14px;' +
      'box-shadow:0 4px 18px rgba(0,0,0,0.4);user-select:none;' +
      'transition:transform .12s ease, box-shadow .2s ease;';
    a.innerHTML = '<span id="galaxyNameVal">' + playerLabel().label + '</span><span style="opacity:.55">·</span><span>🪙 <span id="galaxyCoinsVal">0</span></span>';
    a.addEventListener('mouseenter', () => { a.style.transform = 'translateY(-2px)'; });
    a.addEventListener('mouseleave', () => { a.style.transform = ''; });
    document.body.appendChild(a);
    const nameEl = document.getElementById('galaxyNameVal');
    const coinEl = document.getElementById('galaxyCoinsVal');
    const render = () => { if (nameEl) nameEl.textContent = playerLabel().label; if (coinEl) coinEl.textContent = profile.coins; };
    render();
    Galaxy.onCoins(() => render());
    Galaxy.onUpdate(() => render());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectBadge);
  else injectBadge();
})();
