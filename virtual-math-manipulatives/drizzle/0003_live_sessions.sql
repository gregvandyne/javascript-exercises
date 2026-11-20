CREATE TABLE `live_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`tool_slug` text NOT NULL,
	`title` text NOT NULL,
	`teacher_state_json` text DEFAULT '{}' NOT NULL,
	`pushed_state_json` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `live_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`student_name` text NOT NULL,
	`state_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
