import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uid, now } from './util.ts';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const DATA = DIR;
export const ART = path.join(DIR, 'artifacts');
export const SITES = path.join(DIR, 'sites');
for (const d of [DIR, ART, SITES]) fs.mkdirSync(d, { recursive: true });

const FILE = path.join(DIR, 'astra.db.json');

const empty = () => ({
  users: [] as any[],
  sessions: [] as any[],
  permissions: {} as Record<string, any>,   // userId -> {key: 'on'|'ask'|'denied'}
  settings: {} as Record<string, any>,     // userId -> prefs
  skillStates: {} as Record<string, any>,  // userId -> {skillId: {enabled}}
  agents: [] as any[],                     // custom agents
  skills: [] as any[],                     // custom skills
  conversations: [] as any[],
  tasks: [] as any[],
  automations: [] as any[],
  notifications: [] as any[],
  audit: [] as any[],
});

let db: any;
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { db = empty(); }
for (const [k, v] of Object.entries(empty())) if (!(k in db)) db[k] = v;

let t: any = null;
export function save() {
  if (t) return;
  t = setTimeout(() => { t = null; try { fs.writeFileSync(FILE, JSON.stringify(db)); } catch {} }, 120);
}
export function saveNow() { try { fs.writeFileSync(FILE, JSON.stringify(db)); } catch {} }
export { db };

export function audit(userId: string, action: string, detail: string) {
  db.audit.unshift({ ts: now(), userId, action, detail });
  db.audit = db.audit.slice(0, 500);
  save();
}

export function notify(userId: string, title: string, body: string, kind = 'info') {
  const n = { id: uid('ntf'), userId, title, body, kind, ts: now(), read: false };
  db.notifications.unshift(n);
  save();
  return n;
}

export const permsOf = (userId: string) => (db.permissions[userId] ||= {});
export const settingsStore = (userId: string) => (db.settings[userId] ||= {
  voiceReplies: false, autonomy: 'ask', style: 'Realistic', telegramToken: '', telegramChatId: '',
});
// merged view: per-user values win, then server-side .env defaults (key never leaves the server)
export const settingsOf = (userId: string) => {
  const s = settingsStore(userId);
  return {
    ...s,
    telegramToken: s.telegramToken || process.env.TELEGRAM_TOKEN || '',
    telegramChatId: s.telegramChatId || process.env.TELEGRAM_CHAT_ID || '',
  };
};
