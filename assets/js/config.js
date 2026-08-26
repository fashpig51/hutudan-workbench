// ============================================================
// 工作台 · 配置文件
// 老板在 Supabase 建好项目后，把下面两行填进去即可（去项目 Settings > API 复制）
// supabaseUrl 例：https://abcd1234.supabase.co
// supabaseAnonKey 例：eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9......
// 留空则应用自动进入「纯本地模式」，只能在当前设备用，不会同步。
// ============================================================
window.WB = window.WB || {};
WB.config = {
  supabaseUrl: 'https://ktdlawiitofkhgklhyrz.supabase.co',
  supabaseAnonKey: 'sb_publishable_qdCdLOiKX4H_k_FTG12XFg_qJ2J_WfW',
  appVersion: 'V1.0.46'
  // 版本号规则：版本号 = «1.⌊提交数÷100⌋.提交数%100»，随 git 提交数递增。
  // 例：11 个→V1.0.11；100 个→V1.1.0；156 个→V1.1.56；238 个→V1.2.38（末尾两位=提交数后两位，不归零）。每次有实质改动提交后须同步此值。
};
