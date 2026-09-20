-- 「渡」v2：场景只在 /surf/setup 选一次，冲动来时的页面不再问任何问题。
-- surf_scene 存预设 key（lust/feed/game/snack）或 'custom:<用户文本>'，NULL = 未配置。
-- surf_line 是想对那一刻的自己说的一句话，NULL = 没写。
-- 0010 的 users.surf_triggers 就此弃用：列保留（D1 的 DROP COLUMN 会重建整张表，
-- 而一列没人读的空文本不值那个风险），代码里已经没有任何读写它的路径。
ALTER TABLE users ADD COLUMN surf_scene TEXT;
ALTER TABLE users ADD COLUMN surf_line TEXT;
