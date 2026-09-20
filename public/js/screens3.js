/* Screens: tasks, task detail, automate, notifications, phone control, settings, more. */
(function () {
  const { api, esc, icon, toast, topbar, chip, go, ago, fmtDT, modal, closeModal } = A;
  const q = (s) => document.querySelector(s);
  const TK = { tab: 'active' };
  let autosFetchedAt = 0;

  // ============ TASKS ============
  A.route('/tasks', () => {
    const all = Object.values(S.tasks);
    const autos = S.automs || [];
    const groups = {
      active: all.filter((t) => ['active', 'waiting_approval'].includes(t.status)),
      completed: all.filter((t) => t.status === 'done'),
      scheduled: autos,
      failed: all.filter((t) => t.status === 'failed'),
    };
    const list = groups[TK.tab] || [];
    const tIcon = { website: 'globe', image: 'image', document: 'file', research: 'search', data: 'chart', automation: 'zap', motion: 'video', design: 'pen' };
    let body;
    if (TK.tab === 'scheduled') {
      body = list.length ? list.map((a) =>
        '<div class="lrow" style="cursor:default"><div class="sq" style="background:rgba(139,92,246,.13);color:#b7a4ff">' + icon('calendar', 18) + '</div><div class="t"><b class="ellipsis">' + esc(a.prompt.slice(0, 44)) + '</b><span>next: ' + fmtDT(a.nextDue) + (a.lastRun ? ' \u00B7 last: ' + ago(a.lastRun) : '') + '</span></div>' +
        '<button class="icobtn runnow" data-id="' + a.id + '" title="Run now">' + icon('play', 15) + '</button></div>').join('')
        : '<div class="empty card pad"><div class="big">\u23F0</div><b>Nothing scheduled</b><p class="small mt8">Tell Astra: "Every morning at 8 AM, research the markets and send me a report."</p><button class="btn ghost small mt16" data-act="go" data-hash="#/automate">Create automation</button></div>';
    } else {
      body = list.length ? list.sort((a, b) => b.updatedAt - a.updatedAt).map((t) =>
        '<div class="lrow" data-act="go" data-hash="#/task/' + t.id + '"><div class="sq" style="background:rgba(91,140,255,.12);color:var(--blue)">' + icon(tIcon[t.type] || 'spark', 18) + '</div><div class="t"><b class="ellipsis">' + esc(t.prompt.slice(0, 44)) + '</b><span>' + ago(t.updatedAt) + ' \u00B7 ' + t.progress + '% \u00B7 ' + (t.reviewLoops || 0) + ' fix loop(s)</span></div>' + chip(t.status) + '</div>').join('')
        : '<div class="empty card pad"><div class="big">\uD83D\uDDD2\uFE0F</div><b>No ' + TK.tab + ' tasks</b></div>';
    }
    window.afterRender = async () => {
      if (Date.now() - autosFetchedAt > 5000) { S.automs = await api('/api/automations'); autosFetchedAt = Date.now(); A.render(); return; }
      document.querySelectorAll('#ttabs button').forEach((b) => b.onclick = () => { TK.tab = b.getAttribute('data-t'); A.render(); });
      document.querySelectorAll('.runnow').forEach((b) => b.onclick = async () => { toast('Running now\u2026'); await api('/api/automations/' + b.getAttribute('data-id') + '/run', { method: 'POST', body: '{}' }); });
    };
    return '<div class="scr">' + topbar({ title: 'Tasks', sub: 'Every task has a real execution history' }) +
      '<div class="seg mt8" id="ttabs">' + ['active', 'completed', 'scheduled', 'failed'].map((t) => '<button class="' + (TK.tab === t ? 'on' : '') + '" data-t="' + t + '">' + t[0].toUpperCase() + t.slice(1) + '</button>').join('') + '</div>' +
      '<div class="col mt16" data-live="tasks">' + body + '</div></div>';
  });
  window.onLiveTasks = (ev) => {
    if (ev.type !== 'task') return;
    if (S.route === '/tasks') { /* refresh quietly on next visit; list chips update via render */ }
    if (S.route === '/task/' + ev.task.id) { const st = document.querySelector('[data-live="taskdetail"]'); if (st) A.render(); }
  };

  // ============ TASK DETAIL ============
  A.route('/task/:id', (p) => {
    const t = S.tasks[p.id];
    window.afterRender = async () => {
      const task = t || await api('/api/tasks/' + p.id);
      S.tasks[p.id] = task;
      bindTask(task);
    };
    if (!t) return '<div class="scr">' + topbar({ back: true, title: 'Task' }) + '<div class="empty"><div class="spin">' + icon('refresh', 20) + '</div></div></div>';
    return taskBody(t);
  });
  function taskBody(t) {
    window.afterRender = () => bindTask(t);
    const arts = (t.artifacts || []).map((a) => {
      const url = '/artifacts/' + t.id + '/' + a.path;
      const isImg = a.kind === 'image' && a.path.endsWith('.svg');
      return '<div class="card pad">' + (isImg ? '<div class="imgprev"><object data="' + url + '" type="image/svg+xml"></object></div>' : '') +
        '<div class="row spread mt8"><b class="small">' + esc(a.name) + '</b><a class="btn ghost small" style="text-decoration:none" href="' + url + '" download="' + a.name + '">' + icon('download', 13) + ' Save</a></div></div>';
    }).join('');
    return '<div class="scr" data-live="taskdetail">' + topbar({ back: true, title: t.type.toUpperCase() + ' TASK', sub: esc(t.prompt.slice(0, 44)) }) +
      '<div class="card pad"><div class="row spread">' + chip(t.status) + '<span class="small mut">' + t.progress + '%</span></div><div class="pbar mt8"><i style="width:' + t.progress + '%"></i></div>' +
      '<p class="tiny dim mt8">Created ' + fmtDT(t.createdAt) + (t.completedAt ? ' \u00B7 completed ' + fmtDT(t.completedAt) : '') + '</p>' +
      (t.review ? '<p class="tiny mt8" style="color:' + (t.review.approved ? 'var(--ok)' : 'var(--warn)') + '">' + icon('checkshield', 13) + ' Review Agent: ' + (t.review.approved ? 'APPROVED' : 'IN REVIEW') + ' \u00B7 ' + t.review.findings.length + ' finding(s) \u00B7 ' + t.reviewLoops + ' fix loop(s)</p>' : '') + '</div>' +
      '<div class="row spread mt16"><b class="h2">Execution timeline</b>' + (t.type === 'website' ? '<button class="btn ghost small" data-act="go" data-hash="#/build/' + t.id + '">Open workspace</button>' : '') + '</div>' +
      '<div class="col mt8">' + t.steps.map((s) => UIX.stepHTML(s) ).join('') + '</div>' +
      ((t.artifacts || []).length ? '<b class="h2 mt24" style="display:block">Deliverables \u2014 real results</b><div class="col mt8">' + arts + '</div>' : '') +
      (t.previewUrl ? '<button class="btn ghost mt16" id="pvBtn">' + icon('eye', 15) + ' Open live preview</button>' : '') +
      (t.status === 'done' && t.type === 'website' && !t.deployUrl ? '<button class="btn mt8" id="dpBtn">' + icon('external', 15) + ' Deploy</button>' : '') +
      (t.deployUrl ? '<a class="btn mt8" style="text-decoration:none" href="' + t.deployUrl + '" target="_blank">' + icon('external', 15) + ' Open deployed site</a>' : '') +
      (t.netlifyUrl ? '<a class="btn ghost mt8" style="text-decoration:none" href="' + t.netlifyUrl + '" target="_blank">' + icon('external', 15) + ' Netlify site</a>' : '') +
      '<b class="h2 mt24" style="display:block">Execution history</b><div class="codebox mt8" id="evbox">' + t.events.slice(-80).map((e) => '[' + new Date(e.ts).toLocaleTimeString() + '] ' + esc(e.line)).join('\n') + '</div></div>';
  }
  function bindTask(t) {
    document.querySelectorAll('.approve').forEach((b) => b.onclick = async (e) => {
      await api('/api/tasks/' + t.id + '/approval', { method: 'POST', body: JSON.stringify({ decision: b.getAttribute('data-dec') }) });
      toast(b.getAttribute('data-dec') === 'approve' ? 'Approved.' : 'Denied.');
    });
    const pv = q('#pvBtn'); if (pv) pv.onclick = () => window.open(t.previewUrl, '_blank');
    const dp = q('#dpBtn'); if (dp) dp.onclick = async () => { toast('Deploying\u2026'); const r = await api('/api/tasks/' + t.id + '/deploy', { method: 'POST', body: '{}' }); toast('Live at ' + r.url, 'success'); if (r.netlifyUrl) toast('Netlify: ' + r.netlifyUrl, 'success'); A.render(); };
  }

  // ============ AUTOMATE ============
  A.route('/automate', () => {
    window.afterRender = async () => {
      S.automs = await api('/api/automations');
      fill();
      document.querySelectorAll('.exbtn').forEach((b) => b.onclick = () => { q('#auPrompt').value = b.getAttribute('data-p'); });
      q('#auGo').onclick = async () => {
        const prompt = q('#auPrompt').value.trim();
        if (!prompt) return toast('Describe the automation', 'error');
        await api('/api/automations', { method: 'POST', body: JSON.stringify({ prompt }) });
        toast('Automation registered \u2705', 'success');
        S.automs = await api('/api/automations'); fill(); q('#auPrompt').value = '';
      };
      document.querySelectorAll('.autog').forEach((b) => b.onclick = async () => { await api('/api/automations/' + b.getAttribute('data-id') + '/toggle', { method: 'POST', body: '{}' }); S.automs = await api('/api/automations'); fill(); });
      document.querySelectorAll('.autodel').forEach((b) => b.onclick = async () => { await api('/api/automations/' + b.getAttribute('data-id'), { method: 'DELETE' }); S.automs = await api('/api/automations'); fill(); });
      document.querySelectorAll('.runnow').forEach((b) => b.onclick = async () => { toast('Running now\u2026'); await api('/api/automations/' + b.getAttribute('data-id') + '/run', { method: 'POST', body: '{}' }); go('#/tasks'); });
    };
    function fill() {
      q('#auList').innerHTML = (S.automs || []).map((a) =>
        '<div class="card pad"><div class="row"><div class="sq" style="background:rgba(231,200,115,.12);color:var(--gold)">' + icon('zap', 18) + '</div><div class="t" style="flex:1"><b class="small">' + esc(a.prompt.slice(0, 60)) + '</b><span>next run: ' + fmtDT(a.nextDue) + (a.lastRun ? ' \u00B7 last: ' + ago(a.lastRun) : '') + '</span></div>' +
        A.sw(a.active, 'autog', 'data-id="' + a.id + '"') + '</div><div class="row mt8"><button class="btn ghost small runnow" data-id="' + a.id + '">' + icon('play', 13) + ' Run now</button><button class="btn ghost small autodel" data-id="' + a.id + '" style="color:var(--bad)">' + icon('trash', 13) + '</button></div></div>').join('') || '<p class="small dim center">No automations yet.</p>';
      q('#auList').querySelectorAll('.autog').forEach((b) => b.onclick = async () => { await api('/api/automations/' + b.getAttribute('data-id') + '/toggle', { method: 'POST', body: '{}' }); S.automs = await api('/api/automations'); fill(); });
      q('#auList').querySelectorAll('.autodel').forEach((b) => b.onclick = async () => { await api('/api/automations/' + b.getAttribute('data-id'), { method: 'DELETE' }); S.automs = await api('/api/automations'); fill(); });
      q('#auList').querySelectorAll('.runnow').forEach((b) => b.onclick = async () => { toast('Running now\u2026'); await api('/api/automations/' + b.getAttribute('data-id') + '/run', { method: 'POST', body: '{}' }); });
    }
    return '<div class="scr">' + topbar({ title: 'Automate', sub: 'Astra works while you live your life' }) +
      '<div class="card pad mt8"><textarea class="inp" id="auPrompt" placeholder="e.g. Every morning at 8 AM, research the markets and send me a report."></textarea>' +
      '<div class="row mt8" style="flex-wrap:wrap;gap:6px">' + ['Every morning at 8 AM, research the markets and send me a report', 'Every Monday, prepare my weekly report', 'Every 30 minutes, tell me the time'].map((p) => '<button class="chip scheduled exbtn" data-p="' + esc(p) + '" style="cursor:pointer">' + esc(p.split(',')[0]) + '</button>').join('') + '</div>' +
      '<button class="btn mt16" id="auGo">' + icon('zap', 15) + ' Create automation</button></div>' +
      '<div class="col mt16" id="auList"></div></div>';
  });

  // ============ NOTIFICATIONS ============
  A.route('/notifications', () => {
    const list = S.notifs.map((n) => '<div class="lrow" style="cursor:default;' + (n.read ? 'opacity:.6' : '') + '"><div class="sq" style="background:' + (n.kind === 'success' ? 'rgba(52,211,153,.13);color:var(--ok)' : n.kind === 'approval' ? 'rgba(251,191,36,.13);color:var(--warn)' : 'rgba(91,140,255,.12);color:var(--blue)') + '">' + icon(n.kind === 'success' ? 'check' : n.kind === 'approval' ? 'shield' : 'bell', 17) + '</div><div class="t"><b>' + esc(n.title) + '</b><span>' + esc(n.body) + '</span><span class="tiny dim">' + ago(n.ts) + '</span></div></div>').join('') || '<div class="empty card pad"><div class="big">\uD83D\uDD14</div><b>No notifications</b></div>';
    window.afterRender = () => { api('/api/notifications/read', { method: 'POST', body: '{}' }).then(() => { S.notifs.forEach((n) => n.read = true); A.updateBadge(); }); };
    return '<div class="scr">' + topbar({ back: true, title: 'Notifications', sub: 'Push \u00B7 Telegram \u00B7 (WhatsApp/SMS/Email ready)' }) + '<div class="col mt8">' + list + '</div></div>';
  });

  // ============ PHONE CONTROL ============
  A.route('/phone', () => {
    const rows = (S.permsMeta || []).map((p) => {
      const v = S.perms[p.key] || 'denied';
      return '<div class="card pad"><div class="row"><div class="sq" style="background:rgba(91,140,255,.12);color:var(--blue)">' + icon(p.icon, 18) + '</div><div class="t"><b>' + p.name + '</b><span>' + p.desc + (p.web ? '' : ' \u00B7 requires mobile companion') + '</span></div></div>' +
        '<div class="tri mt8">' + ['on', 'ask', 'denied'].map((o) => '<button data-v="' + o + '" data-k="' + p.key + '" class="' + (v === o ? 'on' : '') + '">' + (o === 'on' ? 'ON' : o === 'ask' ? 'ASK EVERY TIME' : 'DENIED') + '</button>').join('') + '</div></div>';
    }).join('');
    window.afterRender = () => {
      document.querySelectorAll('.tri button').forEach((b) => b.onclick = async () => {
        const k = b.getAttribute('data-k'), v = b.getAttribute('data-v');
        if (v === 'on') await nativePrompt(k);
        S.perms[k] = v;
        await api('/api/permissions', { method: 'PUT', body: JSON.stringify({ [k]: v }) });
        b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        toast(pName(k) + ' \u2192 ' + v.toUpperCase());
      });
    };
    async function nativePrompt(k) {
      try {
        if (k === 'notifications' && window.Notification) await Notification.requestPermission();
        if (k === 'location' && navigator.geolocation) navigator.geolocation.getCurrentPosition(() => {}, () => {});
        if (k === 'camera' && navigator.mediaDevices) { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); }
      } catch {}
    }
    const pName = (k) => (S.permsMeta || []).find((x) => x.key === k)?.name || k;
    return '<div class="scr">' + topbar({ back: true, title: 'Phone Control', sub: 'Astra never accesses anything silently' }) + '<div class="col mt8">' + rows + '</div></div>';
  });

  // ============ MORE ============
  A.route('/more', () => {
    const item = (ic, t, sub, hash) => '<div class="lrow" data-act="go" data-hash="' + hash + '"><div class="sq" style="background:rgba(91,140,255,.12);color:var(--blue)">' + icon(ic, 18) + '</div><div class="t"><b>' + t + '</b><span>' + sub + '</span></div>' + icon('chevR', 16) + '</div>';
    return '<div class="scr">' + topbar({ title: 'More' }) +
      '<div class="card pad row"><div class="heroava">' + esc((S.user.name || 'A')[0].toUpperCase()) + '</div><div><b>' + esc(S.user.name) + '</b><div class="sub tiny dim">' + (S.user.email || 'local account') + '</div></div><span class="chip gold" style="margin-left:auto">FREE PLAN</span></div>' +
      '<div class="col mt16">' +
      item('spark', 'Skills', 'Install, create, assign capabilities', '#/skills') +
      item('bot', 'Agents', 'Your specialized workforce', '#/agents') +
      item('phone', 'Phone Control', 'Permissions: ON / ASK / DENIED', '#/phone') +
      item('bell', 'Notifications', 'Alerts & channels', '#/notifications') +
      item('gear', 'Settings', 'Account, AI, privacy, services', '#/settings') +
      item('shield', 'Privacy & Security', 'Audit log & controls', '#/audit') +
      item('logout', 'Sign Out', '', '#/signout') + '</div>' +
      '<p class="tiny dim center mt24">Astra \u2014 Your AI Agent. Always On.</p></div>';
  });
  A.route('/signout', () => { window.afterRender = async () => { await api('/api/auth/logout', { method: 'POST', body: '{}' }); location.hash = '#/splash'; location.reload(); }; return '<div class="scr"></div>'; });

  // ============ AUDIT ============
  A.route('/audit', () => {
    window.afterRender = async () => {
      const a = await api('/api/audit');
      q('#auBody').innerHTML = a.map((x) => '<div class="lrow" style="cursor:default"><div class="t"><b class="small">' + esc(x.action) + '</b><span>' + esc(x.detail) + '</span><span class="tiny dim">' + fmtDT(x.ts) + '</span></div></div>').join('') || '<p class="small dim">Empty.</p>';
    };
    return '<div class="scr">' + topbar({ back: true, title: 'Privacy & Security', sub: 'Audit log \u2014 everything Astra did' }) +
      '<div class="card pad small mut">Encrypted secrets \u00B7 permission gates on every sensitive tool \u00B7 rate limiting \u00B7 session tokens \u00B7 xKiro key stays server-side.</div>' +
      '<div class="col mt16" id="auBody"></div></div>';
  });

  // ============ SETTINGS ============
  A.route('/settings', () => {
    const st = S.settings;
    window.afterRender = () => {
      q('#setVoice').onchange = async (e) => { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ voiceReplies: e.target.checked }) }); S.settings.voiceReplies = e.target.checked; };
      q('#setAuto').onchange = async (e) => { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ autonomy: e.target.value }) }); S.settings.autonomy = e.target.value; };
      q('#tgSave').onclick = async () => { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ telegramToken: q('#tgTok').value.trim(), telegramChatId: q('#tgChat').value.trim() }) }); toast('Telegram settings saved', 'success'); };
      q('#tgTest').onclick = async () => {
        toast('Sending test\u2026');
        const r = await api('/api/telegram/test', { method: 'POST', body: JSON.stringify({ token: q('#tgTok').value.trim(), chatId: q('#tgChat').value.trim() }) });
        toast(r.ok ? 'Telegram delivered \u2705' : 'Telegram failed: ' + r.detail, r.ok ? 'success' : 'error');
      };
      q('#setName').onchange = async (e) => { S.user.name = e.target.value.trim() || S.user.name; toast('Name updated (local)'); };
    };
    const item = (ic, t, sub, hash) => '<div class="lrow" data-act="go" data-hash="' + hash + '"><div class="sq" style="background:rgba(91,140,255,.12);color:var(--blue)">' + icon(ic, 18) + '</div><div class="t"><b>' + t + '</b><span>' + sub + '</span></div>' + icon('chevR', 16) + '</div>';
    return '<div class="scr">' + topbar({ back: true, title: 'Settings' }) +
      '<div class="card pad row"><div class="heroava">' + esc((S.user.name || 'A')[0].toUpperCase()) + '</div><div style="flex:1"><b>' + esc(S.user.name) + '</b><div class="tiny dim">' + (S.user.email || 'local account') + '</div></div></div>' +
      '<label class="fld">Display name</label><input class="inp" id="setName" value="' + esc(S.user.name) + '">' +
      '<b class="h2 mt24" style="display:block">AI Preferences</b>' +
      '<div class="card pad mt8 row spread"><div><b class="small">Voice replies</b><div class="tiny dim">Speak Astra\u2019s responses aloud</div></div>' + A.sw(!!st.voiceReplies, 'x', 'id="setVoice"') + '</div>' +
      '<div class="card pad mt8 row spread"><div><b class="small">Autonomy</b><div class="tiny dim">How Astra handles permission prompts</div></div><select class="inp" id="setAuto" style="width:auto"><option value="ask"' + (st.autonomy === 'ask' ? ' selected' : '') + '>Ask me</option><option value="auto"' + (st.autonomy === 'auto' ? ' selected' : '') + '>Act autonomously</option></select></div>' +
      '<b class="h2 mt24" style="display:block">System</b><div class="col mt8">' +
      item('bot', 'Agents', 'Manage & create agents', '#/agents') +
      item('spark', 'Skills', 'Skill library', '#/skills') +
      item('phone', 'Phone Control', 'Permission dashboard', '#/phone') +
      item('bell', 'Notifications', 'Alert center', '#/notifications') +
      item('shield', 'Privacy & Security', 'Audit log', '#/audit') + '</div>' +
      '<b class="h2 mt24" style="display:block">Connected Services</b>' +
      '<div class="card pad mt8"><b class="small">Telegram</b><div class="tiny dim">Real push channel when configured (bot token + chat id).</div>' +
      '<input class="inp mt8" id="tgTok" placeholder="bot token" value="' + esc(st.telegramToken || '') + '"><input class="inp mt8" id="tgChat" placeholder="chat id" value="' + esc(st.telegramChatId || '') + '">' +
      '<div class="row mt8"><button class="btn ghost small" id="tgSave">Save</button><button class="btn small" id="tgTest">Send test</button></div></div>' +
      '<b class="h2 mt24" style="display:block">Subscription</b>' +
      '<div class="card pad mt8 row spread"><div><b class="small">Free plan</b><div class="tiny dim">Local agent \u00B7 unlimited tasks</div></div><span class="chip gold">CURRENT</span></div>' +
      '<b class="h2 mt24" style="display:block">About Astra</b>' +
      '<div class="card pad mt8 small mut">Astra v1.0 \u2014 Your AI Agent. Always On.<br>Architecture: Master Agent \u2192 Planner \u2192 Specialized Agents \u2192 Skills \u2192 Tools \u2192 Review Agent \u2192 Fix Loop \u2192 Result. Node/TypeScript backend, on-device web client. xKiro API key (if configured) lives only on the server.</div></div>';
  });
})();
