-- 「渡」冲动引导：一张表记一次冲动流程，users 加一列存用户自己的触发场景。
-- 日期口径与 events.date 一致：Asia/Shanghai，一条 urge 归属 started_at 那天。
CREATE TABLE urges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  started_at INTEGER NOT NULL,          -- 第 0 步建行的时刻（ms）
  ended_at INTEGER,                     -- 进入第 4 步的时刻；NULL = 未走完
  outcome TEXT,                         -- 'passed' | 'opened' | NULL
  state TEXT NOT NULL DEFAULT '',       -- 身体状态 chip：hungry/angry/lonely/tired/none
  trigger TEXT NOT NULL DEFAULT '',     -- 触发场景 chip 原文（用户配置的字串）或 ''
  rounds INTEGER NOT NULL DEFAULT 1,    -- 十分钟走了几轮
  note TEXT NOT NULL DEFAULT ''         -- opened 时的「下次换成什么」
);
CREATE INDEX idx_urges_user ON urges(user_id, started_at);

ALTER TABLE users ADD COLUMN surf_triggers TEXT;  -- 换行分隔，NULL = 用默认四条
