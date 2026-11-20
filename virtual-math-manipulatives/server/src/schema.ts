import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const liveSessions = sqliteTable("live_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  toolSlug: text("tool_slug").notNull(),
  title: text("title").notNull(),
  teacherStateJson: text("teacher_state_json").notNull().default("{}"),
  pushedStateJson: text("pushed_state_json"),
  status: text("status", { enum: ["active", "ended"] }).notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const liveSubmissions = sqliteTable("live_submissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  studentName: text("student_name").notNull(),
  stateJson: text("state_json").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const workspaces = sqliteTable("workspaces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  toolSlug: text("tool_slug").notNull(),
  title: text("title").notNull(),
  stateJson: text("state_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
