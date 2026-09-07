import { NextRequest } from "next/server";
import { store } from "@/lib/store";
import { payBookingSchema, idSchema } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { jsonOk, jsonError, logRequest } from "@/lib/api";

export const dynamic = "force-dynamic";

// POST /api/bookings/[id]/pay
// Body: { simulate: "success"|"failure", amount_cents?, provider_ref? }
// Best practice:
// - Payment provider call (mock) is OUTSIDE the DB lock; only confirm step holds lock
// - Success → confirmBooking() inside per-class mutex (or SELECT FOR UPDATE in Postgres)
// - Failure → failBookingPayment() (no lock needed, never consumes capacity)
// - Both are idempotent on already-final states
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rid = logRequest(req);
  try {
    const { id } = await params;
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) throw new AppError("BAD_REQUEST", "Invalid booking id");

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      raw = {};
    }
    const parsed = payBookingSchema.safeParse(raw);
    if (!parsed.success) throw parsed.error;
    const { simulate, amount_cents, provider_ref } = parsed.data;

    if (simulate === "failure") {
      const result = await store.failBookingPayment({ booking_id: id, provider_ref });
      if ("error" in result) throw new AppError(result.code as AppError["code"], result.error);
      return jsonOk(result.booking, { headers: { "x-request-id": rid }, meta: { payment: result.payment } } as unknown as { headers: Record<string, string> });
    }

    // simulate === "success"
    const result = await store.confirmBooking({ booking_id: id, amount_cents, provider_ref: provider_ref ?? `mock_${Date.now()}` });
    if ("error" in result) throw new AppError(result.code as AppError["code"], result.error);
    // Return both booking and payment; frontend needs both for status display
    // Use meta for secondary resource to keep envelope {data} primary
    const res = jsonOk(result.booking, { headers: { "x-request-id": rid } });
    // Attach payment via custom header alternative? Instead embed in response body for demo compat:
    // Keep backwards-compatible shape: { data: booking, payment }
    const body = { data: result.booking, payment: result.payment };
    const { NextResponse } = await import("next/server");
    return NextResponse.json(body, { status: 200, headers: { "x-request-id": rid } });
  } catch (err) {
    return jsonError(err);
  }
}
