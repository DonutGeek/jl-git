-- JLGit 初始 schema（PostgreSQL）。
-- 旧 SQLite 库不迁移，历史的逐列补齐逻辑在此一次性定义完毕。
-- 时间列沿用 TEXT 存 ISO-8601，与前端既有约定保持一致。

CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT NULL REFERENCES workspaces (id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT '',
  locked      BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  BIGINT NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- workspace_id 不设外键：删组时由业务显式升根，重排时由 service 校验分组存在性。
CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NULL,
  name            TEXT NOT NULL,
  description     TEXT NULL,
  icon            TEXT NOT NULL DEFAULT '',
  color           TEXT NOT NULL DEFAULT '',
  path            TEXT NOT NULL UNIQUE,
  remote_url      TEXT NULL,
  last_opened_at  TEXT NULL,
  pinned          BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order      BIGINT NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recent_projects (
  project_id  TEXT PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  opened_at   TEXT NOT NULL,
  open_count  BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id          TEXT PRIMARY KEY,
  scope       TEXT NOT NULL,
  project_id  TEXT NULL REFERENCES projects (id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',
  pinned      BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  BIGINT NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id                    TEXT PRIMARY KEY,
  conversation_id       TEXT NOT NULL REFERENCES chat_conversations (id) ON DELETE CASCADE,
  role                  TEXT NOT NULL,
  content               TEXT NOT NULL DEFAULT '',
  reasoning_content     TEXT NULL,
  reasoning_duration_ms BIGINT NULL,
  mentions_json         TEXT NULL,
  created_at            TEXT NOT NULL,
  sort_order            BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects (workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_last_opened_at ON projects (last_opened_at);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_scope_project
  ON chat_conversations (scope, project_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages (conversation_id, sort_order);
