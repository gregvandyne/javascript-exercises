DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  tool_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
