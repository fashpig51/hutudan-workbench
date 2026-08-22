// ============================================================
// 三块板块：工作 / 学习 / 日常生活
// 每块调用 WB.store 做增删改与同步；subscribe 让另一台设备实时刷新。
// ============================================================
window.WB = window.WB || {};
WB.sections = WB.sections || {};

// ---------- 工作：待办 ----------
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
    <div class="filter-row">
      <button class="chip active" data-f="all">全部</button>
      <button class="chip" data-f="active">进行中</button>
      <button class="chip" data-f="done">已完成</button>
    </div>
    <ul id="w-list" class="list"></ul>`;

  let filter = 'all';

  async function render() {
    let rows = await WB.store.list('todos', ['title', 'note']);
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    if (filter === 'active') rows = rows.filter(r => r.status !== 'done');
    if (filter === 'done') rows = rows.filter(r => r.status === 'done');
    const ul = E.$('#w-list', root);
    ul.innerHTML = '';
    if (rows.length === 0) { ul.appendChild(E.el('<li class="empty">还没有待办，加一条吧</li>')); return; }
    rows.forEach(r => {
      const li = E.el(`
        <li class="item ${r.status === 'done' ? 'done' : ''}">
          <label class="check"><input type="checkbox" data-id="${r.id}" ${r.status === 'done' ? 'checked' : ''}><span></span></label>
          <div class="item-main">
            <div class="item-title">${E.escapeHtml(r.title)}</div>
            ${r.due_date ? `<div class="item-sub">截止 ${E.fmtDate(r.due_date)}</div>` : ''}
          </div>
          <span class="tag tag-${r.priority}">${r.priority === 'high' ? '高' : r.priority === 'low' ? '低' : '中'}</span>
          <button class="del" data-id="${r.id}" title="删除">✕</button>
        </li>`);
      ul.appendChild(li);
    });
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

// ---------- 日常生活：习惯打卡 + 账本 ----------
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
    </div>
    <div class="sub-block">
      <h3>账本</h3>
      <div class="add-row">
        <input id="t-title" placeholder="备注，如 午饭" maxlength="80">
        <input id="t-amount" type="number" placeholder="金额" step="0.01">
        <select id="t-type"><option value="expense">支出</option><option value="income">收入</option></select>
        <input id="t-cat" placeholder="分类" maxlength="40">
        <button id="t-add" class="btn-primary">记一笔</button>
      </div>
      <div id="t-summary" class="summary"></div>
      <ul id="t-list" class="list"></ul>
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
  async function renderTxns() {
    let rows = await WB.store.list('transactions', ['title', 'category']);
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const ul = E.$('#t-list', root);
    ul.innerHTML = '';
    if (rows.length === 0) { ul.appendChild(E.el('<li class="empty">还没有账目</li>')); return; }
    let inc = 0, exp = 0;
    rows.forEach(r => {
      const amt = parseFloat(r.amount) || 0;
      if (r.type === 'income') inc += amt; else exp += amt;
      const li = E.el(`
        <li class="item">
          <div class="item-main">
            <div class="item-title">${E.escapeHtml(r.title)}${r.category ? ' · ' + E.escapeHtml(r.category) : ''}</div>
          </div>
          <span class="amount ${r.type === 'income' ? 'in' : 'out'}">${r.type === 'income' ? '+' : '-'}${amt.toFixed(2)}</span>
          <button class="del" data-id="${r.id}" title="删除">✕</button>
        </li>`);
      ul.appendChild(li);
    });
    E.$('#t-summary', root).textContent = `本月收入 ${inc.toFixed(2)} ｜ 支出 ${exp.toFixed(2)} ｜ 结余 ${(inc - exp).toFixed(2)}`;
  }

  E.$('#h-add', root).addEventListener('click', async () => {
    const name = E.$('#h-name', root).value.trim();
    if (!name) { E.toast('先写习惯名'); return; }
    await WB.store.upsert('habits', ['name'], { name: name, last_checkin: '', streak: 0 });
    E.$('#h-name', root).value = '';
    renderHabits();
  });
  E.$('#t-add', root).addEventListener('click', async () => {
    const title = E.$('#t-title', root).value.trim();
    const amount = parseFloat(E.$('#t-amount', root).value);
    if (!title || isNaN(amount)) { E.toast('备注和金额都要填'); return; }
    await WB.store.upsert('transactions', ['title', 'category'], {
      title: title,
      amount: amount,
      type: E.$('#t-type', root).value,
      category: E.$('#t-cat', root).value || '',
      txn_date: new Date().toISOString().slice(0, 10)
    });
    E.$('#t-title', root).value = '';
    E.$('#t-amount', root).value = '';
    E.$('#t-cat', root).value = '';
    renderTxns();
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
    if (e.target.matches('#t-list .del')) { await WB.store.remove('transactions', e.target.dataset.id); renderTxns(); }
  });

  WB.store.subscribe('habits', ['name'], renderHabits);
  WB.store.subscribe('transactions', ['title', 'category'], renderTxns);
  renderHabits();
  renderTxns();
};
