import { NextRequest } from "next/server";
import { store } from "@/lib/store";
import { createBookingSchema } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { jsonOk, jsonError, getIdempotencyKey, getCachedIdempotent, setCachedIdempotent, logRequest } from "@/lib/api";

export const dynamic = "force-dynamic";

// POST /api/bookings — create pending_payment
// Best practice: validate at edge (zod), enforce business invariants in service,
// use idempotency-key to safely retry on network failure, return 201 + envelope.
export async function POST(req: NextRequest) {
  const rid = logRequest(req);
  try {
    // Idempotency: if client sent Idempotency-Key and we have cached response, replay it
    const idemKey = getIdempotencyKey(req);
    if (idemKey) {
      const cached = getCachedIdempotent(idemKey);
      if (cached) return jsonOk((cached.body as { data: unknown }).data, { status: cached.status, headers: { "x-idempotent-replayed": "true", "x-request-id": rid } });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new AppError("BAD_REQUEST", "Invalid JSON body");
    }

    const parsed = createBookingSchema.safeParse(raw);
    if (!parsed.success) throw parsed.error;

    const { parent_id, student_id, trial_class_id } = parsed.data;

    const result = store.createPendingBooking({ parent_id, student_id, trial_class_id });

    if ("error" in result) {
      throw new AppError(result.code as AppError["code"], result.error);
    }

    const body = { data: result.booking };
    if (idemKey) setCachedIdempotent(idemKey, 201, body);
    return jsonOk(result.booking, { status: 201, headers: { "x-request-id": rid } });
  } catch (err) {
    return jsonError(err);
  }
}

export async function GET(req: NextRequest) {
  logRequest(req);
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const booking = store.getBooking(id);
      if (!booking) throw new AppError("BOOKING_NOT_FOUND", "Booking not found");
      const payments = store.getPaymentsForBooking(id);
      return jsonOk({ booking, payments });
    }
    // Best practice: never expose dump via GET without auth; use dedicated admin endpoint.
    // For demo we return explicit error to avoid leaking (store as any) internals.
    throw new AppError("BAD_REQUEST", "Use ?id=<bookingId> or GET /api/roster/[classId] or GET /api/seed for debug dump");
  } catch (err) {
    return jsonError(err);
  }
}
