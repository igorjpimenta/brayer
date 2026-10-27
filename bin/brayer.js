#!/usr/bin/env node
import { VERSION } from "../src/version.js";

const usage = `brayer ${VERSION}

Usage:
  brayer --version
  brayer serve --mcp stdio
  brayer serve --mcp http --port 38293
  brayer serve --ws --port 38294
  brayer status

The MCP and status commands land in later stories of the roadmap.`;

const [command, ...rest] = process.argv.slice(2);

if (command === "--version" || command === "-v") {
  console.log(VERSION);
} else if (command === "--help" || command === "-h" || !command) {
  console.log(usage);
} else {
  console.error(`brayer: ${command} is not implemented yet`);
  process.exit(1);
}
