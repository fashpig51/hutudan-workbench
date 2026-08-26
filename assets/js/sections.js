// ============================================================
// 三块板块：工作 / 学习 / 日常生活
// 每块调用 WB.store 做增删改与同步；subscribe 让另一台设备实时刷新。
// ============================================================
window.WB = window.WB || {};
WB.sections = WB.sections || {};

// ============================================================
// 全局标签管理（工作/学习共用）：从表里收集标签，支持新建/改名/删除
// 标签以逗号分隔存在每行 tags 字段；删除=从所有行移除该标签，改名=批量替换。
// ============================================================
WB.tagMgr = WB.tagMgr || {};
WB.tagMgr.collect = async function (table, cols) {
  const rows = await WB.store.list(table, cols);
  const set = new Set();
  rows.forEach(r => (r.tags || '').split(',').map(s => s.trim()).filter(Boolean).forEach(t => set.add(t)));
  return [...set].sort();
};
WB.tagMgr.renameInRows = async function (table, cols, oldT, newT) {
  const rows = await WB.store.list(table, cols);
  for (const r of rows) {
    const parts = (r.tags || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.includes(oldT) && !parts.includes(newT)) continue;
    const next = parts.map(t => t === oldT ? newT : t).filter((t, i, a) => t && a.indexOf(t) === i);
    await WB.store.upsert(table, cols, Object.assign({}, r, { tags: next.join(',') }));
  }
};
WB.tagMgr.removeFromRows = async function (table, cols, tag) {
  const rows = await WB.store.list(table, cols);
  for (const r of rows) {
    const parts = (r.tags || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.includes(tag)) continue;
    await WB.store.upsert(table, cols, Object.assign({}, r, { tags: parts.filter(t => t !== tag).join(',') }));
  }
};
// 打开标签管理弹窗；onChange 在改动后回调（用于刷新列表/候选）
WB.tagMgr.open = function (table, cols, onChange) {
  const E = WB.ui;
  const mask = E.el(`<div class="modal-mask"><div class="modal-box tag-mgr">
    <h2>管理标签</h2>
    <p>新建标签 · 改名 · 删除（删除会从所有记录里移除该标签）</p>
    <div class="tag-mgr-add">
      <input id="tmNew" placeholder="输入新标签名，回车添加">
      <button id="tmAdd" class="btn-primary">添加</button>
    </div>
    <div id="tmList" class="tag-mgr-list"></div>
    <button id="tmClose" class="tm-close">关闭</button>
  </div></div>`);
  document.body.appendChild(mask);
  async function refresh() {
    const tags = await WB.tagMgr.collect(table, cols);
    const list = mask.querySelector('#tmList');
    list.innerHTML = tags.length ? tags.map(t => `<div class="tm-row">
      <input class="tm-name" data-old="${E.escapeHtml(t)}" value="${E.escapeHtml(t)}">
      <button class="tm-save" data-old="${E.escapeHtml(t)}">改名</button>
      <button class="tm-del" data-old="${E.escapeHtml(t)}">删除</button>
    </div>`).join('') : '<div class="empty">还没有标签</div>';
  }
  mask.querySelector('#tmAdd').addEventListener('click', async () => {
    const inp = mask.querySelector('#tmNew'); const v = inp.value.trim();
    if (!v) return;
    const tags = await WB.tagMgr.collect(table, cols);
    if (tags.includes(v)) { E.toast('标签已存在'); return; }
    // 添加：挂到一张占位逻辑——这里仅登记到现有行不方便，改为允许在新建任务时选用；同时写入一张空标记行不可行，故以“候选”形式存在。
    // 简化：把新标签写进最近一条记录（若无记录则提示先建一条）。
    const rows = await WB.store.list(table, cols);
    if (!rows.length) { E.toast('先建一条记录，再管理标签'); return; }
    const r = rows[0];
    const parts = (r.tags || '').split(',').map(s => s.trim()).filter(Boolean);
    parts.push(v);
    await WB.store.upsert(table, cols, Object.assign({}, r, { tags: parts.join(',') }));
    inp.value = ''; await refresh(); if (onChange) onChange();
  });
  mask.querySelector('#tmList').addEventListener('click', async (e) => {
    const old = e.target.dataset.old; if (!old) return;
    if (e.target.matches('.tm-save')) {
      const inp = mask.querySelector(`.tm-name[data-old="${CSS.escape(old)}"]`);
      const nv = inp.value.trim();
      if (!nv || nv === old) return;
      const tags = await WB.tagMgr.collect(table, cols);
      if (tags.includes(nv)) { E.toast('标签名已存在'); return; }
      await WB.tagMgr.renameInRows(table, cols, old, nv);
      await refresh(); if (onChange) onChange();
    } else if (e.target.matches('.tm-del')) {
      if (!confirm(`确定删除标签「${old}」？会从所有记录里移除它。`)) return;
      await WB.tagMgr.removeFromRows(table, cols, old);
      await refresh(); if (onChange) onChange();
    }
  });
  mask.querySelector('#tmClose').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  refresh();
};

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
      <input id="w-tags" placeholder="标签，逗号隔开" maxlength="80" list="w-tagList">
      <datalist id="w-tagList"></datalist>
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
        <button id="w-tagMgr" class="chip" title="新建/改名/删除标签">⚙ 管理标签</button>
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
  let calView = 'month'; // 日历子视图：month / week / day
  let cur = { y: new Date().getFullYear(), m: new Date().getMonth() };
  let curWeekStart = weekStartLocal(selectedDate);
  let selectedDate = todayLocal();
  let schedDate = selectedDate;
  let dueMapCache = {};
  let allRows = [];
  const expanded = {};
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayLocal() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function weekStartLocal(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay(); // 0=周日
    const diff = (dow === 0) ? -6 : 1 - dow; // 以周一为一周起点
    d.setDate(d.getDate() + diff);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

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
      <div class="item-actions">
        <span class="tag tag-mid">纪念日</span>
        <button class="del" data-id="${r.id}" title="删除">✕</button>
      </div>
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
      <div class="item-actions">
        <span class="tag tag-${r.priority}">${r.priority === 'high' ? '高' : r.priority === 'low' ? '低' : '中'}</span>
        <button class="mini-btn" data-toggle="${r.id}">${isExp ? '收起' : (kids.length ? '子任务(' + kids.length + ')' : '加子步骤')}</button>
        <button class="mini-btn" data-focus="${r.id}">专注</button>
        <button class="mini-btn" data-sched="${r.id}">排程</button>
        <button class="del" data-id="${r.id}" title="删除">✕</button>
      </div>
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
    const dl = E.$('#w-tagList', root);
    if (dl) dl.innerHTML = tags.map(t => `<option value="${E.escapeHtml(t)}">`).join('');
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
    const head = E.el(`<div class="cal-head">
      <div class="cal-navgrp">
        <button id="calPrev" class="cal-nav">‹</button>
        <span class="cal-title" id="calTitle"></span>
        <button id="calNext" class="cal-nav">›</button>
      </div>
      <div class="cal-sub">
        <button class="chip calv ${calView === 'month' ? 'active' : ''}" data-calv="month">月</button>
        <button class="chip calv ${calView === 'week' ? 'active' : ''}" data-calv="week">周</button>
        <button class="chip calv ${calView === 'day' ? 'active' : ''}" data-calv="day">日</button>
      </div>
    </div>`);
    cal.appendChild(head);
    if (calView === 'month') renderMonth(cal, dueMap);
    else if (calView === 'week') renderWeek(cal, dueMap);
    else renderDay(cal, dueMap);
  }

  function renderMonth(cal, dueMap) {
    const { y, m } = cur;
    E.$('#calTitle', cal).textContent = `${y}年${m + 1}月`;
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
    cal.appendChild(grid);
  }

  function renderWeek(cal, dueMap) {
    const start = new Date(curWeekStart + 'T00:00:00');
    const end = new Date(start); end.setDate(start.getDate() + 6);
    E.$('#calTitle', cal).textContent = `${curWeekStart.slice(5)} ~ ${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    const grid = E.el(`<div class="week-grid"></div>`);
    const todayStr = todayLocal();
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const ds = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      const dow = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      const items = (dueMap[ds] || []);
      const evs = allRows.filter(r => r.kind === 'event' && r.due_date === ds);
      const cell = E.el(`<div class="week-col ${ds === todayStr ? 'today' : ''} ${ds === selectedDate ? 'sel' : ''}" data-date="${ds}">
        <div class="week-dow">周${dow}</div>
        <div class="week-date">${pad(d.getMonth() + 1)}/${pad(d.getDate())}</div>
        <div class="week-items">
          ${items.map(t => `<div class="week-it ${t.kanban_status === 'done' || t.status === 'done' ? 'done' : ''}"><span class="week-dot p-${t.priority || 'mid'}"></span>${E.escapeHtml(t.title)}</div>`).join('')}
          ${evs.map(t => `<div class="week-it evt">🎂 ${E.escapeHtml(t.title)}</div>`).join('')}
        </div>
      </div>`);
      grid.appendChild(cell);
    }
    cal.appendChild(grid);
  }

  function renderDay(cal, dueMap) {
    const ds = selectedDate;
    const d = new Date(ds + 'T00:00:00');
    const dow = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    E.$('#calTitle', cal).textContent = `${ds} 周${dow}`;
    const items = (dueMap[ds] || []);
    const evs = allRows.filter(r => r.kind === 'event' && r.due_date === ds);
    const box = E.el(`<div class="day-view">
      <div class="day-items">
        ${items.length || evs.length ? '' : '<div class="empty">这一天没有安排</div>'}
        ${items.map(t => `<div class="day-it ${t.kanban_status === 'done' || t.status === 'done' ? 'done' : ''}">
          <span class="week-dot p-${t.priority || 'mid'}"></span>
          <div class="day-it-body"><div class="day-it-title">${E.escapeHtml(t.title)}</div>${t.due_time ? `<div class="day-it-time">⏰ ${t.due_time}</div>` : ''}</div>
        </div>`).join('')}
        ${evs.map(t => `<div class="day-it evt">🎂 <div class="day-it-body"><div class="day-it-title">${E.escapeHtml(t.title)}</div><div class="day-it-time">纪念日</div></div></div>`).join('')}
      </div>
    </div>`);
    cal.appendChild(box);
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
      if (!root.isConnected) { setTimeout(render, 50); return; }
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
    if (e.target.matches('#w-tagMgr')) {
      WB.tagMgr.open('todos', ['title', 'note'], () => { render(); });
      return;
    }
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
    if (e.target.matches('#calPrev')) {
      if (calView === 'month') { cur.m--; if (cur.m < 0) { cur.m = 11; cur.y--; } }
      else if (calView === 'week') { const s = new Date(curWeekStart + 'T00:00:00'); s.setDate(s.getDate() - 7); curWeekStart = s.getFullYear() + '-' + pad(s.getMonth() + 1) + '-' + pad(s.getDate()); }
      else { const s = new Date(selectedDate + 'T00:00:00'); s.setDate(s.getDate() - 1); selectedDate = s.getFullYear() + '-' + pad(s.getMonth() + 1) + '-' + pad(s.getDate()); }
      renderCalendar(dueMapCache); if (calView !== 'month') renderDayList();
    }
    if (e.target.matches('#calNext')) {
      if (calView === 'month') { cur.m++; if (cur.m > 11) { cur.m = 0; cur.y++; } }
      else if (calView === 'week') { const s = new Date(curWeekStart + 'T00:00:00'); s.setDate(s.getDate() + 7); curWeekStart = s.getFullYear() + '-' + pad(s.getMonth() + 1) + '-' + pad(s.getDate()); }
      else { const s = new Date(selectedDate + 'T00:00:00'); s.setDate(s.getDate() + 1); selectedDate = s.getFullYear() + '-' + pad(s.getMonth() + 1) + '-' + pad(s.getDate()); }
      renderCalendar(dueMapCache); if (calView !== 'month') renderDayList();
    }
    const calvBtn = e.target.closest('.calv');
    if (calvBtn) {
      calView = calvBtn.dataset.calv;
      if (calView === 'week') curWeekStart = weekStartLocal(selectedDate);
      renderCalendar(dueMapCache);
      if (calView !== 'month') renderDayList();
      return;
    }
    const cell = e.target.closest('.cal-cell, .week-col');
    if (cell && cell.dataset.date) {
      selectedDate = cell.dataset.date;
      E.$$('.cal-cell, .week-col', root).forEach(c => c.classList.toggle('sel', c.dataset.date === selectedDate));
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

// ---------- 学习：笔记 + 书单 + 关系图谱 + 白板 ----------
WB.sections.study = function (root) {
  const E = WB.ui;
  let view = 'notes';
  let noteFilter = '', bookFilter = '', catFilter = '';
  let allNotes = [], allBooks = [];

  function todayLocal() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  root.innerHTML = `
    <div class="section-head"><h2>学习</h2></div>
    <div class="view-switch" style="margin-bottom:14px">
      <button class="chip active" data-sv="notes">笔记</button>
      <button class="chip" data-sv="books">书单</button>
      <button class="chip" data-sv="graph">关系图谱</button>
      <button class="chip" data-sv="board">白板画布</button>
    </div>
    <div id="s-notes" class="s-panel"></div>
    <div id="s-books" class="s-panel" style="display:none"></div>
    <div id="s-graph" class="s-panel" style="display:none"></div>
    <div id="s-board" class="s-panel" style="display:none"></div>`;

  // ---------- 笔记面板 ----------
  function renderNotesPanel() {
    const el = E.$('#s-notes', root);
    el.innerHTML = `
      <div class="tool-row" style="flex-wrap:wrap;gap:8px">
        <input id="n-search" placeholder="搜索笔记" value="${E.escapeHtml(noteFilter)}">
        <select id="n-cat"><option value="">全部分类</option><option value="灵感">灵感</option><option value="学习">学习</option><option value="工作">工作</option><option value="生活">生活</option></select>
        <select id="n-template"><option value="">无模板</option><option value="daily">每日笔记</option><option value="meeting">会议记录</option><option value="reading">读书笔记</option></select>
        <button id="n-daily" class="btn-ghost">今日每日笔记</button>
        ${isAndroid() ? '<button id="n-voice" class="btn-ghost">🎤 语音速记</button>' : ''}
      </div>
      <div class="add-row">
        <input id="n-title" placeholder="笔记标题" maxlength="120">
        <input id="n-tags" placeholder="标签，逗号隔开" maxlength="80" list="n-tagList">
        <datalist id="n-tagList"></datalist>
        <button id="n-tagMgr" class="btn-ghost" title="新建/改名/删除标签">⚙ 管理标签</button>
        <button id="n-add" class="btn-primary">新建</button>
      </div>
      <ul id="n-list" class="list"></ul>`;
    E.$('#n-tagMgr', el).addEventListener('click', () => { WB.tagMgr.open('notes', ['title', 'content'], () => { renderNotesList(); }); });
    E.$('#n-search', el).addEventListener('input', (e) => { noteFilter = e.target.value.trim().toLowerCase(); renderNotesList(); });
    E.$('#n-cat', el).addEventListener('change', () => { catFilter = E.$('#n-cat', el).value; renderNotesList(); });
    E.$('#n-add', el).addEventListener('click', async () => {
      const title = E.$('#n-title', el).value.trim(); if (!title) { E.toast('先写标题'); return; }
      const tpl = E.$('#n-template', el).value;
      let content = '', category = '', daily = '';
      if (tpl === 'daily') { content = '## 今日三件事\n\n## 灵感\n\n## 复盘'; category = '生活'; daily = todayLocal(); }
      else if (tpl === 'meeting') { content = '## 议题\n\n## 结论\n\n## 待办'; category = '工作'; }
      else if (tpl === 'reading') { content = '## 书名\n\n## 金句\n\n## 感想'; category = '学习'; }
      try {
        await WB.store.upsert('notes', ['title', 'content'], { title, content, tags: E.$('#n-tags', el).value.trim(), category, daily_date: daily, is_daily: !!daily });
        E.$('#n-title', el).value = ''; E.$('#n-tags', el).value = '';
        renderNotesList();
      } catch (err) {
        E.toast('保存失败，请重试');
      }
    });
    E.$('#n-daily', el).addEventListener('click', async () => {
      const d = todayLocal();
      const rows = await WB.store.list('notes', ['title', 'content']);
      const exists = rows.find(r => r.is_daily && r.daily_date === d);
      if (exists) { openNoteEditor(exists); }
      else { await WB.store.upsert('notes', ['title', 'content'], { title: d + ' 每日笔记', content: '## 今日三件事\n\n## 灵感\n\n## 复盘', is_daily: true, daily_date: d, category: '生活' }); renderNotesList(); }
    });
    const voiceBtn = E.$('#n-voice', el);
    if (voiceBtn) voiceBtn.addEventListener('click', () => startVoiceNote(el));
    renderNotesList();
  }
  async function renderNotesList() {
    const ul = E.$('#n-list', root); if (!ul) return;
    allNotes = await WB.store.list('notes', ['title', 'content']);
    allNotes.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    let rows = allNotes.filter(r => !r.is_deleted);
    if (noteFilter) rows = rows.filter(r => (r.title + ' ' + (r.content || '')).toLowerCase().includes(noteFilter));
    if (catFilter) rows = rows.filter(r => r.category === catFilter);
    const dl = E.$('#n-tagList', root);
    if (dl) dl.innerHTML = [...new Set(allNotes.flatMap(r => (r.tags || '').split(',').map(s => s.trim()).filter(Boolean)))].map(t => `<option value="${E.escapeHtml(t)}">`).join('');
    ul.innerHTML = '';
    if (!rows.length) { ul.appendChild(E.el('<li class="empty">还没有笔记</li>')); return; }
    rows.forEach(r => {
      const tags = (r.tags || '').split(',').filter(Boolean).map(t => `<span class="mini-tag">${E.escapeHtml(t)}</span>`).join('');
      const li = E.el(`
        <li class="item" data-id="${r.id}">
          <div class="item-main">
            <div class="item-title">${E.escapeHtml(r.title)} ${r.is_daily ? '<span class="mini-tag">每日</span>' : ''} ${tags}</div>
            ${r.content ? `<div class="item-sub">${E.escapeHtml(r.content.slice(0, 80))}${r.content.length > 80 ? '…' : ''}</div>` : ''}
          </div>
          <div class="item-actions">
            <button class="mini-btn" data-edit="${r.id}">编辑</button>
            <button class="del" data-id="${r.id}" title="删除">✕</button>
          </div>
        </li>`);
      ul.appendChild(li);
    });
  }
  function openNoteEditor(r) {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `
      <div class="modal-box wide">
        <h3>编辑笔记</h3>
        <input id="ne-title" value="${E.escapeHtml(r.title)}" placeholder="标题">
        <input id="ne-tags" value="${E.escapeHtml(r.tags || '')}" placeholder="标签，逗号隔开">
        <input id="ne-links" value="${E.escapeHtml(r.links || '')}" placeholder="双向链接：关联笔记 id，逗号隔开">
        <textarea id="ne-content" placeholder="内容（支持换行分块）">${E.escapeHtml(r.content || '')}</textarea>
        <div class="modal-row">
          <label><input type="file" id="ne-file" style="display:none"><span class="btn-ghost">📎 附件</span></label>
          <span id="ne-attachName" class="muted">${r.attachments ? '已有 ' + JSON.parse(r.attachments).length + ' 个附件' : '无附件'}</span>
        </div>
        <textarea id="ne-summary" placeholder="渐进式总结 / 重点折叠">${E.escapeHtml(r.summary || '')}</textarea>
        <div class="modal-actions">
          <button id="ne-save" class="btn-primary">保存</button>
          <button id="ne-cancel" class="btn-ghost">取消</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    let attachments = r.attachments ? JSON.parse(r.attachments) : [];
    E.$('#ne-file', m).addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const data = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
      attachments.push({ name: file.name, data });
      E.$('#ne-attachName', m).textContent = '已有 ' + attachments.length + ' 个附件';
    });
    E.$('#ne-cancel', m).addEventListener('click', () => m.remove());
    E.$('#ne-save', m).addEventListener('click', async () => {
      await WB.store.upsert('notes', ['title', 'content'], Object.assign({}, r, {
        title: E.$('#ne-title', m).value,
        content: E.$('#ne-content', m).value,
        tags: E.$('#ne-tags', m).value,
        links: E.$('#ne-links', m).value,
        attachments: JSON.stringify(attachments),
        summary: E.$('#ne-summary', m).value,
        blocks: JSON.stringify((E.$('#ne-content', m).value || '').split('\n\n').filter(Boolean).map((b, i) => ({ id: i, text: b })))
      }));
      m.remove(); renderNotesList();
    });
  }
  function isAndroid() { return /android/i.test(navigator.userAgent); }
  function startVoiceNote(el) {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { E.toast('当前浏览器不支持语音'); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR(); rec.lang = 'zh-CN'; rec.continuous = false;
    rec.onresult = async (e) => {
      const txt = e.results[0][0].transcript;
      await WB.store.upsert('notes', ['title', 'content'], { title: '语音速记 ' + todayLocal(), content: txt, voice_url: txt, tags: '语音' });
      E.toast('语音已保存'); renderNotesList();
    };
    rec.start(); E.toast('请说话…');
  }

  // ---------- 书单面板 ----------
  function renderBooksPanel() {
    const el = E.$('#s-books', root);
    el.innerHTML = `
      <div class="tool-row"><input id="b-search" placeholder="搜索书单" value="${E.escapeHtml(bookFilter)}"></div>
      <div class="add-row">
        <input id="b-title" placeholder="书名 / 课程名" maxlength="160">
        <input id="b-author" placeholder="作者 / 讲师" maxlength="120">
        <select id="b-status"><option value="want">想看</option><option value="reading">在看</option><option value="done">看完</option></select>
        <input id="b-progress" type="number" min="0" max="100" placeholder="进度%">
        <input id="b-rating" type="number" min="1" max="5" placeholder="评分1-5">
        <button id="b-add" class="btn-primary">添加</button>
      </div>
      <ul id="b-list" class="list"></ul>`;
    E.$('#b-search', el).addEventListener('input', (e) => { bookFilter = e.target.value.trim().toLowerCase(); renderBooksList(); });
    E.$('#b-add', el).addEventListener('click', async () => {
      const title = E.$('#b-title', el).value.trim(); if (!title) { E.toast('先写书名'); return; }
      await WB.store.upsert('books', ['title', 'author', 'review'], {
        title, author: E.$('#b-author', el).value,
        status: E.$('#b-status', el).value,
        progress: parseInt(E.$('#b-progress', el).value) || 0,
        rating: parseInt(E.$('#b-rating', el).value) || 0,
        review: ''
      });
      E.$('#b-title', el).value = ''; E.$('#b-author', el).value = ''; E.$('#b-progress', el).value = ''; E.$('#b-rating', el).value = '';
      renderBooksList();
    });
    renderBooksList();
  }
  async function renderBooksList() {
    const ul = E.$('#b-list', root); if (!ul) return;
    allBooks = await WB.store.list('books', ['title', 'author', 'review']);
    allBooks.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    let rows = allBooks.filter(r => !r.is_deleted);
    if (bookFilter) rows = rows.filter(r => (r.title + ' ' + (r.author || '')).toLowerCase().includes(bookFilter));
    ul.innerHTML = '';
    if (!rows.length) { ul.appendChild(E.el('<li class="empty">书单是空的</li>')); return; }
    const label = { want: '想看', reading: '在看', done: '看完' };
    rows.forEach(r => {
      const stars = r.rating ? '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) : '';
      const li = E.el(`
        <li class="item" data-id="${r.id}">
          <div class="item-main">
            <div class="item-title">${E.escapeHtml(r.title)} ${stars ? '<span class="stars">' + stars + '</span>' : ''}</div>
            <div class="item-sub">${E.escapeHtml(r.author || '')} · ${label[r.status] || '想看'} · 进度 ${r.progress || 0}%</div>
            ${r.progress ? `<div class="prog"><div class="prog-bar" style="width:${r.progress}%"></div></div>` : ''}
          </div>
          <div class="item-actions">
            <button class="mini-btn" data-bedit="${r.id}">编辑</button>
            <button class="del" data-id="${r.id}">✕</button>
          </div>
        </li>`);
      ul.appendChild(li);
    });
  }
  function openBookEditor(r) {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `
      <div class="modal-box">
        <h3>编辑书单</h3>
        <input id="be-title" value="${E.escapeHtml(r.title)}">
        <input id="be-author" value="${E.escapeHtml(r.author || '')}">
        <select id="be-status"><option value="want">想看</option><option value="reading">在看</option><option value="done">看完</option></select>
        <input id="be-progress" type="number" min="0" max="100" value="${r.progress || 0}">
        <input id="be-rating" type="number" min="1" max="5" value="${r.rating || ''}" placeholder="评分1-5">
        <textarea id="be-review" placeholder="感想">${E.escapeHtml(r.review || '')}</textarea>
        <div class="modal-actions"><button id="be-save" class="btn-primary">保存</button><button id="be-cancel" class="btn-ghost">取消</button></div>
      </div>`;
    document.body.appendChild(m);
    E.$('#be-status', m).value = r.status || 'want';
    E.$('#be-cancel', m).onclick = () => m.remove();
    E.$('#be-save', m).onclick = async () => {
      await WB.store.upsert('books', ['title', 'author', 'review'], Object.assign({}, r, {
        title: E.$('#be-title', m).value, author: E.$('#be-author', m).value,
        status: E.$('#be-status', m).value, progress: parseInt(E.$('#be-progress', m).value) || 0,
        rating: parseInt(E.$('#be-rating', m).value) || 0, review: E.$('#be-review', m).value
      }));
      m.remove(); renderBooksList();
    };
  }

  // ---------- 关系图谱（简化列表版） ----------
  async function renderGraphPanel() {
    const el = E.$('#s-graph', root);
    const rows = await WB.store.list('notes', ['title', 'content']);
    const list = [];
    rows.forEach(r => {
      const links = (r.links || '').split(',').map(s => s.trim()).filter(Boolean);
      links.forEach(lid => {
        const target = rows.find(x => x.id === lid);
        if (target) list.push({ from: r.title, to: target.title });
      });
    });
    el.innerHTML = `<div class="section-head"><h3>笔记双向链接关系</h3></div>
      ${list.length ? '<ul class="list">' + list.map(x => `<li class="item"><div class="item-main"><div class="item-title">${E.escapeHtml(x.from)}</div><div class="item-sub">链接到 → ${E.escapeHtml(x.to)}</div></div></li>`).join('') + '</ul>' : '<div class="empty">暂无链接关系，编辑笔记时填写「双向链接」即可</div>'}`;
  }

  // ---------- 白板画布（简化可拖节点） ----------
  function renderBoardPanel() {
    const el = E.$('#s-board', root);
    el.innerHTML = `
      <div class="tool-row"><input id="board-text" placeholder="节点文字"><button id="board-add" class="btn-primary">添加节点</button><button id="board-save" class="btn-ghost">保存布局</button></div>
      <div id="board-canvas" class="board-canvas"></div>`;
    let nodes = [];
    WB.store.list('notes', ['title', 'content']).then(rows => {
      const saved = rows.find(r => r.title === '__whiteboard__');
      if (saved && saved.whiteboard) { try { nodes = JSON.parse(saved.whiteboard); } catch (e) {} }
      drawNodes();
    });
    function drawNodes() {
      const c = E.$('#board-canvas', el); c.innerHTML = '';
      nodes.forEach((n, i) => {
        const d = E.el(`<div class="board-node" style="left:${n.x}px;top:${n.y}px">${E.escapeHtml(n.text)}</div>`);
        let dragging = false, ox, oy, sx, sy;
        d.addEventListener('pointerdown', (e) => { dragging = true; ox = e.clientX; oy = e.clientY; sx = n.x; sy = n.y; d.setPointerCapture(e.pointerId); });
        d.addEventListener('pointermove', (e) => { if (!dragging) return; n.x = sx + e.clientX - ox; n.y = sy + e.clientY - oy; d.style.left = n.x + 'px'; d.style.top = n.y + 'px'; });
        d.addEventListener('pointerup', () => { dragging = false; });
        c.appendChild(d);
      });
    }
    E.$('#board-add', el).addEventListener('click', () => {
      const t = E.$('#board-text', el).value.trim(); if (!t) return;
      nodes.push({ text: t, x: 50 + Math.random() * 200, y: 50 + Math.random() * 150 });
      E.$('#board-text', el).value = ''; drawNodes();
    });
    E.$('#board-save', el).addEventListener('click', async () => {
      const rows = await WB.store.list('notes', ['title', 'content']);
      const saved = rows.find(r => r.title === '__whiteboard__');
      await WB.store.upsert('notes', ['title', 'content'], { id: saved ? saved.id : undefined, title: '__whiteboard__', content: '白板布局', whiteboard: JSON.stringify(nodes) });
      E.toast('白板布局已保存');
    });
  }

  function setView(v) {
    view = v;
    E.$$('.view-switch .chip[data-sv]', root).forEach(c => c.classList.toggle('active', c.dataset.sv === v));
    ['notes', 'books', 'graph', 'board'].forEach(k => E.$('#s-' + k, root).style.display = (k === v) ? 'block' : 'none');
    if (v === 'notes') renderNotesPanel();
    else if (v === 'books') renderBooksPanel();
    else if (v === 'graph') renderGraphPanel();
    else if (v === 'board') renderBoardPanel();
  }

  root.addEventListener('click', async (e) => {
    if (e.target.matches('.chip[data-sv]')) { setView(e.target.dataset.sv); return; }
    if (e.target.matches('#n-list .del')) { await WB.store.remove('notes', e.target.dataset.id); renderNotesList(); }
    if (e.target.matches('[data-edit]')) { const r = allNotes.find(x => x.id === e.target.dataset.edit); if (r) openNoteEditor(r); }
    if (e.target.matches('#b-list .del')) { await WB.store.remove('books', e.target.dataset.id); renderBooksList(); }
    if (e.target.matches('[data-bedit]')) { const r = allBooks.find(x => x.id === e.target.dataset.bedit); if (r) openBookEditor(r); }
  });

  const unsubNotes = WB.store.subscribe('notes', ['title', 'content'], () => { if (view === 'notes') renderNotesList(); if (view === 'graph') renderGraphPanel(); if (view === 'board') renderBoardPanel(); });
  const unsubBooks = WB.store.subscribe('books', ['title', 'author', 'review'], () => { if (view === 'books') renderBooksList(); });
  root.__unsub = function () { try { unsubNotes(); unsubBooks(); } catch (e) {} };
  setView('notes');
};

// ---------- 日常生活：习惯 + 心情 + 健康 + 统计 ----------
WB.sections.life = function (root) {
  const E = WB.ui;
  let view = 'habits';
  function todayLocal() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function weekStart(d) { d = d || new Date(); const day = (d.getDay() + 6) % 7; const s = new Date(d); s.setDate(d.getDate() - day); return s.getFullYear() + '-' + pad(s.getMonth() + 1) + '-' + pad(s.getDate()); }

  root.innerHTML = `
    <div class="section-head"><h2>日常生活</h2></div>
    <div class="view-switch" style="margin-bottom:14px">
      <button class="chip active" data-lv="habits">习惯打卡</button>
      <button class="chip" data-lv="mood">心情日记</button>
      <button class="chip" data-lv="health">健康记录</button>
      <button class="chip" data-lv="stats">统计报告</button>
    </div>
    <div id="l-habits" class="l-panel"></div>
    <div id="l-mood" class="l-panel" style="display:none"></div>
    <div id="l-health" class="l-panel" style="display:none"></div>
    <div id="l-stats" class="l-panel" style="display:none"></div>`;

  function getCheckins(r) { try { return JSON.parse(r.checkins || '{}'); } catch (e) { return {}; } }

  // ---------- 习惯 ----------
  function renderHabitsPanel() {
    const el = E.$('#l-habits', root);
    el.innerHTML = `
      <div class="add-row">
        <input id="h-name" placeholder="习惯名称，如 每天喝水" maxlength="80">
        <select id="h-type"><option value="check">普通打卡</option><option value="number">量化（如喝水杯数）</option><option value="health">健康类</option></select>
        <input id="h-unit" placeholder="单位：次/杯/分钟" maxlength="20">
        <input id="h-target" type="number" placeholder="每日目标">
        <input id="h-remind" type="time" title="提醒时间">
        <button id="h-add" class="btn-primary">添加</button>
      </div>
      <div id="h-weekgrid" class="week-grid-wrap"></div>
      <ul id="h-list" class="list"></ul>`;
    E.$('#h-add', el).addEventListener('click', async () => {
      const name = E.$('#h-name', el).value.trim(); if (!name) { E.toast('先写习惯名'); return; }
      await WB.store.upsert('habits', ['name'], {
        name, category: '普通', type: E.$('#h-type', el).value,
        unit: E.$('#h-unit', el).value, target: parseInt(E.$('#h-target', el).value) || 0,
        quant: E.$('#h-type', el).value === 'number', remind_time: E.$('#h-remind', el).value,
        checkins: '{}', last_checkin: '', streak: 0
      });
      E.$('#h-name', el).value = ''; E.$('#h-unit', el).value = ''; E.$('#h-target', el).value = '';
      renderHabitsList();
    });
    renderHabitsList();
  }
  async function renderHabitsList() {
    const ul = E.$('#h-list', root); if (!ul) return;
    const rows = await WB.store.list('habits', ['name']);
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const today = todayLocal();
    ul.innerHTML = '';
    if (!rows.length) { ul.appendChild(E.el('<li class="empty">还没有习惯</li>')); return; }
    rows.forEach(r => {
      const cins = getCheckins(r);
      const todayRec = cins[today] || {};
      const doneToday = !!todayRec.done;
      const val = todayRec.value || '';
      const isNum = r.quant || r.type === 'number';
      const goal = r.target || 1;
      const pct = isNum && val ? Math.min(100, Math.round(val / goal * 100)) : (doneToday ? 100 : 0);
      const li = E.el(`
        <li class="item ${doneToday ? 'done' : ''}" data-id="${r.id}">
          <div class="item-main" style="flex:1;min-width:0">
            <div class="item-title">${E.escapeHtml(r.name)} ${r.remind_time ? '<span class="mini-tag">⏰ ' + r.remind_time + '</span>' : ''}</div>
            <div class="item-sub">连续 ${r.streak || 0} 天 · 今日 ${pct}%</div>
            ${isNum ? `<div class="prog"><div class="prog-bar" style="width:${pct}%"></div></div>` : ''}
          </div>
          <div class="item-actions">
            ${isNum ? `<input type="number" class="h-val" data-hid="${r.id}" value="${val}" placeholder="${r.unit || '数值'}">` : ''}
            <button class="mini-btn checkin-btn ${doneToday ? 'on' : ''}" data-id="${r.id}">${doneToday ? '已打卡' : '打卡'}</button>
            <button class="mini-btn" data-hpatch="${r.id}">补卡</button>
            <button class="del" data-id="${r.id}">✕</button>
          </div>
        </li>`);
      ul.appendChild(li);
    });
    renderWeekGrid(rows);
  }
  function renderWeekGrid(rows) {
    const box = E.$('#h-weekgrid', root); if (!box) return;
    const ws = weekStart();
    const days = [];
    for (let i = 0; i < 7; i++) { const d = new Date(ws + 'T00:00:00'); d.setDate(d.getDate() + i); days.push(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())); }
    const html = `<div class="week-grid">
      ${['一','二','三','四','五','六','日'].map((d, i) => `<div class="wg-h">${d}<br><small>${days[i].slice(5)}</small></div>`).join('')}
      ${rows.map(r => {
        const cins = getCheckins(r);
        return `<div class="wg-name" title="${E.escapeHtml(r.name)}">${E.escapeHtml(r.name)}</div>` +
          days.map(d => {
            const rec = cins[d] || {};
            const done = rec.done;
            return `<div class="wg-cell ${done ? 'on' : ''}">${done ? '✓' : ''}</div>`;
          }).join('');
      }).join('')}
    </div>`;
    box.innerHTML = html;
  }

  // ---------- 心情日记 ----------
  function renderMoodPanel() {
    const el = E.$('#l-mood', root);
    el.innerHTML = `
      <div class="add-row">
        <select id="m-mood"><option value="😄">😄 超棒</option><option value="😊">😊 不错</option><option value="😐">😐 一般</option><option value="😔">😔 低落</option><option value="😫">😫 很差</option></select>
        <input id="m-note" placeholder="今天怎么样？" maxlength="200">
        <input id="m-date" type="date" value="${todayLocal()}">
        <button id="m-add" class="btn-primary">记录</button>
      </div>
      <ul id="m-list" class="list"></ul>`;
    E.$('#m-add', el).addEventListener('click', async () => {
      await WB.store.upsert('moods', ['note'], { mood: E.$('#m-mood', el).value, note: E.$('#m-note', el).value, log_date: E.$('#m-date', el).value || todayLocal() });
      E.$('#m-note', el).value = ''; renderMoodList();
    });
    renderMoodList();
  }
  async function renderMoodList() {
    const ul = E.$('#m-list', root); if (!ul) return;
    const rows = await WB.store.list('moods', ['note']);
    rows.sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
    ul.innerHTML = '';
    if (!rows.length) { ul.appendChild(E.el('<li class="empty">还没有心情记录</li>')); return; }
    rows.forEach(r => {
      const li = E.el(`<li class="item"><div class="item-main"><div class="item-title">${r.mood || ''} ${E.escapeHtml(r.log_date || '')}</div><div class="item-sub">${E.escapeHtml(r.note || '')}</div></div><button class="del" data-id="${r.id}">✕</button></li>`);
      ul.appendChild(li);
    });
  }

  // ---------- 健康记录 ----------
  function renderHealthPanel() {
    const el = E.$('#l-health', root);
    el.innerHTML = `
      <div class="add-row">
        <select id="he-kind"><option value="sleep">睡眠</option><option value="water">喝水</option><option value="sport">运动</option><option value="weight">体重</option><option value="medicine">用药</option><option value="steps">步数</option></select>
        <input id="he-value" placeholder="数值，如 7.5 / 2000" maxlength="40">
        <input id="he-note" placeholder="备注" maxlength="120">
        <input id="he-date" type="date" value="${todayLocal()}">
        <button id="he-add" class="btn-primary">记录</button>
      </div>
      <ul id="he-list" class="list"></ul>`;
    E.$('#he-add', el).addEventListener('click', async () => {
      await WB.store.upsert('health', ['note'], { kind: E.$('#he-kind', el).value, value: E.$('#he-value', el).value, note: E.$('#he-note', el).value, log_date: E.$('#he-date', el).value || todayLocal() });
      E.$('#he-value', el).value = ''; E.$('#he-note', el).value = ''; renderHealthList();
    });
    renderHealthList();
  }
  async function renderHealthList() {
    const ul = E.$('#he-list', root); if (!ul) return;
    const rows = await WB.store.list('health', ['note']);
    rows.sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
    const labels = { sleep: '睡眠', water: '喝水', sport: '运动', weight: '体重', medicine: '用药', steps: '步数' };
    ul.innerHTML = '';
    if (!rows.length) { ul.appendChild(E.el('<li class="empty">还没有健康记录</li>')); return; }
    rows.forEach(r => {
      const li = E.el(`<li class="item"><div class="item-main"><div class="item-title">${labels[r.kind] || r.kind} · ${E.escapeHtml(r.value || '')}</div><div class="item-sub">${E.escapeHtml(r.log_date || '')} ${E.escapeHtml(r.note || '')}</div></div><button class="del" data-id="${r.id}">✕</button></li>`);
      ul.appendChild(li);
    });
  }

  // ---------- 统计报告 ----------
  async function renderStatsPanel() {
    const el = E.$('#l-stats', root);
    const habits = await WB.store.list('habits', ['name']);
    const moods = await WB.store.list('moods', ['note']);
    const today = todayLocal();
    const ws = weekStart();
    const days7 = [];
    for (let i = 0; i < 7; i++) { const d = new Date(ws + 'T00:00:00'); d.setDate(d.getDate() + i); days7.push(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())); }
    let html = '<div class="stats-box">';
    html += `<h3>习惯周报告</h3>`;
    habits.forEach(r => {
      const cins = getCheckins(r);
      const weekHits = days7.filter(d => (cins[d] || {}).done).length;
      html += `<div class="stat-row"><span>${E.escapeHtml(r.name)}</span><span>${weekHits}/7 天</span></div>`;
    });
    html += `<h3 style="margin-top:16px">心情分布（最近30条）</h3>`;
    const moodCount = {};
    moods.slice(0, 30).forEach(r => { moodCount[r.mood] = (moodCount[r.mood] || 0) + 1; });
    Object.keys(moodCount).forEach(k => { html += `<div class="stat-row"><span>${k}</span><span>${moodCount[k]} 次</span></div>`; });
    html += '</div>';
    el.innerHTML = html;
  }

  function setView(v) {
    view = v;
    E.$$('.view-switch .chip[data-lv]', root).forEach(c => c.classList.toggle('active', c.dataset.lv === v));
    ['habits', 'mood', 'health', 'stats'].forEach(k => E.$('#l-' + k, root).style.display = (k === v) ? 'block' : 'none');
    if (v === 'habits') renderHabitsPanel();
    else if (v === 'mood') renderMoodPanel();
    else if (v === 'health') renderHealthPanel();
    else if (v === 'stats') renderStatsPanel();
  }

  root.addEventListener('click', async (e) => {
    if (e.target.matches('.chip[data-lv]')) { setView(e.target.dataset.lv); return; }
    // 习惯打卡
    if (e.target.matches('.checkin-btn')) {
      const id = e.target.dataset.id;
      const rows = await WB.store.list('habits', ['name']);
      const r = rows.find(x => x.id === id); if (!r) return;
      const today = todayLocal();
      const cins = getCheckins(r);
      const done = !(cins[today] || {}).done;
      cins[today] = Object.assign({}, cins[today], { done, value: done ? (cins[today] && cins[today].value ? cins[today].value : (r.target || 1)) : 0 });
      const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const streak = done ? ((cins[yest] || {}).done ? (r.streak || 0) + 1 : 1) : Math.max((r.streak || 1) - 1, 0);
      await WB.store.upsert('habits', ['name'], Object.assign({}, r, { checkins: JSON.stringify(cins), last_checkin: done ? today : '', streak }));
      renderHabitsList();
    }
    if (e.target.matches('.h-val')) return;
    if (e.target.matches('[data-hpatch]')) {
      const id = e.target.dataset.hpatch;
      const d = prompt('补卡日期（如 2026-08-22）', todayLocal()); if (!d) return;
      const rows = await WB.store.list('habits', ['name']);
      const r = rows.find(x => x.id === id); if (!r) return;
      const cins = getCheckins(r);
      cins[d] = Object.assign({}, cins[d], { done: true, patched: true });
      await WB.store.upsert('habits', ['name'], Object.assign({}, r, { checkins: JSON.stringify(cins) }));
      renderHabitsList();
    }
    if (e.target.matches('#h-list .del')) { await WB.store.remove('habits', e.target.dataset.id); renderHabitsList(); }
    if (e.target.matches('#m-list .del')) { await WB.store.remove('moods', e.target.dataset.id); renderMoodList(); }
    if (e.target.matches('#he-list .del')) { await WB.store.remove('health', e.target.dataset.id); renderHealthList(); }
  });

  // 量化习惯输入框失焦保存
  root.addEventListener('change', async (e) => {
    if (e.target.matches('.h-val')) {
      const id = e.target.dataset.hid;
      const rows = await WB.store.list('habits', ['name']);
      const r = rows.find(x => x.id === id); if (!r) return;
      const today = todayLocal();
      const cins = getCheckins(r);
      const val = parseFloat(e.target.value) || 0;
      const done = r.target ? val >= r.target : val > 0;
      cins[today] = Object.assign({}, cins[today], { value: val, done });
      await WB.store.upsert('habits', ['name'], Object.assign({}, r, { checkins: JSON.stringify(cins), last_checkin: done ? today : (cins[today].done ? today : '') }));
      renderHabitsList();
    }
  });

  const unsubs = [];
  unsubs.push(WB.store.subscribe('habits', ['name'], () => { if (view === 'habits') renderHabitsList(); }));
  unsubs.push(WB.store.subscribe('moods', ['note'], () => { if (view === 'mood') renderMoodList(); }));
  unsubs.push(WB.store.subscribe('health', ['note'], () => { if (view === 'health') renderHealthList(); }));
  root.__unsub = function () { unsubs.forEach(u => { try { u(); } catch (e) {} }); };
  setView('habits');
};
