// Astra server: Node/TypeScript, zero runtime deps. Auth sessions, rate limiting, SSE, scheduler.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, save, audit, notify, permsOf, settingsOf, settingsStore, ART, SITES } from './db.ts';
import { uid, now, token, parseCookies } from './util.ts';
import { AGENTS, SKILLS, PERMS } from './seed.ts';
import * as E from './engine.ts';

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT || 3000);

// ---- .env loader: server-side secrets, never sent to the client ----
const ENV_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
try {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {}

// ---- SSE ----
const clients = new Map<string, Set<http.ServerResponse>>();
E.setOnEvent((userId, ev) => {
  const set = clients.get(userId);
  if (!set) return;
  const data = 'data: ' + JSON.stringify(ev) + '\n\n';
  for (const res of set) { try { res.write(data); } catch {} }
});

// ---- rate limit ----
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const t = Date.now();
  const arr = (hits.get(ip) || []).filter((x) => x > t - 60000);
  arr.push(t); hits.set(ip, arr);
  return arr.length > 600;
}

// ---- helpers ----
const MIME: Record<string, string> = { html: 'text/html', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', ico: 'image/x-icon', json: 'application/json', webmanifest: 'application/manifest+json', md: 'text/markdown', pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain', csv: 'text/csv' };
function serveFile(res: http.ServerResponse, file: string) {
  try {
    const ext = path.extname(file).slice(1);
    let buf = fs.readFileSync(file);
    if (ext === 'html') {
      let html = buf.toString('utf8');
      let changed = false;
      const sibling = (name: string) => path.join(path.dirname(file), name);
      if (!/styles\.css/.test(html) && fs.existsSync(sibling('styles.css'))) {
        const link = '<link rel="stylesheet" href="styles.css">';
        html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, link + '</head>') : link + '\n' + html;
        changed = true;
      }
      if (!/app\.js/.test(html) && fs.existsSync(sibling('app.js'))) {
        const tag = '<script src="app.js"></script>';
        html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, tag + '</body>') : html + '\n' + tag;
        changed = true;
      }
      if (changed) buf = Buffer.from(html, 'utf8');
    }
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
}
function safeJoin(base: string, rel: string): string | null {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base) ? p : null;
}
function body(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 8_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}
const json = (res: http.ServerResponse, o: any, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };

function authUser(req: http.IncomingMessage): any {
  const ah = String(req.headers.authorization || '');
  const tok = ah.startsWith('Bearer ') ? ah.slice(7).trim() : parseCookies(req.headers.cookie).astra;
  if (!tok) return null;
  const sess = db.sessions.find((s) => s.token === tok);
  if (!sess) return null;
  return db.users.find((u) => u.id === sess.userId) || null;
}

// ---- startup hygiene: honest recovery of interrupted runs ----
for (const t of db.tasks) if (t.status === 'active') { t.status = 'failed'; t.events.push({ ts: now(), step: 'system', line: 'Server restarted mid-run \u2014 task marked failed honestly. Re-run it.' }); }
save();

// ---- scheduler ----
setInterval(() => {
  const t = Date.now();
  for (const a of db.automations) {
    if (a.active && a.nextDue && a.nextDue <= t) E.runAutomation(a);
  }
}, 15000);

// ---- Telegram chat auto-discovery: once the user messages the bot, capture the chat id ----
async function discoverTelegramChat() {
  if (process.env.TELEGRAM_CHAT_ID || !process.env.TELEGRAM_TOKEN) return;
  try {
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/getUpdates`);
    const j: any = await r.json();
    const chat = j?.result?.[0]?.message?.chat?.id;
    if (chat) {
      process.env.TELEGRAM_CHAT_ID = String(chat);
      try {
        const cur = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
        if (!cur.includes('TELEGRAM_CHAT_ID=')) fs.appendFileSync(ENV_FILE, `TELEGRAM_CHAT_ID=${chat}\n`);
      } catch {}
      console.log('Telegram chat discovered:', chat);
    }
  } catch {}
}
discoverTelegramChat();
setInterval(discoverTelegramChat, 30000);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  const p = url.pathname;
  const ip = req.socket.remoteAddress || 'x';
  if (p.startsWith('/api/') && limited(ip)) return json(res, { error: 'rate limited' }, 429);
  if (p.startsWith('/api/')) {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type,authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  }

  try {
    // ---------- static ----------
    if (req.method === 'GET' && !p.startsWith('/api/')) {
      if (p.startsWith('/artifacts/') || p.startsWith('/sites/')) {
        const base = p.startsWith('/artifacts/') ? ART : SITES;
        let rel = decodeURIComponent(p.split('/').slice(2).join('/'));
        if (!rel || rel.endsWith('/')) rel += 'index.html';
        const f = safeJoin(base, rel);
        if (f && fs.existsSync(f) && fs.statSync(f).isFile()) return serveFile(res, f);
        return json(res, { error: 'not found' }, 404);
      }
      if (p.startsWith('/preview/')) {
        const parts = p.split('/').filter(Boolean);
        const rel = decodeURIComponent(parts.slice(2).join('/') || 'index.html');
        const f = safeJoin(path.join(ART, parts[1], 'site'), rel);
        if (f && fs.existsSync(f) && fs.statSync(f).isFile()) return serveFile(res, f);
        return json(res, { error: 'preview not ready' }, 404);
      }
      let rel = p === '/' ? 'index.html' : p.slice(1);
      const f = safeJoin(PUB, rel);
      if (f && fs.existsSync(f) && fs.statSync(f).isFile()) return serveFile(res, f);
      return serveFile(res, path.join(PUB, 'index.html'));
    }

    // ---------- auth ----------
    if (p === '/api/auth/register' && req.method === 'POST') {
      const b = await body(req);
      const name = String(b.name || '').trim().slice(0, 40) || 'Explorer';
      let user = b.email ? db.users.find((u) => u.email === String(b.email).trim().toLowerCase()) : null;
      if (!user) {
        user = { id: uid('usr'), name, email: String(b.email || '').trim().toLowerCase(), createdAt: now() };
        db.users.push(user);
        for (const pr of PERMS) permsOf(user.id)[pr.key] = b.permissions?.[pr.key] || 'denied';
        audit(user.id, 'auth.register', name);
      }
      const s = { token: token(), userId: user.id, createdAt: now() };
      db.sessions.push(s); save();
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': `astra=${s.token}; Path=/; HttpOnly; SameSite=Lax` });
      return res.end(JSON.stringify({ user, token: s.token }));
    }
    if (p === '/api/auth/login' && req.method === 'POST') {
      const b = await body(req);
      const user = db.users.find((u) => u.email === String(b.email || '').toLowerCase().trim() || u.name.toLowerCase() === String(b.email || '').toLowerCase().trim());
      if (!user) return json(res, { error: 'No account found on this device' }, 404);
      const s = { token: token(), userId: user.id, createdAt: now() };
      db.sessions.push(s); save();
      audit(user.id, 'auth.login', '');
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': `astra=${s.token}; Path=/; HttpOnly; SameSite=Lax` });
      return res.end(JSON.stringify({ user, token: s.token }));
    }
    if (p === '/api/auth/logout' && req.method === 'POST') {
      const c = parseCookies(req.headers.cookie);
      db.sessions = db.sessions.filter((s) => s.token !== c.astra); save();
      res.writeHead(200, { 'set-cookie': 'astra=; Path=/; Max-Age=0' }); return res.end('{}');
    }

    const user = authUser(req);
    if (p === '/api/stream') {
      if (!user) return json(res, { error: 'unauthorized' }, 401);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write('data: ' + JSON.stringify({ type: 'hello' }) + '\n\n');
      const set = clients.get(user.id) || new Set();
      set.add(res); clients.set(user.id, set);
      req.on('close', () => { set.delete(res); });
      return;
    }
    if (!user && p.startsWith('/api/')) return json(res, { error: 'unauthorized' }, 401);

    // ---------- me / settings / permissions ----------
    if (p === '/api/me') return json(res, { user, permissions: permsOf(user.id), settings: settingsOf(user.id), skillStates: db.skillStates[user.id] || {}, permsMeta: PERMS });
    if (p === '/api/permissions' && req.method === 'PUT') {
      const b = await body(req);
      const pm = permsOf(user.id);
      for (const [k, v] of Object.entries(b)) if (PERMS.some((x) => x.key === k) && ['on', 'ask', 'denied'].includes(v as string)) pm[k] = v;
      audit(user.id, 'permissions.update', Object.keys(b).join(',')); save();
      return json(res, { permissions: pm });
    }
    if (p === '/api/settings' && req.method === 'PUT') {
      const b = await body(req);
      const s = settingsStore(user.id);
      Object.assign(s, b); save();
      audit(user.id, 'settings.update', Object.keys(b).join(','));
      return json(res, { settings: s });
    }
    if (p === '/api/models') return json(res, { models: await E.xkiroModels() });
    if (p === '/api/telegram/test' && req.method === 'POST') {
      const b = await body(req);
      try {
        const r = await fetch(`https://api.telegram.org/bot${b.token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: b.chatId, text: '\uD83D\uDD2E Astra test notification \u2014 channel connected.' }) });
        const j: any = await r.json();
        return json(res, { ok: !!j.ok, detail: j.description || '' });
      } catch (e: any) { return json(res, { ok: false, detail: String(e?.message) }); }
    }

    // ---------- agents / skills ----------
    if (p === '/api/agents') {
      if (req.method === 'POST') {
        const b = await body(req);
        const a = { id: uid('ag'), custom: true, name: b.name || 'Custom Agent', icon: 'bot', color: '#8b9cff', desc: b.desc || '', skills: b.skills || [], tools: b.tools || [], instructions: b.instructions || '', model: b.model || 'astra-core', permissions: b.permissions || [], createdAt: now() };
        db.agents.unshift(a); audit(user.id, 'agent.create', a.name); save();
        return json(res, a);
      }
      const done = (name: string) => db.tasks.filter((t) => t.status === 'done' && t.steps.some((s: any) => s.agent === name)).length;
      const all = [...AGENTS.map((a) => ({ ...a, status: 'online', tasksCompleted: done(a.name) })), ...db.agents.map((a) => ({ ...a, status: 'online', tasksCompleted: done(a.name) }))];
      return json(res, all);
    }
    if (p === '/api/skills') {
      if (req.method === 'POST') {
        const b = await body(req);
        const s = { id: uid('sk'), custom: true, name: b.name || 'Custom Skill', icon: 'spark', version: '0.1.0', desc: b.desc || '', instructions: b.instructions || '', tools: b.tools || [], permissions: b.permissions || [], examples: b.examples || [], quality: b.quality || [], output: b.output || '—', enabled: true };
        db.skills.unshift(s); audit(user.id, 'skill.create', s.name); save();
        return json(res, s);
      }
      const st = db.skillStates[user.id] || {};
      return json(res, [...SKILLS.map((s) => ({ ...s, enabled: st[s.id]?.enabled !== false })), ...db.skills]);
    }
    const skm = p.match(/^\/api\/skills\/([\w-]+)$/);
    if (skm && req.method === 'PUT') {
      const b = await body(req);
      const st = (db.skillStates[user.id] ||= {});
      const id = skm[1];
      st[id] = { enabled: !!b.enabled };
      const custom = db.skills.find((s) => s.id === id);
      if (custom && b.name) Object.assign(custom, { name: b.name, desc: b.desc, instructions: b.instructions, version: b.version });
      audit(user.id, 'skill.update', id + ' enabled=' + b.enabled); save();
      return json(res, { ok: true });
    }

    // ---------- conversations / chat ----------
    if (p === '/api/conversations') return json(res, db.conversations.filter((c) => c.userId === user.id));
    if (p === '/api/chat' && req.method === 'POST') {
      const b = await body(req);
      const out = await E.handleChat(user, String(b.text || '').slice(0, 4000), b.attachments || [], b.conversationId);
      return json(res, out);
    }

    // ---------- tasks ----------
    if (p === '/api/tasks' && req.method === 'POST') {
      const b = await body(req);
      const task = E.makeTask(user.id, b.type, b.prompt, b.opts || {});
      E.runTask(task.id);
      return json(res, { taskId: task.id });
    }
    if (p === '/api/tasks') return json(res, db.tasks.filter((t) => t.userId === user.id).map(E.pubTask));
    const tm = p.match(/^\/api\/tasks\/([\w-]+)(\/(approval|deploy))?$/);
    if (tm) {
      const task = db.tasks.find((t) => t.id === tm[1] && t.userId === user.id);
      if (!task) return json(res, { error: 'not found' }, 404);
      if (!tm[2]) return json(res, E.pubTask(task));
      if (tm[3] === 'deploy') {
        const url = E.deployTask(task);
        if (!url) return json(res, { error: 'nothing to deploy' }, 400);
        let netlifyUrl: string | null = null;
        let netlifyError: string | null = null;
        if (process.env.NETLIFY_TOKEN) {
          try { netlifyUrl = await E.deployNetlify(task); }
          catch (e: any) { netlifyError = String(e?.message || e); }
        }
        const n = notify(user.id, 'Deployed', task.meta.business + ' is live at ' + url + (netlifyUrl ? ' and ' + netlifyUrl : ''), 'success');
        onEv(user.id, { type: 'notification', n });
        return json(res, { url, netlifyUrl, netlifyError });
      }
      if (tm[3] === 'approval' && req.method === 'POST') {
        const b = await body(req);
        const step = task.steps.find((s: any) => (b.stepId && s.id === b.stepId) || s.status === 'awaiting');
        if (!step) return json(res, { error: 'no pending approval' }, 400);
        if (b.decision === 'approve') { step.approvedOnce = true; step.status = 'pending'; audit(user.id, 'approval.grant', step.approval?.perm || ''); }
        else { step.status = 'skipped'; step.logs.push('You denied this permission \u2014 Astra proceeded without it.'); audit(user.id, 'approval.deny', step.approval?.perm || ''); }
        task.status = 'active'; save();
        E.runTask(task.id);
        return json(res, { ok: true });
      }
    }

    // ---------- notifications ----------
    if (p === '/api/notifications') return json(res, db.notifications.filter((n) => n.userId === user.id).slice(0, 60));
    if (p === '/api/notifications/read' && req.method === 'POST') {
      for (const n of db.notifications) if (n.userId === user.id) n.read = true;
      save(); return json(res, { ok: true });
    }

    // ---------- automations ----------
    if (p === '/api/automations') {
      if (req.method === 'POST') {
        const b = await body(req);
        const sch = E.parseSchedule(b.prompt);
        const a = { id: uid('aut'), userId: user.id, prompt: b.prompt, schedule: sch, nextDue: E.nextDue(sch), active: true, notify: permsOf(user.id).notifications !== 'denied', lastRun: null, createdAt: now() };
        db.automations.unshift(a); audit(user.id, 'automation.create', b.prompt.slice(0, 60)); save();
        return json(res, a);
      }
      return json(res, db.automations.filter((a) => a.userId === user.id));
    }
    const am = p.match(/^\/api\/automations\/([\w-]+)(\/(toggle|run))?$/);
    if (am) {
      const a = db.automations.find((x) => x.id === am[1] && x.userId === user.id);
      if (!a) return json(res, { error: 'not found' }, 404);
      if (am[3] === 'toggle') { a.active = !a.active; save(); return json(res, a); }
      if (am[3] === 'run') { E.runAutomation(a); return json(res, { ok: true }); }
      db.automations = db.automations.filter((x) => x.id !== a.id); save();
      return json(res, { ok: true });
    }

    if (p === '/api/audit') return json(res, db.audit.filter((a) => a.userId === user.id).slice(0, 120));

    return json(res, { error: 'not found' }, 404);
  } catch (e: any) {
    console.error(e);
    return json(res, { error: 'server error: ' + (e?.message || e) }, 500);
  }
});

function onEv(userId: string, ev: any) {
  const set = clients.get(userId);
  if (!set) return;
  const data = 'data: ' + JSON.stringify(ev) + '\n\n';
  for (const r of set) { try { r.write(data); } catch {} }
}

server.listen(PORT, '0.0.0.0', () => console.log('Astra online on :' + PORT));
