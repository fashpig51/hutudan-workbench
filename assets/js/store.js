// ============================================================
// 数据存储模块：本地缓存(IndexedDB 简化版用 localStorage) + Supabase 云端同步
// 设计：主数据在云端(你的 Supabase 免费项目)，每台设备本地留一份缓存(断网也能看)。
// 加密字段在写入前用口令加密，云端只存密文。多设备共享靠「同一口令 → 同一 workspace_id」。
// ============================================================
window.WB = window.WB || {};
WB.store = (function () {
  const CACHE_PREFIX = 'wb_cache_';
  // 每张表的加密字段（与 app.js 的 TABLES 保持一致）
  const ENC_FIELDS = {
    todos: ['title', 'note'],
    notes: ['title', 'content'],
    books: ['title', 'author', 'review'],
    habits: ['name'],
    goals: ['title', 'key_results'],
    time_logs: ['note'],
    moods: ['note'],
    health: ['note']
  };
  let sb = null;            // supabase 客户端
  let workspaceId = null;   // 数据分区
  let passphrase = null;
  let cfg = {};
  let onSyncIssue = null;  // 云端写入失败时的提醒回调（由界面注册）
  let fastOpen = false;     // 兼容旧调用：当前 list 永远秒回本机缓存，此开关已无意义（保留不删以免改动面过大）
  function setFastOpen(v) { fastOpen = v; }
  // 本机改动本地通知：本机一改立刻通知所有订阅者（秒级，不绕云端）
  const _localSubs = {};
  function notify(table) {
    const cbs = _localSubs[table] || [];
    const rows = loadCache(table);
    cbs.forEach(cb => { try { cb(rows); } catch (e) {} });
  }

  function cacheKey(table) { return CACHE_PREFIX + workspaceId + '_' + table; }
  function loadCache(table) {
    try { return JSON.parse(localStorage.getItem(cacheKey(table)) || '[]'); }
    catch (e) { return []; }
  }
  function saveCache(table, rows) {
    localStorage.setItem(cacheKey(table), JSON.stringify(rows));
  }

  // 提前建客户端：页面一加载就跑（不等用户点"进入"），把"建客户端+首次握手"的开销
  // 从点击路径里剔掉。此时还没口令，不推导 workspaceId、不碰任何用户数据，隐私无影响。
  function preConnect(config) {
    cfg = config || WB.config || {};
    if (sb) return; // 已建过就不重建
    if (cfg.supabaseUrl && cfg.supabaseAnonKey && typeof supabase !== 'undefined') {
      try {
        sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      } catch (e) { sb = null; }
    }
  }

  // 初始化：推导密钥与分区；客户端若已提前建好则复用，否则现建
  async function init(pass, config) {
    passphrase = pass;
    cfg = config || WB.config || {};
    workspaceId = await WB.crypto.makeWorkspaceId(pass);
    if (!sb && cfg.supabaseUrl && cfg.supabaseAnonKey && typeof supabase !== 'undefined') {
      try {
        sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      } catch (e) { sb = null; }
    }
    return sb != null;
  }

  function hasCloud() { return sb != null; }
  function getWorkspaceId() { return workspaceId; }

  async function encRow(row, encFields) {
    const out = Object.assign({}, row, { workspace_id: workspaceId });
    for (const f of encFields) {
      if (out[f] != null && out[f] !== '') out[f] = await WB.crypto.encrypt(String(out[f]), passphrase);
    }
    return out;
  }
  async function decRow(row, encFields) {
    const out = Object.assign({}, row);
    for (const f of encFields) {
      if (out[f] != null && out[f] !== '') out[f] = await WB.crypto.decrypt(out[f], passphrase);
    }
    return out;
  }

  // 去掉内部标记（_pending 等），避免上传时报"找不到字段"
  function stripMeta(row) {
    const r = Object.assign({}, row);
    delete r._pending;
    return r;
  }
  // 标记某条没传上云端，留待自动补传
  function markPending(table, id) {
    const cache = loadCache(table);
    const it = cache.find(r => r.id === id);
    if (it) { it._pending = true; saveCache(table, cache); }
  }

  // 取列表：先本地缓存(秒开)，再拉云端合并；保留本地未同步(_pending)项
  // 取列表：永远秒回本机缓存（主数据源是本机）。云端同步在后台完成：
  // 写入时 upsert 已落本机并 notify；跨设备靠实时订阅；进主页 pullAll 拉一次。
  // 这样任意页面读取都不再等网络，新增待办/进入页面都秒显。
  async function list(table, encFields) {
    return loadCache(table);
  }

  // 后台把单张表云端最新拉下来，合进本机缓存并通知刷新。
  // 合并保留本机独占项（云端还没收到 / 本机较新），避免刚新建的被旧快照覆盖。
  async function syncTable(table, encFields) {
    if (!sb) return;
    try {
      const { data, error } = await sb
        .from(table)
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', false);
      if (!error && data) {
        const remote = await Promise.all(data.map(r => decRow(r, encFields || ENC_FIELDS[table] || [])));
        const map = {};
        remote.forEach(r => { if (r && r.id) map[r.id] = r; });
        loadCache(table).forEach(r => {
          if (!r || !r.id || r.is_deleted) return;
          const ex = map[r.id];
          if (!ex) map[r.id] = r;
          else if ((r.updated_at || '') >= (ex.updated_at || '')) map[r.id] = r;
        });
        saveCache(table, Object.values(map));
        notify(table);
      }
    } catch (e) { /* 断网忽略 */ }
  }

  // 进主页时把云端最新数据全拉一遍，覆盖本地缓存（保留未同步项）
  async function pullAll() {
    if (!sb) return;
    for (const table of Object.keys(ENC_FIELDS)) {
      await syncTable(table, ENC_FIELDS[table]);
    }
  }

  // 把之前没传上云端的数据自动补传
  async function flushPending() {
    if (!sb) return 0;
    let count = 0;
    for (const table of Object.keys(ENC_FIELDS)) {
      const cache = loadCache(table);
      let changed = false;
      for (const it of cache) {
        if (it._pending) {
          try {
            const payload = await encRow(it, ENC_FIELDS[table]);
            delete payload._pending;
            const { error } = await sb.from(table).upsert(payload);
            if (!error) { delete it._pending; count++; changed = true; }
          } catch (e) { /* 下次再说 */ }
        }
      }
      if (changed) saveCache(table, cache);
    }
    return count;
  }

  // 新增/修改：本地先写；云端写失败则标记未同步并提醒，稍后自动补传
  async function upsert(table, encFields, row) {
    const now = new Date().toISOString();
    const full = Object.assign({}, row, {
      workspace_id: workspaceId,
      updated_at: now
    });
    if (!full.id) full.id = (crypto.randomUUID ? crypto.randomUUID() : 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2));
    if (!full.created_at) full.created_at = now;
    if (full.is_deleted == null) full.is_deleted = false;

    let cache = loadCache(table);
    const i = cache.findIndex(r => r.id === full.id);
    if (i >= 0) cache[i] = full; else cache.push(full);
    saveCache(table, cache);
    notify(table);   // 本机改动立刻通知所有页面刷新（秒级，不等云端）

    if (sb) {
      try {
        const enc = await encRow(full, encFields || ENC_FIELDS[table] || []);
        delete enc._pending;
        const { error } = await sb.from(table).upsert(enc);
        if (error) { markPending(table, full.id); if (onSyncIssue) onSyncIssue(table); }
      } catch (e) { markPending(table, full.id); if (onSyncIssue) onSyncIssue(table); }
    }
    return full;
  }

  // 原始上传：字段已经是加密后的密文，不再二次加密（用于自动备份文件恢复）
  async function upsertRaw(table, row) {
    const now = new Date().toISOString();
    const full = Object.assign({}, row, {
      workspace_id: workspaceId,
      updated_at: now
    });
    if (!full.id) full.id = (crypto.randomUUID ? crypto.randomUUID() : 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2));
    if (!full.created_at) full.created_at = now;
    if (full.is_deleted == null) full.is_deleted = false;

    let cache = loadCache(table);
    const i = cache.findIndex(r => r.id === full.id);
    if (i >= 0) cache[i] = full; else cache.push(full);
    saveCache(table, cache);
    notify(table);   // 本机改动立刻通知所有页面刷新（秒级，不等云端）

    if (sb) {
      try {
        const payload = stripMeta(full);
        const { error } = await sb.from(table).upsert(payload);
        if (error) { markPending(table, full.id); if (onSyncIssue) onSyncIssue(table); }
      } catch (e) { markPending(table, full.id); if (onSyncIssue) onSyncIssue(table); }
    }
    return full;
  }

  // 删除：软删（is_deleted=true），不真删，方便以后恢复
  async function remove(table, id) {
    const now = new Date().toISOString();
    let cache = loadCache(table);
    cache = cache.map(r => r.id === id ? Object.assign({}, r, { is_deleted: true, updated_at: now }) : r);
    saveCache(table, cache);
    notify(table);   // 本机改动立刻通知所有页面刷新
    if (sb) {
      await sb.from(table).update({ is_deleted: true, updated_at: now }).eq('id', id).eq('workspace_id', workspaceId);
    }
  }

  // 订阅：本机改动 + 跨设备改动都走「更新本机缓存 → notify 刷新」这一条路
  function subscribe(table, encFields, cb) {
    _localSubs[table] = _localSubs[table] || [];
    _localSubs[table].push(cb);
    const localUnsub = () => { _localSubs[table] = (_localSubs[table] || []).filter(f => f !== cb); };
    let rtUnsub = function () {};
    if (sb) {
      const channel = sb.channel('wb_' + table + '_' + workspaceId)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: table, filter: 'workspace_id=eq.' + workspaceId },
          async (payload) => {
            let rows = loadCache(table);
            const rec = payload.new;
            if (rec && rec.id) {
              const dec = await decRow(rec, encFields);
              if (payload.eventType === 'DELETE' || dec.is_deleted) {
                rows = rows.filter(r => r.id !== dec.id);
              } else {
                const i = rows.findIndex(r => r.id === dec.id);
                if (i >= 0) rows[i] = dec; else rows.push(dec);
              }
              saveCache(table, rows);
            }
            notify(table);   // 统一走本地通知刷新（跨设备变更也通知本机所有订阅者）
          })
        .subscribe();
      rtUnsub = function () { try { sb.removeChannel(channel); } catch (e) {} };
    }
    return function () { localUnsub(); rtUnsub(); };
  }

  // 心跳：每次打开应用戳一下数据库，给「7天自动暂停」加一道保险
  async function heartbeat() {
    if (!sb) return;
    try {
      await sb.from('todos').select('count', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
    } catch (e) { /* 忽略 */ }
  }

  function getPassphrase() { return passphrase; }
  // 界面用这个注册"云端写入失败"的提醒（比如弹一句提示）
  function setSyncIssueHandler(fn) { onSyncIssue = fn; }

  // 判断这个口令对应的保险柜里有没有任何数据（本地缓存优先，再查云端）
  // 用来拦住"输错口令开空柜"——你的真保险柜里有东西，空的肯定是输错了
  async function hasAnyData() {
    const tables = ['todos', 'notes', 'books', 'habits'];
    // 1) 本地缓存有 → 秒回（你平时直接进，不卡）
    for (const t of tables) {
      if (loadCache(t).length > 0) return true;
    }
    // 2) 本地空才查云端（新设备/清缓存场景）
    //    并行查 4 张表（Promise.all），避免串行 for 一张张等、累加延迟
    if (sb) {
      try {
        const results = await Promise.all(tables.map(t =>
          sb.from(t).select('id').eq('workspace_id', workspaceId).eq('is_deleted', false).limit(1)
        ));
        return results.some(r => !r.error && r.data && r.data.length > 0);
      } catch (e) { /* 断网等，忽略 */ }
    }
    return false;
  }

  return { preConnect, init, hasCloud, getWorkspaceId, getPassphrase, setSyncIssueHandler, setFastOpen, list, upsert, upsertRaw, remove, subscribe, heartbeat, hasAnyData, pullAll, flushPending, ALL_TABLES: Object.keys(ENC_FIELDS), ENC_FIELDS };
})();
