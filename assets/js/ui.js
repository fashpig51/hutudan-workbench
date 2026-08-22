// ============================================================
// 界面小工具：建节点、转义、提示条、日期格式化
// ============================================================
window.WB = window.WB || {};
WB.ui = (function () {
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function escapeHtml(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function toast(msg) {
    const t = el('<div class="toast">' + escapeHtml(msg) + '</div>');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }
  function fmtDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('zh-CN'); }
    catch (e) { return d; }
  }
  function setSync(status, text) {
    const dot = $('#syncDot');
    const lbl = $('#syncLabel');
    if (dot) dot.className = 'sync-dot ' + status;
    if (lbl) lbl.textContent = text;
  }
  return { el, $, $$, escapeHtml, toast, fmtDate, setSync };
})();
