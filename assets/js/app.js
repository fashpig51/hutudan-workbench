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

  // 表结构：表名 + 该表的加密字段（导出/导入时用来正确加解密）
  const TABLES = [
    { t: 'todos', enc: ['title', 'note'] },
    { t: 'notes', enc: ['title', 'content'] },
    { t: 'books', enc: ['title', 'author'] },
    { t: 'habits', enc: ['name'] },
    { t: 'transactions', enc: ['title', 'category'] }
  ];

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
        <button id="exportBtn" class="btn-ghost" title="导出加密备份文件（存到微信/邮箱/网盘）">📤 备份</button>
        <button id="importBtn" class="btn-ghost" title="从备份文件恢复数据">📥 恢复</button>
        <input id="importFile" type="file" accept="application/json,.json" style="display:none">
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
      const obj = JSON.parse(text);
      if (!obj.enc) { E.toast('这不是工作台备份文件'); return; }
      const json = await WB.crypto.decrypt(obj.enc, WB.store.getPassphrase());
      const payload = JSON.parse(json);
      let count = 0;
      for (const { t, enc } of TABLES) {
        const rows = (payload.data && payload.data[t]) || [];
        for (const row of rows) {
          await WB.store.upsert(t, enc, row);
          count++;
        }
      }
      E.toast('已恢复 ' + count + ' 条，刷新中…');
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      E.toast('恢复失败：文件损坏或口令不对');
      const cloud = WB.store.hasCloud();
      E.setSync(cloud ? 'on' : 'off', cloud ? '已同步' : '纯本地模式');
    }
  }

  document.addEventListener('DOMContentLoaded', showPassModal);
})();
