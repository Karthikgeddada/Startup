import { z } from "zod";

/**
 * Environment contract, validated once at module load. Fails fast at build/dev
 * time instead of silently misbehaving at runtime.
 *
 * Only NEXT_PUBLIC_ variables may appear here — anything else would leak into
 * the browser bundle. Server-only secrets belong to the backend service.
 */
const envSchema = z.object({
  /** "true" (or unset) uses local mock adapters; "false" requires a real backend. */
  NEXT_PUBLIC_USE_MOCKS: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value !== "false"),
  NEXT_PUBLIC_API_BASE_URL: z
    .string()
    .url()
    .or(z.literal(""))
    .default("")
    .transform((url) => url.replace(/\/$/, "")),
  NEXT_PUBLIC_ANALYTICS_ID: z.string().default(""),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_USE_MOCKS: process.env.NEXT_PUBLIC_USE_MOCKS,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
  NEXT_PUBLIC_ANALYTICS_ID: process.env.NEXT_PUBLIC_ANALYTICS_ID,
});
