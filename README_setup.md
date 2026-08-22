# 工作台 · 老板自部署指南（一次性，约 10 分钟）

> 应用本身已经写好、能直接打开用（纯本地模式）。下面这一步是为了开启「手机↔手机实时同步」。
> 如果你现在只想先看看界面，可以跳过，直接双击 `index.html` 用浏览器打开（部分浏览器对本地文件有限制，建议用末尾的「本地预览」方式）。

## 第 1 步：注册 Supabase（用你给的邮箱）
1. 打开 https://supabase.com ，点 Sign Up。
2. 用 `fashpig51@163.com` 注册，去邮箱收验证邮件点一下激活。
3. 登录后点 **New Project**（新建项目）：
   - Name：填 `workbench`
   - Database Password：设一个你能记住的（以后基本不用）
   - Region：选离你近的（如 Singapore / Tokyo）
   - 点 Create，等一两分钟建好。

## 第 2 步：建数据库表
1. 左侧菜单 **SQL Editor** → New query。
2. 把本项目 `supabase/schema.sql` 的**全部内容**粘贴进去。
3. 点 **Run** 执行。看到成功提示即可（建了 5 张表 + 实时推送开关）。

## 第 3 步：拿到两个密钥，填进应用
1. 左侧菜单 **Settings → API**。
2. 复制 **Project URL**（形如 `https://xxxx.supabase.co`）→ 填到下面 `A` 处。
3. 复制 **Publishable key**（新版也叫 anon public key，形如 `sb_publishable_...` 或 `eyJ...`）→ 填到下面 `B` 处。
4. 打开本项目 `assets/js/config.js`，改成：
   ```js
   WB.config = {
     supabaseUrl: 'A_这里填Project URL',
     supabaseAnonKey: 'B_这里填anon public key',
     appVersion: 'V1.0.0'
   };
   ```

## 第 4 步：让两台手机/电脑能同步（关键）
- 在**每一台**设备的浏览器打开这个工作台，输入**同一个口令**。
- 同一口令 = 同一份数据；不同口令 = 互相看不到（这就是隐私保护）。
- ⚠️ 口令忘了 = 数据解不开，请牢记。

## 第 5 步：部署到 GitHub Pages（已上线，大陆可访问）
> 说明：本项目最终用 GitHub Pages 上线（免费、免备案，大陆实测可打开）。早期试过腾讯云 COS（默认域名被强制下载、网页打不开）和 Cloudflare Pages（国内超时），都已弃用。Supabase 钥匙和保活任务都已配好，正常情况下不必重配。
1. 把 `D:\EDG\software\Workbench` 整个文件夹推到 GitHub 仓库（公开仓库 `fashpig51/hutudan-workbench`）。
2. 仓库里已带 `.nojekyll`，防止 GitHub 误处理文件。
3. 仓库 **Settings → Pages**：Source 选 `main` 分支、文件夹选根目录（`/root`），保存。
4. 等几分钟构建完，访问 **https://fashpig51.github.io/hutudan-workbench/** 就是线上地址。
5. 各端（电脑 / 手机 / iPad）浏览器打开该地址 → 输入**同一个口令** → 三端自动同步。
- 改完代码：在 `D:\EDG\software\Workbench` 里 `git add -A && git commit && git push`，GitHub Pages 自动重建（几分钟生效）。
- 保活任务要用的 Supabase 钥匙已作为仓库密钥配好，无需再动。

## 第 6 步：开启保活（防 7 天暂停）
按 `scripts/keepalive/README.md` 把定时任务配上，之后零维护。

---
## 验收清单（改完这步，请在真机上重点看）
- [ ] Supabase 项目建好、`schema.sql` 执行成功、5 张表存在。
- [ ] `config.js` 两个值填对后，应用左下角显示「已同步」（绿点）。
- [ ] **核心需求**：手机 A 点完成一条待办 → 手机 B / iPad / 电脑 5 秒内自动打勾。
- [ ] 笔记、书单、习惯、账本 任一处新增，其他设备几秒后出现。
- [ ] 断网时仍能看到本地已缓存的内容。
