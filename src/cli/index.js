import { VERSION } from "../version.js";
import { flagMap } from "./args.js";
import { formatStatus } from "./format.js";
import { runServe } from "./serve.js";
import { runStatus } from "./status.js";
import { runSweep } from "./sweep.js";
import { runWebhook } from "./webhook.js";

const usage = `brayer ${VERSION}

Usage:
  brayer --version
  brayer serve --mcp stdio
  brayer serve --mcp http --port 38293 [--host 127.0.0.1]
  brayer serve --ws --port 38294
  brayer status [--json]
  brayer sweep [--max-attempts N]
  brayer webhook set --harness H --url U [--bearer B] [--timeout-ms N]
  brayer webhook list
  brayer webhook remove --harness H
  brayer webhook test --harness H

HTTP and the full inbox land in later stories.`;

export { formatStatus };

export async function main(argv = process.argv.slice(2), { env = process.env, logger = console } = {}) {
  const [command, ...rest] = argv;

  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }
  if (!command || command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }

  if (command === "status") {
    await runStatus({ rest, env, logger });
    return;
  }

  if (command === "webhook") {
    await runWebhook({ rest, env, logger });
    return;
  }

  if (command === "sweep") {
    await runSweep({ args: rest, env, logger });
    return;
  }

  if (command === "serve") {
    await runServe({ rest, env, logger });
    return;
  }

  throw new Error(`brayer: ${command} is not implemented yet`);
}
