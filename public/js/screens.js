/* Screens: splash, onboarding, signin, home, chat. */
(function () {
  const { api, esc, icon, logo, toast, topbar, chip, go, ago, sw } = A;

  // ============ SPLASH ============
  A.route('/splash', () => {
    window.afterRender = () => setTimeout(() => go(S.user ? '#/home' : '#/onboarding'), 2000);
    return '<div id="splash"><div class="glow"></div>' + logo(96) + '<h1>Astra</h1><p>Your AI Agent. Always On.</p><div class="loader"><i></i><i></i><i></i></div></div>';
  });

  // ============ ONBOARDING ============
  const OB = { step: 1, perms: {}, skills: new Set(['web-research', 'coding', 'web-development', 'uiux-design', 'image-generation', 'automation']), name: '' };
  const ONB_SKILLS = [['web-research', 'Web & Research'], ['coding', 'Coding'], ['web-development', 'Web Development'], ['uiux-design', 'UI/UX Design'], ['image-generation', 'Image Generation'], ['video', 'Video'], ['documents', 'Documents'], ['data-analysis', 'Data Analysis'], ['automation', 'Automation'], ['browser-control', 'Browser Control']];
  const OB_PERMS = [
    { key: 'contacts', name: 'Contacts', icon: 'users', web: false, desc: 'Look up, add and manage your contacts.' },
    { key: 'files', name: 'Files & Storage', icon: 'folder', web: true, desc: 'Read and manage files you attach or create with Astra.' },
    { key: 'notifications', name: 'Notifications', icon: 'bell', web: true, desc: 'Send you push notifications when tasks complete or need approval.' },
    { key: 'calls', name: 'Calls', icon: 'phone', web: false, desc: 'Make and receive calls on your behalf (mobile companion only).' },
    { key: 'messages', name: 'Messages', icon: 'message', web: false, desc: 'Send and read messages (mobile companion only).' },
    { key: 'camera', name: 'Camera', icon: 'camera', web: true, desc: 'Take photos and videos when you ask.' },
    { key: 'location', name: 'Location', icon: 'pin', web: true, desc: 'Access location for local research and reminders.' },
    { key: 'screen', name: 'Screen Access', icon: 'eye', web: false, desc: 'Read screen content to help with on-screen tasks (mobile companion only).' },
  ];

  A.route('/onboarding', () => {
    if (OB.step === 1) {
      window.afterRender = () => {
        q('#obStart').onclick = () => { OB.step = 2; A.render(); };
        q('#obSignin').onclick = () => go('#/signin');
      };
      return '<div class="scr" style="display:flex;flex-direction:column;justify-content:center;padding-bottom:40px">' +
        '<div class="center">' + logo(110) + '<h1 style="font-size:26px;margin-top:22px">Welcome to Astra</h1>' +
        '<p class="mut" style="margin:12px 26px 0;font-size:13.5px;line-height:1.6">Your AI agent, designed to help you think, plan, create and get things done. Astra doesn\u2019t just advise \u2014 it executes real work and reviews it before delivery.</p></div>' +
        '<div class="dots"><i class="on"></i><i></i><i></i></div>' +
        '<button class="btn" id="obStart">Get Started</button>' +
        '<div class="center"><button class="linkish" id="obSignin">Sign In</button></div></div>';
    }
    if (OB.step === 2) {
      for (const p of (S.permsMeta && S.permsMeta.length ? S.permsMeta : OB_PERMS)) if (!(p.key in OB.perms)) OB.perms[p.key] = ['notifications', 'files'].includes(p.key) ? 'on' : 'on';
      window.afterRender = () => {
        document.querySelectorAll('[data-perm]').forEach((el) => el.addEventListener('change', (e) => { OB.perms[el.getAttribute('data-perm')] = e.target.checked ? 'on' : 'denied'; }));
        q('#obNext').onclick = () => { OB.step = 3; A.render(); };
        q('#obBack').onclick = () => { OB.step = 1; A.render(); };
      };
      const rows = (S.permsMeta && S.permsMeta.length ? S.permsMeta : OB_PERMS).map((p) =>
        '<div class="lrow" style="cursor:default"><div class="sq" style="background:rgba(91,140,255,.12);color:var(--blue)">' + icon(p.icon, 19) + '</div><div class="t"><b>' + p.name + '</b><span>' + p.desc + (p.web ? '' : ' \u00B7 mobile companion') + '</span></div>' + sw(OB.perms[p.key] === 'on', 'x', 'data-perm="' + p.key + '"') + '</div>').join('');
      return '<div class="scr">' + topbar({ back: true, title: 'Your Phone, Your Power', sub: 'Astra accesses capabilities only with your permission' }) +
        '<div class="col mt8">' + rows + '</div><p class="tiny dim mt8">You can change these anytime in Phone Control. Astra never accesses anything silently.</p>' +
        '<button class="btn mt16" id="obNext">Continue</button><div class="center"><button class="linkish" id="obBack">Back</button></div></div>';
    }
    if (OB.step === 3) {
      window.afterRender = () => {
        document.querySelectorAll('[data-skill]').forEach((el) => el.addEventListener('click', () => { const id = el.getAttribute('data-skill'); if (OB.skills.has(id)) OB.skills.delete(id); else OB.skills.add(id); el.classList.toggle('on'); }));
        q('#obNext').onclick = () => { OB.step = 4; A.render(); };
        q('#obBack').onclick = () => { OB.step = 2; A.render(); };
      };
      const chips = ONB_SKILLS.map(([id, name]) => '<button class="qbtn' + (OB.skills.has(id) ? ' on' : '') + '" data-skill="' + id + '" style="padding:11px;text-align:center"><b style="margin:0;font-size:12px">' + name + '</b></button>').join('');
      return '<div class="scr">' + topbar({ back: true, title: 'Choose Your Skills', sub: 'Pick the skills you want Astra to use' }) +
        '<div class="qgrid mt8" style="grid-template-columns:1fr 1fr">' + chips + '</div>' +
        '<p class="tiny dim mt8">You can change these later in the Skills library.</p>' +
        '<button class="btn mt16" id="obNext">Continue</button><div class="center"><button class="linkish" id="obBack">Back</button></div></div>';
    }
    // step 4: name
    window.afterRender = () => {
      q('#obEnter').onclick = async () => {
        const name = q('#obName').value.trim() || 'Explorer';
        try {
          const r = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, permissions: OB.perms }) });
          S.user = r.user; S.perms = OB.perms;
          A.startSSE();
          for (const [id] of ONB_SKILLS) if (!OB.skills.has(id)) await api('/api/skills/' + id, { method: 'PUT', body: JSON.stringify({ enabled: false }) }).catch(() => {});
          toast('Welcome to Astra, ' + name + ' \u2728', 'success');
          go('#/home');
        } catch (e) { toast(e.message, 'error'); }
      };
    };
    return '<div class="scr" style="display:flex;flex-direction:column;justify-content:center">' +
      '<div class="center">' + logo(72) + '<h1 style="font-size:22px;margin-top:16px">One last thing</h1><p class="mut small mt8">What should Astra call you?</p></div>' +
      '<input class="inp mt24" id="obName" placeholder="Your name" autocomplete="name">' +
      '<button class="btn mt16" id="obEnter">Enter Astra</button></div>';
  });

  // ============ SIGN IN ============
  A.route('/signin', () => {
    window.afterRender = () => {
      q('#siGo').onclick = async () => {
        try { const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: q('#siMail').value.trim() }) }); location.hash = '#/home'; location.reload(); }
        catch (e) { toast(e.message, 'error'); }
      };
      q('#siBack').onclick = () => go('#/onboarding');
    };
    return '<div class="scr" style="display:flex;flex-direction:column;justify-content:center">' +
      '<div class="center">' + logo(72) + '<h1 style="font-size:22px;margin-top:16px">Sign in</h1><p class="mut small mt8">Enter the email or name of an account on this device.</p></div>' +
      '<input class="inp mt24" id="siMail" placeholder="email or name">' +
      '<button class="btn mt16" id="siGo">Sign In</button><div class="center"><button class="linkish" id="siBack">Back</button></div></div>';
  });

  // ============ HOME ============
  A.route('/home', () => {
    const h = new Date().getHours();
    const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const name = esc((S.user.name || '').split(' ')[0]);
    const tasks = Object.values(S.tasks).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
    const tIcon = { website: 'globe', image: 'image', document: 'file', research: 'search', data: 'chart', automation: 'zap', motion: 'video', design: 'pen' };
    const act = tasks.length ? tasks.map((t) =>
      '<div class="lrow" data-act="go" data-hash="#/task/' + t.id + '"><div class="sq" style="background:rgba(91,140,255,.12);color:var(--blue)">' + icon(tIcon[t.type] || 'spark', 19) + '</div><div class="t"><b class="ellipsis">' + esc(t.prompt.slice(0, 48)) + '</b><span>' + ago(t.updatedAt) + ' \u00B7 ' + t.progress + '%</span></div>' + chip(t.status) + '</div>').join('')
      : '<div class="empty card pad"><div class="big">\u2728</div><b>No activity yet</b><p class="small mt8">Try one of these \u2014 Astra plans, executes and reviews real work:</p><div class="col mt16">' +
      ['Build a website for my printing business', 'Create a modern logo for a trading app', 'Research the top trading platforms in Ghana'].map((p) => '<button class="btn ghost small" data-q="' + esc(p) + '" style="width:100%">' + esc(p) + '</button>').join('') + '</div></div>';

    window.afterRender = () => {
      document.querySelectorAll('[data-q]').forEach((b) => b.onclick = async () => {
        toast('Astra is planning your task\u2026');
        const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ text: b.getAttribute('data-q') }) });
        S.curConv = r.conversationId; go('#/chat');
      });
    };
    return '<div class="scr">' +
      '<div class="tb"><div class="heroava">' + esc((S.user.name || 'A')[0].toUpperCase()) + '</div><div style="flex:1"><h1>' + g + ', ' + name + ' \uD83D\uDC4B</h1><div class="sub"><span class="online"><i></i>Astra online</span></div></div>' +
      '<button class="icobtn" data-act="go" data-hash="#/notifications">' + icon('bell', 18) + '<span class="bdg" data-badge style="display:none"></span></button></div>' +
      '<div class="card pad mt8" style="border-color:var(--line2);background:linear-gradient(150deg,rgba(91,140,255,.14),rgba(139,92,246,.10)),var(--card)">' +
      '<div class="row"><div class="sq" style="background:var(--grad);color:#fff">' + icon('spark', 20) + '</div><div class="t" style="flex:1"><b>Your AI Assistant</b><span>Ready to help, create and get things done.</span></div></div>' +
      '<button class="btn mt16" data-act="go" data-hash="#/chat">Start a task</button></div>' +
      '<div class="qgrid mt16">' +
      '<button class="qbtn" data-act="go" data-hash="#/chat"><span style="color:var(--blue)">' + icon('message', 20) + '</span><b>Chat</b><span>Ask anything</span></button>' +
      '<button class="qbtn" data-act="go" data-hash="#/create"><span style="color:#f472b6">' + icon('wand', 20) + '</span><b>Create</b><span>Image, video, docs</span></button>' +
      '<button class="qbtn" data-act="go" data-hash="#/build"><span style="color:var(--ok)">' + icon('globe', 20) + '</span><b>Build</b><span>Apps & websites</span></button>' +
      '<button class="qbtn" data-act="go" data-hash="#/automate"><span style="color:var(--gold)">' + icon('zap', 20) + '</span><b>Automate</b><span>Save time</span></button></div>' +
      '<div class="row spread mt24"><b class="h2">Recent Activity</b><button class="linkish" data-act="go" data-hash="#/tasks" style="padding:4px">View all</button></div>' +
      '<div class="col mt8" data-live="home">' + act + '</div></div>';
  });
  window.onLiveHome = (ev) => {
    if (S.route === '/home' && ev.type === 'task') { const el = document.querySelector('[data-live="home"]'); if (el) { /* light touch: re-render home list on next render only */ } }
  };

  // ============ shared exec-card rendering ============
  function stepHTML(st) {
    const ic = st.status === 'done' ? '\u2713' : st.status === 'failed' ? '\u2717' : st.status === 'running' ? '\u25CF' : st.status === 'awaiting' ? '!' : st.status === 'skipped' ? '\u2014' : '\u25CB';
    const logs = (st.logs || []).slice(-5).map((l) => '<span class="' + (l.startsWith('\u2713') ? 'ok' : l.startsWith('\u2717') || l.startsWith('ERROR') ? 'bad' : '') + '">' + esc(l) + '</span>').join('');
    return '<div class="step ' + st.status + '"><div class="dot">' + ic + '</div><div style="flex:1;min-width:0"><b>' + esc(st.name) + '</b> <span class="who">\u00B7 ' + esc(st.agent) + (st.skill ? ' \u00B7 ' + esc(st.skill) : '') + '</span>' +
      (st.status === 'awaiting' && st.approval ? '<div class="row mt8"><button class="btn small approve" data-dec="approve">Approve</button><button class="btn small danger approve" data-dec="deny">Deny</button></div><p class="tiny warn mt8" style="color:var(--warn)">' + esc(st.approval.what) + '</p>' : '') +
      (logs ? '<div class="logs">' + logs + '</div>' : '') + '</div></div>';
  }
  function execHTML(t) {
    const steps = t.steps.map(stepHTML).join('');
    const arts = (t.artifacts || []).map((a) => '<a class="btn ghost small" style="text-decoration:none" href="/artifacts/' + t.id + '/' + a.path + '" target="_blank" download="' + a.name + '">' + icon('download', 14) + esc(a.name) + '</a>').join('');
    const extra = [];
    if (t.previewUrl) extra.push('<button class="btn small ghost pvw">' + icon('eye', 14) + 'Preview</button>');
    if (t.type === 'website' && t.status === 'done' && !t.deployUrl) extra.push('<button class="btn small dep">' + icon('external', 14) + 'Deploy</button>');
    if (t.deployUrl) extra.push('<a class="btn small" style="text-decoration:none" href="' + t.deployUrl + '" target="_blank">' + icon('external', 14) + 'Live site</a>');
    if (t.netlifyUrl) extra.push('<a class="btn ghost small" style="text-decoration:none" href="' + t.netlifyUrl + '" target="_blank">' + icon('external', 14) + 'Netlify</a>');
    const reviewLine = t.review ? '<p class="tiny mt8" style="color:' + (t.review.approved ? 'var(--ok)' : 'var(--warn)') + '">' + icon('checkshield', 12) + ' Review Agent: ' + (t.review.approved ? 'approved' : 'reviewing') + ' \u00B7 ' + t.review.findings.length + ' finding(s) \u00B7 ' + t.reviewLoops + ' fix loop(s)</p>' : '';
    return '<div class="exec" data-exec="' + t.id + '"><div class="hd"><div class="sq" style="background:var(--grad);color:#fff">' + icon('bot', 18) + '</div><div style="flex:1"><b class="small">' + esc(t.type.toUpperCase()) + ' TASK</b><div class="pbar mt8"><i style="width:' + t.progress + '%"></i></div></div>' + chip(t.status) + '</div>' +
      '<div class="bd">' + steps + reviewLine + '</div>' +
      ((arts || extra.length) ? '<div class="ft">' + arts + extra.join('') + '</div>' : '') + '</div>';
  }
  window.UIX = { execHTML, stepHTML };

  // ============ CHAT ============
  A.route('/chat', () => chatRender());
  function chatRender() {
    const convs = S.convs || [];
    const cur = convs.find((c) => c.id === S.curConv) || convs[0];
    S.curConv = cur ? cur.id : null;
    const msgs = cur ? cur.messages.map((m) => {
      if (m.role === 'user') return '<div class="msg user">' + esc(m.text) + (m.attachments && m.attachments.length ? '<span class="meta">\uD83D\uDCCE ' + esc(m.attachments.join(', ')) + '</span>' : '') + '</div>';
      let out = '<div class="msg astra">' + esc(m.text) + '</div>';
      if (m.taskId && S.tasks[m.taskId]) out += UIX.execHTML(S.tasks[m.taskId]);
      return out;
    }).join('') : '';
    window.afterRender = () => bindChat();
    return '<div class="scr" id="chatscr">' +
      '<div class="tb"><button class="icobtn" data-act="back">' + icon('back', 18) + '</button><div style="flex:1"><h1>Astra</h1><div class="sub"><span class="online"><i></i>Online \u00B7 Master Agent</span></div></div>' +
      '<button class="icobtn" id="newConv" title="New chat">' + icon('plus', 18) + '</button>' +
      '<button class="icobtn" id="voiceOut" style="color:' + (S.settings.voiceReplies ? 'var(--blue)' : 'inherit') + '" title="Voice replies">' + icon('play', 16) + '</button></div>' +
      '<div class="row" id="convRow" style="overflow-x:auto;gap:6px;padding-bottom:4px"></div>' +
      '<div class="col mt8" id="msgs" data-live="chat">' + (msgs || '<div class="empty"><div class="big">\uD83E\uDD16</div><b>Talk to your agent</b><p class="small mt8">Ask for anything \u2014 "Build me a professional website for my business." Astra shows its plan, then executes with live agents, tools and review.</p></div>') + '</div>' +
      '<div style="position:sticky;bottom:96px;margin-top:14px" class="card pad" id="chatbar">' +
      '<div id="attRow" class="row" style="flex-wrap:wrap;gap:6px"></div>' +
      '<div class="row"><button class="icobtn" id="attBtn">' + icon('clip', 17) + '</button><input type="file" id="attFile" multiple hidden>' +
      '<input class="inp" id="chatInp" placeholder="Ask Astra anything\u2026" style="flex:1">' +
      '<button class="icobtn" id="micBtn">' + icon('mic', 17) + '</button>' +
      '<button class="icobtn" id="sendBtn" style="background:var(--grad);border:0;color:#fff">' + icon('send', 16) + '</button></div></div></div>';
  }
  let atts = [];
  async function bindChat() {
    await loadConvs();
    renderPicker(); renderMsgs();
    const inp = q('#chatInp'); if (!inp) return;
    q('#newConv').onclick = () => { S.curConv = null; A.render(); };
    document.querySelectorAll('.convpick').forEach((b) => b.onclick = () => { S.curConv = b.getAttribute('data-c'); A.render(); });
    q('#voiceOut').onclick = async () => { S.settings.voiceReplies = !S.settings.voiceReplies; await api('/api/settings', { method: 'PUT', body: JSON.stringify({ voiceReplies: S.settings.voiceReplies }) }); A.render(); };
    q('#attBtn').onclick = () => q('#attFile').click();
    q('#attFile').onchange = (e) => {
      for (const f of e.target.files) {
        if (f.size > 400_000) { toast('File too large (max 400KB): ' + f.name, 'error'); continue; }
        const r = new FileReader();
        r.onload = () => { atts.push({ name: f.name, dataUrl: String(r.result), text: /\.(csv|txt|md|json)$/i.test(f.name) ? atob(String(r.result).split(',')[1]) : undefined }); renderAtts(); };
        r.readAsDataURL(f);
      }
    };
    function renderAtts() { q('#attRow').innerHTML = atts.map((a, i) => '<span class="chip active" data-i="' + i + '" style="cursor:pointer">' + icon('clip', 11) + ' ' + esc(a.name) + ' \u2715</span>').join(''); document.querySelectorAll('#attRow .chip').forEach((c) => c.onclick = () => { atts.splice(+c.getAttribute('data-i'), 1); renderAtts(); }); }
    q('#micBtn').onclick = () => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return toast('Voice input not supported in this browser', 'error');
      const rec = new SR(); rec.lang = 'en-US';
      q('#micBtn').style.color = 'var(--bad)';
      rec.onresult = (e) => { inp.value = (inp.value + ' ' + e.results[0][0].transcript).trim(); };
      rec.onend = () => { q('#micBtn').style.color = ''; };
      rec.start(); toast('Listening\u2026');
    };
    const send = async () => {
      const text = inp.value.trim(); if (!text && !atts.length) return;
      inp.value = ''; const sentAtts = atts; atts = []; renderAtts();
      const el = q('#msgs');
      el.insertAdjacentHTML('beforeend', '<div class="msg user">' + esc(text || '(attachment)') + '</div><div class="msg astra" id="thinking"><span class="spin">' + icon('refresh', 14) + '</span> Astra is thinking\u2026</div>');
      scrollChat();
      try {
        const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ text, attachments: sentAtts, conversationId: S.curConv }) });
        S.curConv = r.conversationId;
        await loadConvs();
        const th = q('#thinking'); if (th) th.remove();
        if (r.kind === 'reply') {
          el.insertAdjacentHTML('beforeend', '<div class="msg astra">' + esc(r.text) + '</div>');
          if (S.settings.voiceReplies && window.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance(r.text));
        } else {
          const t = S.tasks[r.taskId] || (await api('/api/tasks/' + r.taskId));
          S.tasks[r.taskId] = t;
          const conv = (S.convs || []).find((c) => c.id === r.conversationId);
          const plan = conv ? conv.messages[conv.messages.length - 1].text : '';
          el.insertAdjacentHTML('beforeend', '<div class="msg astra">' + esc(plan) + '</div>' + UIX.execHTML(t));
        }
        scrollChat();
      } catch (e) { const th = q('#thinking'); if (th) th.innerHTML = esc(e.message); toast(e.message, 'error'); }
    };
    q('#sendBtn').onclick = send;
    inp.onkeydown = (e) => { if (e.key === 'Enter') send(); };

    window.onAct = (act, el) => {
      if (act === 'approve-click') return;
    };
    document.querySelectorAll('.approve').forEach((b) => b.onclick = async (e) => {
      const card = e.target.closest('[data-exec]'); const tid = card.getAttribute('data-exec');
      await api('/api/tasks/' + tid + '/approval', { method: 'POST', body: JSON.stringify({ decision: b.getAttribute('data-dec') }) });
      toast(b.getAttribute('data-dec') === 'approve' ? 'Approved \u2014 Astra continues.' : 'Denied \u2014 Astra proceeds without it.');
    });
    document.querySelectorAll('.pvw').forEach((b) => b.onclick = (e) => { const card = e.target.closest('[data-exec]'); go('#/build/' + card.getAttribute('data-exec')); });
    document.querySelectorAll('.dep').forEach((b) => b.onclick = async (e) => {
      const card = e.target.closest('[data-exec]'); const tid = card.getAttribute('data-exec');
      toast('Deploying\u2026');
      const r = await api('/api/tasks/' + tid + '/deploy', { method: 'POST', body: JSON.stringify({}) });
      toast('Live at ' + r.url, 'success');
    });
  }
  function renderPicker() {
    const row = q('#convRow'); if (!row) return;
    row.innerHTML = (S.convs || []).slice(0, 8).map((c) => '<button class="chip ' + (c.id === S.curConv ? 'active' : 'scheduled') + ' convpick" data-c="' + c.id + '" style="flex:none">' + esc(c.title.slice(0, 22)) + '</button>').join('');
    row.querySelectorAll('.convpick').forEach((b) => b.onclick = () => { S.curConv = b.getAttribute('data-c'); renderPicker(); renderMsgs(); });
  }
  function renderMsgs() {
    const el = q('#msgs'); if (!el) return;
    const cur = (S.convs || []).find((c) => c.id === S.curConv);
    if (!cur) return;
    el.innerHTML = cur.messages.map((m) => {
      if (m.role === 'user') return '<div class="msg user">' + esc(m.text) + '</div>';
      let out = '<div class="msg astra">' + esc(m.text) + '</div>';
      if (m.taskId && S.tasks[m.taskId]) out += UIX.execHTML(S.tasks[m.taskId]);
      return out;
    }).join('');
    el.querySelectorAll('[data-exec]').forEach(rebindExec);
    scrollChat();
  }
  async function loadConvs() { S.convs = await api('/api/conversations'); }
  function scrollChat() { const sc = q('#chatscr'); if (sc) sc.scrollTop = sc.scrollHeight; }
  window.onLiveChat = (ev) => {
    if (S.route !== '/chat') return;
    if (ev.type === 'task') {
      const el = document.querySelector('[data-exec="' + ev.task.id + '"]');
      if (el) { const tmp = document.createElement('div'); tmp.innerHTML = UIX.execHTML(ev.task); const fresh = tmp.firstChild; el.replaceWith(fresh); rebindExec(fresh); }
    }
  };
  function rebindExec(root) {
    root.querySelectorAll('.approve').forEach((b) => b.onclick = async (e) => {
      const card = e.target.closest('[data-exec]');
      await api('/api/tasks/' + card.getAttribute('data-exec') + '/approval', { method: 'POST', body: JSON.stringify({ decision: b.getAttribute('data-dec') }) });
    });
    root.querySelectorAll('.pvw').forEach((b) => b.onclick = () => go('#/build/' + root.getAttribute('data-exec')));
    root.querySelectorAll('.dep').forEach((b) => b.onclick = async () => { const r = await api('/api/tasks/' + root.getAttribute('data-exec') + '/deploy', { method: 'POST', body: JSON.stringify({}) }); toast('Live at ' + r.url, 'success'); });
  }
  window.onLive = (ev) => { window.onLiveChat && window.onLiveChat(ev); window.onLiveTasks && window.onLiveTasks(ev); window.onLiveBuild && window.onLiveBuild(ev); };
  const q = (s) => document.querySelector(s);
})();
