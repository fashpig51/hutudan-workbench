// ============================================================
// 主控制器：口令登录、导航切换、顶栏、同步状态
// ============================================================
window.WB = window.WB || {};
(function () {
  const E = WB.ui;
  const NAV = [
    { key: 'work', label: '工作', icon: '💼' },
    { key: 'study', label: '学习', icon: '📚' },
    { key: 'life', label: '日常生活', icon: '🏠' }
  ];
  let current = 'work';

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
        <input id="search" placeholder="搜索（本设备）">
        <button id="lockBtn" class="btn-ghost" title="退出当前口令">锁</button>
      </div>`;
    E.$('#lockBtn', tb).addEventListener('click', () => location.reload());
    E.$('#search', tb).addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      E.$$('#content .item-title').forEach(t => {
        const li = t.closest('.item');
        li.style.display = !q || t.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  function switchTo(key) {
    current = key;
    E.$$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.key === key));
    const content = E.$('#content');
    content.innerHTML = '';
    if (key === 'work') WB.sections.work(content);
    else if (key === 'study') WB.sections.study(content);
    else if (key === 'life') WB.sections.life(content);
  }

  async function start(pass) {
    E.setSync('wait', '连接中…');
    const cloud = await WB.store.init(pass, WB.config);
    if (cloud) {
      E.setSync('on', '云端同步中');
      await WB.store.heartbeat();
      setTimeout(() => E.setSync('on', '已同步'), 800);
    } else {
      E.setSync('off', '纯本地模式');
    }
    buildShell();
    switchTo('work');
    E.$('#passModal').style.display = 'none';
  }

  function showPassModal() {
    const m = E.$('#passModal');
    m.style.display = 'flex';
    const input = E.$('#passInput');
    input.focus();
    const submit = async () => {
      const v = input.value;
      if (!v) { E.toast('口令不能为空'); return; }
      await start(v);
    };
    E.$('#passOk', m).onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  }

  document.addEventListener('DOMContentLoaded', showPassModal);
})();
