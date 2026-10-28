import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4-mini";
import { createToolHandlers } from "./tools/index.js";
import { assertDeclaration, resolveIdentity } from "./identity.js";
import { VERSION } from "./version.js";

function errorResult(err) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: String(err?.message ?? err) }) }],
    isError: true,
  };
}

export function createMcpServer({ store, base, logger } = {}) {
  const declared = assertDeclaration(base);
  const { TOOL_DEFS, handle } = createToolHandlers(store);
  const server = new McpServer({ name: "brayer", version: VERSION });

  for (const def of TOOL_DEFS) {
    server.registerTool(
      def.name,
      { description: def.description, inputSchema: z.object(def.shape) },
      async (args, extra) => {
        try {
          const identity = resolveIdentity({ meta: extra?._meta, args, base: declared });
          logger?.info?.(`brayer: ${def.name} from ${identity.harness}:${identity.agent}:${identity.session}`);
          const result = await handle(def.name, args, identity);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (err) {
          return errorResult(err);
        }
      }
    );
  }

  return server;
}

export async function startMcpServer({ store, base, logger } = {}) {
  const server = createMcpServer({ store, base, logger });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger?.info?.("brayer: MCP server connected on stdio");
  return server;
}
