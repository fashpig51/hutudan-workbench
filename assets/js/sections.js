// ============================================================
// 三块板块：工作 / 学习 / 日常生活
// 每块调用 WB.store 做增删改与同步；subscribe 让另一台设备实时刷新。
// ============================================================
window.WB = window.WB || {};
WB.sections = WB.sections || {};

// ---------- 工作：待办 + 日历 ----------
WB.sections.work = function (root) {
  const E = WB.ui;
  root.innerHTML = `
    <div class="section-head"><h2>工作 · 待办清单</h2></div>
    <div class="add-row">
      <input id="w-title" placeholder="要做什么？" maxlength="200">
      <select id="w-priority">
        <option value="high">高</option>
        <option value="mid" selected>中</option>
        <option value="low">低</option>
      </select>
      <input id="w-due" type="date">
      <button id="w-add" class="btn-primary">添加</button>
    </div>
    <div class="tool-row">
      <div class="filter-row" id="w-filterRow">
        <button class="chip active" data-f="all">全部</button>
        <button class="chip" data-f="active">进行中</button>
        <button class="chip" data-f="done">已完成</button>
      </div>
      <button id="w-viewToggle" class="btn-ghost">📅 日历</button>
    </div>
    <div id="w-calendar" class="calendar" style="display:none"></div>
    <div id="w-dayLabel" class="day-label" style="display:none"></div>
    <ul id="w-list" class="list"></ul>`;

  let filter = 'all';
  let view = 'list';
  let cur = { y: new Date().getFullYear(), m: new Date().getMonth() };
  let selectedDate = new Date().toISOString().slice(0, 10);
  let dueMapCache = {};

  function itemEl(r) {
    return E.el(`
      <li class="item ${r.status === 'done' ? 'done' : ''}">
        <label class="check"><input type="checkbox" data-id="${r.id}" ${r.status === 'done' ? 'checked' : ''}><span></span></label>
        <div class="item-main">
          <div class="item-title">${E.escapeHtml(r.title)}</div>
          ${r.due_date ? `<div class="item-sub">截止 ${E.fmtDate(r.due_date)}</div>` : ''}
        </div>
        <span class="tag tag-${r.priority}">${r.priority === 'high' ? '高' : r.priority === 'low' ? '低' : '中'}</span>
        <button class="del" data-id="${r.id}" title="删除">✕</button>
      </li>`);
  }

  function renderList(rows) {
    const ul = E.$('#w-list', root);
    ul.innerHTML = '';
    if (rows.length === 0) { ul.appendChild(E.el('<li class="empty">还没有待办，加一条吧</li>')); return; }
    rows.forEach(r => ul.appendChild(itemEl(r)));
  }

  function renderCalendar(dueMap) {
    const cal = E.$('#w-calendar', root);
    cal.innerHTML = '';
    const { y, m } = cur;
    const head = E.el(`
      <div class="cal-head">
        <button id="calPrev" class="cal-nav">‹</button>
        <span class="cal-title">${y}年${m + 1}月</span>
        <button id="calNext" class="cal-nav">›</button>
      </div>`);
    const grid = E.el(`<div class="cal-grid"></div>`);
    ['日', '一', '二', '三', '四', '五', '六'].forEach(d => grid.appendChild(E.el(`<div class="cal-dow">${d}</div>`)));
    const firstDow = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < firstDow; i++) grid.appendChild(E.el(`<div class="cal-cell empty"></div>`));
    for (let d = 1; d <= days; d++) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cnt = (dueMap[ds] || []).length;
      const cell = E.el(`
        <div class="cal-cell ${cnt ? 'has' : ''} ${ds === todayStr ? 'today' : ''} ${ds === selectedDate ? 'sel' : ''}" data-date="${ds}">
          <span class="cal-num">${d}</span>
          ${cnt ? `<span class="cal-dot"></span>` : ''}
        </div>`);
      grid.appendChild(cell);
    }
    cal.appendChild(head);
    cal.appendChild(grid);
  }

  function renderDayList() {
    const label = E.$('#w-dayLabel', root);
    label.style.display = 'block';
    label.textContent = `${selectedDate} 的待办（${ (dueMapCache[selectedDate] || []).length } 条）`;
    renderList(dueMapCache[selectedDate] || []);
  }

  async function render() {
    let rows = await WB.store.list('todos', ['title', 'note']);
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    dueMapCache = {};
    rows.forEach(t => { if (t.due_date) { (dueMapCache[t.due_date] = dueMapCache[t.due_date] || []).push(t); } });
    if (view === 'calendar') {
      renderCalendar(dueMapCache);
      renderDayList();
    } else {
      let f = rows;
      if (filter === 'active') f = f.filter(r => r.status !== 'done');
      if (filter === 'done') f = f.filter(r => r.status === 'done');
      renderList(f);
    }
  }

  E.$('#w-add', root).addEventListener('click', async () => {
    const title = E.$('#w-title', root).value.trim();
    if (!title) { E.toast('先写点什么'); return; }
    await WB.store.upsert('todos', ['title', 'note'], {
      title: title,
      priority: E.$('#w-priority', root).value,
      due_date: E.$('#w-due', root).value || null,
      status: 'active'
    });
    E.$('#w-title', root).value = '';
    E.$('#w-due', root).value = '';
    render();
  });

  E.$('#w-viewToggle', root).addEventListener('click', () => {
    view = (view === 'list') ? 'calendar' : 'list';
    E.$('#w-calendar', root).style.display = (view === 'calendar') ? 'block' : 'none';
    E.$('#w-dayLabel', root).style.display = (view === 'calendar') ? 'block' : 'none';
    E.$('#w-filterRow', root).style.display = (view === 'calendar') ? 'none' : 'flex';
    E.$('#w-viewToggle', root).textContent = (view === 'calendar') ? '☰ 列表' : '📅 日历';
    render();
  });

  root.addEventListener('click', async (e) => {
    if (e.target.matches('.chip')) {
      filter = e.target.dataset.f;
      E.$$('.chip', root).forEach(c => c.classList.toggle('active', c === e.target));
      render();
    }
    if (e.target.matches('.del')) {
      await WB.store.remove('todos', e.target.dataset.id);
      render();
    }
    if (e.target.matches('#calPrev')) { cur.m--; if (cur.m < 0) { cur.m = 11; cur.y--; } renderCalendar(dueMapCache); }
    if (e.target.matches('#calNext')) { cur.m++; if (cur.m > 11) { cur.m = 0; cur.y++; } renderCalendar(dueMapCache); }
    if (e.target.matches('.cal-cell') && e.target.dataset.date) {
      selectedDate = e.target.dataset.date;
      E.$$('.cal-cell', root).forEach(c => c.classList.toggle('sel', c.dataset.date === selectedDate));
      renderDayList();
    }
  });

  root.addEventListener('change', async (e) => {
    if (e.target.matches('input[type=checkbox]')) {
      const id = e.target.dataset.id;
      const rows = await WB.store.list('todos', ['title', 'note']);
      const r = rows.find(x => x.id === id);
      if (!r) return;
      await WB.store.upsert('todos', ['title', 'note'], Object.assign({}, r, { status: e.target.checked ? 'done' : 'active' }));
      render();
    }
  });

  WB.store.subscribe('todos', ['title', 'note'], render);
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

  WB.store.subscribe('notes', ['title', 'content'], renderNotes);
  WB.store.subscribe('books', ['title', 'author'], renderBooks);
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

  WB.store.subscribe('habits', ['name'], renderHabits);
  renderHabits();
};
