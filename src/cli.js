import { createStore } from "./store.js";
import { startMcpServer } from "./mcp.js";
import { VERSION } from "./version.js";

const usage = `brayer ${VERSION}

Usage:
  brayer --version
  brayer serve --mcp stdio
  brayer serve --mcp http --port 38293
  brayer serve --ws --port 38294
  brayer status

HTTP, WebSocket and status land in later stories.`;

export async function main(argv = process.argv.slice(2), { env = process.env } = {}) {
  const [command, ...rest] = argv;

  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }
  if (!command || command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }

  if (command === "serve") {
    const mcpIndex = rest.indexOf("--mcp");
    const transport = mcpIndex >= 0 ? rest[mcpIndex + 1] : null;
    if (transport !== "stdio") {
      throw new Error("brayer: serve currently supports only --mcp stdio");
    }
    if (!env.BRAYER_HARNESS) throw new Error("brayer: BRAYER_HARNESS is required for stdio");
    const store = createStore({ config: { dbPath: env.BRAYER_DB || undefined } });
    await startMcpServer({ store, base: { harness: env.BRAYER_HARNESS }, logger: console });
    return;
  }

  throw new Error(`brayer: ${command} is not implemented yet`);
}
