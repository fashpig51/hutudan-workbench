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
    { t: 'habits', enc: ['name'] }
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
    b.innerHTML = '<span>⏰ 该做了：' + WB.ui.escapeHtml(r.title) + (r.due_time ? '（' + r.due_time + '）' : '') + '</span><button class="remind-ok">知道了</button>';
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
        <input id="search" placeholder="搜索（本设备）">
        <button id="exportBtn" class="btn-ghost" title="导出加密备份文件（存到微信/邮箱/网盘）">📤 备份</button>
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
        li.style.display = !q || t.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  function switchTo(key) {
    const content = E.$('#content');
    const oldRoot = content.firstElementChild;
    if (oldRoot && oldRoot.__unsub) { try { oldRoot.__unsub(); } catch (e) {} }
    content.innerHTML = '';
    current = key;
    E.$$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.key === key));
    if (key === 'work') WB.sections.work(content);
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
    switchTo('work');
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
