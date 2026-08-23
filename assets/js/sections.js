// ============================================================
// 三块板块：工作 / 学习 / 日常生活
// 每块调用 WB.store 做增删改与同步；subscribe 让另一台设备实时刷新。
// ============================================================
window.WB = window.WB || {};
WB.sections = WB.sections || {};

// ---------- 工作：待办 + 日历 + 看板 + 排程 + 小结 ----------
WB.sections.work = function (root) {
  const E = WB.ui;
  root.innerHTML = `
    <div class="section-head"><h2>工作 · 待办清单</h2></div>
    <div class="add-row">
      <input id="w-title" placeholder="要做什么？支持“明天下午5点交报告”；添加后点任务右侧「加子步骤」拆分子任务" maxlength="200">
      <select id="w-priority">
        <option value="high">高</option>
        <option value="mid" selected>中</option>
        <option value="low">低</option>
      </select>
      <input id="w-due" type="date">
      <input id="w-duetime" type="time" title="截止时间">
      <input id="w-tags" placeholder="标签，逗号隔开" maxlength="80">
      <select id="w-kind">
        <option value="task">任务</option>
        <option value="event">纪念日</option>
      </select>
      <select id="w-parent" title="作为哪个任务的子步骤（可选）"><option value="">无（独立任务）</option></select>
      <button id="w-add" class="btn-primary">添加</button>
    </div>
    <div class="tool-row">
      <div class="filter-row" id="w-filterRow">
        <button class="chip active" data-f="all">全部</button>
        <button class="chip" data-f="active">进行中</button>
        <button class="chip" data-f="done">已完成</button>
        <button class="chip" data-f="hot">本周高优</button>
        <span id="w-tagChips" class="tag-chips"></span>
      </div>
      <div class="view-switch">
        <button class="chip active" data-v="list">列表</button>
        <button class="chip" data-v="kanban">看板</button>
        <button class="chip" data-v="schedule">排程</button>
        <button class="chip" data-v="summary">小结</button>
        <button class="chip" data-v="calendar">📅 日历</button>
      </div>
    </div>
    <div id="w-calendar" class="calendar" style="display:none"></div>
    <div id="w-dayLabel" class="day-label" style="display:none"></div>
    <div id="w-kanban" class="kanban" style="display:none"></div>
    <div id="w-schedule" class="schedule" style="display:none"></div>
    <div id="w-summary" class="summary-box" style="display:none"></div>
    <ul id="w-list" class="list"></ul>`;

  let filter = 'all';
  let view = 'list';
  let tagFilter = '';
  let cur = { y: new Date().getFullYear(), m: new Date().getMonth() };
  let selectedDate = todayLocal();
  let schedDate = selectedDate;
  let dueMapCache = {};
  let allRows = [];
  const expanded = {};
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayLocal() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function norm(r) {
    r = Object.assign({}, r);
    if (!r.kanban_status) r.kanban_status = (r.status === 'done') ? 'done' : 'todo';
    if (!r.kind) r.kind = 'task';
    if (r.focus_minutes == null) r.focus_minutes = 0;
    if (!r.parent_id) r.parent_id = '';
    return r;
  }
  function isDone(r) { return r.kanban_status === 'done' || r.status === 'done'; }
  function childrenOf(id) { return allRows.filter(r => r.parent_id === id); }
  function countdown(dateStr) {
    if (!dateStr) return '';
    const today = todayLocal();
    const days = Math.round((new Date(dateStr + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    if (days > 0) return '还剩 ' + days + ' 天';
    if (days < 0) return '已过 ' + Math.abs(days) + ' 天';
    return '就是今天';
  }

  // ---- 智能识别时间（免费规则版）----
  function parseSmart(text) {
    let t = text;
    const now = new Date();
    const shift = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };
    const fmt = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    let due = null, time = null;
    const rel = [['大后天', 3], ['后天', 2], ['明天', 1], ['今天', 0]];
    for (const [kw, n] of rel) { if (t.includes(kw)) { due = fmt(shift(n)); t = t.replace(kw, ''); break; } }
    let m = t.match(/(\d+)\s*天后/); if (m && !due) { due = fmt(shift(parseInt(m[1]))); t = t.replace(m[0], ''); }
    const wd = { '日': 0, '天': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
    let nextWeek = t.includes('下周');
    for (const k in wd) {
      const re = new RegExp('(下?周|星期|周)' + k);
      if (re.test(t)) {
        const target = wd[k];
        let diff = (target - now.getDay() + 7) % 7; if (diff === 0) diff = 7;
        if (nextWeek) diff += 7;
        due = fmt(shift(diff)); t = t.replace(re, ''); break;
      }
    }
    let md = t.match(/(\d{1,2})月(\d{1,2})[号日]/);
    if (md && !due) { let mo = parseInt(md[1]), da = parseInt(md[2]); let d = new Date(now.getFullYear(), mo - 1, da); if (d < now) d = new Date(now.getFullYear() + 1, mo - 1, da); due = fmt(d); t = t.replace(md[0], ''); }
    let dm = t.match(/(\d{1,2})[号日]/);
    if (dm && !due) { let da = parseInt(dm[1]); let d = new Date(now.getFullYear(), now.getMonth(), da); if (d < now) d = new Date(now.getFullYear(), now.getMonth() + 1, da); due = fmt(d); t = t.replace(dm[0], ''); }
    let hour = null, minute = 0;
    const ap = t.match(/(上午|早上|早晨|中午|下午|晚上|傍晚)/);
    const tm = t.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
    const tm2 = t.match(/(\d{1,2})\s*点半?/);
    if (tm) { hour = parseInt(tm[1]); minute = parseInt(tm[2]); t = t.replace(tm[0], ''); }
    else if (tm2) { hour = parseInt(tm2[1]); minute = /半/.test(tm2[0]) ? 30 : 0; t = t.replace(tm2[0], ''); }
    if (ap && hour != null) {
      const w = ap[1];
      if (w === '下午' || w === '晚上' || w === '傍晚') { if (hour < 12) hour += 12; }
      else if (w === '中午') { if (hour === 12) hour = 12; }
      else { if (hour === 12) hour = 0; }
      t = t.replace(ap[0], '');
    }
    if (hour != null) time = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
    t = t.replace(/[每交搞定之前完成做写弄一下啦吧呀呢]/g, ' ').replace(/\s+/g, ' ').trim();
    return { title: t || text, due: due, time: time };
  }

  // ---- 周范围 ----
  function weekStart() { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function weekEnd() { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day + 6); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function filteredRows() {
    let f = allRows.filter(r => !r.parent_id);
    if (filter === 'active') f = f.filter(r => !isDone(r) && r.kind === 'task');
    if (filter === 'done') f = f.filter(r => isDone(r) && r.kind === 'task');
    if (filter === 'hot') {
      const ws = weekStart();
      f = f.filter(r => r.kind === 'task' && !isDone(r) && r.priority === 'high' && r.due_date && r.due_date >= ws && r.due_date <= weekEnd());
    }
    if (tagFilter) f = f.filter(r => (r.tags || '').split(',').map(s => s.trim()).includes(tagFilter));
    return f;
  }

  function itemEl(r) {
    if (r.kind === 'event') {
      return E.el(`<li class="item event">
        <div class="item-main">
          <div class="item-title">${E.escapeHtml(r.title)}</div>
          <div class="item-sub">${countdown(r.due_date)}</div>
        </div>
        <span class="tag tag-mid">纪念日</span>
        <button class="del" data-id="${r.id}" title="删除">✕</button>
      </li>`);
    }
    const kids = childrenOf(r.id);
    const doneK = kids.filter(isDone).length;
    const pct = kids.length ? Math.round(doneK / kids.length * 100) : 0;
    const isExp = expanded[r.id];
    const kidHtml = isExp ? `
      <ul class="sub-list">
        ${kids.map(k => `<li class="sub-item">
          <label class="check"><input type="checkbox" data-sub="${k.id}" ${isDone(k) ? 'checked' : ''}><span></span></label>
          <span class="sub-title">${E.escapeHtml(k.title)}</span>
          <button class="del sub-del" data-sub-del="${k.id}" title="删除">✕</button>
        </li>`).join('')}
        <li class="sub-add"><input id="sub-${r.id}" placeholder="加个子步骤…" maxlength="120"><button class="btn-ghost sub-add-btn" data-sub-add="${r.id}">添加</button></li>
      </ul>` : '';
    return E.el(`<li class="item ${isDone(r) ? 'done' : ''}" data-id="${r.id}">
      <label class="check"><input type="checkbox" data-id="${r.id}" ${isDone(r) ? 'checked' : ''}><span></span></label>
      <div class="item-main">
        <div class="item-title">${E.escapeHtml(r.title)}</div>
        <div class="item-sub">
          ${r.due_date ? '截止 ' + E.fmtDate(r.due_date) + (r.due_time ? ' ' + r.due_time : '') : ''}
          ${r.tags ? ' · ' + E.escapeHtml(r.tags) : ''}
          ${r.focus_minutes ? ' · 专注' + r.focus_minutes + '分' : ''}
        </div>
        ${kids.length ? `<div class="prog"><div class="prog-bar" style="width:${pct}%"></div><span class="prog-txt">${doneK}/${kids.length} ${pct}%</span></div>` : ''}
      </div>
      <span class="tag tag-${r.priority}">${r.priority === 'high' ? '高' : r.priority === 'low' ? '低' : '中'}</span>
      <button class="mini-btn" data-toggle="${r.id}">${isExp ? '收起' : (kids.length ? '子任务(' + kids.length + ')' : '加子步骤')}</button>
      <button class="mini-btn" data-focus="${r.id}">专注</button>
      <button class="mini-btn" data-sched="${r.id}">排程</button>
      <button class="del" data-id="${r.id}" title="删除">✕</button>
      ${kidHtml}
    </li>`);
  }

  function renderList(rows) {
    const ul = E.$('#w-list', root);
    ul.innerHTML = '';
    try {
      if (rows.length === 0) { ul.appendChild(E.el('<li class="empty">还没有待办，加一条吧；已有任务可点右侧「加子步骤」拆分子任务</li>')); return; }
      rows.forEach(r => ul.appendChild(itemEl(r)));
    } catch (err) {
      ul.appendChild(E.el('<li class="empty">列表渲染出错了，刷新试试</li>'));
      console.error('renderList error', err);
    }
  }

  function renderTagChips() {
    const box = E.$('#w-tagChips', root);
    const tags = [...new Set(allRows.flatMap(r => (r.tags || '').split(',').map(s => s.trim()).filter(Boolean)))];
    box.innerHTML = tags.map(t => `<button class="chip ${tagFilter === t ? 'active' : ''}" data-tag="${E.escapeHtml(t)}">${E.escapeHtml(t)}</button>`).join('');
  }

  // ---- 看板 ----
  function renderKanban(rows) {
    const cols = [['todo', '待办'], ['doing', '进行中'], ['done', '完成']];
    const el = E.$('#w-kanban', root);
    el.innerHTML = cols.map(([k, label]) => {
      const items = rows.filter(r => r.kind === 'task' && !r.parent_id && r.kanban_status === k);
      return `<div class="kanban-col" data-col="${k}">
        <div class="kanban-col-head">${label}<span>${items.length}</span></div>
        <div class="kanban-cards">
          ${items.map(r => `<div class="kanban-card" draggable="true" data-id="${r.id}">
            <div class="kc-title">${E.escapeHtml(r.title)}</div>
            ${r.due_date ? `<div class="kc-sub">${E.fmtDate(r.due_date)}${r.due_time ? ' ' + r.due_time : ''}</div>` : ''}
            <select class="kc-move" data-id="${r.id}">
              <option value="todo" ${k === 'todo' ? 'selected' : ''}>待办</option>
              <option value="doing" ${k === 'doing' ? 'selected' : ''}>进行中</option>
              <option value="done" ${k === 'done' ? 'selected' : ''}>完成</option>
            </select>
          </div>`).join('')}
        </div>
      </div>`;
    }).join('');
  }

  // ---- 排程 ----
  function overlap(a, b) {
    if (!a.scheduled_start || !b.scheduled_start) return false;
    const ae = a.scheduled_end || '23:59', be = b.scheduled_end || '23:59';
    return a.scheduled_start < be && b.scheduled_start < ae;
  }
  function endOf(t) {
    if (t.scheduled_end) return t.scheduled_end;
    // 没填结束时间：按开始+1小时算，但不超过 23:59
    if (!t.scheduled_start) return '23:59';
    const [h, m] = t.scheduled_start.split(':').map(Number);
    const d = new Date(); d.setHours(h, m + 60);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function renderSchedule(rows) {
    const el = E.$('#w-schedule', root);
    const dayTasks = rows.filter(r => r.kind === 'task' && !r.parent_id && r.scheduled_date === schedDate && r.scheduled_start);
    const conflicts = new Set();
    for (let i = 0; i < dayTasks.length; i++) for (let j = i + 1; j < dayTasks.length; j++) {
      if (overlap(dayTasks[i], dayTasks[j])) { conflicts.add(dayTasks[i].id); conflicts.add(dayTasks[j].id); }
    }
    let html = `<div class="sched-tool">
      <input id="w-schedDate" type="date" value="${schedDate}">
      <span class="sched-hint ${conflicts.size ? 'warn' : ''}">${conflicts.size ? '⚠ 有时间段重叠' : (dayTasks.length ? '这天没冲突' : '这天还没排任务')}</span>
    </div>`;
    if (dayTasks.length === 0) {
      html += `<div class="empty" style="margin:18px 0">从下方选一条待办，填上开始/结束时间，再点“排到这天”。<br>只有“截止时间”的任务不会自动出现在这里。</div>`;
    }
    html += `<div class="sched-rows">`;
    for (let h = 6; h <= 23; h++) {
      const hh = String(h).padStart(2, '0') + ':00';
      const blk = dayTasks.filter(t => t.scheduled_start <= hh && endOf(t) > hh.slice(0, 5));
      html += `<div class="sched-row ${blk.length ? 'has' : ''}">
        <div class="sched-time">${hh}</div>
        <div class="sched-slot">${blk.map(t => `<div class="sched-block ${conflicts.has(t.id) ? 'conflict' : ''}">${E.escapeHtml(t.title)}<br><small>${t.scheduled_start} - ${endOf(t)}</small></div>`).join('')}</div>
      </div>`;
    }
    html += `</div><div class="sched-assign">
      <select id="w-schedTask">${rows.filter(r => r.kind === 'task' && !r.parent_id && r.kanban_status !== 'done').map(r => `<option value="${r.id}">${E.escapeHtml(r.title)}</option>`).join('')}</select>
      <input id="w-schedStart" type="time" placeholder="开始"><input id="w-schedEnd" type="time" placeholder="结束">
      <button id="w-schedAdd" class="btn-primary">排到这天</button>
    </div>`;
    el.innerHTML = html;
  }

  // ---- 小结 ----
  function renderSummary(rows) {
    const el = E.$('#w-summary', root);
    const today = todayLocal();
    const ws = weekStart();
    const tasks = rows.filter(r => r.kind === 'task');
    const doneToday = tasks.filter(r => isDone(r) && (r.updated_at || '').slice(0, 10) === today);
    const dueToday = tasks.filter(r => !isDone(r) && r.due_date === today);
    const weekDone = tasks.filter(r => isDone(r) && (r.updated_at || '').slice(0, 10) >= ws);
    const weekNew = tasks.filter(r => (r.created_at || '').slice(0, 10) >= ws);
    const focusTotal = tasks.reduce((s, r) => s + (parseInt(r.focus_minutes) || 0), 0);
    el.innerHTML = `
      <div class="sum-grid">
        <div class="sum-card"><div class="sum-num">${doneToday.length}</div><div class="sum-lbl">今天完成</div></div>
        <div class="sum-card"><div class="sum-num">${dueToday.length}</div><div class="sum-lbl">今天到期未完成</div></div>
        <div class="sum-card"><div class="sum-num">${weekDone.length}</div><div class="sum-lbl">本周完成</div></div>
        <div class="sum-card"><div class="sum-num">${weekNew.length}</div><div class="sum-lbl">本周新建</div></div>
        <div class="sum-card"><div class="sum-num">${focusTotal}</div><div class="sum-lbl">累计专注(分)</div></div>
      </div>`;
  }

  // ---- 日历（保留并标纪念日）----
  function renderCalendar(dueMap) {
    const cal = E.$('#w-calendar', root);
    cal.innerHTML = '';
    const { y, m } = cur;
    const head = E.el(`<div class="cal-head">
      <button id="calPrev" class="cal-nav">‹</button>
      <span class="cal-title">${y}年${m + 1}月</span>
      <button id="calNext" class="cal-nav">›</button>
    </div>`);
    const grid = E.el(`<div class="cal-grid"></div>`);
    ['日', '一', '二', '三', '四', '五', '六'].forEach(d => grid.appendChild(E.el(`<div class="cal-dow">${d}</div>`)));
    const firstDow = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const todayStr = todayLocal();
    for (let i = 0; i < firstDow; i++) grid.appendChild(E.el(`<div class="cal-cell empty"></div>`));
    for (let d = 1; d <= days; d++) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cnt = (dueMap[ds] || []).length;
      const evs = allRows.filter(r => r.kind === 'event' && r.due_date === ds).length;
      const cell = E.el(`<div class="cal-cell ${cnt || evs ? 'has' : ''} ${ds === todayStr ? 'today' : ''} ${ds === selectedDate ? 'sel' : ''}" data-date="${ds}">
        <span class="cal-num">${d}</span>
        ${cnt ? `<span class="cal-dot"></span>` : ''}
        ${evs ? `<span class="cal-evt">${evs}个纪念日</span>` : ''}
      </div>`);
      grid.appendChild(cell);
    }
    cal.appendChild(head); cal.appendChild(grid);
  }
  function renderDayList() {
    const label = E.$('#w-dayLabel', root);
    label.style.display = 'block';
    label.textContent = `${selectedDate} 的待办（${ (dueMapCache[selectedDate] || []).length } 条）`;
    renderList(dueMapCache[selectedDate] || []);
  }

  let renderLock = false, renderQueued = false;
  async function render() {
    if (renderLock) { renderQueued = true; return; }
    renderLock = true;
    try {
      if (!root.isConnected) return;
      allRows = (await WB.store.list('todos', ['title', 'note'])).map(norm);
      dueMapCache = {};
      allRows.forEach(t => { if (t.due_date) { (dueMapCache[t.due_date] = dueMapCache[t.due_date] || []).push(t); } });
      const parentSel = E.$('#w-parent', root);
      if (parentSel) {
        const cur = parentSel.value;
        parentSel.innerHTML = '<option value="">无（独立任务）</option>' + allRows.filter(r => r.kind === 'task' && !r.parent_id).map(r => `<option value="${r.id}">${E.escapeHtml(r.title)}</option>`).join('');
        parentSel.value = cur;
      }
      renderTagChips();
      if (view === 'calendar') { renderCalendar(dueMapCache); renderDayList(); }
      else if (view === 'kanban') { renderKanban(allRows); }
      else if (view === 'schedule') { renderSchedule(allRows); }
      else if (view === 'summary') { renderSummary(allRows); }
      else { renderList(filteredRows()); }
    } catch (err) {
      console.error('work render error', err);
      const ul = E.$('#w-list', root);
      if (ul) { ul.innerHTML = ''; ul.appendChild(E.el('<li class="empty">加载失败，刷新试试：' + E.escapeHtml(err.message || '未知错误') + '</li>')); }
    } finally {
      renderLock = false;
      if (renderQueued) { renderQueued = false; setTimeout(render, 0); }
    }
  }

  function setView(v) {
    view = v;
    E.$$('.view-switch .chip', root).forEach(c => c.classList.toggle('active', c.dataset.v === v));
    E.$('#w-list', root).style.display = (v === 'list' || v === 'calendar') ? 'block' : 'none';
    E.$('#w-calendar', root).style.display = (v === 'calendar') ? 'block' : 'none';
    E.$('#w-dayLabel', root).style.display = (v === 'calendar') ? 'block' : 'none';
    E.$('#w-kanban', root).style.display = (v === 'kanban') ? 'block' : 'none';
    E.$('#w-schedule', root).style.display = (v === 'schedule') ? 'block' : 'none';
    E.$('#w-summary', root).style.display = (v === 'summary') ? 'block' : 'none';
    E.$('#w-filterRow', root).style.display = (v === 'list') ? 'flex' : 'none';
    render();
  }

  // ---- 添加 ----
  E.$('#w-add', root).addEventListener('click', async () => {
    const btn = E.$('#w-add', root);
    let title = E.$('#w-title', root).value.trim();
    if (!title) { E.toast('先写点什么'); return; }
    const smart = parseSmart(title);
    const due = E.$('#w-due', root).value || smart.due || null;
    const time = E.$('#w-duetime', root).value || smart.time || null;
    const finalTitle = (smart.due || smart.time) ? smart.title : title;
    const parentId = E.$('#w-parent', root).value || '';
    btn.disabled = true;
    try {
      await WB.store.upsert('todos', ['title', 'note'], {
        title: finalTitle,
        priority: E.$('#w-priority', root).value,
        due_date: due,
        due_time: time,
        tags: E.$('#w-tags', root).value.trim(),
        kind: E.$('#w-kind', root).value,
        kanban_status: 'todo',
        status: 'active',
        parent_id: parentId
      });
      E.$('#w-title', root).value = '';
      E.$('#w-due', root).value = ''; E.$('#w-duetime', root).value = ''; E.$('#w-tags', root).value = '';
    } finally { btn.disabled = false; render(); }
  });

  // 顶部筛选 / 标签 / 视图
  E.$('#w-filterRow', root).addEventListener('click', (e) => {
    if (e.target.matches('.chip[data-f]')) {
      filter = e.target.dataset.f;
      E.$$('#w-filterRow .chip[data-f]', root).forEach(c => c.classList.toggle('active', c === e.target));
      if (view === 'list') renderList(filteredRows());
    }
    if (e.target.matches('.chip[data-tag]')) {
      tagFilter = (tagFilter === e.target.dataset.tag) ? '' : e.target.dataset.tag;
      renderTagChips();
      if (view === 'list') renderList(filteredRows());
    }
  });
  E.$('.view-switch', root).addEventListener('click', (e) => {
    if (e.target.matches('.chip[data-v]')) setView(e.target.dataset.v);
  });

  // 通用点击
  root.addEventListener('click', async (e) => {
    if (e.target.matches('.del[data-id]')) { await WB.store.remove('todos', e.target.dataset.id); render(); return; }
    if (e.target.matches('.del[data-sub-del]')) { await WB.store.remove('todos', e.target.dataset.subDel); render(); return; }
    if (e.target.matches('[data-toggle]')) { expanded[e.target.dataset.toggle] = !expanded[e.target.dataset.toggle]; render(); return; }
    if (e.target.matches('[data-focus]')) {
      const r = allRows.find(x => x.id === e.target.dataset.focus);
      if (r && WB.pomodoro) WB.pomodoro.start(r.id, r.title);
      return;
    }
    if (e.target.matches('[data-sched]')) {
      const r = allRows.find(x => x.id === e.target.dataset.sched);
      schedDate = (r && r.due_date) ? r.due_date : todayLocal();
      setView('schedule');
      return;
    }
    if (e.target.matches('.sub-add-btn')) {
      const pid = e.target.dataset.subAdd;
      const inp = E.$('#sub-' + pid, root);
      const btn = e.target;
      const v = inp.value.trim(); if (!v) return;
      inp.value = ''; inp.disabled = true; btn.disabled = true;
      try {
        await WB.store.upsert('todos', ['title', 'note'], { title: v, priority: 'mid', kind: 'task', kanban_status: 'todo', status: 'active', parent_id: pid });
      } finally { render(); }
      return;
    }
    if (e.target.matches('#calPrev')) { cur.m--; if (cur.m < 0) { cur.m = 11; cur.y--; } renderCalendar(dueMapCache); }
    if (e.target.matches('#calNext')) { cur.m++; if (cur.m > 11) { cur.m = 0; cur.y++; } renderCalendar(dueMapCache); }
    const cell = e.target.closest('.cal-cell');
    if (cell && cell.dataset.date) {
      selectedDate = cell.dataset.date;
      E.$$('.cal-cell', root).forEach(c => c.classList.toggle('sel', c.dataset.date === selectedDate));
      renderDayList();
    }
    if (e.target.matches('#w-schedAdd')) {
      const id = E.$('#w-schedTask', root).value;
      const s = E.$('#w-schedStart', root).value, en = E.$('#w-schedEnd', root).value;
      if (!s) { E.toast('先选开始时间'); return; }
      if (en && en <= s) { E.toast('结束时间要比开始时间晚'); return; }
      const r = allRows.find(x => x.id === id); if (!r) return;
      await WB.store.upsert('todos', ['title', 'note'], Object.assign({}, r, { scheduled_date: schedDate, scheduled_start: s, scheduled_end: en }));
      render();
    }
  });

  // 看板移动 / 拖拽
  E.$('#w-kanban', root).addEventListener('change', async (e) => {
    if (e.target.matches('.kc-move')) {
      const id = e.target.dataset.id;
      const r = allRows.find(x => x.id === id); if (!r) return;
      await WB.store.upsert('todos', ['title', 'note'], Object.assign({}, r, { kanban_status: e.target.value, status: e.target.value === 'done' ? 'done' : 'active' }));
      render();
    }
  });
  E.$('#w-kanban', root).addEventListener('dragstart', (e) => {
    const card = e.target.closest('.kanban-card'); if (!card) return;
    e.dataTransfer.setData('text/plain', card.dataset.id);
  });
  E.$('#w-kanban', root).addEventListener('dragover', (e) => { e.preventDefault(); });
  E.$('#w-kanban', root).addEventListener('drop', async (e) => {
    e.preventDefault();
    const col = e.target.closest('.kanban-col'); if (!col) return;
    const id = e.dataTransfer.getData('text/plain'); if (!id) return;
    const r = allRows.find(x => x.id === id); if (!r) return;
    await WB.store.upsert('todos', ['title', 'note'], Object.assign({}, r, { kanban_status: col.dataset.col, status: col.dataset.col === 'done' ? 'done' : 'active' }));
    render();
  });

  // 排程日期切换
  E.$('#w-schedule', root).addEventListener('change', (e) => {
    if (e.target.matches('#w-schedDate')) { schedDate = e.target.value; renderSchedule(allRows); }
  });

  // 勾选完成 / 子步骤
  root.addEventListener('change', async (e) => {
    if (e.target.matches('input[type=checkbox][data-id]')) {
      const id = e.target.dataset.id;
      const r = allRows.find(x => x.id === id); if (!r) return;
      const done = e.target.checked;
      await WB.store.upsert('todos', ['title', 'note'], Object.assign({}, r, { kanban_status: done ? 'done' : 'todo', status: done ? 'done' : 'active' }));
      render();
    }
    if (e.target.matches('input[type=checkbox][data-sub]')) {
      const id = e.target.dataset.sub;
      const r = allRows.find(x => x.id === id); if (!r) return;
      const done = e.target.checked;
      await WB.store.upsert('todos', ['title', 'note'], Object.assign({}, r, { kanban_status: done ? 'done' : 'todo', status: done ? 'done' : 'active' }));
      render();
    }
  });
  // 子步骤回车添加
  root.addEventListener('keydown', (e) => {
    if (e.target.matches('.sub-add input') && e.key === 'Enter') {
      const inp = e.target;
      const pid = inp.id.replace('sub-', '');
      const v = inp.value.trim(); if (!v) return;
      inp.value = ''; inp.disabled = true;
      WB.store.upsert('todos', ['title', 'note'], { title: v, priority: 'mid', kind: 'task', kanban_status: 'todo', status: 'active', parent_id: pid }).then(render, render);
    }
  });

  const unsub = WB.store.subscribe('todos', ['title', 'note'], render);
  root.__unsub = unsub;
  render();
};

// ---------- 学习：笔记 + 书单 ----------
WB.sections.study = function (root) {
  const E = WB.ui;
  root.innerHTML = `
    <div class="section-head"><h2>学习</h2></div>
    <div class="sub-block">
      <h3>笔记</h3>
      <div class="add-row">
        <input id="n-title" placeholder="笔记标题" maxlength="120">
        <button id="n-add" class="btn-primary">新建</button>
      </div>
      <ul id="n-list" class="list"></ul>
    </div>
    <div class="sub-block">
      <h3>书单 / 课程</h3>
      <div class="add-row">
        <input id="b-title" placeholder="书名 / 课程名" maxlength="160">
        <select id="b-status">
          <option value="want">想看</option>
          <option value="reading">在看</option>
          <option value="done">看完</option>
        </select>
        <button id="b-add" class="btn-primary">添加</button>
      </div>
      <ul id="b-list" class="list"></ul>
    </div>`;

  async function renderNotes() {
    let rows = await WB.store.list('notes', ['title', 'content']);
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const ul = E.$('#n-list', root);
    ul.innerHTML = '';
    if (rows.length === 0) { ul.appendChild(E.el('<li class="empty">还没有笔记</li>')); return; }
    rows.forEach(r => {
      const li = E.el(`
        <li class="item">
          <div class="item-main">
            <div class="item-title">${E.escapeHtml(r.title)}</div>
            ${r.content ? `<div class="item-sub">${E.escapeHtml(r.content.slice(0, 60))}${r.content.length > 60 ? '…' : ''}</div>` : ''}
          </div>
          <button class="del" data-id="${r.id}" title="删除">✕</button>
        </li>`);
      ul.appendChild(li);
    });
  }
  async function renderBooks() {
    let rows = await WB.store.list('books', ['title', 'author']);
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const ul = E.$('#b-list', root);
    ul.innerHTML = '';
    if (rows.length === 0) { ul.appendChild(E.el('<li class="empty">书单是空的</li>')); return; }
    const label = { want: '想看', reading: '在看', done: '看完' };
    rows.forEach(r => {
      const li = E.el(`
        <li class="item">
          <div class="item-main">
            <div class="item-title">${E.escapeHtml(r.title)}</div>
            ${r.author ? `<div class="item-sub">${E.escapeHtml(r.author)}</div>` : ''}
          </div>
          <span class="tag tag-mid">${label[r.status] || '想看'}</span>
          <button class="del" data-id="${r.id}" title="删除">✕</button>
        </li>`);
      ul.appendChild(li);
    });
  }

  E.$('#n-add', root).addEventListener('click', async () => {
    const title = E.$('#n-title', root).value.trim();
    if (!title) { E.toast('先写标题'); return; }
    await WB.store.upsert('notes', ['title', 'content'], { title: title, content: '' });
    E.$('#n-title', root).value = '';
    renderNotes();
  });
  E.$('#b-add', root).addEventListener('click', async () => {
    const title = E.$('#b-title', root).value.trim();
    if (!title) { E.toast('先写书名'); return; }
    await WB.store.upsert('books', ['title', 'author'], { title: title, author: '', status: E.$('#b-status', root).value });
    E.$('#b-title', root).value = '';
    renderBooks();
  });

  root.addEventListener('click', async (e) => {
    if (e.target.matches('#n-list .del')) { await WB.store.remove('notes', e.target.dataset.id); renderNotes(); }
    if (e.target.matches('#b-list .del')) { await WB.store.remove('books', e.target.dataset.id); renderBooks(); }
  });

  const unsubNotes = WB.store.subscribe('notes', ['title', 'content'], renderNotes);
  const unsubBooks = WB.store.subscribe('books', ['title', 'author'], renderBooks);
  root.__unsub = function () { try { unsubNotes(); unsubBooks(); } catch (e) {} };
  renderNotes();
  renderBooks();
};

// ---------- 日常生活：习惯打卡 ----------
WB.sections.life = function (root) {
  const E = WB.ui;
  root.innerHTML = `
    <div class="section-head"><h2>日常生活</h2></div>
    <div class="sub-block">
      <h3>习惯打卡</h3>
      <div class="add-row">
        <input id="h-name" placeholder="习惯名称，如 每天喝水" maxlength="80">
        <button id="h-add" class="btn-primary">添加</button>
      </div>
      <ul id="h-list" class="list"></ul>
    </div>`;

  async function renderHabits() {
    let rows = await WB.store.list('habits', ['name']);
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const ul = E.$('#h-list', root);
    ul.innerHTML = '';
    if (rows.length === 0) { ul.appendChild(E.el('<li class="empty">还没有习惯</li>')); return; }
    const today = new Date().toISOString().slice(0, 10);
    rows.forEach(r => {
      const doneToday = r.last_checkin === today;
      const li = E.el(`
        <li class="item ${doneToday ? 'done' : ''}">
          <button class="checkin ${doneToday ? 'on' : ''}" data-id="${r.id}">${doneToday ? '已打卡' : '打卡'}</button>
          <div class="item-main">
            <div class="item-title">${E.escapeHtml(r.name)}</div>
            <div class="item-sub">连续 ${r.streak || 0} 天</div>
          </div>
          <button class="del" data-id="${r.id}" title="删除">✕</button>
        </li>`);
      ul.appendChild(li);
    });
  }

  E.$('#h-add', root).addEventListener('click', async () => {
    const name = E.$('#h-name', root).value.trim();
    if (!name) { E.toast('先写习惯名'); return; }
    await WB.store.upsert('habits', ['name'], { name: name, last_checkin: '', streak: 0 });
    E.$('#h-name', root).value = '';
    renderHabits();
  });

  root.addEventListener('click', async (e) => {
    if (e.target.matches('.checkin')) {
      const id = e.target.dataset.id;
      const rows = await WB.store.list('habits', ['name']);
      const r = rows.find(x => x.id === id);
      if (!r) return;
      const today = new Date().toISOString().slice(0, 10);
      const doneToday = r.last_checkin === today;
      await WB.store.upsert('habits', ['name'], Object.assign({}, r, {
        last_checkin: doneToday ? '' : today,
        streak: doneToday ? Math.max((r.streak || 1) - 1, 0) : (r.last_checkin === new Date(Date.now() - 86400000).toISOString().slice(0, 10) ? (r.streak || 0) + 1 : 1)
      }));
      renderHabits();
    }
    if (e.target.matches('#h-list .del')) { await WB.store.remove('habits', e.target.dataset.id); renderHabits(); }
  });

  const unsubHabits = WB.store.subscribe('habits', ['name'], renderHabits);
  root.__unsub = unsubHabits;
  renderHabits();
};
