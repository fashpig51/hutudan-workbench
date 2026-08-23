// ============================================================
// 数据存储模块：本地缓存(IndexedDB 简化版用 localStorage) + Supabase 云端同步
// 设计：主数据在云端(你的 Supabase 免费项目)，每台设备本地留一份缓存(断网也能看)。
// 加密字段在写入前用口令加密，云端只存密文。多设备共享靠「同一口令 → 同一 workspace_id」。
// ============================================================
window.WB = window.WB || {};
WB.store = (function () {
  const CACHE_PREFIX = 'wb_cache_';
  let sb = null;            // supabase 客户端
  let workspaceId = null;   // 数据分区
  let passphrase = null;
  let cfg = {};

  function cacheKey(table) { return CACHE_PREFIX + workspaceId + '_' + table; }
  function loadCache(table) {
    try { return JSON.parse(localStorage.getItem(cacheKey(table)) || '[]'); }
    catch (e) { return []; }
  }
  function saveCache(table, rows) {
    localStorage.setItem(cacheKey(table), JSON.stringify(rows));
  }

  // 初始化：推导密钥与分区，连接云端（若已配置）
  async function init(pass, config) {
    passphrase = pass;
    cfg = config || WB.config || {};
    workspaceId = await WB.crypto.makeWorkspaceId(pass);
    sb = null;
    if (cfg.supabaseUrl && cfg.supabaseAnonKey && typeof supabase !== 'undefined') {
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

  // 取列表：先本地缓存(秒开)，再拉云端合并
  async function list(table, encFields) {
    let rows = loadCache(table);
    if (sb) {
      const { data, error } = await sb
        .from(table)
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', false);
      if (!error && data) {
        rows = await Promise.all(data.map(r => decRow(r, encFields)));
        saveCache(table, rows);
      }
    }
    return rows;
  }

  // 新增/修改：本地先写，云端再写
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

    if (sb) {
      const enc = await encRow(full, encFields);
      const { error } = await sb.from(table).upsert(enc);
      if (error) console.warn('云端写入失败:', error.message);
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

    if (sb) {
      const { error } = await sb.from(table).upsert(full);
      if (error) console.warn('云端写入失败:', error.message);
    }
    return full;
  }

  // 删除：软删（is_deleted=true），不真删，方便以后恢复
  async function remove(table, id) {
    const now = new Date().toISOString();
    let cache = loadCache(table);
    cache = cache.map(r => r.id === id ? Object.assign({}, r, { is_deleted: true, updated_at: now }) : r);
    saveCache(table, cache);
    if (sb) {
      await sb.from(table).update({ is_deleted: true, updated_at: now }).eq('id', id).eq('workspace_id', workspaceId);
    }
  }

  // 实时订阅：这台改了，立刻推给其他设备
  function subscribe(table, encFields, cb) {
    if (!sb) return function () {};
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
          cb(rows);
        })
      .subscribe();
    return function () { try { sb.removeChannel(channel); } catch (e) {} };
  }

  // 心跳：每次打开应用戳一下数据库，给「7天自动暂停」加一道保险
  async function heartbeat() {
    if (!sb) return;
    try {
      await sb.from('todos').select('count', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
    } catch (e) { /* 忽略 */ }
  }

  function getPassphrase() { return passphrase; }

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

  return { init, hasCloud, getWorkspaceId, getPassphrase, list, upsert, upsertRaw, remove, subscribe, heartbeat, hasAnyData };
})();
