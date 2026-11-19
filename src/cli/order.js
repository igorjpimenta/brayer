import { createStore } from "../store.js";
import { flagMap } from "./args.js";

export async function runOrder({ rest = [], env = process.env, logger = console } = {}) {
  const [sub, ...orderArgs] = rest;
  const values = flagMap(orderArgs);
  const store = createStore({ dbPath: env.BRAYER_DB || undefined });
  try {
    if (sub === "create") {
      const order = store.order.create({
        title: values.title,
        goal: values.goal,
        acceptance: values.acceptance,
        constraints: values.constraints,
        workspace: values.workspace,
        repo: values.repo,
        branch: values.branch,
        priority: values.priority === undefined ? 50 : Number(values.priority),
        status: values.status ?? "draft",
        approvalMode: values["approval-mode"] ?? "human",
        actor: values.actor ?? "operator",
      });
      console.log(JSON.stringify({ order }, null, 2));
      return order;
    }

    if (sub === "cancel") {
      if (!values.id) throw new Error("brayer: order cancel requires --id");
      const result = store.order.cancel({
        id: values.id,
        actor: values.actor ?? "operator",
        reason: values.reason ?? "cancelled",
      });
      console.log(JSON.stringify(result, null, 2));
      return result;
    }

    if (sub === "get") {
      if (!values.id) throw new Error("brayer: order get requires --id");
      const order = store.order.get(values.id);
      if (!order) throw new Error(`brayer: order not found: ${values.id}`);
      console.log(JSON.stringify({
        order,
        events: store.event.list({ workOrderId: order.id }),
        checkpoint: store.checkpoint.latest({ workOrderId: order.id }),
        evidence: store.evidence.list({ workOrderId: order.id }),
        verdicts: store.verdict.list({ workOrderId: order.id }),
      }, null, 2));
      return order;
    }

    throw new Error("brayer: order requires create, cancel or get");
  } finally {
    store.close();
  }
}
