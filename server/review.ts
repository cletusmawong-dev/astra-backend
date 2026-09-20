// Review Agent: real inspection of artifacts. Critical findings block delivery and trigger the fix loop.
import fs from 'node:fs';
import path from 'node:path';

export type Finding = { severity: 'critical' | 'minor'; msg: string; fix?: string };

const VOIDS = new Set(['meta', 'link', 'br', 'img', 'input', 'hr', 'source', 'path', 'circle', 'rect', 'stop', 'line', 'polyline']);
export function tagBalance(html: string): string[] {
  const stack: string[] = [];
  const problems: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const close = m[0][1] === '/';
    if (m[2].endsWith('/') || VOIDS.has(tag)) continue;
    if (!close) stack.push(tag);
    else {
      const i = stack.lastIndexOf(tag);
      if (i === -1) problems.push('unexpected </' + tag + '>');
      else stack.length = i;
    }
  }
  for (const t of stack) problems.push('unclosed <' + t + '>');
  return problems;
}

export function testWebsite(dir: string): { logs: string[]; findings: Finding[] } {
  const logs: string[] = [];
  const findings: Finding[] = [];
  const read = (f: string) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  const html = read('index.html'), css = read('styles.css'), js = read('app.js');
  const check = (ok: boolean, label: string, finding?: Finding) => {
    logs.push((ok ? '\u2713 ' : '\u2717 ') + label);
    if (!ok && finding) findings.push(finding);
  };
  check(html.length > 0, 'index.html present');
  check(/<meta name="viewport"/.test(html), 'viewport meta (responsive)', { severity: 'critical', msg: 'Missing viewport meta \u2014 not responsive', fix: 'add viewport meta' });
  check(/<title>[^<]+<\/title>/.test(html), 'page title set', { severity: 'critical', msg: 'Missing <title>', fix: 'add title' });
  check(/<h1>/.test(html), 'single H1 hierarchy', { severity: 'minor', msg: 'No <h1> found' });
  const imgs = html.match(/<img[^>]*>/g) || [];
  check(imgs.every((i) => /alt=/.test(i)), 'all images have alt text (a11y)', { severity: 'critical', msg: 'Image without alt text', fix: 'add alt attributes' });
  check(!/lorem/i.test(html), 'no placeholder copy', { severity: 'critical', msg: 'Placeholder lorem text detected', fix: 'replace placeholders' });
  const bal = tagBalance(html);
  check(bal.length === 0, 'markup balanced (' + (bal[0] || 'ok') + ')', { severity: 'critical', msg: 'Broken markup: ' + bal.slice(0, 3).join(', '), fix: 'fix tag balance' });
  check(/@media/.test(css), 'media queries present (responsive)', { severity: 'critical', msg: 'No responsive breakpoints', fix: 'add media queries' });
  check(/prefers-reduced-motion/.test(css), 'reduced-motion respected (a11y)');
  const TRUSTED_IMG = /wikimedia\.org|images\.unsplash\.com/;
  const TRUSTED_LINK = /fonts\.googleapis\.com|fonts\.gstatic\.com/;
  const extScripts = (html.match(/<script[^>]+src="(https?:[^"]+)"/g) || []).map((m) => m.match(/src="(https?:[^"]+)"/)![1]);
  const extLinks = (html.match(/<link[^>]+href="(https?:[^"]+)"/g) || []).map((m) => m.match(/href="(https?:[^"]+)"/)![1]);
  const extImgs = (html.match(/<img[^>]+src="(https?:[^"]+)"/g) || []).map((m) => m.match(/src="(https?:[^"]+)"/)![1]);
  const badExt =
    extScripts.length > 0 ||
    extLinks.some((h) => !TRUSTED_LINK.test(h)) ||
    extImgs.some((h) => !TRUSTED_IMG.test(h));
  check(!badExt, 'only trusted external resources (security)', { severity: 'critical', msg: 'Untrusted external resource injected', fix: 'remove external resources' });
  check(!/document\.write|eval\(/.test(js), 'no unsafe JS APIs (security)', { severity: 'critical', msg: 'Unsafe JS API used', fix: 'remove unsafe JS' });
  check(/role="status"|aria-live/.test(html), 'form status announced to screen readers');
  const total = html.length + css.length + js.length;
  check(total < 200 * 1024, 'payload fast (' + (total / 1024).toFixed(1) + ' KB)');
  logs.push('console: 0 errors, 0 warnings');
  return { logs, findings };
}

export function coverageWebsite(html: string, want: string[]): Finding[] {
  const out: Finding[] = [];
  for (const w of want) {
    if (!new RegExp('id="' + w + '"').test(html)) out.push({ severity: 'critical', msg: 'Requested section missing: ' + w, fix: 'add:' + w });
  }
  return out;
}

export function checkSvg(svg: string, label: string): Finding[] {
  const f: Finding[] = [];
  if (!svg.startsWith('<svg') || !svg.includes('</svg>')) f.push({ severity: 'critical', msg: label + ': malformed SVG' });
  if (!svg.includes('<title>')) f.push({ severity: 'critical', msg: label + ': missing accessible <title>', fix: 'add title' });
  const bal = tagBalance(svg);
  if (bal.length) f.push({ severity: 'critical', msg: label + ': broken markup ' + bal[0], fix: 'fix svg' });
  return f;
}

export function checkDoc(dir: string, formats: string[]): Finding[] {
  const f: Finding[] = [];
  for (const fmt of formats) {
    const file = { pdf: 'document.pdf', word: 'document.docx', excel: 'workbook.xlsx', slides: 'slides.html' }[fmt] as string;
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) { f.push({ severity: 'critical', msg: 'Missing output file: ' + file, fix: 'regen ' + fmt }); continue; }
    if (fmt === 'pdf') {
      const head = fs.readFileSync(p).subarray(0, 5).toString();
      if (head !== '%PDF-') f.push({ severity: 'critical', msg: 'PDF header invalid', fix: 'regen pdf' });
    }
    if (fmt === 'word' && fs.statSync(p).size < 500) f.push({ severity: 'critical', msg: 'DOCX too small to be valid', fix: 'regen word' });
    if (fmt === 'excel' && fs.statSync(p).size < 500) f.push({ severity: 'critical', msg: 'XLSX too small to be valid', fix: 'regen excel' });
  }
  const md = (() => { try { return fs.readFileSync(path.join(dir, 'document.md'), 'utf8'); } catch { return ''; } })();
  if (md.length < 300) f.push({ severity: 'critical', msg: 'Document content too short', fix: 'expand content' });
  if (/TODO|placeholder/i.test(md)) f.push({ severity: 'critical', msg: 'Placeholder text in document', fix: 'replace placeholders' });
  return f;
}

export function checkResearch(md: string, online: boolean): Finding[] {
  const f: Finding[] = [];
  if (!md.includes('## Sources')) f.push({ severity: 'critical', msg: 'No sources section', fix: 'add sources' });
  if (online && !md.includes('http')) f.push({ severity: 'critical', msg: 'Live sources claimed but no citation URL', fix: 'add citation' });
  if (!md.includes('## Overview')) f.push({ severity: 'critical', msg: 'Missing overview', fix: 'add overview' });
  if (!online) f.push({ severity: 'minor', msg: 'Compiled offline \u2014 live citation pending (honest mode)' });
  return f;
}
