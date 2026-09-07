import { z } from "zod";

// Shared primitives — prevent injection, ensure format before touching business logic
export const idSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);

export const createBookingSchema = z.object({
  parent_id: idSchema,
  student_id: idSchema,
  trial_class_id: idSchema,
});

export const payBookingSchema = z.object({
  simulate: z.enum(["success", "failure"]).default("success"),
  amount_cents: z.number().int().min(100).max(10_000_000).optional().default(99000),
  provider_ref: z.string().max(128).optional(),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type PayBookingInput = z.infer<typeof payBookingSchema>;
