-- 补齐 projects.workspace_id 的外键，与同库 workspaces.parent_id 保持同一套语义。
-- 0001 以「删组时由业务显式升根」为由省掉了该约束，但业务的升根实现
-- （repositories::project::detach_workspace 的 UPDATE ... SET workspace_id = NULL）
-- 与 ON DELETE SET NULL 完全等价，该理由不成立；约束交给数据库兜底，
-- 可拦住业务出错或手工改库导致的「指向已删分组」脏数据。

-- 存量脏数据会让 ADD CONSTRAINT 直接失败，先按删组的既有语义升到根级。
UPDATE projects
SET workspace_id = NULL
WHERE workspace_id IS NOT NULL
  AND workspace_id NOT IN (SELECT id FROM workspaces);

ALTER TABLE projects
  ADD CONSTRAINT projects_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE SET NULL;
