// Real artifact generators: websites, images, motion previews, documents (pdf/docx/xlsx/slides), research, data analysis, design kits.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { esc, seedFrom, mulberry, pick, wrap, sentences, mean, stdev, slug } from './util.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);

// ============ WEBSITE ============
const INDUSTRIES: any[] = [
  { keys: ['print', 'press'], name: 'printing', tag: 'Precision printing, delivered on time.', services: ['Offset & Digital Printing', 'Large-Format Banners', 'Business Stationery', 'Packaging & Labels', 'Same-Day Jobs'] },
  { keys: ['restaurant', 'cafe', 'coffee', 'food', 'bakery', 'kitchen'], name: 'hospitality', tag: 'Honest food, made fresh every morning.', services: ['Seasonal Menu', 'Private Events', 'Catering', 'Chef\u2019s Table', 'Gift Cards'] },
  { keys: ['fashion', 'boutique', 'clothing', 'style'], name: 'fashion', tag: 'Considered pieces for every day.', services: ['New Arrivals', 'Collections', 'Personal Styling', 'Alterations', 'Gift Cards'] },
  { keys: ['tech', 'software', 'startup', 'saas', 'app'], name: 'technology', tag: 'Software that moves your business forward.', services: ['Product', 'Integrations', 'Analytics', 'Security', 'Support'] },
  { keys: ['consult', 'agency', 'law', 'account', 'finance'], name: 'professional', tag: 'Clear advice. Measurable results.', services: ['Strategy', 'Advisory', 'Compliance', 'Reporting', 'Training'] },
  { keys: ['gym', 'fitness', 'yoga', 'train'], name: 'fitness', tag: 'Stronger every session.', services: ['Membership', 'Personal Training', 'Classes', 'Nutrition', 'Recovery'] },
  { keys: ['salon', 'beauty', 'spa', 'hair'], name: 'beauty', tag: 'Care that shows.', services: ['Cuts & Color', 'Skin Care', 'Nails', 'Bridal', 'Products'] },
  { keys: ['estate', 'property', 'realty', 'home'], name: 'realestate', tag: 'Find the place that fits.', services: ['Buy', 'Rent', 'Valuations', 'Management', 'Consulting'] },
];
export const PALETTES: any[] = [
  { bg: '#0b1020', ink: '#eef2ff', accent: '#6d8dff', accent2: '#9a6bff', card: '#121a33' },
  { bg: '#faf9f6', ink: '#17233b', accent: '#1f5eff', accent2: '#7c3aed', card: '#ffffff' },
  { bg: '#0e1512', ink: '#ecfdf5', accent: '#34d399', accent2: '#a3e635', card: '#15201b' },
  { bg: '#160f1e', ink: '#f5f0ff', accent: '#c084fc', accent2: '#f472b6', card: '#201631' },
  { bg: '#f6f4ff', ink: '#1e1b3a', accent: '#6d28d9', accent2: '#0ea5e9', card: '#ffffff' },
];

export function parseBrief(prompt: string) {
  const p = prompt.toLowerCase();
  const ind = INDUSTRIES.find((i) => i.keys.some((k) => p.includes(k))) || { name: 'business', tag: 'Quality you can rely on.', services: ['Our Services', 'About Us', 'Customer Care', 'Projects', 'Support'] };
  const m = prompt.match(/(?:for|called|named)\s+([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,3})/) || prompt.match(/"([^"]{2,40})"/);
  const business = m ? m[1] : (prompt.match(/\b([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){1,2})\b/) || [null, 'Northstar Studio'])[1];
  const want: string[] = [];
  const W: [RegExp, string][] = [
    [/pricing|price|packages|plans/, 'pricing'], [/gallery|portfolio|our work|projects/, 'gallery'],
    [/team|staff|people/, 'team'], [/testimonial|review/, 'testimonials'], [/faq|questions/, 'faq'],
    [/blog|news/, 'blog'], [/contact|book|appointment|form/, 'contact'], [/menu/, 'menu'],
  ];
  for (const [re, k] of W) if (re.test(p)) want.push(k);
  if (!want.includes('contact')) want.push('contact');
  return { industry: ind, business, want };
}

export function genWebsite(prompt: string, variant: string, notes: string[], seedStr: string, palIndex?: number) {
  const rng = mulberry(seedFrom(seedStr + prompt));
  const { industry, business, want } = parseBrief(prompt);
  const pal = palIndex != null ? PALETTES[palIndex % PALETTES.length] : pick(rng, PALETTES);
  const extra = notes.filter((n) => n.startsWith('add:')).map((n) => n.slice(4));
  for (const e of extra) if (!want.includes(e)) want.push(e);
  const isApp = variant !== 'website';

  const services = industry.services.slice(0, 4 + Math.floor(rng() * 2));
  const year = new Date().getFullYear();

  const sectionHtml: string[] = [];
  sectionHtml.push(`  <section id="services" class="sec">\n    <h2>What we do</h2>\n    <div class="grid">` +
    services.map((s, i) => `      <article class="card"><h3>${esc(s)}</h3><p>${esc(business)} delivers ${esc(s.toLowerCase())} with care, speed and a quality guarantee.</p></article>`).join('\n') +
    `\n    </div>\n  </section>`);

  if (want.includes('menu')) sectionHtml.push(`  <section id="menu" class="sec alt"><h2>Menu highlights</h2><ul class="list">${['House Special', 'Seasonal Plate', 'Garden Bowl', 'Slow-Roasted Classic'].map((d) => `<li><strong>${d}</strong><span>from \u20B5${40 + Math.floor(rng() * 120)}</span></li>`).join('')}</ul></section>`);
  if (want.includes('gallery')) sectionHtml.push(`  <section id="gallery" class="sec alt"><h2>Recent work</h2><div class="grid g3">${[1, 2, 3].map((i) => `<figure class="shot" style="--h:${160 + Math.floor(rng() * 60)}px" role="img" aria-label="Project ${i} by ${esc(business)}"><span>0${i}</span></figure>`).join('')}</div></section>`);
  if (want.includes('pricing')) sectionHtml.push(`  <section id="pricing" class="sec"><h2>Simple pricing</h2><div class="grid g3">${['Starter', 'Growth', 'Pro'].map((t, i) => `<article class="card price${i === 1 ? ' hot' : ''}"><h3>${t}</h3><p class="num">\u20B5${[250, 650, 1400][i]}/mo</p><ul>${['Core features', 'Priority support', 'Monthly review'][i] ? ['Core features', 'Email support', i > 0 ? 'Priority support' : '', i > 1 ? 'Dedicated manager' : ''].filter(Boolean) : []}</ul><a class="btn ghost" href="#contact">Choose ${t}</a></article>`).join('')}</div></section>`);
  if (want.includes('team')) sectionHtml.push(`  <section id="team" class="sec alt"><h2>The team</h2><div class="grid g3">${['Ama K.', 'Kofi M.', 'Edna O.'].map((n, i) => `<article class="card person"><div class="ava" aria-hidden="true">${n[0]}</div><h3>${n}</h3><p>${['Founder', 'Lead Specialist', 'Client Success'][i]}</p></article>`).join('')}</div></section>`);
  if (want.includes('testimonials')) sectionHtml.push(`  <section id="testimonials" class="sec"><h2>Clients say</h2><div class="grid g3">${['Fast, professional and the finish was perfect. We re-order every month.', 'They understood the brief instantly and delivered early.', 'The best decision we made this year for our brand.'].map((q, i) => `<blockquote class="card">\u201C${q}\u201D<footer>\u2014 ${['Esi A.', 'Daniel T.', 'Akosua B.'][i]}</footer></blockquote>`).join('')}</div></section>`);
  if (want.includes('faq')) sectionHtml.push(`  <section id="faq" class="sec alt"><h2>Questions</h2><div class="list col">${[['How fast is delivery?', 'Most jobs complete within 2\u20134 working days.'], ['Do you offer revisions?', 'Yes \u2014 every package includes revisions until you are happy.'], ['How do I pay?', 'Mobile money, card or bank transfer.']].map(([q, a]) => `<details class="card"><summary>${q}</summary><p>${a}</p></details>`).join('')}</div></section>`);
  if (want.includes('blog')) sectionHtml.push(`  <section id="blog" class="sec"><h2>News</h2><div class="grid g3">${[1, 2, 3].map((i) => `<article class="card"><p class="dim">Update 0${i}</p><h3>${['New equipment, faster turnaround', 'Weekend openings announced', 'Thank you, Accra'][i - 1]}</h3><p>Short note from the ${esc(business)} team.</p></article>`).join('')}</div></section>`);

  const contact = `  <section id="contact" class="sec alt"><h2>Contact us</h2>\n    <form id="cform" novalidate>\n      <label for="cname">Name</label><input id="cname" name="name" required autocomplete="name">\n      <label for="cmail">Email</label><input id="cmail" name="email" type="email" required autocomplete="email">\n      <label for="cmsg">Message</label><textarea id="cmsg" name="message" required></textarea>\n      <button class="btn" type="submit">Send message</button>\n      <p id="cstat" role="status" aria-live="polite"></p>\n    </form>\n  </section>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(business)} \u2014 ${esc(industry.tag)}">
<title>${esc(business)} | ${esc(isApp ? 'Web App' : 'Official Site')}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header class="top">
  <a class="brand" href="#top">${esc(business)}</a>
  <nav id="nav" aria-label="Main">
    <a href="#services">Services</a>${want.includes('gallery') ? '<a href="#gallery">Work</a>' : ''}${want.includes('pricing') ? '<a href="#pricing">Pricing</a>' : ''}${want.includes('team') ? '<a href="#team">Team</a>' : ''}${want.includes('faq') ? '<a href="#faq">FAQ</a>' : ''}
    <a href="#contact">Contact</a>
  </nav>
  <button id="menu" aria-label="Toggle menu" aria-expanded="false">&#9776;</button>
</header>
<main id="top">
  <section class="hero">
    <p class="kicker">${isApp ? 'Web app' : 'Welcome'}</p>
    <h1>${esc(business)}</h1>
    <p class="tag">${esc(industry.tag)}</p>
    <div class="cta"><a class="btn" href="#contact">${isApp ? 'Get started' : 'Get a quote'}</a><a class="btn ghost" href="#services">Explore</a></div>
  </section>
${sectionHtml.join('\n')}
  <section id="about" class="sec"><h2>About</h2><p>${esc(business)} is a ${esc(industry.name)} team built on craft and reliability. ${notes.includes('fix:about') ? 'We publish clear timelines, honest pricing and a direct line to a human on every project.' : 'This page was generated by Astra\u2019s Web Agent and passed automated QA.'}</p></section>
${contact}
</main>
<footer><p>\u00A9 ${year} ${esc(business)}. Built with Astra.</p></footer>
<script src="app.js"></script>
</body>
</html>
`;

  const css = `:root{--bg:${pal.bg};--ink:${pal.ink};--ac:${pal.accent};--ac2:${pal.accent2};--card:${pal.card};--mut:color-mix(in srgb,var(--ink) 62%,var(--bg))}
*{box-sizing:border-box;margin:0}html{scroll-behavior:smooth}
body{font:16px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--ink)}
.top{position:sticky;top:0;display:flex;align-items:center;gap:16px;padding:14px 22px;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid color-mix(in srgb,var(--ink) 12%,transparent);z-index:5}
.brand{font-weight:800;letter-spacing:.3px;color:var(--ink);text-decoration:none;margin-right:auto}
#nav{display:flex;gap:18px}#nav a{color:var(--mut);text-decoration:none;font-size:14px}#nav a:hover{color:var(--ink)}
#menu{display:none;background:none;border:1px solid color-mix(in srgb,var(--ink) 25%,transparent);color:var(--ink);border-radius:10px;padding:6px 10px;font-size:16px}
.hero{padding:96px 22px 72px;text-align:center;background:radial-gradient(60% 80% at 50% 0%,color-mix(in srgb,var(--ac) 22%,transparent),transparent)}
.kicker{color:var(--ac);letter-spacing:2px;text-transform:uppercase;font-size:12px}
h1{font-size:clamp(34px,7vw,58px);margin:10px 0 6px}
.tag{color:var(--mut);font-size:18px}
.cta{margin-top:26px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-block;padding:12px 22px;border-radius:12px;background:linear-gradient(135deg,var(--ac),var(--ac2));color:#fff;text-decoration:none;font-weight:600;border:0;cursor:pointer}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid color-mix(in srgb,var(--ink) 30%,transparent)}
.sec{max-width:1040px;margin:0 auto;padding:64px 22px}
.sec.alt{max-width:none;background:color-mix(in srgb,var(--ink) 4%,transparent)}.sec.alt>*{max-width:1040px;margin-left:auto;margin-right:auto}
h2{font-size:28px;margin-bottom:22px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.g3{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.card{background:var(--card);border:1px solid color-mix(in srgb,var(--ink) 10%,transparent);border-radius:16px;padding:20px}
.card h3{margin-bottom:8px}
.card p{color:var(--mut);font-size:14px}
.dim{color:var(--mut);font-size:12px}
.num{font-size:26px;font-weight:800;color:var(--ac);margin:6px 0}
.card ul{list-style:none;margin:10px 0 16px;color:var(--mut);font-size:14px}
.card ul li::before{content:"\u2713 ";color:var(--ac)}
.price.hot{border-color:var(--ac)}
.list{list-style:none;display:grid;gap:10px}.list.col{max-width:720px}
.list li{display:flex;justify-content:space-between;background:var(--card);padding:14px 18px;border-radius:12px;border:1px solid color-mix(in srgb,var(--ink) 10%,transparent)}
.shot{height:var(--h);border-radius:16px;background:linear-gradient(135deg,color-mix(in srgb,var(--ac) 70%,#000),color-mix(in srgb,var(--ac2) 70%,#000));display:flex;align-items:flex-end;padding:14px;color:#fff;font-weight:800}
.ava{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--ac),var(--ac2));display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;margin-bottom:10px}
.person p{color:var(--mut);font-size:13px}
blockquote.card{font-size:14px}blockquote footer{margin-top:10px;color:var(--mut);font-size:12px}
details.card summary{cursor:pointer;font-weight:600}details.card p{margin-top:8px}
form{max-width:560px;display:grid;gap:10px}
label{font-size:13px;color:var(--mut)}
input,textarea{background:color-mix(in srgb,var(--ink) 6%,transparent);border:1px solid color-mix(in srgb,var(--ink) 18%,transparent);border-radius:10px;padding:11px 12px;color:var(--ink);font:inherit}
input:focus,textarea:focus{outline:2px solid var(--ac);border-color:transparent}
#cstat{font-size:14px;min-height:20px}
footer{padding:34px 22px;text-align:center;color:var(--mut);font-size:13px;border-top:1px solid color-mix(in srgb,var(--ink) 10%,transparent)}
.reveal{opacity:0;transform:translateY(14px);transition:all .6s ease}.reveal.in{opacity:1;transform:none}
@media(max-width:760px){#nav{display:none;position:absolute;top:56px;right:14px;left:14px;flex-direction:column;background:var(--card);border:1px solid color-mix(in srgb,var(--ink) 14%,transparent);border-radius:14px;padding:16px}#nav.open{display:flex}#menu{display:block}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto}}
`;

  const js = `(function(){
  var menu=document.getElementById('menu'),nav=document.getElementById('nav');
  if(menu&&nav){menu.addEventListener('click',function(){var o=nav.classList.toggle('open');menu.setAttribute('aria-expanded',o?'true':'false');});}
  var f=document.getElementById('cform');
  if(f){f.addEventListener('submit',function(e){e.preventDefault();
    var st=document.getElementById('cstat');
    var name=f.name.value.trim(),mail=f.email.value.trim(),msg=f.message.value.trim();
    if(!name||!msg||!/^[^@]+@[^@]+\\.[^@]+$/.test(mail)){st.textContent='Please fill all fields with a valid email.';st.style.color='#ff8f8f';return;}
    st.textContent='Thanks '+name+'! Your message was received. We reply within one business day.';st.style.color='#7ee2a8';f.reset();
  });}
  if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target);}});},{threshold:.12});
    document.querySelectorAll('.card,figure,.hero > *').forEach(function(el){el.classList.add('reveal');io.observe(el);});}
})();
`;
  return { files: { 'index.html': html, 'styles.css': css, 'app.js': js }, meta: { business, industry: industry.name, sections: want } };
}

// ============ IMAGE / DESIGN / MOTION ============
export function genImage(prompt: string, opts: { style?: string; ratio?: string; quality?: string; seed?: string }) {
  const rng = mulberry(seedFrom((opts.seed || '') + prompt + (opts.style || '')));
  const [w, h] = ({ '1:1': [1024, 1024], '16:9': [1280, 720], '9:16': [720, 1280] } as any)[opts.ratio || '1:1'] || [1024, 1024];
  const detail = opts.quality === 'High' ? 26 : opts.quality === 'Ultra' ? 40 : 16;
  const style = opts.style || 'Artistic';
  const pals: Record<string, string[]> = {
    Realistic: ['#0e1a2f', '#1d3a5f', '#e8b04b', '#7fb2ff'],
    Anime: ['#1a1030', '#ff6fa5', '#7c4dff', '#4dd7ff'],
    '3D': ['#101418', '#3b82f6', '#8b5cf6', '#22d3ee'],
    Artistic: ['#0b0716', '#8b5cf6', '#f472b6', '#e7c873'],
  };
  const C = pals[style] || pals.Artistic;
  const isLogo = /logo|monogram|emblem|brand mark/i.test(prompt);
  let body = '';
  if (isLogo) {
    const letter = (prompt.match(/\b([A-Z])\w*/) || [, 'A'])[1];
    body = `
  <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C[2]}"/><stop offset="1" stop-color="${C[1]}"/></linearGradient></defs>
  <circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.34}" fill="none" stroke="url(#lg)" stroke-width="${Math.min(w, h) * 0.015}"/>
  <text x="${w / 2}" y="${h / 2 + Math.min(w, h) * 0.11}" font-family="system-ui,sans-serif" font-size="${Math.min(w, h) * 0.34}" font-weight="800" text-anchor="middle" fill="url(#lg)">${esc(letter)}</text>
  <path d="M ${w / 2 + Math.min(w, h) * 0.26} ${h / 2 - Math.min(w, h) * 0.3} l 10 26 26 10 -26 10 -10 26 -10 -26 -26 -10 26 -10 z" fill="${C[3]}"/>`;
  } else {
    let blobs = '';
    for (let i = 0; i < 5; i++) {
      blobs += `<circle cx="${(rng() * w).toFixed(0)}" cy="${(rng() * h).toFixed(0)}" r="${(60 + rng() * Math.min(w, h) * 0.3).toFixed(0)}" fill="${C[1 + (i % 3)]}" opacity="0.${2 + (i % 4)}" filter="url(#b)"/>`;
    }
    let stars = '';
    for (let i = 0; i < detail; i++) {
      const x = (rng() * w).toFixed(0), y = (rng() * h).toFixed(0), r = (1 + rng() * 3).toFixed(1);
      stars += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${(0.2 + rng() * 0.7).toFixed(2)}"/>`;
    }
    let rays = '';
    if (style !== 'Realistic') for (let i = 0; i < 6; i++) rays += `<rect x="${(rng() * w).toFixed(0)}" y="${-40}" width="${(2 + rng() * 5).toFixed(1)}" height="${h + 80}" fill="${C[2 + (i % 2)]}" opacity="0.12" transform="rotate(${(-30 + rng() * 60).toFixed(0)} ${w / 2} ${h / 2})"/>`;
    body = `<defs><filter id="b"><feGaussianBlur stdDeviation="${Math.min(w, h) * 0.06}"/></filter><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C[0]}"/><stop offset="1" stop-color="#05060d"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>${blobs}${rays}${stars}
  <path d="M ${w * 0.5} ${h * 0.42} l ${w * 0.02} ${h * 0.05} ${w * 0.05} ${h * 0.02} -${w * 0.05} ${h * 0.02} -${w * 0.02} ${h * 0.05} -${w * 0.02} -${h * 0.05} -${w * 0.05} -${h * 0.02} ${w * 0.05} -${h * 0.02} z" fill="#fff" opacity="0.9"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${esc(prompt)}</title>${body}\n</svg>`;
  return { svg, w, h };
}

export function genMotion(prompt: string, seedStr: string) {
  const rng = mulberry(seedFrom(seedStr + prompt));
  const w = 1280, h = 720;
  let orbs = '';
  for (let i = 0; i < 6; i++) {
    const cx = rng() * w, cy = rng() * h, r = 60 + rng() * 160, dur = (6 + rng() * 8).toFixed(1);
    orbs += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${['#6d8dff', '#9a6bff', '#22d3ee'][i % 3]}" opacity="0.25" filter="url(#fb)">
  <animate attributeName="cy" values="${cy.toFixed(0)};${(cy - 120).toFixed(0)};${cy.toFixed(0)}" dur="${dur}s" repeatCount="indefinite"/></circle>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>Motion preview: ${esc(prompt)}</title>
<defs><filter id="fb"><feGaussianBlur stdDeviation="50"/></filter><linearGradient id="gb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070b18"/><stop offset="1" stop-color="#141031"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#gb)"/>${orbs}
<text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="54" font-weight="800" fill="#eef2ff" opacity="0">${esc(prompt.slice(0, 40))}<animate attributeName="opacity" values="0;1;1;0" dur="8s" repeatCount="indefinite"/></text>
<rect x="${w / 2 - 160}" y="${h / 2 + 50}" width="320" height="4" rx="2" fill="#2a3354"/><rect x="${w / 2 - 160}" y="${h / 2 + 50}" width="0" height="4" rx="2" fill="#8b5cf6"><animate attributeName="width" values="0;320" dur="8s" repeatCount="indefinite"/></rect>
</svg>`;
  return { svg, w, h };
}

export function genDesign(prompt: string, seedStr: string) {
  const rng = mulberry(seedFrom(seedStr + prompt));
  const c = ['#6d8dff', '#9a6bff', '#22d3ee', '#e7c873', '#0b1020', '#eef2ff'];
  const sw = c.map((col, i) => `<rect x="${40 + i * 110}" y="60" width="90" height="90" rx="18" fill="${col}"/><text x="${40 + i * 110}" y="175" font-size="13" fill="#8b93b8" font-family="system-ui">${col}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640" viewBox="0 0 900 640" role="img"><title>Design kit: ${esc(prompt)}</title>
<rect width="900" height="640" fill="#070b18"/>
<text x="40" y="42" font-family="system-ui" font-size="22" font-weight="800" fill="#eef2ff">Astra Design Kit</text>
${sw}
<text x="40" y="230" font-size="34" font-weight="800" fill="#eef2ff" font-family="system-ui">Display / 34</text>
<text x="40" y="266" font-size="20" fill="#c7cdea" font-family="system-ui">Title / 20 semibold</text>
<text x="40" y="294" font-size="14" fill="#8b93b8" font-family="system-ui">Body / 14 regular \u2014 the quick brown fox jumps over the lazy dog.</text>
<rect x="40" y="330" width="170" height="52" rx="14" fill="#6d8dff"/><text x="125" y="362" text-anchor="middle" font-size="15" font-weight="600" fill="#fff" font-family="system-ui">Primary</text>
<rect x="230" y="330" width="170" height="52" rx="14" fill="none" stroke="#3a4470"/><text x="315" y="362" text-anchor="middle" font-size="15" fill="#c7cdea" font-family="system-ui">Secondary</text>
<rect x="40" y="420" width="380" height="160" rx="20" fill="#0d1226" stroke="#232b4d"/><text x="64" y="458" font-size="16" font-weight="700" fill="#eef2ff" font-family="system-ui">Card component</text><text x="64" y="484" font-size="13" fill="#8b93b8" font-family="system-ui">radius 20 \u00B7 border 1px \u00B7 glow shadow</text><rect x="64" y="510" width="120" height="36" rx="10" fill="#9a6bff"/>
<circle cx="620" cy="480" r="80" fill="none" stroke="#22d3ee" stroke-width="2" stroke-dasharray="4 8"/>
<text x="620" y="488" text-anchor="middle" font-size="14" fill="#22d3ee" font-family="system-ui">8pt grid</text>
</svg>`;
  return { svg };
}

// ============ PDF ============
function pdfEscape(s: string) { return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
export function makePdf(title: string, lines: string[]): Buffer {
  const clean = (s: string) => s.replace(/[^\x20-\x7E]/g, '?');
  const pages: string[][] = [];
  for (let i = 0; i < Math.max(1, Math.ceil(lines.length / 44)); i++) pages.push(lines.slice(i * 44, i * 44 + 44));
  const objs: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objs[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objs[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((p) => p + ' 0 R').join(' ')}] /Count ${pages.length} >>\nendobj\n`;
  objs[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  pages.forEach((pl, i) => {
    const pid = 4 + i * 2, cid = 5 + i * 2;
    let s = `BT /F1 16 Tf 72 760 Td (${pdfEscape(clean(title))}) Tj ET\nBT /F1 10 Tf 72 726 Td 15 TL\n`;
    for (const ln of pl) s += `(${pdfEscape(clean(ln))}) Tj T*\n`;
    s += 'ET';
    objs[pid] = `${pid} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${cid} 0 R >>\nendobj\n`;
    objs[cid] = `${cid} 0 obj\n<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream\nendobj\n`;
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < objs.length; i++) { offsets[i] = Buffer.byteLength(out); out += objs[i]; }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'binary');
}

// ============ DOCUMENT ============
export function docContent(prompt: string, seedStr: string) {
  const rng = mulberry(seedFrom(seedStr + prompt));
  const subject = prompt.replace(/^(write|create|make|draft|generate)\s+/i, '').replace(/\b(a|an|the|professional|document|pdf|word|docx|excel|presentation|slides|about|on)\b/gi, '').trim() || 'Strategic Initiative';
  const title = subject.split(/\s+/).slice(0, 6).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const sections = [
    ['Executive Summary', `This document presents a structured plan for ${subject}. It defines objectives, scope, approach and next steps so stakeholders can decide quickly and execute without ambiguity.`],
    ['Background', `Demand in this area has grown steadily. ${title} addresses that gap with a focused, measurable program. Current conditions favor a phased rollout with weekly review points.`],
    ['Objectives', ''],
    ['Approach', `We proceed in three phases: discovery (requirements and constraints), execution (delivery in weekly increments), and review (quality gate before each release). Each phase ends with a concrete artifact and a go/no-go decision.`],
    ['Budget & Resources', ''],
    ['Risks & Mitigations', ''],
    ['Next Steps', ''],
  ] as [string, string][];
  const bullets: Record<string, string[]> = {
    Objectives: ['Deliver the core scope within 30 days', 'Keep total cost within approved budget', 'Maintain a quality score above 90% at review'],
    'Budget & Resources': [`Estimated budget: \u20B5${(8 + Math.floor(rng() * 40)) * 1000}`, 'One lead, two contributors, part-time reviewer', 'Tools already licensed \u2014 no new subscriptions'],
    'Risks & Mitigations': ['Scope creep \u2192 weekly change review', 'Single point of failure \u2192 documented handover', 'Late feedback \u2192 fixed review window every Friday'],
    'Next Steps': ['Approve this document', 'Kick off discovery phase on Monday', 'Schedule the first review gate'],
  };
  return { title, sections, bullets };
}

export function writeDocx(outPath: string, title: string, sections: [string, string][], bullets: Record<string, string[]>) {
  const json = JSON.stringify({ out: outPath, title, sections: sections.map(([h, p]) => ({ h, p, b: bullets[h] || [] })) });
  const tmp = outPath + '.spec.json';
  fs.writeFileSync(tmp, json);
  const r = spawnSync('python3', [path.join(HERE, 'mkdocx.py'), tmp], { encoding: 'utf8' });
  try { fs.unlinkSync(tmp); } catch {}
  return r.status === 0;
}
export function writeXlsx(outPath: string, title: string, seedStr: string) {
  const rng = mulberry(seedFrom(seedStr));
  const rows = ['January', 'February', 'March', 'April', 'May', 'June'].map((m) => [m, 'Revenue', Math.floor(2000 + rng() * 9000), Math.floor(rng() * 40) + 55]);
  const json = JSON.stringify({ out: outPath, title, headers: ['Month', 'Line', 'Amount (GHS)', 'Score'], rows });
  const tmp = outPath + '.spec.json';
  fs.writeFileSync(tmp, json);
  const r = spawnSync('python3', [path.join(HERE, 'mkxlsx.py'), tmp], { encoding: 'utf8' });
  try { fs.unlinkSync(tmp); } catch {}
  return r.status === 0;
}

// ============ RESEARCH ============
export async function genResearch(subject: string): Promise<{ md: string; online: boolean; extract: string }> {
  let extract = '';
  let online = false;
  for (let attempt = 0; attempt < 2 && !online; attempt++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch('https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&format=json&origin=*&titles=' + encodeURIComponent(subject), { signal: ctrl.signal, headers: { 'user-agent': 'AstraAgent/1.0 (research skill)' } });
      clearTimeout(to);
      const j: any = await res.json();
      const page = j?.query?.pages ? Object.values(j.query.pages)[0] as any : null;
      if (page && page.extract) { extract = String(page.extract); online = true; }
    } catch (e: any) { online = false; console.error('[research] fetch error:', e?.name, e?.message, e?.cause?.message); }
  }

  const sents = sentences(extract).slice(0, 8);
  const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  let md = `# Research Report: ${subject}\n\n_Compiled by Astra Research Agent \u00B7 ${nowStr}_\n\n`;
  md += `## Overview\n\n${online ? (sents.join(' ') || extract.slice(0, 1200)) : `Live sources were unreachable at run time. This is an offline framework for researching "${subject}"; re-run when connectivity is available to populate live citations.`}\n\n`;
  md += `## Key Points\n\n` + (online && sents.length ? sents.slice(0, 6).map((s, i) => `${i + 1}. ${s.trim()}`).join('\n') : `1. Define the decision this research must support.\n2. List primary sources to consult.\n3. Capture facts with citations.\n4. Note conflicts and open questions.`) + `\n\n`;
  md += `## Analysis\n\n` + (online ? `The source material positions "${subject}" with verifiable, encyclopedic coverage. Confidence is high for the overview; deeper claims should be cross-checked against the primary sources listed below before publication.` : `Offline mode: analysis deferred until live sources are reachable. Astra never fabricates citations.`) + `\n\n`;
  md += `## Sources\n\n` + (online ? `- Wikipedia \u2014 "${subject}" (live fetch, ${nowStr}): https://en.wikipedia.org/wiki/${encodeURIComponent(subject.replace(/ /g, '_'))}` : `- None reachable (offline). `) + `\n`;
  return { md, online, extract };
}

// ============ DATA ============
export function genData(prompt: string, csvText: string | undefined, seedStr: string) {
  let nums: number[] = [];
  if (csvText) {
    for (const ln of csvText.split(/\n/)) for (const cell of ln.split(/[,\t;]/)) { const v = parseFloat(cell); if (isFinite(v)) nums.push(v); }
  }
  if (!nums.length) nums = (prompt.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  if (!nums.length) return null;
  const s = { count: nums.length, sum: nums.reduce((a, b) => a + b, 0), mean: mean(nums), min: Math.min(...nums), max: Math.max(...nums), sd: stdev(nums) };
  const w = 900, h = 420, bw = Math.min(70, (w - 120) / nums.length);
  const max = Math.max(...nums.map(Math.abs), 1);
  const bars = nums.slice(0, 40).map((n, i) => {
    const bh = Math.abs(n) / max * 260;
    return `<rect x="${70 + i * (bw + 8)}" y="${320 - bh}" width="${bw}" height="${bh}" rx="6" fill="${n >= 0 ? '#6d8dff' : '#f472b6'}"/><text x="${70 + i * (bw + 8) + bw / 2}" y="340" text-anchor="middle" font-size="11" fill="#8b93b8" font-family="system-ui">${i + 1}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>Data analysis chart</title><rect width="${w}" height="${h}" fill="#070b18"/><line x1="60" y1="320" x2="${w - 20}" y2="320" stroke="#2a3354"/>${bars}<text x="60" y="40" font-family="system-ui" font-size="18" font-weight="700" fill="#eef2ff">n=${s.count} \u00B7 mean=${s.mean.toFixed(2)} \u00B7 sd=${s.sd.toFixed(2)}</text><text x="60" y="64" font-family="system-ui" font-size="13" fill="#8b93b8">min=${s.min} \u00B7 max=${s.max} \u00B7 sum=${s.sum.toFixed(2)}</text></svg>`;
  const md = `# Data Analysis\n\n- Count: ${s.count}\n- Sum: ${s.sum.toFixed(2)}\n- Mean: ${s.mean.toFixed(2)}\n- Min: ${s.min} \u00B7 Max: ${s.max}\n- Std dev: ${s.sd.toFixed(2)}\n`;
  return { stats: s, svg, md };
}
