-- ============================================================
-- 工作台 · 数据库结构（分表）
-- 用法：登录 Supabase → 左侧 SQL Editor → 粘贴本文件全部内容 → Run
-- 说明：数据已在前端用「口令」加密后存入，云端只存密文；
--       RLS 设为 anon 可读写（靠加密保护隐私），workspace_id 用来区分不同口令的数据。
-- ============================================================

-- 1) 待办 todos
create table if not exists todos (
  id uuid primary key,
  workspace_id text not null,
  title text,
  note text,
  status text default 'active',
  priority text default 'mid',
  due_date text,
  due_time text,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  parent_id text,
  kanban_status text default 'todo',
  tags text,
  kind text default 'task',
  focus_minutes integer default 0,
  scheduled_date text,
  scheduled_start text,
  scheduled_end text
);
create index if not exists idx_todos_ws on todos(workspace_id);

-- 2) 笔记 notes
create table if not exists notes (
  id uuid primary key,
  workspace_id text not null,
  title text,
  content text,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_notes_ws on notes(workspace_id);

-- 3) 书单 books
create table if not exists books (
  id uuid primary key,
  workspace_id text not null,
  title text,
  author text,
  status text default 'want',
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_books_ws on books(workspace_id);

-- 4) 习惯 habits
create table if not exists habits (
  id uuid primary key,
  workspace_id text not null,
  name text,
  last_checkin text,
  streak integer default 0,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_habits_ws on habits(workspace_id);

-- ---------- 安全规则（RLS） ----------
-- 开启行级安全，允许 anon 角色对本应用全表读写（数据安全靠前端口令加密）
alter table todos enable row level security;
alter table notes enable row level security;
alter table books enable row level security;
alter table habits enable row level security;

drop policy if exists anon_all_todos on todos;
create policy anon_all_todos on todos for all to anon using (true) with check (true);
drop policy if exists anon_all_notes on notes;
create policy anon_all_notes on notes for all to anon using (true) with check (true);
drop policy if exists anon_all_books on books;
create policy anon_all_books on books for all to anon using (true) with check (true);
drop policy if exists anon_all_habits on habits;
create policy anon_all_habits on habits for all to anon using (true) with check (true);

-- 开启实时推送（这台改了另一台立刻收到）
alter publication supabase_realtime add table todos;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table books;
alter publication supabase_realtime add table habits;

-- ============================================================
-- 阶段一（工作扩展）：已建好的旧项目，在 Supabase SQL Editor 单独执行下面这段加列即可
-- （新建项目直接跑上面整份脚本即可，这截是给老库补字段用的）
-- ============================================================
alter table todos add column if not exists due_time text;
alter table todos add column if not exists parent_id text;
alter table todos add column if not exists kanban_status text default 'todo';
alter table todos add column if not exists tags text;
alter table todos add column if not exists kind text default 'task';
alter table todos add column if not exists focus_minutes integer default 0;
alter table todos add column if not exists scheduled_date text;
alter table todos add column if not exists scheduled_start text;
alter table todos add column if not exists scheduled_end text;
