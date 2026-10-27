import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.js",
  out: "./.migrations",
  dbCredentials: { url: process.env.BRAYER_DB || "./brayer.sqlite" },
});
