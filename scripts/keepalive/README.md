# 保活任务部署说明（防 Supabase 免费项目 7 天自动暂停）

## 为什么要做
Supabase 免费项目 **7 天没有数据库活动会自动暂停**（数据不丢，但要手动点恢复）。
这个定时任务每 3 天自动去戳一下数据库，让它永远保持活跃，你完全不用管。零成本。

## 步骤（一次性的，几分钟）
1. 去 github.com 新建一个**私有**仓库（名字随意，如 `workbench-keepalive`）。
2. 把本目录的 `keepalive.yml` 放进仓库的 `.github/workflows/` 目录：
   - 仓库里新建文件夹 `.github/workflows/`，把 `keepalive.yml` 传进去，提交。
3. 仓库 → Settings → Secrets and variables → Actions → New repository secret，添加两个：
   - `SUPABASE_URL`：你的项目地址，形如 `https://xxxx.supabase.co`
   - `SUPABASE_ANON`：你的 anon public key（Settings → API 里复制，和 config.js 填的是同一个）
4. 仓库 → Actions → 找到 `workbench-keepalive` → 点 `Run workflow` 手动跑一次验证。
   - 看到绿色 ✓、日志里 `http code: 200` 就成功了。
5. 之后它每 3 天自动跑，无需再管。

## 替代方案（不想用 GitHub）
任何能定时发 HTTP 请求的服务都行（如腾讯云函数定时触发器、自己的服务器 crontab），
目标就是每隔几天请求一次 `${SUPABASE_URL}/rest/v1/todos?select=count`（带 anon key 头）。
