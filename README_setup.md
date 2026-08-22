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

## 第 5 步：部署到腾讯云 COS（国内可访问，推荐）
> ⚠️ 坑：Cloudflare / GitHub Pages 等**境外域名在中国大陆常被墙**，手机用流量打不开。故改用腾讯云对象存储（COS）静态网站托管，腾讯自家域名国内畅通。
1. 打开 https://console.cloud.tencent.com/cos ，登录你的腾讯云账号。
2. 首次需点「开通服务」（免费）。
3. 左侧「存储桶列表」→ **创建存储桶**：
   - 名称：`hutudan-workbench`（自定义，全小写、数字、中划线）
   - 地域：选离你近的（如广州 `ap-guangzhou`）
   - 访问权限：**公有读私有写**
   - 其他默认，点确定。
4. 进入存储桶 → 左侧「文件列表」→ **上传** → 把电脑里 `D:\EDG\software\Workbench` 文件夹内**所有文件 + `assets` 子文件夹**拖进去（保持 `index.html` 与 `assets` 同层）。
5. 左侧「基础配置」→ **静态网站** → 开启：
   - 索引文档：`index.html`
   - 错误文档：`index.html`（可选）
   - 保存。
6. 记下页面上的「**静态网站域名**」（形如 `https://hutudan-workbench-xxxx.cos-website.ap-guangzhou.myqcloud.com`）——这就是手机/iPad/电脑的访问地址。
7. 各端浏览器打开该域名 → 输入**与本地相同的口令** → 三端同步。
- 费用：按流量计费，个人用每月通常几毛到一块，**非体验版、不会到期**。

## 第 6 步：开启保活（防 7 天暂停）
按 `scripts/keepalive/README.md` 把定时任务配上，之后零维护。

---
## 验收清单（改完这步，请在真机上重点看）
- [ ] Supabase 项目建好、`schema.sql` 执行成功、5 张表存在。
- [ ] `config.js` 两个值填对后，应用左下角显示「已同步」（绿点）。
- [ ] **核心需求**：手机 A 点完成一条待办 → 手机 B / iPad / 电脑 5 秒内自动打勾。
- [ ] 笔记、书单、习惯、账本 任一处新增，其他设备几秒后出现。
- [ ] 断网时仍能看到本地已缓存的内容。
