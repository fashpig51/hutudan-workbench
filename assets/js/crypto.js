// ============================================================
// 口令加密模块（AES-GCM）
// 你设的口令 = 打开云端保险柜的密码。云端只存「锁起来的密文」，
// 同一口令的设备才能互相解锁、看到同一份数据；外人拿到也打不开。
// ============================================================
window.WB = window.WB || {};
WB.crypto = (function () {
  const APP_SALT = 'workbench-permanent-v1';
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // 由口令派生出 256 位密钥
  async function deriveKey(passphrase, salt) {
    const km = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
      km,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // 同一口令 → 同一个 workspace_id（数据分区标识）
  async function makeWorkspaceId(passphrase) {
    return (await sha256Hex(passphrase)).slice(0, 16);
  }

  async function encrypt(text, passphrase) {
    if (text == null || text === '') return '';
    const key = await deriveKey(passphrase, APP_SALT);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(String(text)));
    const packed = new Uint8Array(iv.length + ct.byteLength);
    packed.set(iv);
    packed.set(new Uint8Array(ct), iv.length);
    return btoa(String.fromCharCode.apply(null, packed));
  }

  async function decrypt(b64, passphrase) {
    if (!b64) return '';
    try {
      const packed = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const iv = packed.slice(0, 12);
      const ct = packed.slice(12);
      const key = await deriveKey(passphrase, APP_SALT);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return dec.decode(pt);
    } catch (e) {
      return '[解密失败·口令可能不对]';
    }
  }

  return { sha256Hex, makeWorkspaceId, encrypt, decrypt };
})();
