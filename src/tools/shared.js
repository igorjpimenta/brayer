import * as z from "zod/v4-mini";

export const identityShape = {
  brayer_agent: z.optional(z.string()),
  brayer_session: z.optional(z.string()),
  _meta: z.optional(z.unknown()),
};
