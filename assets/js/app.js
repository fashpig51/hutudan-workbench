// ============================================================
// 主控制器：口令登录、导航切换、顶栏、同步状态
// ============================================================
window.WB = window.WB || {};
(function () {
  const E = WB.ui;
  const NAV = [
    { key: 'dashboard', label: '总览', icon: '📊' },
    { key: 'work', label: '工作', icon: '💼' },
    { key: 'study', label: '学习', icon: '📚' },
    { key: 'life', label: '日常生活', icon: '🏠' }
  ];
  let current = 'work';

  // 表结构：表名 + 该表的加密字段（导出/导入时用来正确加解密）
  const TABLES = [
    { t: 'todos', enc: ['title', 'note'] },
    { t: 'notes', enc: ['title', 'content'] },
    { t: 'books', enc: ['title', 'author', 'review'] },
    { t: 'habits', enc: ['name'] },
    { t: 'goals', enc: ['title', 'key_results'] },
    { t: 'time_logs', enc: ['note'] },
    { t: 'moods', enc: ['note'] },
    { t: 'health', enc: ['note'] }
  ];

  // ---------- 番茄钟（全局浮动条）----------
  WB.pomodoro = (function () {
    let timer = null, remain = 0, total = 25 * 60, taskId = null;
    function bar() {
      let b = document.getElementById('pomoBar');
      if (!b) {
        b = document.createElement('div'); b.id = 'pomoBar'; b.className = 'pomo-bar';
        b.innerHTML = '<span class="pomo-title"></span><span class="pomo-time"></span><button class="pomo-stop">停</button>';
        document.body.appendChild(b);
        b.querySelector('.pomo-stop').onclick = stop;
      }
      return b;
    }
    function fmt(s) { const m = Math.floor(s / 60), ss = s % 60; return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0'); }
    async function finish() {
      clearInterval(timer); timer = null;
      bar().style.display = 'none';
      if (taskId) {
        const rows = await WB.store.list('todos', ['title', 'note']);
        const r = rows.find(x => x.id === taskId);
        if (r) {
          await WB.store.upsert('todos', ['title', 'note'], Object.assign({}, r, {
            kanban_status: 'done', status: 'done',
            focus_minutes: (parseInt(r.focus_minutes) || 0) + 25
          }));
        }
      }
      WB.ui.toast('专注结束，已标记完成 +25分钟');
      taskId = null;
    }
    function stop() { if (timer) clearInterval(timer); timer = null; bar().style.display = 'none'; taskId = null; }
    function tick() {
      const b = bar();
      b.querySelector('.pomo-time').textContent = fmt(remain);
      if (remain <= 0) { finish(); return; }
      remain--;
    }
    function start(id, title) {
      taskId = id; remain = total;
      const b = bar();
      b.querySelector('.pomo-title').textContent = '专注：' + title;
      b.style.display = 'flex';
      if (timer) clearInterval(timer);
      tick(); timer = setInterval(tick, 1000);
    }
    return { start: start, stop: stop };
  })();

  // ---------- 到期提醒（页面开着时弹横幅）----------
  let reminded = new Set();
  function todayLocal() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function isDoneR(r) { return r.kanban_status === 'done' || r.status === 'done'; }
  function showReminder(r) {
    let b = document.getElementById('remindBar');
    if (!b) { b = document.createElement('div'); b.id = 'remindBar'; b.className = 'remind-bar'; document.body.appendChild(b); }
    b.innerHTML = '<div class="remind-body"><div class="remind-title">⏰ 该做了：' + WB.ui.escapeHtml(r.title) + '</div>' + (r.due_time ? '<div class="remind-time">' + r.due_time + '</div>' : '') + '</div><button class="remind-ok">知道了</button>';
    b.style.display = 'flex';
    b.querySelector('.remind-ok').onclick = () => { b.style.display = 'none'; };
  }
  async function checkReminders() {
    try {
      const rows = await WB.store.list('todos', ['title', 'note']);
      const now = new Date();
      const todayStr = todayLocal();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      for (const r of rows) {
        if (r.kind === 'event' || isDoneR(r) || !r.due_date) continue;
        let due = false;
        if (r.due_date < todayStr) due = true;
        else if (r.due_date === todayStr && r.due_time) {
          const p = r.due_time.split(':').map(Number);
          if (p[0] * 60 + p[1] <= nowMin) due = true;
        }
        if (due && !reminded.has(r.id)) { reminded.add(r.id); showReminder(r); }
      }
    } catch (e) { /* 忽略 */ }
  }
  function startReminderLoop() { checkReminders(); setInterval(checkReminders, 15000); }

  function buildShell() {
    const sidebar = E.$('#sidebar');
    sidebar.innerHTML = `
      <div class="brand">糊涂蛋<span>工作台</span></div>
      <nav id="nav"></nav>
      <div class="side-foot">
        <div id="syncWrap" class="sync-wrap">
          <span id="syncDot" class="sync-dot off"></span>
          <span id="syncLabel">未连接云端</span>
        </div>
        <div class="ver">${WB.config.appVersion}</div>
      </div>`;
    const nav = E.$('#nav', sidebar);
    NAV.forEach(n => {
      const b = E.el(`<button class="nav-btn" data-key="${n.key}"><span class="ni">${n.icon}</span>${n.label}</button>`);
      nav.appendChild(b);
    });
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (!btn) return;
      switchTo(btn.dataset.key);
    });

    // 顶栏
    const tb = E.$('#topbar');
    const d = new Date();
    const greet = d.getHours() < 6 ? '夜深了' : d.getHours() < 12 ? '早上好' : d.getHours() < 18 ? '下午好' : '晚上好';
    tb.innerHTML = `
      <div class="greet">${greet}，老板</div>
      <div class="date">${d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</div>
      <div class="top-actions">
        <input id="nlInput" placeholder="自然语言输入，如“明天下午5点交报告”“每周五跑步”" maxlength="200">
        <button id="nlBtn" class="btn-ghost">执行</button>
        <input id="search" placeholder="搜索（本设备）">
        <button id="themeBtn" class="btn-ghost" title="切换明暗主题">🌙</button>
        <button id="exportBtn" class="btn-ghost" title="导出加密备份文件">📤 备份</button>
        <button id="importBtn" class="btn-ghost" title="从备份文件恢复数据">📥 恢复</button>
        <input id="importFile" type="file" accept="application/json,.json,.txt" style="display:none">
        <button id="lockBtn" class="btn-ghost" title="退出当前口令">锁</button>
      </div>`;
    E.$('#lockBtn', tb).addEventListener('click', () => location.reload());
    E.$('#exportBtn', tb).addEventListener('click', exportData);
    E.$('#importBtn', tb).addEventListener('click', () => E.$('#importFile', tb).click());
    E.$('#importFile', tb).addEventListener('change', (e) => { importData(e.target.files[0]); e.target.value = ''; });
    E.$('#search', tb).addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      E.$$('#content .item-title').forEach(t => {
        const li = t.closest('.item');
        if (li) li.style.display = !q || t.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
    E.$('#themeBtn', tb).addEventListener('click', () => {
      document.body.classList.toggle('light');
      localStorage.setItem('wb_theme', document.body.classList.contains('light') ? 'light' : 'dark');
      E.toast('主题已切换');
    });
    if (localStorage.getItem('wb_theme') === 'light') document.body.classList.add('light');
    E.$('#nlBtn', tb).addEventListener('click', () => doNaturalLanguage(E.$('#nlInput', tb).value));
    E.$('#nlInput', tb).addEventListener('keydown', (e) => { if (e.key === 'Enter') doNaturalLanguage(e.target.value); });
  }

  function switchTo(key) {
    const oldContent = E.$('#content');
    const oldRoot = oldContent.firstElementChild;
    if (oldRoot && oldRoot.__unsub) { try { oldRoot.__unsub(); } catch (e) {} }
    // 把 content 容器整体替换掉，彻底清掉旧板块残留的事件监听器，避免切回来后列表空白
    const content = oldContent.cloneNode(false);
    oldContent.parentNode.replaceChild(content, oldContent);
    current = key;
    E.$$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.key === key));
    if (key === 'dashboard') WB.dashboard(content);
    else if (key === 'work') WB.sections.work(content);
    else if (key === 'study') WB.sections.study(content);
    else if (key === 'life') WB.sections.life(content);
    if (content.firstElementChild && !content.firstElementChild.__unsub) content.firstElementChild.__unsub = function () {};
  }

  // 校验通过后真正进入（init 已在外部完成）
  async function enterApp(pass, cloud) {
    E.setSync('wait', '连接中…');
    if (cloud) {
      E.setSync('on', '云端同步中');
      await WB.store.heartbeat();
      setTimeout(() => E.setSync('on', '已同步'), 800);
    } else {
      E.setSync('off', '纯本地模式');
    }
    buildShell();
    switchTo('dashboard');
    startReminderLoop();
    E.$('#passModal').style.display = 'none';
  }

  function showPassModal() {
    const m = E.$('#passModal');
    m.style.display = 'flex';
    const input = E.$('#passInput');
    const warn = E.$('#passWarn');
    input.focus();

    const submit = async () => {
      const v = input.value;
      if (!v) { E.toast('口令不能为空'); return; }
      E.setSync('wait', '校验中…');
      // 先用口令开柜子，再看柜子里有没有你的东西
      const cloud = await WB.store.init(v, WB.config);
      const has = await WB.store.hasAnyData();
      if (has) {
        // 有数据 → 口令对，直接进
        warn.style.display = 'none';
        enterApp(v, cloud);
      } else {
        // 空柜子 → 可能输错，弹提示不进（兜底按钮防锁死）
        warn.style.display = 'block';
      }
    };

    E.$('#passOk', m).onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };

    // 兜底：明知是空柜仍要进（防"全删+断网"被误锁门外）
    E.$('#passForce', m).onclick = async () => {
      const v = input.value;
      const cloud = await WB.store.init(v, WB.config);
      warn.style.display = 'none';
      enterApp(v, cloud);
    };
    // 重新输入
    E.$('#passRetry', m).onclick = () => {
      warn.style.display = 'none';
      input.value = '';
      input.focus();
    };
  }

  // ---------- 自然语言输入（免费规则版） ----------
  function parseSimpleTime(text) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const shift = n => { const d = new Date(now); d.setDate(d.getDate() + n); return fmt(d); };
    let due = null, time = null, t = text;
    const rel = [['大后天', 3], ['后天', 2], ['明天', 1], ['今天', 0]];
    for (const [kw, n] of rel) { if (t.includes(kw)) { due = shift(n); t = t.replace(kw, ''); break; } }
    const tm = t.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
    const tm2 = t.match(/(\d{1,2})\s*点半?/);
    const ap = t.match(/(上午|下午|晚上|中午|早上|早晨|傍晚)/);
    let hour = null, minute = 0;
    if (tm) { hour = parseInt(tm[1]); minute = parseInt(tm[2]); t = t.replace(tm[0], ''); }
    else if (tm2) { hour = parseInt(tm2[1]); minute = /半/.test(tm2[0]) ? 30 : 0; t = t.replace(tm2[0], ''); }
    if (ap && hour != null) {
      const w = ap[1];
      if (w === '下午' || w === '晚上' || w === '傍晚') { if (hour < 12) hour += 12; }
      else if (w === '中午') { if (hour !== 12) hour = 12; }
      else { if (hour === 12) hour = 0; }
      t = t.replace(ap[0], '');
    }
    if (hour != null) time = pad(hour) + ':' + pad(minute);
    t = t.replace(/[每交搞定之前完成做写弄一下啦吧呀呢]/g, ' ').replace(/\s+/g, ' ').trim();
    return { title: t || text, due: due, time: time };
  }
  async function doNaturalLanguage(text) {
    const t = text.trim(); if (!t) return;
    const lower = t.toLowerCase();
    // 识别习惯："每天跑步""每周五游泳"
    if (/每天|每周|习惯|打卡/.test(t)) {
      const name = t.replace(/每天|每周.|习惯|打卡/g, '').trim() || t;
      await WB.store.upsert('habits', ['name'], { name: name, category: '普通', type: 'check', checkins: '{}' });
      E.toast('已创建习惯：' + name);
      E.$('#nlInput').value = '';
      if (current === 'life') switchTo('life');
      return;
    }
    // 识别笔记
    if (/笔记|记录|想法/.test(t)) {
      const title = t.replace(/笔记|记录|想法/g, '').trim() || t;
      await WB.store.upsert('notes', ['title', 'content'], { title: title, content: '' });
      E.toast('已创建笔记：' + title);
      E.$('#nlInput').value = '';
      if (current === 'study') switchTo('study');
      return;
    }
    // 默认当成任务，简单识别时间
    const smart = parseSimpleTime(t);
    await WB.store.upsert('todos', ['title', 'note'], {
      title: smart.title || t,
      priority: 'mid',
      due_date: smart.due,
      due_time: smart.time,
      kanban_status: 'todo',
      status: 'active',
      raw_input: t
    });
    E.toast('已创建待办：' + (smart.title || t));
    E.$('#nlInput').value = '';
    if (current === 'work') switchTo('work');
  }

  // ---------- 首页总览仪表盘 ----------
  WB.dashboard = async function (root) {
    const E = WB.ui;
    root.innerHTML = `
      <div class="section-head"><h2>今日总览</h2></div>
      <div class="dash-grid">
        <div class="dash-card" id="dash-todos"><h3>📋 今日待办</h3><div class="dash-body"></div></div>
        <div class="dash-card" id="dash-habits"><h3>🌱 习惯打卡</h3><div class="dash-body"></div></div>
        <div class="dash-card" id="dash-notes"><h3>📝 今日笔记</h3><div class="dash-body"></div></div>
        <div class="dash-card" id="dash-focus"><h3>⏱️ 本周专注</h3><div class="dash-body"></div></div>
      </div>
      <div class="section-head" style="margin-top:20px"><h2>目标进展</h2></div>
      <div id="dash-goals"></div>
      <div class="section-head" style="margin-top:20px"><h2>每周复盘</h2></div>
      <div id="dash-weekly" class="weekly-box"></div>`;
    async function render() {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const ws = weekStart();
        const todos = await WB.store.list('todos', ['title', 'note']);
        const todayTodos = todos.filter(r => r.kind === 'task' && !r.parent_id && r.due_date === today && !isDoneR(r));
        E.$('#dash-todos .dash-body', root).innerHTML = todayTodos.length ? todayTodos.map(r => `<div class="dash-row">• ${E.escapeHtml(r.title)} ${r.due_time ? '(' + r.due_time + ')' : ''}</div>`).join('') : '<div class="dash-row muted">今天没有到期待办</div>';

        const habits = await WB.store.list('habits', ['name']);
        const todayCheckins = habits.filter(r => r.last_checkin === today);
        E.$('#dash-habits .dash-body', root).innerHTML = habits.length ? `<div class="dash-row">${todayCheckins.length}/${habits.length} 已打卡</div>` + habits.map(r => `<div class="dash-row">${r.last_checkin === today ? '✅' : '⬜'} ${E.escapeHtml(r.name)}</div>`).join('') : '<div class="dash-row muted">还没有习惯</div>';

        const notes = await WB.store.list('notes', ['title', 'content']);
        const todayNotes = notes.filter(r => r.daily_date === today || (r.created_at || '').slice(0, 10) === today);
        E.$('#dash-notes .dash-body', root).innerHTML = todayNotes.length ? todayNotes.map(r => `<div class="dash-row">• ${E.escapeHtml(r.title)}</div>`).join('') : '<div class="dash-row muted">今天还没写笔记</div>';

        const focusTotal = todos.reduce((s, r) => s + (parseInt(r.focus_minutes) || 0), 0);
        E.$('#dash-focus .dash-body', root).innerHTML = `<div class="dash-row">累计 ${focusTotal} 分钟</div>`;

        const goals = await WB.store.list('goals', ['title', 'key_results']);
        const gEl = E.$('#dash-goals', root);
        if (!goals.length) { gEl.innerHTML = '<div class="empty">还没有目标，去「学习」板块添加</div>'; }
        else {
          gEl.innerHTML = goals.filter(g => g.status !== 'done').map(g => {
            let krs = []; try { krs = JSON.parse(g.key_results || '[]'); } catch (e) {}
            const done = krs.filter(k => (k.current || 0) >= (k.target || 1)).length;
            const pct = krs.length ? Math.round(done / krs.length * 100) : 0;
            return `<div class="goal-row"><div class="goal-title">${E.escapeHtml(g.title)}</div><div class="prog"><div class="prog-bar" style="width:${pct}%"></div><span class="prog-txt">${pct}%</span></div></div>`;
          }).join('');
        }

        const weekDone = todos.filter(r => r.kind === 'task' && isDoneR(r) && (r.updated_at || '').slice(0, 10) >= ws).length;
        const weekNew = todos.filter(r => (r.created_at || '').slice(0, 10) >= ws).length;
        E.$('#dash-weekly', root).innerHTML = `<div class="sum-grid"><div class="sum-card"><div class="sum-num">${weekDone}</div><div class="sum-lbl">本周完成</div></div><div class="sum-card"><div class="sum-num">${weekNew}</div><div class="sum-lbl">本周新建</div></div><div class="sum-card"><div class="sum-num">${todayCheckins.length}</div><div class="sum-lbl">今日打卡</div></div><div class="sum-card"><div class="sum-num">${focusTotal}</div><div class="sum-lbl">累计专注(分)</div></div></div>`;
      } catch (e) { console.error('dashboard error', e); }
    }
    function weekStart() { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.toISOString().slice(0, 10); }
    const unsubs = [];
    for (const t of ['todos', 'habits', 'notes', 'goals']) {
      const enc = t === 'notes' ? ['title', 'content'] : t === 'habits' ? ['name'] : t === 'goals' ? ['title', 'key_results'] : ['title', 'note'];
      unsubs.push(WB.store.subscribe(t, enc, render));
    }
    root.__unsub = function () { unsubs.forEach(u => { try { u(); } catch (e) {} }); };
    render();
  };

  async function exportData() {
    if (!WB.store.getPassphrase()) { E.toast('还没进入工作台，无法备份'); return; }
    E.setSync('wait', '导出中…');
    try {
      const data = {};
      for (const { t, enc } of TABLES) {
        data[t] = await WB.store.list(t, enc);
      }
      const payload = {
        app: 'hutudan-workbench',
        version: WB.config.appVersion,
        exportedAt: new Date().toISOString(),
        workspaceHint: WB.store.getWorkspaceId(),
        data
      };
      const json = JSON.stringify(payload);
      const encB64 = await WB.crypto.encrypt(json, WB.store.getPassphrase());
      const file = { enc: encB64, tip: '用同一口令在工作台「恢复」即可还原' };
      const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '糊涂蛋工作台备份_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      E.toast('已导出加密备份（请存到微信/邮箱/网盘）');
    } catch (e) {
      E.toast('导出失败：' + (e.message || e));
    }
    const cloud = WB.store.hasCloud();
    E.setSync(cloud ? 'on' : 'off', cloud ? '已同步' : '纯本地模式');
  }

  async function importData(file) {
    if (!file) return;
    if (!WB.store.getPassphrase()) { E.toast('还没进入工作台，无法恢复'); return; }
    E.setSync('wait', '恢复中…');
    try {
      const text = await file.text();
      let obj;
      try {
        obj = JSON.parse(text);
      } catch (_) {
        // 可能是从 GitHub 网页直接保存的 HTML 包装页
        const trimmed = text.trim().slice(0, 200).toLowerCase();
        if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.includes('<head') || trimmed.includes('github')) {
          E.toast('这是网页版，不是原始备份文件；请在 GitHub 文件页点 Raw 后再保存');
        } else {
          E.toast('这不是工作台备份文件');
        }
        const cloud = WB.store.hasCloud();
        E.setSync(cloud ? 'on' : 'off', cloud ? '已同步' : '纯本地模式');
        return;
      }

      let payload, rawMode = false;
      if (obj.enc) {
        // 格式 A：前端"导出"按钮生成的整包加密文件
        const json = await WB.crypto.decrypt(obj.enc, WB.store.getPassphrase());
        payload = JSON.parse(json);
      } else if (obj.tables) {
        // 格式 B：自动备份仓库生成的明文结构文件（tables 内字段已是密文）
        payload = { data: obj.tables };
        rawMode = true;
      } else {
        E.toast('这不是工作台备份文件');
        return;
      }

      let count = 0;
      for (const { t, enc } of TABLES) {
        const rows = (payload.data && payload.data[t]) || [];
        for (const row of rows) {
          if (rawMode) {
            await WB.store.upsertRaw(t, row);
          } else {
            await WB.store.upsert(t, enc, row);
          }
          count++;
        }
      }
      const ext = (file.name || '').split('.').pop().toLowerCase();
      const tip = ext === 'json' ? '' : '（建议以后保存为 .json 扩展名）';
      E.toast('已恢复 ' + count + ' 条' + tip + '，刷新中…');
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      E.toast('恢复失败：文件损坏或口令不对');
      const cloud = WB.store.hasCloud();
      E.setSync(cloud ? 'on' : 'off', cloud ? '已同步' : '纯本地模式');
    }
  }

  function hideSplash() {
    const s = document.getElementById('splash');
    if (!s) return;
    s.classList.add('hidden');
    setTimeout(() => { try { s.remove(); } catch (e) {} }, 650);
  }

  document.addEventListener('DOMContentLoaded', () => {
    // 启动图至少显示 0.4 秒，让过渡自然；最多 3 秒兜底
    setTimeout(() => { hideSplash(); showPassModal(); }, 400);
    setTimeout(hideSplash, 3000);
  });
})();

// 装上"刷新管家"(sw.js)：让每次刷新都先去网上拿最新版本，断网才用存的旧版
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
