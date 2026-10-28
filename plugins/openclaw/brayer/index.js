import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createStore } from "@igorjpimenta/brayer/src/store.js";
import {
  attachSession,
  checkpointSession,
  resumeSession,
} from "@igorjpimenta/brayer/plugins/shared/contract.js";
import { buildBrayerMeta } from "./meta.js";
import { checkpointPayload, resumeContext, sessionFromContext } from "./session.js";

export default definePluginEntry({
  id: "brayer",
  name: "Brayer",
  description:
    "Stamps _meta.brayer on Brayer MCP calls, checkpoints a configured order on turn end, and resumes its latest checkpoint.",
  configSchema: () => ({
    type: "object",
    additionalProperties: true,
    properties: {
      orderId: {
        type: "string",
        description: "Existing Brayer order for this gateway. Required for automatic checkpoint/resume.",
      },
      dbPath: {
        type: "string",
        description: "Brayer SQLite path. Defaults to BRAYER_DB or ~/.brayer/store.sqlite.",
      },
      workspaceDir: {
        type: "string",
        description: "Workspace path used as the checkpoint tree pin.",
      },
      autoCheckpoint: {
        type: "boolean",
        description: "Checkpoint on turn end and session end. Default true when orderId is set.",
      },
    },
  }),
  register: (api) => {
    if (typeof api.on !== "function") {
      api.logger.warn("brayer: api.on unavailable; hooks not registered");
      return;
    }

    api.on("before_tool_call", (event, ctx) => buildBrayerMeta(event, ctx));

    const cfg = api.pluginConfig ?? {};
    const orderId = cfg.orderId ?? process.env.BRAYER_ORDER_ID ?? null;
    if (!orderId || cfg.autoCheckpoint === false) return;

    let store = null;
    const getStore = () => {
      if (!store) {
        store = createStore({ dbPath: cfg.dbPath ?? process.env.BRAYER_DB ?? undefined });
      }
      return store;
    };
    const attach = (session) => attachSession({ store: getStore(), session, orderId });

    api.on("agent_end", (event, ctx) => {
      const session = sessionFromContext(event, ctx);
      if (!session) return;
      try {
        const attached = attach(session);
        const trigger = event?.success === false ? "error" : "idle";
        const payload = checkpointPayload({ trigger, event, workspaceDir: ctx?.workspaceDir ?? cfg.workspaceDir });
        checkpointSession({
          store: getStore(),
          session,
          orderId,
          attemptId: attached.attempt.id,
          ...payload,
        });
      } catch (err) {
        api.logger.warn(`brayer: checkpoint failed: ${err?.message ?? err}`);
      }
    });

    api.on("session_end", (event, ctx) => {
      const session = sessionFromContext(event, ctx);
      if (!session) return;
      try {
        const attached = attach(session);
        const payload = checkpointPayload({ trigger: "stop", event, workspaceDir: ctx?.workspaceDir ?? cfg.workspaceDir });
        checkpointSession({
          store: getStore(),
          session,
          orderId,
          attemptId: attached.attempt.id,
          ...payload,
        });
      } catch (err) {
        api.logger.warn(`brayer: session checkpoint failed: ${err?.message ?? err}`);
      }
    });

    api.on("before_prompt_build", (event, ctx) => {
      const session = sessionFromContext(event, ctx);
      if (!session) return;
      try {
        const resumed = resumeSession({ store: getStore(), session, orderId });
        const context = resumeContext(resumed.checkpoint);
        if (context) return { prependContext: context };
      } catch (err) {
        api.logger.warn(`brayer: resume failed: ${err?.message ?? err}`);
      }
    });

    api.on("gateway_stop", () => {
      store?.close();
      store = null;
    });
  },
});
