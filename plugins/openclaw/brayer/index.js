import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { buildBrayerMeta } from "./meta.js";

export default definePluginEntry({
  id: "brayer",
  name: "Brayer",
  description: "Stamps _meta.brayer (harness/agent/session) onto Brayer MCP tool calls.",
  register: (api) => {
    if (typeof api.on !== "function") {
      api.logger.warn("brayer: api.on unavailable; identity hook not registered");
      return;
    }
    api.on("before_tool_call", (event, ctx) => buildBrayerMeta(event, ctx));
  },
});
