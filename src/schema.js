import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  check,
} from "drizzle-orm/sqlite-core";

export const ORDER_STATUSES = [
  "draft",
  "ready",
  "claimed",
  "running",
  "review",
  "approved",
  "rejected",
  "blocked",
  "done",
  "cancelled",
];
export const APPROVAL_MODES = ["auto", "evidence", "human"];
export const ATTEMPT_STATUSES = ["running", "finished", "failed", "abandoned"];
export const EVIDENCE_KINDS = ["diff", "test", "lint", "screenshot", "artifact", "log"];
export const VERDICT_DECISIONS = ["approve", "reject", "escalate", "rollback"];

const inList = (values) => sql.raw(values.map((v) => `'${v}'`).join(", "));

export const workOrders = sqliteTable("work_orders", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  goal: text("goal").notNull(),
  constraints: text("constraints"),
  acceptance: text("acceptance").notNull(),
  status: text("status").notNull(),
  priority: integer("priority").notNull().default(50),
  workspace: text("workspace"),
  repo: text("repo"),
  branch: text("branch"),
  budgetTokens: integer("budget_tokens"),
  budgetUsd: real("budget_usd"),
  modelPolicy: text("model_policy"),
  approvalMode: text("approval_mode").notNull().default("human"),
  parentId: text("parent_id"),
  winchTaskId: text("winch_task_id"),
  assignee: text("assignee"),
  claimExpiresAt: integer("claim_expires_at"),
  leaseSeconds: integer("lease_seconds"),
  lastHeartbeat: integer("last_heartbeat"),
  attemptCount: integer("attempt_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  closedAt: integer("closed_at"),
}, (table) => [
  check("work_orders_status", sql`${table.status} IN (${inList(ORDER_STATUSES)})`),
  check("work_orders_approval_mode", sql`${table.approvalMode} IN (${inList(APPROVAL_MODES)})`),
  index("idx_work_orders_status_priority").on(table.status, table.priority),
  index("idx_work_orders_assignee").on(table.assignee),
  index("idx_work_orders_winch_task").on(table.winchTaskId),
]);

export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  harness: text("harness").notNull(),
  agent: text("agent").notNull(),
  sessionRef: text("session_ref"),
  model: text("model"),
  status: text("status").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  cacheRead: integer("cache_read").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  toolCalls: integer("tool_calls").notNull().default(0),
  error: text("error"),
  checkpointId: text("checkpoint_id"),
}, (table) => [
  check("attempts_status", sql`${table.status} IN (${inList(ATTEMPT_STATUSES)})`),
  index("idx_attempts_order").on(table.workOrderId),
]);

export const checkpoints = sqliteTable("checkpoints", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  goal: text("goal"),
  stateJson: text("state_json").notNull(),
  summary: text("summary"),
  confidence: real("confidence"),
  resumeRecipe: text("resume_recipe"),
  treeHash: text("tree_hash"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_checkpoints_order").on(table.workOrderId),
  index("idx_checkpoints_attempt").on(table.attemptId),
]);

export const evidence = sqliteTable("evidence", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  uri: text("uri").notNull(),
  sha256: text("sha256").notNull(),
  summary: text("summary"),
  command: text("command"),
  exitCode: integer("exit_code"),
  status: text("status"),
  verifier: text("verifier"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  check("evidence_kind", sql`${table.kind} IN (${inList(EVIDENCE_KINDS)})`),
  index("idx_evidence_order").on(table.workOrderId),
  index("idx_evidence_attempt").on(table.attemptId),
]);

export const verdicts = sqliteTable("verdicts", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").references(() => attempts.id, { onDelete: "set null" }),
  decision: text("decision").notNull(),
  reason: text("reason"),
  actor: text("actor").notNull(),
  policy: text("policy"),
  evidenceIds: text("evidence_ids"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  check("verdicts_decision", sql`${table.decision} IN (${inList(VERDICT_DECISIONS)})`),
  index("idx_verdicts_order").on(table.workOrderId),
]);

export const playbooks = sqliteTable("playbooks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  trigger: text("trigger"),
  procedure: text("procedure").notNull(),
  provenance: text("provenance"),
  evalScore: real("eval_score"),
  status: text("status").notNull().default("draft"),
  createdAt: integer("created_at").notNull(),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workOrderId: text("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id"),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  kind: text("kind"),
  actor: text("actor"),
  note: text("note"),
  sessionRef: text("session_ref"),
  at: integer("at").notNull(),
}, (table) => [
  index("idx_events_order").on(table.workOrderId),
]);
