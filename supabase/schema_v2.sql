-- ============================================================
-- 工作台 V2 · 数据库结构（5 张新表）
-- 用法：登录 Supabase → 左侧 SQL Editor → 粘贴本文件全部内容 → Run
-- 说明：
--   1) 数据在前端用「口令」加密后存入（云端只存密文），靠加密保护隐私；
--   2) RLS 设为 anon 可读写（与 V1 旧表策略一致）；
--   3) 表名前缀 wb2_ 与旧版 V1 的表（todos/notes/...）区分，互不干扰，旧数据不丢；
--   4) 列名使用双引号保留驼峰，以匹配前端 JS 对象的字段名（PostgREST 会原样映射 JSON key）。
-- 本文件幂等：重复执行不会报错。
-- ============================================================

-- 1) 待办 wb2_todos
create table if not exists "wb2_todos" (
  "id"         text primary key,
  "user_id"    text not null,
  "title"      text,
  "desc"       text,
  "createdAt"  text,
  "dueAt"      text,
  "done"       boolean default false,
  "completedAt" text,
  "priority"   integer default 3,
  "tags"       jsonb,
  "recurring"  text default 'none',
  "pinned"     boolean default false
);
create index if not exists "idx_wb2_todos_uid" on "wb2_todos"("user_id");

-- 2) 笔记 wb2_notes
create table if not exists "wb2_notes" (
  "id"         text primary key,
  "user_id"    text not null,
  "title"      text,
  "content"    text,
  "folder"     text,
  "pinned"     boolean default false,
  "locked"     boolean default false,
  "createdAt"  text,
  "updatedAt"  text
);
create index if not exists "idx_wb2_notes_uid" on "wb2_notes"("user_id");

-- 3) 番茄记录 wb2_pomodoros
create table if not exists "wb2_pomodoros" (
  "id"         text primary key,
  "user_id"    text not null,
  "projectId"  text,
  "type"       text,          -- focus / short / long
  "startedAt"  text,
  "endedAt"    text,
  "duration"   integer,       -- 分钟
  "completed"  boolean default false
);
create index if not exists "idx_wb2_pomodoros_uid" on "wb2_pomodoros"("user_id");

-- 4) 文件夹 wb2_folders_v1
create table if not exists "wb2_folders_v1" (
  "id"         text primary key,
  "user_id"    text not null,
  "name"       text,
  "createdAt"  text
);
create index if not exists "idx_wb2_folders_uid" on "wb2_folders_v1"("user_id");

-- 5) 番茄项目 wb2_pomo_projects
create table if not exists "wb2_pomo_projects" (
  "id"            text primary key,
  "user_id"       text not null,
  "name"          text,
  "createdAt"     text,
  "color"         text,
  "totalFocusMin" integer default 0
);
create index if not exists "idx_wb2_pomoproj_uid" on "wb2_pomo_projects"("user_id");

-- ---------- 安全规则（RLS，与 V1 旧表一致：anon 全读写） ----------
alter table "wb2_todos"         enable row level security;
alter table "wb2_notes"         enable row level security;
alter table "wb2_pomodoros"     enable row level security;
alter table "wb2_folders_v1"     enable row level security;
alter table "wb2_pomo_projects" enable row level security;

drop policy if exists anon_all_wb2_todos on "wb2_todos";
create policy anon_all_wb2_todos on "wb2_todos" for all to anon using (true) with check (true);
drop policy if exists anon_all_wb2_notes on "wb2_notes";
create policy anon_all_wb2_notes on "wb2_notes" for all to anon using (true) with check (true);
drop policy if exists anon_all_wb2_pomodoros on "wb2_pomodoros";
create policy anon_all_wb2_pomodoros on "wb2_pomodoros" for all to anon using (true) with check (true);
drop policy if exists anon_all_wb2_folders on "wb2_folders_v1";
create policy anon_all_wb2_folders on "wb2_folders_v1" for all to anon using (true) with check (true);
drop policy if exists anon_all_wb2_pomoproj on "wb2_pomo_projects";
create policy anon_all_wb2_pomoproj on "wb2_pomo_projects" for all to anon using (true) with check (true);
