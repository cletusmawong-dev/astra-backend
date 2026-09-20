/* Astra client core: state, api, router, SSE, icons, shared UI. */
(function () {
  const S = { user: null, perms: {}, settings: {}, skills: [], agents: [], tasks: {}, convs: [], notifs: [], automations: [], route: '/', booted: false };
  window.S = S;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = (ts) => { const m = Math.floor((Date.now() - ts) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; const h = Math.floor(m / 60); if (h < 24) return h + 'h ago'; return Math.floor(h / 24) + 'd ago'; };
  const fmtDT = (ts) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ headers: { 'content-type': 'application/json' } }, opts));
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) throw Object.assign(new Error(j.error || r.status), { status: r.status });
    return j;
  }

  // ---------- icons ----------
  const P = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V5"/><circle cx="12" cy="3.5" r="1.5"/><path d="M9.5 13.5h.01M14.5 13.5h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    tasks: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 12l2 2 4-5"/>',
    more: '<circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
    clip: '<path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="3"/><path d="M22 8.5l-6 3.5 6 3.5z"/>',
    file: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><polyline points="14 2 14 7 20 7"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18"/>',
    zap: '<path d="M13 2L3 14h8l-1 8 10-12h-8z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    pen: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M8 17v-6M13 17V7M18 17v-4"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M15.5 3.13a4 4 0 0 1 0 7.75"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    chevR: '<polyline points="9 18 15 12 9 6"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    spark: '<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
    play: '<path d="M5 3l14 9-14 9z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M16 8l-2.5 6.5L7 17l2.5-6.5z"/>',
    checkshield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 11.5l2 2 4-4.5"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    wand: '<path d="M15 4V2M15 10V8M11 6H9M21 6h-2M17.5 3.5l1-1M17.5 8.5l1 1M12.5 3.5l-1-1"/><path d="M14 8L2 20l2 2L16 10z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  };
  const icon = (n, s = 20) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none">' + (P[n] || P.spark) + '</svg>';

  const logo = (s = 48) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64"><defs><linearGradient id="lg' + s + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b8cff"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="#0a0f22" stroke="rgba(124,140,255,.25)"/><path d="M32 12 L48 50 H40 L32 28 L24 50 H16 Z" fill="url(#lg' + s + ')"/><path d="M32 34 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill="#e7c873"/></svg>';

  // ---------- toasts & modal ----------
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; setTimeout(() => el.remove(), 400); }, 3400);
  }
  function modal(html) { const m = document.getElementById('modal'); m.innerHTML = '<div class="sheet"><div class="grab"></div>' + html + '</div>'; m.classList.add('open'); m.onclick = (e) => { if (e.target === m) closeModal(); }; }
  function closeModal() { const m = document.getElementById('modal'); m.classList.remove('open'); m.innerHTML = ''; }

  // ---------- shared UI ----------
  const chip = (st) => '<span class="chip ' + st + '">' + String(st).replace('_', ' ').toUpperCase() + '</span>';
  function topbar(o) {
    return '<div class="tb">' + (o.back ? '<button class="icobtn" data-act="back">' + icon('back', 18) + '</button>' : '') +
      '<div style="flex:1;min-width:0"><h1 class="ellipsis">' + (o.title || '') + '</h1>' + (o.sub ? '<div class="sub">' + o.sub + '</div>' : '') + '</div>' + (o.right || '') + '</div>';
  }
  function nav(active) {
    const item = (key, ic, label, hash) => '<button class="' + (active === key ? 'on' : '') + '" data-act="go" data-hash="' + hash + '">' + icon(ic, 21) + '<span>' + label + '</span></button>';
    return '<nav id="nav">' + item('home', 'home', 'Home', '#/home') + item('agents', 'bot', 'Agents', '#/agents') +
      '<button class="fab" data-act="go" data-hash="#/create" aria-label="Create">' + icon('plus', 22) + '</button>' +
      item('tasks', 'tasks', 'Tasks', '#/tasks') + item('more', 'more', 'More', '#/more') + '</nav>';
  }
  const sw = (checked, act, extra) => '<label class="sw"><input type="checkbox" ' + (checked ? 'checked' : '') + ' data-act="' + act + '" ' + (extra || '') + '><i></i></label>';

  // ---------- router ----------
  const ROUTES = [];
  function route(pattern, fn) { ROUTES.push([pattern.split('/').filter(Boolean), fn]); }
  function match(path) {
    const parts = path.split('/').filter(Boolean);
    for (const [pat, fn] of ROUTES) {
      if (pat.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < pat.length; i++) {
        if (pat[i].startsWith(':')) params[pat[i].slice(1)] = decodeURIComponent(parts[i]);
        else if (pat[i] !== parts[i]) { ok = false; break; }
      }
      if (ok) return { fn, params };
    }
    return null;
  }
  const app = () => document.getElementById('app');
  function render() {
    let path = (location.hash || '#/splash').slice(1);
    const m = match(path) || match('/splash');
    S.route = path;
    const keepNav = !['/splash', '/onboarding', '/signin'].includes(path);
    const html = m.fn(m.params);
    app().innerHTML = html + (keepNav && S.user ? nav(m.params._nav || activeNav(path)) : '');
    updateBadge();
    if (window.afterRender) { const f = window.afterRender; window.afterRender = null; f(); }
  }
  function activeNav(path) {
    if (path.startsWith('/home')) return 'home';
    if (path.startsWith('/agent')) return 'agents';
    if (path.startsWith('/task') || path.startsWith('/build')) return 'tasks';
    if (path.startsWith('/create')) return '';
    return '';
  }
  const go = (h) => { location.hash = h; };

  // ---------- live SSE ----------
  let es = null;
  function startSSE() {
    if (es) return;
    es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      let ev; try { ev = JSON.parse(e.data); } catch { return; }
      if (ev.type === 'task') { S.tasks[ev.task.id] = ev.task; if (window.onLive) window.onLive(ev); }
      if (ev.type === 'notification') { S.notifs.unshift(ev.n); updateBadge(); toast(ev.n.title + ' \u2014 ' + ev.n.body, ev.n.kind === 'success' ? 'success' : ''); if (window.onLive) window.onLive(ev); }
    };
  }
  function updateBadge() {
    const n = S.notifs.filter((x) => !x.read).length;
    document.querySelectorAll('[data-badge]').forEach((el) => { el.style.display = n ? 'flex' : 'none'; el.textContent = n > 9 ? '9+' : n; });
  }

  // ---------- boot ----------
  async function boot() {
    try {
      const me = await api('/api/me');
      S.user = me.user; S.perms = me.permissions; S.settings = me.settings; S.permsMeta = me.permsMeta;
    } catch { S.user = null; }
    if (S.user) {
      startSSE();
      const [tasks, notifs] = await Promise.all([api('/api/tasks'), api('/api/notifications')]);
      for (const t of tasks) S.tasks[t.id] = t;
      S.notifs = notifs;
    }
    S.booted = true;
    if (!location.hash) location.hash = S.user ? '#/home' : '#/splash';
    render();
  }

  // global click delegation
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act');
    if (act === 'go') { go(el.getAttribute('data-hash')); }
    else if (act === 'back') { history.back(); }
    else if (act === 'closemodal') closeModal();
    if (window.onAct) window.onAct(act, el, e);
  });
  window.addEventListener('hashchange', render);

  window.A = { api, esc, ago, fmtDT, icon, logo, toast, modal, closeModal, topbar, nav, sw, chip, go, render, route, startSSE, updateBadge, app, boot };
})();
