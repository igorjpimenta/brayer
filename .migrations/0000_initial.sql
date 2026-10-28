CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`work_order_id` text NOT NULL,
	`harness` text NOT NULL,
	`agent` text NOT NULL,
	`session_ref` text,
	`model` text,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cache_read` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`tool_calls` integer DEFAULT 0 NOT NULL,
	`error` text,
	`checkpoint_id` text,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "attempts_status" CHECK("attempts"."status" IN ('running', 'finished', 'failed', 'abandoned'))
);
--> statement-breakpoint
CREATE INDEX `idx_attempts_order` ON `attempts` (`work_order_id`);--> statement-breakpoint
CREATE TABLE `checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`work_order_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`kind` text NOT NULL,
	`goal` text,
	`state_json` text NOT NULL,
	`summary` text,
	`confidence` real,
	`resume_recipe` text,
	`tree_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_checkpoints_order` ON `checkpoints` (`work_order_id`);--> statement-breakpoint
CREATE INDEX `idx_checkpoints_attempt` ON `checkpoints` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_order_id` text NOT NULL,
	`attempt_id` text,
	`from_status` text,
	`to_status` text,
	`kind` text,
	`actor` text,
	`note` text,
	`session_ref` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_events_order` ON `events` (`work_order_id`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`work_order_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`kind` text NOT NULL,
	`uri` text NOT NULL,
	`sha256` text NOT NULL,
	`summary` text,
	`command` text,
	`exit_code` integer,
	`status` text,
	`verifier` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "evidence_kind" CHECK("evidence"."kind" IN ('diff', 'test', 'lint', 'screenshot', 'artifact', 'log'))
);
--> statement-breakpoint
CREATE INDEX `idx_evidence_order` ON `evidence` (`work_order_id`);--> statement-breakpoint
CREATE INDEX `idx_evidence_attempt` ON `evidence` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `playbooks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`trigger` text,
	`procedure` text NOT NULL,
	`provenance` text,
	`eval_score` real,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verdicts` (
	`id` text PRIMARY KEY NOT NULL,
	`work_order_id` text NOT NULL,
	`attempt_id` text,
	`decision` text NOT NULL,
	`reason` text,
	`actor` text NOT NULL,
	`policy` text,
	`evidence_ids` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "verdicts_decision" CHECK("verdicts"."decision" IN ('approve', 'reject', 'escalate', 'rollback'))
);
--> statement-breakpoint
CREATE INDEX `idx_verdicts_order` ON `verdicts` (`work_order_id`);--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`goal` text NOT NULL,
	`constraints` text,
	`acceptance` text NOT NULL,
	`status` text NOT NULL,
	`priority` integer DEFAULT 50 NOT NULL,
	`workspace` text,
	`repo` text,
	`branch` text,
	`budget_tokens` integer,
	`budget_usd` real,
	`model_policy` text,
	`approval_mode` text DEFAULT 'human' NOT NULL,
	`parent_id` text,
	`assignee` text,
	`claim_expires_at` integer,
	`lease_seconds` integer,
	`last_heartbeat` integer,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer,
	CONSTRAINT "work_orders_status" CHECK("work_orders"."status" IN ('draft', 'ready', 'claimed', 'running', 'review', 'approved', 'rejected', 'blocked', 'done', 'cancelled')),
	CONSTRAINT "work_orders_approval_mode" CHECK("work_orders"."approval_mode" IN ('auto', 'evidence', 'human'))
);
--> statement-breakpoint
CREATE INDEX `idx_work_orders_status_priority` ON `work_orders` (`status`,`priority`);--> statement-breakpoint
CREATE INDEX `idx_work_orders_assignee` ON `work_orders` (`assignee`);