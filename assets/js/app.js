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

    // 顶栏：左标题 + 中间居中搜索 + 右日期/铃铛/账户（对齐参考页布局）
    const tb = E.$('#topbar');
    const d = new Date();
    const wk = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
    const dateStr = `${wk} ${String(d.getMonth() + 1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    tb.innerHTML = `
      <div class="brand tb-brand">糊涂蛋<span>工作台</span></div>
      <div class="top-search">
        <i class="search-ico">🔍</i>
        <input id="search" placeholder="搜索任务、笔记、便签">
      </div>
      <div class="top-actions">
        <span class="tb-date">${dateStr}</span>
        <button id="bellBtn" class="icon-btn" title="提醒">🔔</button>
        <button id="themeBtn" class="icon-btn" title="切换明暗主题">🌙</button>
        <button id="exportBtn" class="icon-btn" title="导出加密备份">📤</button>
        <button id="importBtn" class="icon-btn" title="恢复备份">📥</button>
        <input id="importFile" type="file" accept="application/json,.json,.txt" style="display:none">
        <button id="lockBtn" class="icon-btn" title="锁屏">🔒</button>
        <span class="tb-account"><span class="tb-avatar">👤</span>账户 ▾</span>
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
      const light = document.body.classList.toggle('light');
      localStorage.setItem('wb_theme', light ? 'light' : 'dark');
      E.toast(light ? '已切到浅色' : '已切到深色');
    });
    // 默认浅色；若用户之前记过"深色"偏好，则保持深色。右上角月亮可随时切换并记住。
    if (localStorage.getItem('wb_theme') !== 'dark') document.body.classList.add('light');
  }

  function switchTo(key) {
    const content = E.$('#content');
    current = key;
    E.$$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.key === key));
    // 懒加载：每个导航只 build 一次，之后切换只显隐，避免整页重建造成的数据刷新竞争
    let host = content.querySelector('.section-host[data-key="' + key + '"]');
    if (!host) {
      host = document.createElement('div');
      host.className = 'section-host';
      host.dataset.key = key;
      content.appendChild(host);
      if (key === 'dashboard') WB.dashboard(host);
      else if (key === 'work') WB.sections.work(host);
      else if (key === 'study') WB.sections.study(host);
      else if (key === 'life') WB.sections.life(host);
    }
    content.querySelectorAll('.section-host').forEach(h => {
      h.style.display = (h.dataset.key === key) ? '' : 'none';
    });
  }

  // 校验通过后真正进入（init 已在外部完成）
  async function enterApp(pass, cloud) {
    E.setSync('wait', '连接中…');
    // 云端写入失败时的提醒：明确告诉用户没存上云端，已留本机待补传
    WB.store.setSyncIssueHandler(() => {
      E.toast('云端没存上，已留在本机，联网后自动补传');
    });
    buildShell();
    if (cloud) {
      // 先只取本机缓存，让页面秒开；云端在后台拉，拉完再局部刷新
      WB.store.setFastOpen(true);
      E.setSync('wait', '读取本地…');
    }
    switchTo('dashboard');           // 用本地缓存立刻画出页面
    startReminderLoop();
    E.$('#passModal').style.display = 'none';
    if (cloud) {
      setupGlobalSync(); // 全局实时订阅：任一设备改动都推给本机并刷新当前页
      // 定时补传：开着应用时若网络恢复，自动把漏传的数据补上去
      setInterval(() => { if (WB.store.hasCloud()) WB.store.flushPending().catch(() => {}); }, 20000);
      // 关掉"只取本地"，让后续读取走云端；后台拉最新并刷新当前页（不阻塞进入）
      WB.store.setFastOpen(false);
      E.setSync('wait', '云端同步中…');
      Promise.resolve().then(async () => {
        try {
          await WB.store.pullAll();      // 后台把云端最新全拉下来，写进本地缓存
          await WB.store.flushPending(); // 补传之前没传上的
          refreshCurrent();              // 把云端最新刷到当前页
          E.setSync('on', '已同步');
        } catch (e) {
          E.setSync('on', '已同步（部分失败）');
        }
        WB.store.heartbeat().catch(() => {}); // 7天暂停加保险，异步不阻塞
      });
    } else {
      E.setSync('off', '纯本地模式');
    }
  }

  // 实时订阅：覆盖所有表，任一设备改动就刷新当前页
  function setupGlobalSync() {
    WB.store.ALL_TABLES.forEach(t => {
      WB.store.subscribe(t, WB.store.ENC_FIELDS[t], refreshCurrent);
    });
  }
  function refreshCurrent() {
    // 只刷新当前页数据（各 section 已在 build 时订阅自身数据表，这里做兜底刷新），
    // 不再重建整个页面，避免"保存后不显示/进入不显示最新"的渲染竞争
    const content = E.$('#content');
    const host = content.querySelector('.section-host[data-key="' + current + '"]');
    if (host && host._render) host._render();
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
      <div class="stat-row4">
        <div class="stat-card"><div class="stat-ico">📋</div><div><div class="stat-num" id="stat-todo">0</div><div class="stat-lbl">今日待办</div></div></div>
        <div class="stat-card"><div class="stat-ico">⚡</div><div><div class="stat-num" id="stat-doing">0</div><div class="stat-lbl">进行中</div></div></div>
        <div class="stat-card"><div class="stat-ico">✅</div><div><div class="stat-num" id="stat-done">0</div><div class="stat-lbl">已完成</div></div></div>
        <div class="stat-card"><div class="stat-ico">⏱️</div><div><div class="stat-num" id="stat-focus">0</div><div class="stat-lbl">专注(分)</div></div></div>
      </div>

      <div class="dash-cols">
        <div class="dash-main">
          <div class="dash-card">
            <div class="dash-card-head"><h3>今日任务</h3><span class="muted-sm">临近/逾期置顶</span></div>
            <div id="dash-today" class="dash-body"></div>
          </div>
        </div>
        <div class="dash-side">
          <div class="dash-card">
            <div class="dash-card-head"><h3>时间规划</h3></div>
            <div id="dash-plan" class="dash-body"></div>
          </div>
          <div class="dash-card">
            <div class="dash-card-head"><h3>近期到期提醒</h3></div>
            <div id="dash-due" class="dash-body"></div>
          </div>
        </div>
      </div>

      <div class="section-head" style="margin-top:22px"><h2>目标管理</h2></div>
      <div class="dash-card" id="dash-goals"><div class="dash-body"></div></div>
      <div class="add-row" id="goal-form">
        <input id="g-title" placeholder="目标名称" maxlength="120">
        <input id="g-kr" placeholder="关键结果（如：跑步100公里/减重5公斤）" maxlength="120">
        <input id="g-deadline" type="date">
        <button id="g-add" class="btn-primary">添加目标</button>
      </div>

      <div class="section-head" style="margin-top:20px"><h2>时间日志</h2></div>
      <div class="dash-card" id="dash-logs"><div class="dash-body"></div></div>
      <div class="add-row" id="log-form">
        <input id="lg-title" placeholder="做了什么" maxlength="120">
        <input id="lg-min" type="number" placeholder="多少分钟" min="1" style="width:100px">
        <select id="lg-cat"><option value="工作">工作</option><option value="学习">学习</option><option value="生活">生活</option><option value="休息">休息</option></select>
        <button id="lg-add" class="btn-primary">记一笔</button>
      </div>

      <div class="section-head" style="margin-top:20px"><h2>日历融合</h2></div>
      <div id="dash-fusion-cal"></div>

      <div class="section-head" style="margin-top:20px"><h2>时间轴 / 甘特图</h2></div>
      <div id="dash-gantt"></div>

      <div class="section-head" style="margin-top:20px"><h2>每周复盘</h2></div>
      <div id="dash-weekly" class="weekly-box"></div>

      <div class="section-head" style="margin-top:20px"><h2>导出报表</h2></div>
      <div class="tool-row">
        <button id="dash-export-week" class="btn-ghost">📊 导出本周报表</button>
        <button id="dash-export-all" class="btn-ghost">📤 导出全部加密备份</button>
      </div>`;
    function pad(n) { return String(n).padStart(2, '0'); }
    function todayLocal() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function weekStart() { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    let curCal = { y: new Date().getFullYear(), m: new Date().getMonth() };

    async function render() {
      try {
        const today = todayLocal();
        const ws = weekStart();
        const todos = await WB.store.list('todos', ['title', 'note']);
        const habits = await WB.store.list('habits', ['name']);
        const notes = await WB.store.list('notes', ['title', 'content']);
        const goals = await WB.store.list('goals', ['title', 'key_results']);
        const logs = await WB.store.list('time_logs', ['note']);

        // 今日总览
        const todayTodosAll = todos.filter(r => r.kind === 'task' && !r.parent_id);
        const focusTotal = todayTodosAll.reduce((s, r) => s + (parseInt(r.focus_minutes) || 0), 0);
        const stTodo = E.$('#stat-todo', root), stDoing = E.$('#stat-doing', root), stDone = E.$('#stat-done', root), stFocus = E.$('#stat-focus', root);
        if (stTodo) stTodo.textContent = todayTodosAll.filter(r => !isDoneR(r) && r.due_date === today).length;
        if (stDoing) stDoing.textContent = todayTodosAll.filter(r => !isDoneR(r) && r.kanban_status === 'doing').length;
        if (stDone) stDone.textContent = todayTodosAll.filter(r => isDoneR(r)).length;
        if (stFocus) stFocus.textContent = focusTotal;

        // 今日任务（临近/逾期置顶，逾期标红）
        const b1 = E.$('#dash-today', root);
        const todayTasks = todayTodosAll.filter(r => !isDoneR(r));
        const sorted = todayTasks.slice().sort((a, b) => {
          const da = a.due_date || '9999', db = b.due_date || '9999';
          return da < db ? -1 : da > db ? 1 : 0;
        });
        if (b1) {
          if (!sorted.length) b1.innerHTML = '<div class="dash-row muted">今天没有待办，享受一下 🎉</div>';
          else b1.innerHTML = sorted.map(r => {
            const overdue = r.due_date && r.due_date < today;
            const soon = r.due_date === today;
            const cls = overdue ? 'dash-task overdue' : soon ? 'dash-task soon' : 'dash-task';
            return `<div class="${cls}"><span class="dt-check" data-dtid="${r.id}">${isDoneR(r) ? '✓' : ''}</span><span class="dt-title">${E.escapeHtml(r.title)}</span>${r.due_time ? `<span class="dt-time">${r.due_time}</span>` : ''}${overdue ? '<span class="dt-flag">逾期</span>' : soon ? '<span class="dt-flag soon">今天</span>' : ''}</div>`;
          }).join('');
        }

        // 时间规划（今日有排程的任务）
        const b2 = E.$('#dash-plan', root);
        const planTasks = todayTodosAll.filter(r => r.scheduled_date === today && r.scheduled_start && !isDoneR(r)).sort((a, b) => (a.scheduled_start || '').localeCompare(b.scheduled_start || ''));
        if (b2) {
          if (!planTasks.length) b2.innerHTML = '<div class="dash-row muted">今天还没排时间块</div>';
          else b2.innerHTML = planTasks.map(r => `<div class="dash-row">🕒 ${r.scheduled_start}${r.scheduled_end ? '-' + r.scheduled_end : ''} · ${E.escapeHtml(r.title)}</div>`).join('');
        }

        // 近期到期提醒（未来7天内 + 已逾期）
        const b3 = E.$('#dash-due', root);
        const dueTasks = todayTodosAll.filter(r => !isDoneR(r) && r.due_date).map(r => {
          let diff = 0; try { diff = Math.round((new Date(r.due_date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000); } catch (e) {}
          return Object.assign({}, r, { _diff: diff });
        }).filter(r => r._diff <= 7);
        dueTasks.sort((a, b) => a._diff - b._diff);
        if (b3) {
          if (!dueTasks.length) b3.innerHTML = '<div class="dash-row muted">未来一周没有到期事项</div>';
          else b3.innerHTML = dueTasks.map(r => {
            const txt = r._diff < 0 ? `逾期${-r._diff}天` : r._diff === 0 ? '今天' : `${r._diff}天后`;
            const cls = r._diff < 0 ? 'due-row overdue' : r._diff === 0 ? 'due-row soon' : 'due-row';
            return `<div class="${cls}"><span class="due-ico">📌</span><span class="due-title">${E.escapeHtml(r.title)}</span><span class="due-when">${txt}</span></div>`;
          }).join('');
        }

        // 目标管理
        const gEl = E.$('#dash-goals .dash-body', root);
        if (gEl) {
          if (!goals.length) { gEl.innerHTML = '<div class="empty">还没有目标，上方添加一个</div>'; }
          else {
            gEl.innerHTML = goals.filter(g => g.status !== 'done').map(g => {
              let krs = []; try { krs = JSON.parse(g.key_results || '[]'); } catch (e) {}
              const done = krs.filter(k => (k.current || 0) >= (k.target || 1)).length;
              const pct = krs.length ? Math.round(done / krs.length * 100) : 0;
              const krsHtml = krs.map((k, i) => `<div class="dash-row" style="font-size:12px;color:var(--muted)">• ${E.escapeHtml(k.text || '')} ${k.current || 0}/${k.target || 1} <button class="mini-btn" data-gk="${g.id}" data-gki="${i}">+1</button></div>`).join('');
              return `<div class="goal-row" data-gid="${g.id}"><div class="goal-title">${E.escapeHtml(g.title)} ${g.deadline ? '（截止 ' + g.deadline + '）' : ''}</div>${krsHtml}<div class="prog"><div class="prog-bar" style="width:${pct}%"></div><span class="prog-txt">${pct}%</span></div><button class="mini-btn" data-gdone="${g.id}">标记完成</button> <button class="del" data-gdel="${g.id}">✕</button></div>`;
            }).join('');
          }
        }

        // 时间日志
        const lEl = E.$('#dash-logs .dash-body', root);
        if (lEl) {
          const todayLogs = logs.filter(r => r.log_date === today);
          const totalMin = todayLogs.reduce((s, r) => s + (parseInt(r.minutes) || 0), 0);
          if (!todayLogs.length) { lEl.innerHTML = '<div class="empty">今天还没记时间</div>'; }
          else {
            lEl.innerHTML = `<div class="dash-row">今日累计 ${totalMin} 分钟</div>` + todayLogs.map(r => `<div class="dash-row">• [${E.escapeHtml(r.category || '其他')}] ${E.escapeHtml(r.note || '')} ${r.minutes || 0}分 <button class="del" data-ldel="${r.id}">✕</button></div>`).join('');
          }
        }

        // 日历融合
        renderFusionCal(todos, habits, notes);

        // 甘特图
        renderGantt(todos);

        // 每周复盘
        const weekDone = todos.filter(r => r.kind === 'task' && isDoneR(r) && (r.updated_at || '').slice(0, 10) >= ws).length;
        const weekNew = todos.filter(r => (r.created_at || '').slice(0, 10) >= ws).length;
        const wEl = E.$('#dash-weekly', root);
        if (wEl) wEl.innerHTML = `<div class="sum-grid"><div class="sum-card"><div class="sum-num">${weekDone}</div><div class="sum-lbl">本周完成</div></div><div class="sum-card"><div class="sum-num">${weekNew}</div><div class="sum-lbl">本周新建</div></div><div class="sum-card"><div class="sum-num">${todayCheckins.length}</div><div class="sum-lbl">今日打卡</div></div><div class="sum-card"><div class="sum-num">${focusTotal}</div><div class="sum-lbl">累计专注(分)</div></div></div>`;
      } catch (e) {
        console.error('dashboard error', e);
        const body = E.$('#dash-todos .dash-body', root);
        if (body) body.innerHTML = '<div class="dash-row warn">总览加载失败，刷新试试：' + E.escapeHtml(e.message || '未知错误') + '</div>';
      }
    }

    function renderFusionCal(todos, habits, notes) {
      const el = E.$('#dash-fusion-cal', root); if (!el) return;
      const { y, m } = curCal;
      const days = new Date(y, m + 1, 0).getDate();
      const firstDow = new Date(y, m, 1).getDay();
      const todayStr = todayLocal();
      let html = `<div class="cal-head"><button class="cal-nav" id="fc-prev">‹</button><span class="cal-title">${y}年${m + 1}月</span><button class="cal-nav" id="fc-next">›</button></div><div class="cal-grid">`;
      ['日', '一', '二', '三', '四', '五', '六'].forEach(d => html += `<div class="cal-dow">${d}</div>`);
      for (let i = 0; i < firstDow; i++) html += '<div class="cal-cell empty"></div>';
      for (let d = 1; d <= days; d++) {
        const ds = `${y}-${pad(m + 1)}-${pad(d)}`;
        const hasTodo = todos.some(r => r.due_date === ds);
        const hasHabit = habits.some(r => (r.checkins && JSON.parse(r.checkins || '{}')[ds])?.done);
        const hasNote = notes.some(r => r.daily_date === ds || (r.created_at || '').slice(0, 10) === ds);
        html += `<div class="cal-cell ${ds === todayStr ? 'today' : ''} ${hasTodo || hasHabit || hasNote ? 'has' : ''}"><span class="cal-num">${d}</span>${hasTodo ? '<span class="cal-dot" style="background:var(--amber)"></span>' : ''}${hasHabit ? '<span class="cal-dot" style="background:var(--mint);margin-left:8px"></span>' : ''}${hasNote ? '<span class="cal-dot" style="background:var(--blue);margin-left:16px"></span>' : ''}</div>`;
      }
      html += '</div>';
      el.innerHTML = html;
    }

    function renderGantt(todos) {
      const el = E.$('#dash-gantt', root); if (!el) return;
      const rows = todos.filter(r => r.scheduled_date && r.scheduled_start && r.kind === 'task' && !r.parent_id);
      rows.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.scheduled_start.localeCompare(b.scheduled_start));
      if (!rows.length) { el.innerHTML = '<div class="empty">还没有排程任务，去「工作」板块的「排程」视图添加</div>'; return; }
      let html = '<div class="gantt-rows">';
      rows.slice(0, 30).forEach(r => {
        const start = r.scheduled_date + ' ' + r.scheduled_start;
        const end = r.scheduled_date + ' ' + (r.scheduled_end || r.scheduled_start);
        html += `<div class="gantt-row"><div class="gantt-title">${E.escapeHtml(r.title)}</div><div class="gantt-bar">${start} → ${end}</div></div>`;
      });
      html += '</div>';
      el.innerHTML = html;
    }

    // 目标添加
    E.$('#g-add', root).addEventListener('click', async () => {
      const title = E.$('#g-title', root).value.trim();
      const kr = E.$('#g-kr', root).value.trim();
      const deadline = E.$('#g-deadline', root).value;
      if (!title) { E.toast('先写目标名称'); return; }
      const krs = kr ? [{ text: kr, target: 1, current: 0 }] : [];
      await WB.store.upsert('goals', ['title', 'key_results'], { title, key_results: JSON.stringify(krs), deadline, status: 'active' });
      E.$('#g-title', root).value = ''; E.$('#g-kr', root).value = ''; E.$('#g-deadline', root).value = '';
      render();
    });

    // 时间日志添加
    E.$('#lg-add', root).addEventListener('click', async () => {
      const note = E.$('#lg-title', root).value.trim();
      const min = parseInt(E.$('#lg-min', root).value) || 0;
      const cat = E.$('#lg-cat', root).value;
      if (!note || min <= 0) { E.toast('写清楚做了什么、多少分钟'); return; }
      await WB.store.upsert('time_logs', ['note'], { note, minutes: min, category: cat, log_date: todayLocal() });
      E.$('#lg-title', root).value = ''; E.$('#lg-min', root).value = '';
      render();
    });

    // 通用点击：目标进度+1 / 完成 / 删除 / 时间日志删除 / 日历切换
    root.addEventListener('click', async (e) => {
      if (e.target.matches('.dt-check')) {
        const id = e.target.dataset.dtid;
        const rows = await WB.store.list('todos', ['title', 'note']);
        const r = rows.find(x => x.id === id); if (!r) return;
        await WB.store.upsert('todos', ['title', 'note'], Object.assign({}, r, { kanban_status: 'done', status: 'done' }));
        render();
      }
      if (e.target.matches('#fc-prev')) { curCal.m--; if (curCal.m < 0) { curCal.m = 11; curCal.y--; } const data = await gatherData(); renderFusionCal(data.todos, data.habits, data.notes); return; }
      if (e.target.matches('#fc-next')) { curCal.m++; if (curCal.m > 11) { curCal.m = 0; curCal.y++; } const data = await gatherData(); renderFusionCal(data.todos, data.habits, data.notes); return; }
      if (e.target.matches('[data-gk]')) {
        const id = e.target.dataset.gk; const idx = parseInt(e.target.dataset.gki);
        const rows = await WB.store.list('goals', ['title', 'key_results']);
        const r = rows.find(x => x.id === id); if (!r) return;
        let krs = []; try { krs = JSON.parse(r.key_results || '[]'); } catch (e) {}
        if (krs[idx]) { krs[idx].current = (krs[idx].current || 0) + 1; }
        await WB.store.upsert('goals', ['title', 'key_results'], Object.assign({}, r, { key_results: JSON.stringify(krs) }));
        render();
      }
      if (e.target.matches('[data-gdone]')) {
        const id = e.target.dataset.gdone;
        const rows = await WB.store.list('goals', ['title', 'key_results']);
        const r = rows.find(x => x.id === id); if (!r) return;
        await WB.store.upsert('goals', ['title', 'key_results'], Object.assign({}, r, { status: 'done' }));
        render();
      }
      if (e.target.matches('[data-gdel]')) {
        await WB.store.remove('goals', e.target.dataset.gdel); render();
      }
      if (e.target.matches('[data-ldel]')) {
        await WB.store.remove('time_logs', e.target.dataset.ldel); render();
      }
      if (e.target.matches('#dash-export-all')) {
        exportData();
      }
      if (e.target.matches('#dash-export-week')) {
        exportWeekReport();
      }
    });

    async function gatherData() {
      return {
        todos: await WB.store.list('todos', ['title', 'note']),
        habits: await WB.store.list('habits', ['name']),
        notes: await WB.store.list('notes', ['title', 'content'])
      };
    }

    async function exportWeekReport() {
      try {
        const ws = weekStart();
        const todos = await WB.store.list('todos', ['title', 'note']);
        const habits = await WB.store.list('habits', ['name']);
        const notes = await WB.store.list('notes', ['title', 'content']);
        const logs = await WB.store.list('time_logs', ['note']);
        let txt = `糊涂蛋工作台 · 本周报表（${ws} 起）\n\n`;
        txt += `【本周完成待办】\n` + todos.filter(r => r.kind === 'task' && isDoneR(r) && (r.updated_at || '').slice(0, 10) >= ws).map(r => `✓ ${r.title}`).join('\n') + '\n\n';
        txt += `【本周新建待办】\n` + todos.filter(r => (r.created_at || '').slice(0, 10) >= ws).map(r => `• ${r.title}`).join('\n') + '\n\n';
        txt += `【习惯打卡】\n` + habits.map(r => `• ${r.name}：连续 ${r.streak || 0} 天`).join('\n') + '\n\n';
        txt += `【本周时间日志】\n` + logs.filter(r => (r.log_date || '') >= ws).map(r => `• ${r.category || '其他'} ${r.note || ''} ${r.minutes || 0}分`).join('\n') + '\n\n';
        txt += `【本周笔记】\n` + notes.filter(r => (r.created_at || '').slice(0, 10) >= ws).map(r => `• ${r.title}`).join('\n') + '\n';
        const blob = new Blob([txt], { type: 'text/plain' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '本周报表_' + todayLocal() + '.txt'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        E.toast('本周报表已导出');
      } catch (e) { E.toast('导出失败：' + (e.message || e)); }
    }

    // 总览页自订阅本机改动：任一表变化（含本机新增待办）立刻刷新总览，不等云端推送回来
    ['todos', 'habits', 'notes', 'goals', 'time_logs'].forEach(t => {
      WB.store.subscribe(t, WB.store.ENC_FIELDS[t], render);
    });

    render();
    root._render = render;
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
    // 提前建好云端客户端（不带口令、不碰数据），让用户盯着登录页发呆那几秒就默默连上，
    // 点"进入"时直接复用，省掉"建客户端+首次握手"的延迟。密钥没填则自动走纯本地。
    WB.store.preConnect(WB.config);
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
