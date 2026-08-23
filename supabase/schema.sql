-- ============================================================
-- 工作台 · 数据库结构（分表）
-- 用法：登录 Supabase → 左侧 SQL Editor → 粘贴本文件全部内容 → Run
-- 说明：数据已在前端用「口令」加密后存入，云端只存密文；
--       RLS 设为 anon 可读写（靠加密保护隐私），workspace_id 用来区分不同口令的数据。
-- ============================================================

-- 1) 待办 todos
-- 阶段一已扩展：子任务、看板、标签、纪念日、专注时长、排程
-- 阶段四扩展：自然语言输入存原始文本
-- 阶段二扩展：笔记
-- 阶段三扩展：习惯
-- 阶段四扩展：目标、时间日志、心情、健康
-- 全功能版：所有表字段一次建齐

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
  scheduled_end text,
  raw_input text
);
create index if not exists idx_todos_ws on todos(workspace_id);

-- 2) 笔记 notes（阶段二扩展）
create table if not exists notes (
  id uuid primary key,
  workspace_id text not null,
  title text,
  content text,
  tags text,
  category text,
  template text,
  attachments text,    -- JSON 数组：{name, data(base64)}
  links text,          -- 逗号分隔的双向链接 id 列表
  blocks text,         -- JSON 数组分块（段落/引用/折叠）
  whiteboard text,     -- JSON：白板节点位置
  daily_date text,     -- 每日笔记日期
  is_daily boolean default false,
  voice_url text,      -- 语音速记 base64
  summary text,        -- 渐进式总结/重点折叠内容
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_notes_ws on notes(workspace_id);

-- 3) 书单 books（阶段二扩展：进度%、打分、感想）
create table if not exists books (
  id uuid primary key,
  workspace_id text not null,
  title text,
  author text,
  status text default 'want',
  progress integer default 0,    -- 0-100
  rating integer,                -- 1-5
  review text,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_books_ws on books(workspace_id);

-- 4) 习惯 habits（阶段三扩展）
create table if not exists habits (
  id uuid primary key,
  workspace_id text not null,
  name text,
  category text default '普通',
  unit text,                     -- 单位：次/分钟/杯/公里
  quant boolean default false,   -- 是否量化
  target integer,                -- 每日目标
  type text default 'check',     -- check/number/health
  checkins text,                 -- JSON：{ "2026-08-23": {done:true, value:3, patched:true} }
  last_checkin text,
  streak integer default 0,
  remind_time text,              -- 提醒时间
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_habits_ws on habits(workspace_id);

-- 5) 目标 goals（阶段四）
create table if not exists goals (
  id uuid primary key,
  workspace_id text not null,
  title text,
  key_results text,              -- JSON 数组 [{text, target, current}]
  status text default 'active',
  deadline text,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_goals_ws on goals(workspace_id);

-- 6) 时间日志 time_logs（阶段四）
create table if not exists time_logs (
  id uuid primary key,
  workspace_id text not null,
  todo_id text,
  note text,
  minutes integer default 0,
  log_date text,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_time_logs_ws on time_logs(workspace_id);

-- 7) 心情日记 moods（阶段三）
create table if not exists moods (
  id uuid primary key,
  workspace_id text not null,
  mood text,                     -- 表情：😄😊😐😔😫
  note text,
  log_date text,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_moods_ws on moods(workspace_id);

-- 8) 健康记录 health（阶段三）
create table if not exists health (
  id uuid primary key,
  workspace_id text not null,
  kind text,                     -- sleep/water/sport/weight/medicine/steps
  value text,
  note text,
  log_date text,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_health_ws on health(workspace_id);

-- ---------- 安全规则（RLS） ----------
-- 开启行级安全，允许 anon 角色对本应用全表读写（数据安全靠前端口令加密）
alter table todos enable row level security;
alter table notes enable row level security;
alter table books enable row level security;
alter table habits enable row level security;
alter table goals enable row level security;
alter table time_logs enable row level security;
alter table moods enable row level security;
alter table health enable row level security;

drop policy if exists anon_all_todos on todos;
create policy anon_all_todos on todos for all to anon using (true) with check (true);
drop policy if exists anon_all_notes on notes;
create policy anon_all_notes on notes for all to anon using (true) with check (true);
drop policy if exists anon_all_books on books;
create policy anon_all_books on books for all to anon using (true) with check (true);
drop policy if exists anon_all_habits on habits;
create policy anon_all_habits on habits for all to anon using (true) with check (true);
drop policy if exists anon_all_goals on goals;
create policy anon_all_goals on goals for all to anon using (true) with check (true);
drop policy if exists anon_all_time_logs on time_logs;
create policy anon_all_time_logs on time_logs for all to anon using (true) with check (true);
drop policy if exists anon_all_moods on moods;
create policy anon_all_moods on moods for all to anon using (true) with check (true);
drop policy if exists anon_all_health on health;
create policy anon_all_health on health for all to anon using (true) with check (true);

-- 开启实时推送（这台改了另一台立刻收到）
alter publication supabase_realtime add table todos;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table books;
alter publication supabase_realtime add table habits;
alter publication supabase_realtime add table goals;
alter publication supabase_realtime add table time_logs;
alter publication supabase_realtime add table moods;
alter publication supabase_realtime add table health;

-- ============================================================
-- 老库升级：给已建好的旧项目补字段/补表（不会破坏现有数据）
-- 在 Supabase SQL Editor 单独执行下面这段即可
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
alter table todos add column if not exists raw_input text;

alter table notes add column if not exists tags text;
alter table notes add column if not exists category text;
alter table notes add column if not exists template text;
alter table notes add column if not exists attachments text;
alter table notes add column if not exists links text;
alter table notes add column if not exists blocks text;
alter table notes add column if not exists whiteboard text;
alter table notes add column if not exists daily_date text;
alter table notes add column if not exists is_daily boolean default false;
alter table notes add column if not exists voice_url text;
alter table notes add column if not exists summary text;

alter table books add column if not exists progress integer default 0;
alter table books add column if not exists rating integer;
alter table books add column if not exists review text;

alter table habits add column if not exists category text default '普通';
alter table habits add column if not exists unit text;
alter table habits add column if not exists quant boolean default false;
alter table habits add column if not exists target integer;
alter table habits add column if not exists type text default 'check';
alter table habits add column if not exists checkins text;
alter table habits add column if not exists remind_time text;

-- 阶段四新表（老库直接执行这里也会创建）
create table if not exists goals (id uuid primary key, workspace_id text not null, title text, key_results text, status text default 'active', deadline text, is_deleted boolean default false, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists time_logs (id uuid primary key, workspace_id text not null, todo_id text, note text, minutes integer default 0, log_date text, is_deleted boolean default false, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists moods (id uuid primary key, workspace_id text not null, mood text, note text, log_date text, is_deleted boolean default false, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists health (id uuid primary key, workspace_id text not null, kind text, value text, note text, log_date text, is_deleted boolean default false, created_at timestamptz default now(), updated_at timestamptz default now());

-- 老库 RLS / 实时推送（安全执行，重复执行不报错）
alter table goals enable row level security; alter table time_logs enable row level security; alter table moods enable row level security; alter table health enable row level security;
drop policy if exists anon_all_goals on goals; create policy anon_all_goals on goals for all to anon using (true) with check (true);
drop policy if exists anon_all_time_logs on time_logs; create policy anon_all_time_logs on time_logs for all to anon using (true) with check (true);
drop policy if exists anon_all_moods on moods; create policy anon_all_moods on moods for all to anon using (true) with check (true);
drop policy if exists anon_all_health on health; create policy anon_all_health on health for all to anon using (true) with check (true);
alter publication supabase_realtime add table goals; alter publication supabase_realtime add table time_logs; alter publication supabase_realtime add table moods; alter publication supabase_realtime add table health;
