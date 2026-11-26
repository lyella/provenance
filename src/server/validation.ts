import { z } from "zod";
import { CONFIDENCES, SOURCES } from "@/lib/types";

export const IntentBody = z.object({
  body: z.string().trim().min(1, "an intent needs a body").max(4000),
  confidence: z.enum(CONFIDENCES).default("medium"),
  evidence: z.array(z.string().trim().min(1).max(280)).max(12).default([]),
  tags: z.array(z.string().trim().min(1).max(32)).max(8).default([]),
  /** Link number or intent id being amended. */
  supersedes: z.union([z.number().int().positive(), z.string().min(1)]).nullish(),
});

export const CreateCaseBody = z.object({
  title: z.string().trim().min(3, "give the case a title").max(160),
  kind: z.enum(["decision", "incident", "forecast", "hire"]).default("decision"),
  policy: z.enum(["none", "zero", "half"]).default("half"),
  windowDays: z.number().int().min(1).max(90).default(14),
});

export const SealBody = z.object({
  note: z.string().trim().max(500).optional(),
});

export const RegisterBody = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8, "passwords need at least 8 characters").max(200),
  name: z.string().trim().min(1).max(80),
  handle: z.string().trim().max(32).optional(),
});

export const LoginBody = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

export type IntentBodyT = z.infer<typeof IntentBody>;
export type CreateCaseBodyT = z.infer<typeof CreateCaseBody>;

export function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const err = new Error(first ? `${first.path.join(".") || "input"}: ${first.message}` : "invalid input");
    (err as Error & { status?: number }).status = 422;
    throw err;
  }
  return result.data;
}

export { SOURCES };
