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

    const result = await store.createPendingBooking({ parent_id, student_id, trial_class_id });

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
      const booking = await store.getBooking(id);
      if (!booking) throw new AppError("BOOKING_NOT_FOUND", "Booking not found");
      const payments = await store.getPaymentsForBooking(id);
      return jsonOk({ booking, payments });
    }
    // Support per-child status check for UI clarity (best practice: resource-oriented filtering)
    const studentId = req.nextUrl.searchParams.get("studentId") ?? req.nextUrl.searchParams.get("student_id");
    const trialClassId = req.nextUrl.searchParams.get("trialClassId") ?? req.nextUrl.searchParams.get("trial_class_id");
    const classId = req.nextUrl.searchParams.get("classId");
    if (studentId && trialClassId) {
      const bookings = await store.getBookingsForStudentClass(studentId, trialClassId);
      return jsonOk({ bookings });
    }
    if (studentId) {
      const all = (await store.getAllBookings()).filter((b) => b.student_id === studentId);
      return jsonOk({ bookings: all });
    }
    if (classId) {
      const bookings = await store.getBookingsForClass(classId);
      // Return breakdown for UI: how many pending/confirmed/failed — never hide pending from child owner
      const breakdown = {
        confirmed: bookings.filter((b) => b.status === "confirmed").length,
        pending_payment: bookings.filter((b) => b.status === "pending_payment").length,
        payment_failed: bookings.filter((b) => b.status === "payment_failed").length,
        cancelled: bookings.filter((b) => b.status === "cancelled").length,
        total: bookings.length,
      };
      return jsonOk({ bookings, breakdown });
    }
    throw new AppError("BAD_REQUEST", "Use ?id=<bookingId> or ?studentId=&trialClassId= or ?classId= or GET /api/roster/[classId]");
  } catch (err) {
    return jsonError(err);
  }
}
