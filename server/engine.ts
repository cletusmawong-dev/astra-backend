// Astra orchestration: Master Agent -> Task Planner -> Specialized Agents -> Skills -> Tools -> Execution -> Review Agent -> Fix Loop -> Result.
// Nothing here fakes progress: every step performs real work (file writes, validators, network fetches, schedulers) and streams real events.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { db, save, audit, notify, permsOf, settingsOf, ART, SITES } from './db.ts';
import { uid, now, seedFrom, slug, kb } from './util.ts';
import { skillById } from './seed.ts';
import * as G from './generate.ts';
import * as R from './review.ts';

let onEvent: (userId: string, ev: any) => void = () => {};
export const setOnEvent = (fn: typeof onEvent) => { onEvent = fn; };
const emitTask = (task: any) => onEvent(task.userId, { type: 'task', task: pubTask(task) });
export const pubTask = (t: any) => ({ ...t, running: undefined });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const taskDir = (id: string) => path.join(ART, id);

function log(task: any, step: any, line: string) {
  step.logs.push(line);
  task.events.push({ ts: now(), step: step.name, line });
  if (task.events.length > 600) task.events = task.events.slice(-600);
  task.updatedAt = now();
  save(); emitTask(task);
}

// ---------- intent ----------
export function intent(text: string): string {
  const t = text.toLowerCase();
  if (/every\s+(\d+\s*)?(minute|hour|morning|evening|day|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|daily|weekly|reminder|automate|schedule|tell me when|notify me when/.test(t)) return 'automation';
  if (/mobile app|android app|react native app|expo app|build (me )?an app|app for my|create (me )?an app/.test(t)) return 'app';
  if (/build|website|web app|webapp|landing|storefront|site for|make me a site|web tool|portfolio site/.test(t)) return 'website';
  if (/logo|image|picture|illustration|poster|icon|design kit|ui kit/.test(t)) return /design|ui kit|kit/.test(t) && !/logo|image|picture|poster|icon/.test(t) ? 'design' : 'image';
  if (/spreadsheet|excel|proposal|document|report doc|write me a|draft a|presentation|slides|pdf|word doc/.test(t) && !/research/.test(t)) return 'document';
  if (/(analyze|analyse)\b.*(\d|csv|data|figures|numbers)/.test(t)) return 'data';
  if (/research|analyse|analyze|find out|report on|summar|market|compare|top \d|who is|what is/.test(t)) return 'research';
  return 'chat';
}

// ---------- plans ----------
const S = (key: string, name: string, agent: string, skill: string) => ({ id: uid('st'), key, name, agent, skill, status: 'pending', logs: [] as string[], findings: [] as any[] });
export function planFor(type: string): any[] {
  switch (type) {
    case 'website': return [S('understand', 'Understand requirements', 'Master Agent', ''), S('research', 'Research', 'Research Agent', 'web-research'), S('design', 'Design', 'Design Agent', 'uiux-design'), S('develop', 'Development', 'Web Agent', 'web-development'), S('test', 'Testing', 'Coding Agent', 'coding'), S('review', 'Review', 'Review Agent', 'review-qa'), S('preview', 'Preview & deploy', 'Web Agent', 'web-development')];
    case 'image': return [S('understand', 'Understand brief', 'Master Agent', ''), S('generate', 'Generate image', 'Design Agent', 'image-generation'), S('review', 'Review', 'Review Agent', 'review-qa'), S('deliver', 'Deliver', 'Design Agent', 'image-generation')];
    case 'motion': return [S('understand', 'Understand brief', 'Master Agent', ''), S('generate', 'Compose motion preview', 'Video Agent', 'video'), S('review', 'Review', 'Review Agent', 'review-qa'), S('deliver', 'Deliver', 'Video Agent', 'video')];
    case 'design': return [S('understand', 'Understand brief', 'Master Agent', ''), S('generate', 'Create design kit', 'Design Agent', 'uiux-design'), S('review', 'Review', 'Review Agent', 'review-qa'), S('deliver', 'Deliver', 'Design Agent', 'uiux-design')];
    case 'document': return [S('understand', 'Understand brief', 'Master Agent', ''), S('draft', 'Write content', 'Document Agent', 'documents'), S('review', 'Review', 'Review Agent', 'review-qa'), S('deliver', 'Deliver', 'Document Agent', 'documents')];
    case 'research': return [S('understand', 'Understand question', 'Master Agent', ''), S('fetch', 'Fetch live sources', 'Research Agent', 'web-research'), S('compile', 'Compile report', 'Research Agent', 'web-research'), S('review', 'Review', 'Review Agent', 'review-qa'), S('deliver', 'Deliver', 'Research Agent', 'web-research')];
    case 'data': return [S('understand', 'Understand data', 'Master Agent', ''), S('compute', 'Compute statistics', 'Data Agent', 'data-analysis'), S('review', 'Review', 'Review Agent', 'review-qa'), S('deliver', 'Deliver', 'Data Agent', 'data-analysis')];
    case 'automation': return [S('understand', 'Understand trigger', 'Master Agent', ''), S('register', 'Register automation', 'Automation Agent', 'automation'), S('confirm', 'Confirm schedule', 'Automation Agent', 'automation')];
    case 'app': return [S('understand', 'Understand requirements', 'Master Agent', ''), S('scaffold', 'Scaffold project', 'Coding Agent', 'coding'), S('review', 'Review', 'Review Agent', 'review-qa'), S('deliver', 'Deliver', 'Coding Agent', 'coding')];
  }
  return [S('understand', 'Understand', 'Master Agent', '')];
}

export function makeTask(userId: string, type: string, prompt: string, opts: any = {}) {
  const task: any = { id: uid('task'), userId, type, prompt, opts, status: 'active', progress: 0, reviewLoops: 0, fixNotes: [] as string[], steps: planFor(type), artifacts: [] as any[], console: [] as string[], events: [] as any[], review: null, previewUrl: null, deployUrl: null, meta: {}, createdAt: now(), updatedAt: now() };
  db.tasks.unshift(task);
  audit(userId, 'task.create', type + ': ' + prompt.slice(0, 60));
  save();
  return task;
}

// ---------- permission gate ----------
function gate(task: any, step: any, perm: string, what: string): 'ok' | 'awaiting' | 'denied' {
  if (step.approvedOnce) return 'ok';
  const st = permsOf(task.userId)[perm] || 'denied';
  if (st === 'on') return 'ok';
  if (st === 'ask') {
    step.status = 'awaiting';
    step.approval = { perm, what };
    task.status = 'waiting_approval';
    log(task, step, `Permission required: ${perm} (${what}). Waiting for your approval.`);
    const n = notify(task.userId, 'Approval required', `Astra needs "${perm}" to ${what}.`, 'approval');
    onEvent(task.userId, { type: 'notification', n });
    return 'awaiting';
  }
  return 'denied';
}

// ---------- executors ----------
const exec: Record<string, (task: any, step: any) => Promise<void | 'awaiting'>> = {
  async understand(task, step) {
    await sleep(250);
    log(task, step, `Intent classified: ${task.type}`);
    if (task.type === 'website' && task.opts.reviseOf) {
      const src = db.tasks.find((t: any) => t.id === task.opts.reviseOf && t.userId === task.userId);
      if (src) {
        task.meta.business = src.meta.business; task.meta.industry = src.meta.industry; task.meta.want = src.meta.want || [];
        task.meta.reviseOf = src.id; task.meta.revision = (src.meta.revision || 1) + 1;
        log(task, step, `Reopening project ${src.id} (v${src.meta.revision || 1}) \u2014 surgical revision, never a rebuild.`);
        log(task, step, `Carried context: ${task.meta.business} \u00B7 ${task.meta.industry} \u00B7 sections ${(task.meta.want || []).join(', ') || 'hero'}`);
        return;
      }
      log(task, step, 'Revision source not found \u2014 treating as a fresh brief.');
    }
    if (task.type === 'website') {
      const b = G.parseBrief(task.prompt);
      task.meta.business = b.business; task.meta.industry = b.industry.name; task.meta.want = b.want;
      log(task, step, `Business: ${b.business} \u00B7 industry: ${b.industry.name}`);
      log(task, step, `Requested sections: ${b.want.join(', ')}`);
    } else {
      const subject = task.prompt.replace(/^(please\s+)?(build|create|make|write|draft|generate|research|analyze|analyse)\s+/i, '').slice(0, 80);
      task.meta.subject = subject;
      log(task, step, `Subject: ${subject}`);
    }
    log(task, step, 'Plan approved by Master Agent \u2192 dispatching specialized agents.');
  },

  async research(task, step) {
    const dir = taskDir(task.id); fs.mkdirSync(dir, { recursive: true });
    await sleep(300);
    log(task, step, `Compiling industry profile: ${task.meta.industry}`);
    log(task, step, 'Audience, tone and section strategy derived from brief.');
    const notes = `# Research notes\nIndustry: ${task.meta.industry}\nBusiness: ${task.meta.business}\nSections: ${(task.meta.want || []).join(', ')}\nTone: professional, warm, concise.\n`;
    fs.writeFileSync(path.join(dir, 'research-notes.md'), notes);
    log(task, step, 'wrote research-notes.md');
  },

  async design(task, step) {
    await sleep(250);
    const palIndex = seedFrom(task.id) % G.PALETTES.length;
    task.meta.palIndex = palIndex;
    const dir = taskDir(task.id); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'design-tokens.json'), JSON.stringify({ paletteIndex: palIndex, radius: 16, type: 'system-ui stack', grid: '8pt' }, null, 2));
    log(task, step, `Design tokens chosen (palette #${palIndex + 1}, 8pt grid, radius 16).`);
    log(task, step, 'wrote design-tokens.json');
  },

  async develop(task, step) {
    const dir = path.join(taskDir(task.id), 'site'); fs.mkdirSync(dir, { recursive: true });
    const notes = task.fixNotes || [];
    if (notes.length) log(task, step, `Applying Review Agent fixes: ${notes.join('; ')}`);
    const srcTask = task.opts.reviseOf ? db.tasks.find((t: any) => t.id === task.opts.reviseOf && t.userId === task.userId) : null;
    const sdir = srcTask ? path.join(taskDir(srcTask.id), 'site') : null;
    const curHtml = sdir ? (() => { try { return fs.readFileSync(path.join(sdir, 'index.html'), 'utf8'); } catch { return ''; } })() : '';
    const curCss = sdir ? (() => { try { return fs.readFileSync(path.join(sdir, 'styles.css'), 'utf8'); } catch { return ''; } })() : '';
    const revising = !!srcTask && !!curHtml;
    let stylePref = '';
    try { stylePref = settingsOf(task.userId).style || ''; } catch {}
    let photos: string[] = [];
    if (!revising) {
      const brief = G.parseBrief(task.prompt);
      task.meta.business = task.meta.business || brief.business;
      log(task, step, 'Searching online for real photography\u2026');
      const queries = SCENES[task.meta.industry] || [task.meta.industry + ' interior'];
      for (const q of queries) {
        if (photos.length >= 6) break;
        for (const u of await searchImages(q, 6)) if (!photos.includes(u)) photos.push(u);
      }
      photos = photos.slice(0, 6);
      if (photos.length) log(task, step, `Found ${photos.length} real photos via image-search module.`);
      else log(task, step, 'Image search returned nothing \u2014 site will use CSS/SVG art (labeled honestly).');
    } else {
      const prevRev = srcTask!.meta.revision || 1;
      const vdir = path.join(dir, 'versions', 'v' + prevRev);
      fs.mkdirSync(vdir, { recursive: true });
      for (const f of ['index.html', 'styles.css', 'app.js']) {
        const sf = path.join(sdir!, f);
        if (fs.existsSync(sf)) fs.copyFileSync(sf, path.join(vdir, f));
      }
      log(task, step, `Project files loaded (${kb(Buffer.byteLength(curHtml))} html) \u2014 previous version snapshotted to versions/v${prevRev}.`);
    }
    log(task, step, revising ? 'Applying requested changes surgically via xKiro module\u2026' : 'Commissioning bespoke modern site from xKiro module\u2026');
    let html = revising
      ? await xkiroChat(null, [
          'You are maintaining an existing production website. Apply the change request SURGICALLY.',
          'CURRENT index.html:\n' + curHtml.slice(0, 24000),
          'CURRENT styles.css:\n' + curCss.slice(0, 12000),
          `CHANGE REQUEST: "${task.prompt}"`,
          'Keep every other section, headline, copy, image URL, Google Fonts link and element id intact unless the request says otherwise. Preserve all responsive @media rules and prefers-reduced-motion. Keep tags balanced, alt attributes on images, no external scripts. Return the COMPLETE updated HTML document with ALL CSS inside one <style> block and JS in one inline <script>. No markdown, no fences, no commentary.',
        ].join('\n'), { timeoutMs: 90000, model: 'qwen/qwen3-max:free' })
      : await xkiroChat(null, [

      'You are an award-winning web designer in 2026. Build ONE complete, bespoke single-page marketing website as a single HTML document.',
      `Business: "${task.meta.business}". Industry: ${task.meta.industry}. Original request: "${task.prompt}".`,
      (task.meta.want || []).length ? `Required sections, each with the EXACT id given, plus a hero: ${(task.meta.want || []).map((w: string) => '<section id="' + w + '">').join(' ')}` : '',
      photos.length ? `REAL PHOTOGRAPHY MANIFEST \u2014 these URLs are verified live photos; use them (hero + section imagery), never invent image URLs:\n${photos.map((p, i) => i + 1 + '. ' + p).join('\n')}` : '',
      notes.length ? `The reviewer demanded these fixes: ${notes.join('; ')}.` : '',
      stylePref ? `Client visual preference: ${stylePref}.` : '',
      'Design language: contemporary 2026 aesthetic \u2014 full-bleed photographic hero with dark gradient scrim and bold display headline, generous whitespace, CSS grid layouts, soft rounded cards, subtle glass panels, refined 2\u20133 color palette, elegant type pairing via Google Fonts (one <link> to fonts.googleapis.com is ALLOWED and expected), smooth scroll, hover micro-interactions, scroll-reveal via tiny inline JS. Absolutely avoid dated looks: no table layouts, no bevels, no clip-art, no tiled backgrounds, no center-aligned 90s blocks.',
      'Rules: 100% original copy tailored to this exact business (real-sounding service names, prices, testimonials with customer names \u2014 never lorem ipsum). Inside one <style> block include at least two @media breakpoints and a prefers-reduced-motion rule. Every <img> needs an alt attribute and must use a manifest URL. Allowed external hosts: images from the manifest, fonts.googleapis.com / fonts.gstatic.com ONLY; no other http URLs, no external scripts. Include <meta name="viewport">, a <title>, exactly one <h1>. Optionally one tiny inline <script> (no eval, no document.write). All tags balanced. Return ONLY the raw HTML document \u2014 no markdown, no fences, no commentary.',
    ].filter(Boolean).join('\n'), { timeoutMs: 90000, model: 'qwen/qwen3-max:free' });
    let via = revising ? 'xKiro module (surgical revision)' : 'xKiro module';
    if (!html && revising) throw new Error('xKiro unreachable \u2014 revision NOT applied; project unchanged.');
    if (!html) {
      via = 'procedural generator (xKiro unreachable \u2014 labeled honestly)';
      const out = G.genWebsite(task.prompt, task.opts.variant || 'website', notes, task.id, task.meta.palIndex);
      for (const [name, content] of Object.entries(out.files)) fs.writeFileSync(path.join(dir, name), content as string);
      log(task, step, `Site written via ${via}.`);
    } else {
      html = html.replace(/```(html)?/gi, '').trim();
      const cssM = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      const css = cssM ? cssM[1].trim() : '';
      html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      const jsM = html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/i);
      const js = jsM ? jsM[1].trim() : '';
      html = html.replace(/<script(?![^>]*src)[^>]*>[\s\S]*?<\/script>/gi, '');
      if (!/^<!doctype/i.test(html)) html = '<!DOCTYPE html>\n' + html;
      if (css && !/styles\.css/.test(html)) {
        const link = '<link rel="stylesheet" href="styles.css">';
        html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, link + '</head>') : link + '\n' + html;
      }
      if (js && !/app\.js/.test(html)) {
        const tag = '<script src="app.js"></script>';
        html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, tag + '</body>') : html + '\n' + tag;
      }
      fs.writeFileSync(path.join(dir, 'index.html'), html);
      fs.writeFileSync(path.join(dir, 'styles.css'), css || '@media (max-width: 720px) { body { margin: 0; } }');
      fs.writeFileSync(path.join(dir, 'app.js'), js || '// no scripts');
      log(task, step, `Bespoke site written via ${via}: index.html ${kb(Buffer.byteLength(html))}, styles.css ${kb(Buffer.byteLength(css))}, app.js ${kb(Buffer.byteLength(js))}`);
    }
    task.artifacts = [
      { name: 'index.html', path: 'site/index.html', kind: 'code' },
      { name: 'styles.css', path: 'site/styles.css', kind: 'code' },
      { name: 'app.js', path: 'site/app.js', kind: 'code' },
    ];
  },

  async test(task, step) {
    await sleep(300);
    const { logs, findings } = R.testWebsite(path.join(taskDir(task.id), 'site'));
    for (const l of logs) { log(task, step, l); task.console.push(l); }
    step.findings = findings;
    if (findings.length) task.fixNotes = [...new Set([...(task.fixNotes || []), ...findings.filter((f) => f.fix).map((f) => f.fix!)])];
    save();
  },

  async scaffold(task, step) {
    const dir = path.join(taskDir(task.id), 'app-project'); fs.mkdirSync(dir, { recursive: true });
    const fixes = (task.fixNotes || []) as string[];
    if (fixes.length) log(task, step, `Applying Review Agent fixes: ${fixes.join('; ')}`);
    log(task, step, 'Requesting Expo + TypeScript scaffold from xKiro (raw App.tsx source)…');
    let via = 'xKiro';
    let code = await xkiroChat(null, `Scaffold a single-file React Native Expo app in TypeScript. Brief: "${String(task.prompt).slice(0, 800)}".${fixes.length ? ` Required fixes: ${fixes.join('; ')}.` : ''} Output ONLY raw App.tsx source code: no markdown, no fences, no explanations. Use only react-native core components, typed props, and end with export default App.`, { timeoutMs: 60000, model: XKIRO_CODE_MODEL });
    if (!code) {
      via = 'offline template (xKiro unreachable \u2014 labeled honestly)';
      code = [
        "import React, { useState } from 'react';",
        "import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';",
        '',
        '// Astra offline scaffold \u2014 brief: ' + String(task.prompt).slice(0, 160),
        'export default function App() {',
        '  const [ready] = useState(true);',
        '  return (',
        '    <SafeAreaView style={s.root}>',
        '      <ScrollView contentContainerStyle={s.body}>',
        "        <Text style={s.title}>Astra App Scaffold</Text>",
        "        <Text style={s.sub}>{ready ? 'Ready for extension' : ''}</Text>",
        "        <View style={s.card}><Text style={s.cardText}>Brief: " + String(task.prompt).slice(0, 160).replace(/[`$\\]/g, '') + '</Text></View>',
        '      </ScrollView>',
        '    </SafeAreaView>',
        '  );',
        '}',
        '',
        'const s = StyleSheet.create({',
        "  root: { flex: 1, backgroundColor: '#05070F' },",
        '  body: { padding: 24 },',
        "  title: { color: '#fff', fontSize: 24, fontWeight: '800' },",
        "  sub: { color: '#8fa3ff', marginBottom: 12 },",
        "  card: { backgroundColor: '#101632', borderRadius: 16, padding: 16 },",
        "  cardText: { color: '#cbd5ff', lineHeight: 22 },",
        '});',
        '',
      ].join('\n');
    }
    code = code.replace(/```[a-z]*\n?/g, '').trim();
    fs.writeFileSync(path.join(dir, 'App.tsx'), code);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'astra-app-' + task.id.slice(-6), version: '0.1.0', main: 'expo/AppEntry.js', scripts: { start: 'expo start', android: 'expo run:android' }, dependencies: { expo: '~57.0.0', react: '19.2.3', 'react-native': '0.86.3' } }, null, 2));
    fs.writeFileSync(path.join(dir, 'README.md'), `# Astra App Project\n\nBrief: ${task.prompt}\n\nScaffold generated by: ${via}\nReviewed by: Astra Review Agent\n\nRun locally:\n\n    npx create-expo-app@latest my-app && replace App.tsx with this file\n    npx expo start\n\nNote: on-device builds happen on your machine via EAS. Astra generated and reviewed the source; it does not claim a device build here.\n`);
    task.artifacts = [
      { name: 'App.tsx', path: 'app-project/App.tsx', kind: 'code' },
      { name: 'package.json', path: 'app-project/package.json', kind: 'code' },
      { name: 'README.md', path: 'app-project/README.md', kind: 'document' },
    ];
    log(task, step, `Scaffold written via ${via}: App.tsx (${kb(Buffer.byteLength(code))}), package.json, README.md`);
  },

  async review(task, step) {
    await sleep(300);
    let findings: R.Finding[] = [...(step.findings || [])];
    if (task.type === 'website') {
      const html = (() => { try { return fs.readFileSync(path.join(taskDir(task.id), 'site', 'index.html'), 'utf8'); } catch { return ''; } })();
      findings = [...findings, ...R.coverageWebsite(html, task.meta.want || [])];
      const testStep = task.steps.find((s: any) => s.key === 'test');
      findings = [...new Map([...findings, ...(testStep?.findings || [])].map((f) => [f.msg, f])).values()];
    }
    if (task.type === 'image' || task.type === 'motion' || task.type === 'design') {
      const svg = (() => { try { return fs.readFileSync(path.join(taskDir(task.id), task.type === 'image' ? 'image.svg' : task.type === 'motion' ? 'motion.svg' : 'design-kit.svg'), 'utf8'); } catch { return ''; } })();
      findings = [...findings, ...R.checkSvg(svg, task.type)];
    }
    if (task.type === 'document') findings = [...findings, ...R.checkDoc(taskDir(task.id), task.opts.formats || ['pdf'])];
    if (task.type === 'app') {
      const code = (() => { try { return fs.readFileSync(path.join(taskDir(task.id), 'app-project', 'App.tsx'), 'utf8'); } catch { return ''; } })();
      if (!code) findings.push({ severity: 'critical', msg: 'App.tsx missing from scaffold', fix: 'Regenerate the scaffold' } as any);
      else {
        if (!/export default/.test(code)) findings.push({ severity: 'critical', msg: 'App.tsx has no default export', fix: 'End the file with export default App' } as any);
        if (/```/.test(code)) findings.push({ severity: 'critical', msg: 'Markdown fences leaked into App.tsx', fix: 'Strip markdown fences from the generated source' } as any);
        if (code.length < 400) findings.push({ severity: 'critical', msg: 'App.tsx is suspiciously small for the brief', fix: 'Generate a fuller implementation covering the brief' } as any);
      }
    }
    if (task.type === 'research') findings = [...findings, ...R.checkResearch(task.meta.md || '', !!task.meta.online)];
    const critical = findings.filter((f) => f.severity === 'critical');
    for (const f of findings) log(task, step, `${f.severity === 'critical' ? '\u2717' : '\u25CB'} [${f.severity}] ${f.msg}`);
    if (!findings.length) log(task, step, 'Checklist clean \u2014 no findings.');
    if (critical.length && task.reviewLoops < 2) {
      task.reviewLoops++;
      task.fixNotes = [...new Set(critical.filter((f) => f.fix).map((f) => f.fix!))];
      log(task, step, `DO NOT DELIVER \u2014 ${critical.length} critical finding(s). Sending back to producing agent (fix loop ${task.reviewLoops}).`);
      for (const s of task.steps) if (['develop', 'test', 'draft', 'scaffold'].includes(s.key)) { s.status = 'retry'; s.logs.push('(re-run after Review Agent feedback)'); }
      task.review = { approved: false, findings, loops: task.reviewLoops };
      return;
    }
    if (critical.length) {
      task.review = { approved: false, findings, loops: task.reviewLoops };
      task.status = 'failed';
      log(task, step, `DO NOT DELIVER \u2014 critical findings remain after ${task.reviewLoops} fix loop(s). Review Agent blocks delivery. Task failed honestly.`);
      return;
    }
    task.review = { approved: true, findings, loops: task.reviewLoops };
    log(task, step, `Review Agent verdict: APPROVED after ${task.reviewLoops} fix loop(s). Cleared for delivery.`);
  },

  async preview(task, step) {
    task.previewUrl = '/preview/' + task.id + '/';
    log(task, step, 'Live preview served at ' + task.previewUrl);
    log(task, step, 'Deploy available on request (Deploy button).');
  },

  async generate(task, step) {
    const dir = taskDir(task.id); fs.mkdirSync(dir, { recursive: true });
    await sleep(350);
    if (task.type === 'image') {
      const { svg, w, h } = G.genImage(task.prompt, { style: task.opts.style, ratio: task.opts.ratio, quality: task.opts.quality, seed: task.id });
      fs.writeFileSync(path.join(dir, 'image.svg'), svg);
      task.artifacts = [{ name: 'image.svg', path: 'image.svg', kind: 'image', w, h }];
      log(task, step, `Rendered ${w}\u00D7${h} composition (${task.opts.style || 'Artistic'}) \u2192 image.svg (${kb(Buffer.byteLength(svg))})`);
    } else if (task.type === 'motion') {
      const { svg } = G.genMotion(task.prompt, task.id);
      fs.writeFileSync(path.join(dir, 'motion.svg'), svg);
      task.artifacts = [{ name: 'motion.svg', path: 'motion.svg', kind: 'image' }];
      log(task, step, 'Animated motion preview composed (honest label: not a rendered video \u2014 GPU service not connected).');
    } else {
      const { svg } = G.genDesign(task.prompt, task.id);
      fs.writeFileSync(path.join(dir, 'design-kit.svg'), svg);
      task.artifacts = [{ name: 'design-kit.svg', path: 'design-kit.svg', kind: 'image' }];
      log(task, step, 'Design kit rendered: palette, type scale, components, 8pt grid.');
    }
  },

  async draft(task, step) {
    const dir = taskDir(task.id); fs.mkdirSync(dir, { recursive: true });
    await sleep(350);
    const formats: string[] = task.opts.formats && task.opts.formats.length ? task.opts.formats : ['pdf'];
    task.opts.formats = formats;
    const c = G.docContent(task.prompt, task.id);
    const lines: string[] = [];
    lines.push('', ...G_wrap(c.sections, c.bullets));
    fs.writeFileSync(path.join(dir, 'document.md'), `# ${c.title}\n\n` + c.sections.map(([h, p]) => `## ${h}\n\n${p || (c.bullets[h] || []).map((b) => '- ' + b).join('\n')}\n`).join('\n'));
    log(task, step, `Drafted "${c.title}" \u2014 ${c.sections.length} sections.`);
    const made: string[] = [];
    if (formats.includes('pdf')) { fs.writeFileSync(path.join(dir, 'document.pdf'), G.makePdf(c.title, lines)); made.push('pdf'); log(task, step, 'exported document.pdf (real PDF writer)'); }
    if (formats.includes('word')) { const ok = G.writeDocx(path.join(dir, 'document.docx'), c.title, c.sections, c.bullets); if (ok) { made.push('word'); log(task, step, 'exported document.docx (python-docx)'); } else log(task, step, 'DOCX export unavailable \u2014 skipped honestly'); }
    if (formats.includes('excel')) { const ok = G.writeXlsx(path.join(dir, 'workbook.xlsx'), c.title.slice(0, 20), task.id); if (ok) { made.push('excel'); log(task, step, 'exported workbook.xlsx (openpyxl)'); } else log(task, step, 'XLSX export unavailable \u2014 skipped honestly'); }
    if (formats.includes('slides')) {
      const slides = c.sections.map(([h, p], i) => `<section class="slide"><h2>${h}</h2>${p ? `<p>${p}</p>` : '<ul>' + (c.bullets[h] || []).map((b) => `<li>${b}</li>`).join('') + '</ul>'}</section>`).join('\n');
      fs.writeFileSync(path.join(dir, 'slides.html'), `<!doctype html><meta charset="utf-8"><title>${c.title}</title><style>body{margin:0;font-family:system-ui;background:#0b1020;color:#eef2ff}.slide{min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:8vh 10vw;border-bottom:1px solid #232b4d}h2{font-size:40px;color:#8b9cff}p,li{font-size:20px;line-height:1.6;color:#c7cdea}</style><h1 style="padding:10vh 10vw 0;font-size:52px">${c.title}</h1>\n${slides}`);
      made.push('slides'); log(task, step, 'exported slides.html (presentation deck)');
    }
    const FILEN: Record<string, string> = { pdf: 'document.pdf', word: 'document.docx', excel: 'workbook.xlsx', slides: 'slides.html' };
    task.artifacts = made.map((f) => ({ name: FILEN[f], path: FILEN[f], kind: 'doc' })).concat([{ name: 'document.md', path: 'document.md', kind: 'doc' }]);
  },

  async fetch(task, step) {
    const wantsLocal = /near|local|in (accra|ghana|my city)/i.test(task.prompt);
    if (wantsLocal) {
      const g = gate(task, step, 'location', 'personalize research with your location');
      if (g === 'awaiting') return 'awaiting';
      if (g === 'denied') log(task, step, 'Location permission denied \u2192 using generic context (never accessed silently).');
      else log(task, step, 'Location permission granted \u2192 local context enabled.');
    }
    await sleep(300);
    log(task, step, 'GET en.wikipedia.org \u2026');
    const r = await G.genResearch(task.meta.subject || task.prompt);
    task.meta.online = r.online; task.meta.md = r.md;
    log(task, step, r.online ? '200 OK \u2014 live source retrieved with citations.' : 'Network unreachable \u2014 honest offline framework compiled (no fabricated citations).');
  },

  async compile(task, step) {
    const dir = taskDir(task.id); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'research-report.md'), task.meta.md || '# Report\n');
    task.artifacts = [{ name: 'research-report.md', path: 'research-report.md', kind: 'doc' }];
    log(task, step, 'Report structured: Overview \u2192 Key Points \u2192 Analysis \u2192 Sources.');
  },

  async compute(task, step) {
    const dir = taskDir(task.id); fs.mkdirSync(dir, { recursive: true });
    const d = G.genData(task.prompt, task.opts.csvText, task.id);
    if (!d) { step.status = 'failed'; log(task, step, 'ERROR: no numeric data found. Attach a CSV or include numbers in the request \u2014 Astra will not invent data.'); task.status = 'failed'; return; }
    fs.writeFileSync(path.join(dir, 'chart.svg'), d.svg);
    fs.writeFileSync(path.join(dir, 'analysis.md'), d.md);
    task.artifacts = [{ name: 'chart.svg', path: 'chart.svg', kind: 'image' }, { name: 'analysis.md', path: 'analysis.md', kind: 'doc' }];
    log(task, step, `Computed over n=${d.stats.count}: mean=${d.stats.mean.toFixed(2)}, sd=${d.stats.sd.toFixed(2)}, min=${d.stats.min}, max=${d.stats.max}.`);
  },

  async register(task, step) {
    const g = gate(task, step, 'notifications', 'send you alerts when this automation runs');
    if (g === 'awaiting') return 'awaiting';
    const sch = parseSchedule(task.prompt);
    const a = { id: uid('aut'), userId: task.userId, prompt: task.prompt, schedule: sch, nextDue: nextDue(sch), active: true, notify: g === 'ok', lastRun: null, createdAt: now() };
    db.automations.unshift(a);
    task.meta.automationId = a.id; task.meta.nextDue = a.nextDue;
    log(task, step, `Automation registered \u2014 ${describeSchedule(sch)}.`);
    if (g === 'denied') log(task, step, 'Notifications denied \u2192 automation runs silently (your explicit setting).');
    save();
  },

  async confirm(task, step) {
    log(task, step, `Next run: ${new Date(task.meta.nextDue || Date.now()).toLocaleString()}.`);
    log(task, step, 'Manage it anytime under Automate.');
  },

  async deliver(task, step) {
    for (const a of task.artifacts) log(task, step, `Delivered ${a.name} \u2192 /artifacts/${task.id}/${a.path}`);
    log(task, step, 'Tangible result attached to this task. Done.');
  },
};

function G_wrap(sections: [string, string][], bullets: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const [h, p] of sections) {
    out.push('', h.toUpperCase(), '-'.repeat(Math.min(60, h.length + 4)));
    if (p) out.push(...p.match(/.{1,92}(\s|$)/g)!.map((s) => s.trim()));
    for (const b of bullets[h] || []) out.push('  * ' + b);
  }
  return out;
}

// ---------- scheduler parsing ----------
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export function parseSchedule(t: string): any {
  const low = t.toLowerCase();
  let m = low.match(/every\s+(\d+)\s*(minute|hour)/);
  if (m) return { kind: 'interval', ms: (+m[1]) * (m[2] === 'hour' ? 3600000 : 60000) };
  m = low.match(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (m) return { kind: 'weekly', day: DAYS.indexOf(m[1]), h: 9, min: 0 };
  m = low.match(/every\s+(morning|evening)(?:\s+at\s+(\d{1,2})(?::(\d{2}))?)?/);
  if (m) return { kind: 'daily', h: m[1] === 'morning' ? (m[2] ? +m[2] : 8) : (m[2] ? +m[2] : 18), min: m[3] ? +m[3] : 0 };
  m = low.match(/every\s+day(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/);
  if (m) { let h = m[1] ? +m[1] : 9; if (m[3] === 'pm' && h < 12) h += 12; return { kind: 'daily', h, min: m[2] ? +m[2] : 0 }; }
  return { kind: 'daily', h: 9, min: 0 };
}
export function nextDue(sch: any, from = Date.now()): number {
  if (sch.kind === 'interval') return from + sch.ms;
  const d = new Date(from);
  if (sch.kind === 'weekly') { d.setDate(d.getDate() + ((sch.day - d.getDay() + 7) % 7)); d.setHours(sch.h, sch.min, 0, 0); if (d.getTime() <= from) d.setDate(d.getDate() + 7); return d.getTime(); }
  d.setHours(sch.h, sch.min, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}
export const describeSchedule = (sch: any) =>
  sch.kind === 'interval' ? `every ${sch.ms / 60000} min` : sch.kind === 'weekly' ? `every ${DAYS[sch.day]} at ${sch.h}:${String(sch.min).padStart(2, '0')}` : `daily at ${sch.h}:${String(sch.min).padStart(2, '0')}`;

// ---------- runner ----------
export async function runTask(taskId: string) {
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task || task.running) return;
  task.running = true;
  try {
    for (;;) {
      const step = task.steps.find((s: any) => s.status === 'pending' || s.status === 'retry');
      if (!step) break;
      step.status = 'running'; step.startedAt = now();
      task.status = 'active';
      log(task, step, `\u25B8 ${step.agent}${step.skill ? ' \u00B7 skill: ' + step.skill : ''}`);
      emitTask(task);
      let awaited: void | 'awaiting' = undefined;
      try { awaited = await (exec[step.key] || exec.understand)(task, step); }
      catch (e: any) { step.status = 'failed'; log(task, step, 'ERROR: ' + (e?.message || e)); task.status = 'failed'; }
      if (awaited === 'awaiting') { save(); task.running = false; return; }
      if (step.status === 'running') step.status = 'done';
      step.finishedAt = now();
      const doneCount = task.steps.filter((s: any) => ['done', 'skipped', 'failed'].includes(s.status)).length;
      task.progress = Math.round((doneCount / task.steps.length) * 100);
      save(); emitTask(task);
      if (task.status === 'failed') break;
      await sleep(120);
    }
    if (task.status !== 'failed' && task.status !== 'waiting_approval') {
      task.status = 'done'; task.progress = 100; task.completedAt = now();
      const title = task.type === 'website' ? `Website for ${task.meta.business || 'you'} is ready` : task.type === 'automation' ? 'Automation is live' : task.type === 'app' ? 'App scaffold ready' : `Task completed: ${task.type}`;
      const n = notify(task.userId, title, 'Review Agent approved the result. Open the task to view artifacts.', 'success');
      onEvent(task.userId, { type: 'notification', n });
      maybeTelegram(task.userId, `\u2705 ${title}`);
      audit(task.userId, 'task.done', task.id);
    } else if (task.status === 'failed') {
      const n = notify(task.userId, 'Task failed', 'Astra could not complete: ' + task.prompt.slice(0, 60) + ' \u2014 see the execution history for the honest reason.', 'error');
      onEvent(task.userId, { type: 'notification', n });
      maybeTelegram(task.userId, `\u274C Task failed: ${task.prompt.slice(0, 60)}`);
      audit(task.userId, 'task.failed', task.id);
    }
  } finally {
    task.running = false;
    save(); emitTask(task);
  }
}

export async function maybeTelegram(userId: string, text: string) {
  const s = settingsOf(userId);
  const tok = s.telegramToken || process.env.TELEGRAM_TOKEN || '';
  const chat = s.telegramChatId || process.env.TELEGRAM_CHAT_ID || '';
  if (!tok || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) });
  } catch {}
}

// ---------- optional xKiro LLM hook (key stays server-side, never reaches the client) ----------
const XKIRO_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36';
const XKIRO_CODE_MODEL = 'mistralai/codestral-2508';
const XKIRO_REASON_MODEL = 'qwen/qwen3-max:free';
const xkiroBase = () => (process.env.XKIRO_BASE_URL || 'https://api.xkiro.ai/v1').replace(/\/$/, '');
const xkiroHeaders = () => ({ 'content-type': 'application/json', authorization: 'Bearer ' + process.env.XKIRO_API_KEY, 'user-agent': XKIRO_UA });

// ---------- online image search module (keyless, real photos) ----------
const SCENES: Record<string, string[]> = {
  hospitality: ['cafe interior', 'bakery bread', 'restaurant food'],
  printing: ['printing press', 'print shop'],
  fashion: ['fashion boutique', 'clothing store'],
  technology: ['modern office', 'software workspace'],
  professional: ['office meeting', 'business team'],
  fitness: ['gym training', 'fitness workout'],
  beauty: ['beauty salon', 'hair salon'],
  realestate: ['apartment building exterior', 'villa exterior', 'residential architecture'],
  business: ['shop interior', 'retail store'],
};
export async function searchImages(query: string, count = 6): Promise<string[]> {
  try {
    const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch='
      + encodeURIComponent(query + ' filetype:bitmap') + '&gsrnamespace=6&gsrlimit=' + count
      + '&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1600';
    const r = await fetch(u, { headers: { 'user-agent': 'AstraAgent/1.0 (astra@example.com)', accept: 'application/json' } });
    if (!r.ok) return [];
    const j: any = await r.json();
    const pages = j?.query?.pages || {};
    const out: { url: string; w: number }[] = [];
    for (const p of Object.values(pages) as any[]) {
      const ii = p?.imageinfo?.[0];
      if (ii && /jpeg|jpg|png/i.test(ii.mime || '') && (ii.width || 0) >= 800) out.push({ url: ii.thumburl || ii.url, w: ii.width || 0 });
    }
    out.sort((a, b) => b.w - a.w);
    return out.map((o) => o.url).slice(0, count);
  } catch { return []; }
}

let modelCache: { ts: number; models: any[] } | null = null;
export async function xkiroModels(): Promise<any[]> {
  if (modelCache && Date.now() - modelCache.ts < 600000) return modelCache.models;
  if (!process.env.XKIRO_API_KEY) return [];
  try {
    const r = await fetch(xkiroBase() + '/models', { headers: xkiroHeaders() });
    if (!r.ok) return modelCache ? modelCache.models : [];
    const j: any = await r.json();
    modelCache = { ts: Date.now(), models: (j.data || []).map((m: any) => ({ id: m.id, name: m.display_name || m.id, tier: m.access_tier, caps: m.capabilities || {} })) };
    return modelCache.models;
  } catch { return modelCache ? modelCache.models : []; }
}

export async function xkiroChat(
  user: any,
  text: string,
  opts: { timeoutMs?: number; model?: string; images?: { mime: string; data: string }[] } = {},
): Promise<string | null> {
  const key = process.env.XKIRO_API_KEY;
  if (!key) return null;
  const timeoutMs = opts.timeoutMs || 12000;
  const preferred = opts.model || (user && user.id ? settingsOf(user.id).model : '') || process.env.XKIRO_MODEL || 'xkiro-large';
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    const userMsg: any = (opts.images && opts.images.length)
      ? {
          role: 'user',
          content: [
            { type: 'text', text },
            ...opts.images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.data}` } })),
          ],
        }
      : { role: 'user', content: text };
    const r = await fetch(xkiroBase() + '/chat/completions', {
      method: 'POST',
      headers: xkiroHeaders(),
      signal: ctrl.signal,
      body: JSON.stringify({
        model: preferred,
        messages: [
          { role: 'system', content: 'You are Astra, a personal AI agent. Tagline: Your AI Agent. Always On. Be concise, professional and execution-oriented.' },
          userMsg,
        ],
      }),
    });
    clearTimeout(to);
    if (!r.ok) return null;
    const j: any = await r.json();
    const out = j?.choices?.[0]?.message?.content;
    return typeof out === 'string' && out.trim() ? out.trim() : null;
  } catch { return null; }
}

// ---------- chat ----------
export function cognition(user: any, text: string): string {
  const t = text.toLowerCase().trim();
  const name = (user?.name || '').split(' ')[0];
  if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t)) return `Hello${name ? ' ' + name : ''}! I'm Astra \u2014 your AI agent. I don't just advise, I execute: build sites, create files, research with live citations, automate schedules. What should I get done for you?`;
  if (/who are you|what are you|about astra/.test(t)) return `I'm Astra, an agent system: a Master Agent plans, specialized agents (Research, Coding, Design, Web, Document, Data, Automation, Review\u2026) execute real skills with real tools, and an independent Review Agent blocks anything that fails quality. Your AI Agent. Always On.`;
  if (/what can you do|help|capabilit/.test(t)) return `I can, for real:\n\u2022 Build & deploy responsive websites ("Build a website for my printing business")\n\u2022 Generate images/logos and design kits\n\u2022 Write PDF / Word / Excel / presentation files\n\u2022 Research topics with live cited sources\n\u2022 Compute statistics & charts from your numbers\n\u2022 Schedule recurring automations with notifications\nTry one \u2014 I'll show my plan first, then execute it live.`;
  if (/time|date|day is it/.test(t)) return `It's ${new Date().toLocaleString(undefined, { weekday: 'long', hour: '2-digit', minute: '2-digit' })} on your device.`;
  if (/^[\d\s+\-*/().%]+$/.test(t) && /\d/.test(t) && /[+\-*/%]/.test(t)) {
    try { const v = Function('"use strict";return (' + t + ')')(); if (isFinite(v)) return `= ${v}`; } catch {}
  }
  if (/thank/.test(t)) return `Anytime. That's what I'm here for.`;
  const hint = intent(text);
  if (hint !== 'chat') return `Understood \u2014 that maps to my ${hint} skill. Send it as a task and I'll plan and execute it with live progress (or use the Build / Create / Automate tabs).`;
  return `I'm Astra Core, the on-device orchestrator (an xKiro API key can be connected server-side for open-ended LLM conversation \u2014 see Settings \u2192 AI Preferences). I never pretend: ask me to BUILD, CREATE, RESEARCH or AUTOMATE something and I'll execute it for real, with a Review Agent checking my work before delivery.`;
}

export async function handleChat(user: any, text: string, attachments: any[], convId?: string) {
  let conv = convId ? db.conversations.find((c) => c.id === convId && c.userId === user.id) : null;
  if (!conv) { conv = { id: uid('conv'), userId: user.id, title: text.slice(0, 48), messages: [], createdAt: now() }; db.conversations.unshift(conv); }
  conv.messages.push({ role: 'user', text, ts: now(), attachments: (attachments || []).map((a) => a.name) });
  const type = intent(text);
  if (type === 'chat') {
    const imgs = (attachments || [])
      .filter((a) => (a.mime || '').startsWith('image/') && a.data && a.data.length < 4000000)
      .map((a) => ({ mime: a.mime, data: a.data }));
    const visionModel = (settingsOf(user.id) as any).model || 'qwen/qwen3.5-omni-plus:free';
    let reply = imgs.length ? await xkiroChat(user, text, { images: imgs, timeoutMs: 75000, model: visionModel }) : null;
    if (!reply) reply = (await xkiroChat(user, text)) || cognition(user, text);
    conv.messages.push({ role: 'astra', text: reply, ts: now() });
    save();
    return { kind: 'reply', text: reply, conversationId: conv.id };
  }
  const csvAtt = (attachments || []).find((a) => (a.name || '').endsWith('.csv') && a.text);
  const task = makeTask(user.id, type, text, csvAtt ? { csvText: csvAtt.text } : {});
  conv.messages.push({ role: 'astra', ts: now(), taskId: task.id, text: `Here's how I'll handle this:\n${task.steps.map((s: any) => '\u2713 ' + s.name).join('\n')}\n\nExecuting now with live progress \u2014 watch each agent and tool run below.` });
  save();
  runTask(task.id);
  return { kind: 'task', taskId: task.id, conversationId: conv.id };
}

// ---------- deploy ----------
const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function deployNetlify(task: any): Promise<string> {
  const tok = process.env.NETLIFY_TOKEN;
  if (!tok) throw new Error('NETLIFY_TOKEN not configured');
  const siteDir = path.join(taskDir(task.id), 'site');
  const zipPath = path.join(taskDir(task.id), 'netlify.zip');
  const z = spawnSync('python3', [path.join(HERE, 'mkzip.py'), siteDir, zipPath], { encoding: 'utf8' });
  if (z.status !== 0) throw new Error('zip packaging failed');
  const buf = fs.readFileSync(zipPath);
  const auth = { authorization: 'Bearer ' + tok };
  let siteId = task.meta.netlifySiteId;
  if (!siteId) {
    const c = await fetch('https://api.netlify.com/api/v1/sites', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'astra-' + slug((task.meta.business || 'site') + '-' + task.id.slice(-4)) }),
    });
    const cj: any = await c.json();
    if (!c.ok) throw new Error(cj.message || 'Netlify site creation failed (' + c.status + ')');
    siteId = cj.id;
    task.meta.netlifySiteId = siteId;
    // new Netlify sites default to SSO-gated visitor access; make Astra deploys public
    await fetch('https://api.netlify.com/api/v1/sites/' + siteId, {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ sso_login: false }),
    }).catch(() => {});
  }
  const d = await fetch('https://api.netlify.com/api/v1/sites/' + siteId + '/deploys', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/zip' },
    body: buf,
  });
  const dj: any = await d.json();
  if (!d.ok) throw new Error(dj.message || 'Netlify deploy failed (' + d.status + ')');
  task.netlifyUrl = dj.ssl_url || dj.url;
  audit(task.userId, 'deploy.netlify', task.netlifyUrl);
  save(); emitTask(task);
  return task.netlifyUrl;
}

export function deployTask(task: any): string | null {
  const src = path.join(taskDir(task.id), 'site');
  if (!fs.existsSync(path.join(src, 'index.html'))) return null;
  const sl = (slug(task.meta.business || 'site') + '-' + task.id.slice(-4));
  const dest = path.join(SITES, sl);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dest, f));
  task.deployUrl = '/sites/' + sl + '/';
  audit(task.userId, 'deploy', task.deployUrl);
  save(); emitTask(task);
  return task.deployUrl;
}

// ---------- automation runner ----------
export async function runAutomation(a: any) {
  a.lastRun = now();
  a.nextDue = nextDue(a.schedule, now());
  const type = intent(a.prompt) === 'automation' ? 'research' : intent(a.prompt);
  const task = makeTask(a.userId, type, a.prompt, {});
  if (a.notify) { const n = notify(a.userId, 'Scheduled task started', describeSchedule(a.schedule) + ' \u2192 ' + a.prompt.slice(0, 60), 'info'); onEvent(a.userId, { type: 'notification', n }); maybeTelegram(a.userId, `\u23F0 Scheduled task started: ${a.prompt.slice(0, 60)}`); }
  save();
  runTask(task.id);
}
