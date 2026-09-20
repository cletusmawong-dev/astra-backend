/* Screens: agents, skills, create, build workspace. */
(function () {
  const { api, esc, icon, toast, topbar, chip, go, ago } = A;
  const q = (s) => document.querySelector(s);

  // ============ AGENTS ============
  let agentsFetchedAt = 0;
  A.route('/agents', () => {
    const list = S.agents || [];
    const cards = list.map((a) =>
      '<div class="lrow" data-act="go" data-hash="#/agent/' + a.id + '"><div class="sq" style="background:' + (a.color || '#5b8cff') + '22;color:' + (a.color || '#5b8cff') + '">' + icon(a.icon, 19) + '</div>' +
      '<div class="t"><b>' + esc(a.name) + ' ' + (a.custom ? '<span class="chip gold">CUSTOM</span>' : '') + '</b><span class="ellipsis">' + esc(a.desc) + '</span></div>' +
      '<div class="center"><span class="online"><i></i></span><div class="tiny dim mt8">' + (a.tasksCompleted || 0) + ' done</div></div></div>').join('');
    window.afterRender = () => {
      if (Date.now() - agentsFetchedAt > 5000) {
        api('/api/agents').then((ag) => { S.agents = ag; agentsFetchedAt = Date.now(); A.render(); }).catch(() => {});
      }
    };
    return '<div class="scr">' + topbar({ title: 'Agents', sub: 'Your specialized AI workforce' }) +
      '<button class="btn ghost mt8" data-act="go" data-hash="#/agents/new">' + icon('plus', 16) + ' Create an agent</button>' +
      '<div class="col mt16">' + (cards || '<div class="empty"><div class="spin">' + icon('refresh', 22) + '</div></div>') + '</div></div>';
  });

  A.route('/agents/new', () => {
    window.afterRender = async () => {
      const skills = await api('/api/skills');
      const box = q('#skChips');
      const sel = new Set();
      box.innerHTML = skills.map((s) => '<button class="chip scheduled skc" data-id="' + s.id + '" style="cursor:pointer">' + esc(s.name) + '</button>').join(' ');
      box.querySelectorAll('.skc').forEach((b) => b.onclick = () => { const id = b.getAttribute('data-id'); if (sel.has(id)) sel.delete(id); else sel.add(id); b.className = 'chip ' + (sel.has(id) ? 'active' : 'scheduled') + ' skc'; b.style.cursor = 'pointer'; });
      q('#saveAgent').onclick = async () => {
        const a = { name: q('#aName').value.trim(), desc: q('#aDesc').value.trim(), skills: [...sel], tools: q('#aTools').value.split(',').map((x) => x.trim()).filter(Boolean), permissions: q('#aPerms').value.split(',').map((x) => x.trim()).filter(Boolean), model: q('#aModel').value, instructions: q('#aInst').value.trim() };
        if (!a.name) return toast('Name required', 'error');
        await api('/api/agents', { method: 'POST', body: JSON.stringify(a) });
        S.agents = null; toast('Agent created: ' + a.name, 'success'); go('#/agents');
      };
    };
    return '<div class="scr">' + topbar({ back: true, title: 'Create an agent' }) +
      '<label class="fld">Agent name</label><input class="inp" id="aName" placeholder="e.g. Marketing Agent">' +
      '<label class="fld">Description</label><input class="inp" id="aDesc" placeholder="What does it do?">' +
      '<label class="fld">Skills</label><div id="skChips" class="row" style="flex-wrap:wrap;gap:6px"></div>' +
      '<label class="fld">Tools (comma separated)</label><input class="inp" id="aTools" placeholder="crm.update, email.send">' +
      '<label class="fld">Permissions</label><input class="inp" id="aPerms" placeholder="contacts, messages">' +
      '<label class="fld">Model</label><select class="inp" id="aModel"><option>astra-core</option><option>xkiro-large</option><option>xkiro-fast</option></select>' +
      '<label class="fld">Instructions</label><textarea class="inp" id="aInst" placeholder="System instructions for this agent\u2026"></textarea>' +
      '<button class="btn mt16" id="saveAgent">Create Agent</button></div>';
  });

  A.route('/agent/:id', (p) => {
    const a = (S.agents || []).find((x) => x.id === p.id);
    if (!a) { window.afterRender = () => api('/api/agents').then((ag) => { S.agents = ag; go('#/agent/' + p.id); }); return '<div class="scr"><div class="empty"><div class="spin">' + icon('refresh', 22) + '</div></div></div>'; }
    const skills = (a.skills || []).map((sid) => '<div class="lrow" style="cursor:default"><div class="sq" style="background:rgba(91,140,255,.12);color:var(--blue)">' + icon('spark', 16) + '</div><div class="t"><b>' + esc(sid) + '</b></div></div>').join('') || '<p class="small dim">No skills assigned.</p>';
    return '<div class="scr">' + topbar({ back: true, title: a.name, sub: '<span class="online"><i></i>Online</span>' }) +
      '<div class="card pad center"><div class="sq" style="width:64px;height:64px;border-radius:20px;margin:0 auto;background:' + (a.color || '#5b8cff') + '22;color:' + (a.color || '#5b8cff') + '">' + icon(a.icon, 30) + '</div>' +
      '<b class="h2 mt16" style="display:block">' + esc(a.name) + '</b><p class="small mut mt8">' + esc(a.desc) + '</p>' +
      '<div class="row spread mt16"><span class="chip done">' + (a.tasksCompleted || 0) + ' TASKS COMPLETED</span><span class="chip active">' + esc(a.model || 'astra-core') + '</span></div></div>' +
      '<b class="h2 mt24" style="display:block">Skills</b><div class="col mt8">' + skills + '</div>' +
      '<b class="h2 mt24" style="display:block">Tools</b><div class="row mt8" style="flex-wrap:wrap;gap:6px">' + ((a.tools || []).map((t) => '<span class="chip active">' + icon('wand', 11) + ' ' + esc(t) + '</span>').join('') || '<span class="small dim">none</span>') + '</div>' +
      (a.instructions ? '<b class="h2 mt24" style="display:block">Instructions</b><p class="small mut mt8">' + esc(a.instructions) + '</p>' : '') + '</div>';
  });

  // ============ SKILLS ============
  A.route('/skills', () => {
    window.afterRender = async () => {
      S.skills = await api('/api/skills');
      fillSkills('');
      q('#skSearch').oninput = (e) => fillSkills(e.target.value.toLowerCase());
    };
    function fillSkills(f) {
      const list = S.skills.filter((s) => !f || (s.name + s.desc).toLowerCase().includes(f));
      q('#skList').innerHTML = list.map((s) =>
        '<div class="lrow" data-open="' + s.id + '"><div class="sq" style="background:rgba(139,92,246,.13);color:#b7a4ff">' + icon(s.icon, 19) + '</div><div class="t" data-open="' + s.id + '"><b>' + esc(s.name) + ' <span class="dim tiny">v' + esc(s.version) + '</span></b><span class="ellipsis">' + esc(s.desc) + '</span></div>' +
        A.sw(s.enabled !== false, 'sktog', 'data-id="' + s.id + '"') + '</div>').join('');
      q('#skList').querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', (e) => { if (e.target.closest('.sw')) return; go('#/skill/' + el.getAttribute('data-open')); }));
      q('#skList').querySelectorAll('input[data-act="sktog"]').forEach((t) => t.onchange = async (e) => {
        await api('/api/skills/' + t.getAttribute('data-id'), { method: 'PUT', body: JSON.stringify({ enabled: e.target.checked }) });
        toast((e.target.checked ? 'Enabled: ' : 'Disabled: ') + t.getAttribute('data-id'));
      });
    }
    return '<div class="scr">' + topbar({ title: 'Skills Library', sub: 'Real capabilities \u2014 not pretend' , right: '<button class="icobtn" data-act="go" data-hash="#/skills/new">' + icon('plus', 18) + '</button>' }) +
      '<input class="inp mt8" id="skSearch" placeholder="Search skills\u2026">' +
      '<div class="col mt16" id="skList"></div></div>';
  });

  A.route('/skill/:id', (p) => {
    window.afterRender = async () => {
      if (!S.skills || !S.skills.length) S.skills = await api('/api/skills');
      const s = S.skills.find((x) => x.id === p.id);
      if (!s) return;
      const row = (h, b) => '<b class="h2 mt24" style="display:block">' + h + '</b><div class="mt8">' + b + '</div>';
      q('#skBody').innerHTML =
        '<div class="card pad"><div class="row"><div class="sq" style="background:rgba(139,92,246,.13);color:#b7a4ff">' + icon(s.icon, 22) + '</div><div style="flex:1"><b class="h2">' + esc(s.name) + '</b><div class="tiny dim">v' + esc(s.version) + (s.custom ? ' \u00B7 custom' : '') + '</div></div>' + A.sw(s.enabled !== false, 'sktog2') + '</div>' +
        '<p class="small mut mt16">' + esc(s.desc) + '</p></div>' +
        row('Instructions', '<p class="small mut">' + esc(s.instructions) + '</p>') +
        row('Tools', '<div class="row" style="flex-wrap:wrap;gap:6px">' + (s.tools || []).map((t) => '<span class="chip active">' + esc(t) + '</span>').join('') + '</div>') +
        row('Required permissions', '<div class="row" style="flex-wrap:wrap;gap:6px">' + ((s.permissions || []).length ? s.permissions.map((t) => '<span class="chip waiting">' + esc(t) + '</span>').join('') : '<span class="chip done">none</span>') + '</div>') +
        row('Examples', '<div class="col">' + (s.examples || []).map((e) => '<div class="lrow" style="cursor:default"><div class="t"><span>' + esc(e) + '</span></div></div>').join('') + '</div>') +
        row('Quality requirements', '<ul class="small mut" style="padding-left:18px;line-height:1.9">' + (s.quality || []).map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>') +
        row('Output format', '<span class="chip scheduled">' + esc(s.output) + '</span>');
      q('#skBody').querySelector('input[data-act="sktog2"]').onchange = async (e) => { await api('/api/skills/' + s.id, { method: 'PUT', body: JSON.stringify({ enabled: e.target.checked }) }); toast('Skill ' + (e.target.checked ? 'enabled' : 'disabled')); };
    };
    return '<div class="scr">' + topbar({ back: true, title: 'Skill' }) + '<div id="skBody"></div></div>';
  });

  A.route('/skills/new', () => {
    window.afterRender = () => {
      q('#saveSkill').onclick = async () => {
        const s = { name: q('#sName').value.trim(), desc: q('#sDesc').value.trim(), instructions: q('#sInst').value.trim(), tools: q('#sTools').value.split(',').map((x) => x.trim()).filter(Boolean), permissions: q('#sPerms').value.split(',').map((x) => x.trim()).filter(Boolean), examples: q('#sEx').value.split('\n').filter(Boolean), quality: q('#sQ').value.split('\n').filter(Boolean), output: q('#sOut').value.trim() };
        if (!s.name) return toast('Name required', 'error');
        await api('/api/skills', { method: 'POST', body: JSON.stringify(s) });
        S.skills = null; toast('Skill created: ' + s.name, 'success'); go('#/skills');
      };
    };
    return '<div class="scr">' + topbar({ back: true, title: 'Create custom skill' }) +
      '<label class="fld">Skill name</label><input class="inp" id="sName">' +
      '<label class="fld">Description</label><input class="inp" id="sDesc">' +
      '<label class="fld">Instructions</label><textarea class="inp" id="sInst"></textarea>' +
      '<label class="fld">Tools</label><input class="inp" id="sTools">' +
      '<label class="fld">Required permissions</label><input class="inp" id="sPerms">' +
      '<label class="fld">Examples (one per line)</label><textarea class="inp" id="sEx"></textarea>' +
      '<label class="fld">Quality requirements (one per line)</label><textarea class="inp" id="sQ"></textarea>' +
      '<label class="fld">Output format</label><input class="inp" id="sOut" placeholder="e.g. Markdown report">' +
      '<button class="btn mt16" id="saveSkill">Create Skill</button></div>';
  });

  // ============ CREATE ============
  const C = { tab: 'image', style: 'Artistic', ratio: '1:1', quality: 'High', dur: '10s', formats: new Set(['pdf']) };
  A.route('/create', () => {
    window.afterRender = () => {
      document.querySelectorAll('#ctabs button').forEach((b) => b.onclick = () => { C.tab = b.getAttribute('data-t'); A.render(); });
      document.querySelectorAll('.stylegrid button').forEach((b) => b.onclick = () => { C.style = b.getAttribute('data-s'); document.querySelectorAll('.stylegrid button').forEach((x) => x.classList.toggle('on', x === b)); });
      document.querySelectorAll('[data-ratio]').forEach((b) => b.onclick = () => { C.ratio = b.getAttribute('data-ratio'); document.querySelectorAll('[data-ratio]').forEach((x) => x.classList.toggle('on', x === b)); });
      document.querySelectorAll('[data-quality]').forEach((b) => b.onclick = () => { C.quality = b.getAttribute('data-quality'); document.querySelectorAll('[data-quality]').forEach((x) => x.classList.toggle('on', x === b)); });
      document.querySelectorAll('[data-dur]').forEach((b) => b.onclick = () => { C.dur = b.getAttribute('data-dur'); document.querySelectorAll('[data-dur]').forEach((x) => x.classList.toggle('on', x === b)); });
      document.querySelectorAll('[data-fmt]').forEach((b) => b.onclick = () => { const f = b.getAttribute('data-fmt'); if (C.formats.has(f)) C.formats.delete(f); else C.formats.add(f); b.classList.toggle('on'); });
      q('#goCreate').onclick = async () => {
        const prompt = q('#cPrompt').value.trim();
        if (!prompt) return toast('Describe what you want', 'error');
        let type = C.tab, opts = {};
        if (C.tab === 'image') opts = { style: C.style, ratio: C.ratio, quality: C.quality };
        if (C.tab === 'video') { type = 'motion'; opts = { dur: C.dur, style: C.style, ratio: C.ratio }; }
        if (C.tab === 'document') opts = { formats: [...C.formats] };
        toast('Astra is creating\u2026');
        const r = await api('/api/tasks', { method: 'POST', body: JSON.stringify({ type, prompt, opts }) });
        go('#/task/' + r.taskId);
      };
    };
    const tabs = ['image', 'video', 'document', 'design'];
    const body = C.tab === 'image' ?
      '<textarea class="inp mt16" id="cPrompt" placeholder="Describe what you want\u2026\ne.g. modern logo for a trading app"></textarea>' +
      '<label class="fld">Style</label><div class="stylegrid">' + ['Realistic', 'Anime', '3D', 'Artistic'].map((s) => '<button class="' + (C.style === s ? 'on' : '') + '" data-s="' + s + '">' + s + '</button>').join('') + '</div>' +
      '<label class="fld">Aspect ratio</label><div class="seg">' + ['1:1', '16:9', '9:16'].map((r) => '<button class="' + (C.ratio === r ? 'on' : '') + '" data-ratio="' + r + '">' + r + '</button>').join('') + '</div>' +
      '<label class="fld">Quality</label><div class="seg">' + ['Standard', 'High', 'Ultra'].map((r) => '<button class="' + (C.quality === r ? 'on' : '') + '" data-quality="' + r + '">' + r + '</button>').join('') + '</div>'
      : C.tab === 'video' ?
      '<textarea class="inp mt16" id="cPrompt" placeholder="Describe your video\u2026"></textarea>' +
      '<label class="fld">Duration</label><div class="seg">' + ['5s', '10s', '30s'].map((r) => '<button class="' + (C.dur === r ? 'on' : '') + '" data-dur="' + r + '">' + r + '</button>').join('') + '</div>' +
      '<label class="fld">Style</label><div class="stylegrid">' + ['Realistic', 'Anime', '3D', 'Artistic'].map((s) => '<button class="' + (C.style === s ? 'on' : '') + '" data-s="' + s + '">' + s + '</button>').join('') + '</div>' +
      '<p class="tiny dim mt8">Honest note: full video rendering needs the GPU service (not connected). Astra delivers an animated motion preview instead.</p>'
      : C.tab === 'document' ?
      '<textarea class="inp mt16" id="cPrompt" placeholder="e.g. A project proposal for a new printing press line"></textarea>' +
      '<label class="fld">Formats (real files)</label><div class="qgrid">' + [['pdf', 'PDF'], ['word', 'Word'], ['excel', 'Excel'], ['slides', 'Presentation']].map(([f, n]) => '<button class="qbtn ' + (C.formats.has(f) ? 'on' : '') + '" data-fmt="' + f + '" style="text-align:center;padding:11px"><b style="margin:0">' + n + '</b></button>').join('') + '</div>'
      : '<textarea class="inp mt16" id="cPrompt" placeholder="e.g. dark fintech UI kit with gold accents"></textarea>';
    return '<div class="scr">' + topbar({ title: 'Create', sub: 'Astra produces real files' }) +
      '<div class="seg mt8" id="ctabs">' + tabs.map((t) => '<button class="' + (C.tab === t ? 'on' : '') + '" data-t="' + t + '">' + t[0].toUpperCase() + t.slice(1) + '</button>').join('') + '</div>' +
      body + '<button class="btn mt24" id="goCreate">' + icon('wand', 16) + ' Create with Astra</button></div>';
  });
  window.onLiveBuild = (ev) => {
    if (ev.type !== 'task' || !S.route.startsWith('/build/')) return;
    const id = S.route.split('/')[2];
    if (ev.task.id !== id) return;
    S.tasks[id] = ev.task;
    if (B.ws === 'console') { const cb = q('#consolebox'); if (cb) cb.textContent = (ev.task.console || []).join('\n') || cb.textContent; }
    const scr = document.querySelector('[data-live="build"]');
    if (scr && (ev.task.status === 'done' || ev.task.status === 'failed')) A.render();
  };

  // ============ BUILD ============
  const B = { tab: 'website', ws: 'preview' };
  A.route('/build', () => {
    window.afterRender = () => {
      document.querySelectorAll('#btabs button').forEach((b) => b.onclick = () => { B.tab = b.getAttribute('data-t'); A.render(); });
      q('#goBuild').onclick = async () => {
        const prompt = q('#bPrompt').value.trim();
        if (!prompt) return toast('Describe your project', 'error');
        toast('Astra is planning your build\u2026');
        const r = await api('/api/tasks', { method: 'POST', body: JSON.stringify({ type: 'website', prompt, opts: { variant: B.tab } }) });
        go('#/build/' + r.taskId);
      };
    };
    return '<div class="scr">' + topbar({ title: 'Build', sub: 'Websites \u00B7 Apps \u00B7 Web tools' }) +
      '<div class="seg mt8" id="btabs">' + ['website', 'app', 'tool'].map((t) => '<button class="' + (B.tab === t ? 'on' : '') + '" data-t="' + t + '">' + (t === 'website' ? 'Website' : t === 'app' ? 'App' : 'Web Tool') + '</button>').join('') + '</div>' +
      '<textarea class="inp mt16" id="bPrompt" placeholder="Describe your project\u2026\ne.g. Build a website for my printing business"></textarea>' +
      '<p class="tiny dim mt8">Astra will: understand \u2192 research \u2192 design \u2192 build \u2192 test \u2192 review \u2192 fix \u2192 preview \u2192 deploy.</p>' +
      '<button class="btn mt16" id="goBuild">' + icon('code', 16) + ' Start Building</button></div>';
  });

  A.route('/build/:id', (p) => {
    const t = S.tasks[p.id];
    window.afterRender = async () => {
      const task = t || await api('/api/tasks/' + p.id);
      S.tasks[p.id] = task;
      bindBuild(task);
    };
    if (!t) return '<div class="scr">' + topbar({ back: true, title: 'Build workspace' }) + '<div class="empty"><div class="spin">' + icon('refresh', 20) + '</div></div></div>';
    return buildBody(t);
  });
  function buildBody(t) {
    window.afterRender = () => bindBuild(t);
    const files = ['index.html', 'styles.css', 'app.js'];
    const body = B.ws === 'preview' ? (t.previewUrl ? '<iframe class="prev" src="' + t.previewUrl + '"></iframe>' : '<div class="empty card pad">Preview appears when development completes.</div>')
      : B.ws === 'code' ? '<div class="seg mt8" id="filetabs">' + files.map((f) => '<button data-f="' + f + '">' + f + '</button>').join('') + '</div><div class="codebox mt8" id="codebox">Loading\u2026</div>'
      : B.ws === 'files' ? '<div class="col mt8">' + (t.artifacts || []).map((a) => '<a class="lrow" style="text-decoration:none;color:inherit" href="/artifacts/' + t.id + '/' + a.path + '" download="' + a.name + '"><div class="sq" style="background:rgba(91,140,255,.12);color:var(--blue)">' + icon('file', 17) + '</div><div class="t"><b>' + esc(a.name) + '</b><span>site/' + esc(a.name) + '</span></div>' + icon('download', 16) + '</a>').join('') + '</div>'
      : '<div class="codebox mt8" id="consolebox">' + (t.console.length ? t.console.map((l) => esc(l)).join('\n') : 'Console output appears during testing.') + '</div>';
    return '<div class="scr" data-live="build">' + topbar({ back: true, title: t.meta.business ? esc(t.meta.business) : 'Build workspace', sub: esc(t.prompt.slice(0, 40)) }) +
      '<div class="row spread mt8">' + chip(t.status) + '<span class="small mut">' + t.progress + '%</span></div><div class="pbar mt8"><i style="width:' + t.progress + '%"></i></div>' +
      '<div class="seg mt16" id="wstabs">' + ['preview', 'code', 'files', 'console'].map((w) => '<button class="' + (B.ws === w ? 'on' : '') + '" data-w="' + w + '">' + w[0].toUpperCase() + w.slice(1) + '</button>').join('') + '</div>' +
      body +
      '<div class="row mt16">' + (t.status === 'done' && !t.deployUrl ? '<button class="btn" id="depBtn">' + icon('external', 16) + ' Deploy</button>' : '') + (t.deployUrl ? '<a class="btn" style="text-decoration:none" href="' + t.deployUrl + '" target="_blank">' + icon('external', 16) + ' Open live site</a>' : '') + (t.netlifyUrl ? '<a class="btn ghost" style="text-decoration:none" href="' + t.netlifyUrl + '" target="_blank">' + icon('external', 16) + ' Netlify</a>' : '') + '</div>' +
      (t.review ? '<p class="tiny mt16" style="color:' + (t.review.approved ? 'var(--ok)' : 'var(--warn)') + '">' + icon('checkshield', 13) + ' Review Agent: ' + (t.review.approved ? 'APPROVED' : 'REVIEWING') + ' \u00B7 ' + t.review.findings.length + ' findings \u00B7 ' + t.reviewLoops + ' fix loop(s)</p>' : '') +
      '<div class="col mt16">' + t.steps.map((s) => UIX.stepHTML(s)).join('') + '</div>' +
      '<div class="center mt16"><button class="linkish" data-act="go" data-hash="#/task/' + t.id + '">Open in Task Manager \u2192</button></div></div>';
  }
  async function bindBuild(t) {
    document.querySelectorAll('#wstabs button').forEach((b) => b.onclick = () => { B.ws = b.getAttribute('data-w'); document.getElementById('app').innerHTML = buildBody(S.tasks[t.id] || t) + A.nav('tasks'); });
    document.querySelectorAll('#filetabs button').forEach((b, i) => b.onclick = async () => {
      document.querySelectorAll('#filetabs button').forEach((x) => x.classList.remove('on')); b.classList.add('on');
      try { const r = await fetch('/artifacts/' + t.id + '/site/' + b.getAttribute('data-f')); q('#codebox').textContent = await r.text(); } catch { q('#codebox').textContent = 'File not available yet.'; }
    });
    const fb = document.querySelector('#filetabs button'); if (fb) fb.onclick();
    const dep = q('#depBtn');
    if (dep) dep.onclick = async () => { toast('Deploying\u2026'); const r = await api('/api/tasks/' + t.id + '/deploy', { method: 'POST', body: JSON.stringify({}) }); toast('Live at ' + r.url, 'success'); if (r.netlifyUrl) toast('Netlify: ' + r.netlifyUrl, 'success'); if (r.netlifyError) toast('Netlify: ' + r.netlifyError, 'error'); A.render(); };
  }
})();
