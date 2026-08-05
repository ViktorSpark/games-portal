(() => {
  const KEY = 'galaxy_profile';
  const RATE = 10000;
  const WIN_BONUS = { tetris: 15, 'space-arcade': 20, karate: 20, snake: 10, 2048: 10, minesweeper: 15, memory: 10, shooter: 20 };
  const GAME_NAMES = {
    tetris: 'Космический тетрис', 'space-arcade': 'Космическая аркада', karate: 'Карате чемпионат',
    snake: 'Космический змей', 2048: 'Космическое 2048', minesweeper: 'Сапёр на планетах',
    memory: 'Галактическая память', shooter: 'Астро-шутер'
  };

  let profile = null;
  let session = { gameId: null, startedAt: 0, lastTick: 0 };
  let listeners = [];

  function load() {
    try { profile = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { profile = null; }
    if (!profile || typeof profile !== 'object') {
      profile = { nickname: 'Гость', coins: 0, coinsFromTime: 0, coinsFromWins: 0, createdAt: Date.now(), stats: {}, statuses: [] };
      save();
    }
    if (!profile.stats) profile.stats = {};
    if (!profile.statuses) profile.statuses = [];
    if (profile.coinsFromTime === undefined) profile.coinsFromTime = 0;
    if (profile.coinsFromWins === undefined) profile.coinsFromWins = 0;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) {} }

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

  function emit() { listeners.forEach(fn => { try { fn(profile.coins); } catch (e) {} }); }

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
      if (addCoins > 0) { profile.coins += addCoins; profile.coinsFromTime += addCoins; emit(); }
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
    if (added) { save(); emit(); }
  }

  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + ' сек';
    const m = Math.floor(s / 60);
    if (m < 60) return m + ' мин';
    const h = Math.floor(m / 60);
    return h + ' ч ' + (m % 60) + ' мин';
  }

  const Galaxy = {
    init(gameId) {
      load();
      session = { gameId, startedAt: Date.now(), lastTick: Date.now() };
      save();
    },
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
      emit();
    },
    getCoins() { load(); return profile.coins; },
    getNickname() { load(); return profile.nickname; },
    setNickname(n) {
      load();
      profile.nickname = (n || '').trim().slice(0, 20) || 'Гость';
      save();
      emit();
    },
    getProfile() { load(); return profile; },
    getStats(gameId) { load(); return getStats(gameId); },
    getRank() { load(); return rank(); },
    getStatuses() { load(); return profile.statuses; },
    getTotalTime() { load(); return totalTime(); },
    getTotalWins() { load(); return totalWins(); },
    onCoins(fn) { listeners.push(fn); },
    formatTime,
    GAME_NAMES
  };
  window.Galaxy = Galaxy;

  function gameId() { return gameIdFromUrl(); }
  const autoGame = gameId();
  if (autoGame) Galaxy.init(autoGame);

  window.addEventListener('beforeunload', () => { flushTime(); });
  setInterval(() => { flushTime(); }, 5000);

  function injectBadge() {
    if (!document.body || document.getElementById('galaxyCoinsBadge')) return;
    const depth = autoGame ? '../../' : '';
    const a = document.createElement('a');
    a.id = 'galaxyCoinsBadge';
    a.href = depth + 'profile.html';
    a.title = 'Личный кабинет: монеты и награды';
    a.style.cssText =
      'position:fixed;top:10px;right:10px;z-index:9999;' +
      'font-family:"Russo One",Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:1px;' +
      'color:#ffd500;text-decoration:none;white-space:nowrap;' +
      'background:linear-gradient(135deg,rgba(255,213,0,0.16),rgba(255,94,203,0.18));' +
      'border:1px solid rgba(255,213,0,0.55);border-radius:12px;padding:7px 14px;' +
      'box-shadow:0 4px 18px rgba(0,0,0,0.4);user-select:none;' +
      'transition:transform .12s ease, box-shadow .2s ease;';
    a.innerHTML = '🪙 <span id="galaxyCoinsVal">0</span>';
    a.addEventListener('mouseenter', () => { a.style.transform = 'translateY(-2px)'; });
    a.addEventListener('mouseleave', () => { a.style.transform = ''; });
    document.body.appendChild(a);
    const val = document.getElementById('galaxyCoinsVal');
    const setVal = c => { if (val) val.textContent = c; };
    setVal(profile.coins);
    Galaxy.onCoins(setVal);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectBadge);
  else injectBadge();
})();
