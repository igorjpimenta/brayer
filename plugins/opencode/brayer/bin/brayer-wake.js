#!/usr/bin/env node
import { startWakeServer } from "../wake.js";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : undefined;

startWakeServer({ port }).catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
