import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const simulate = body?.simulate ?? "success"; // "success" | "failure"
  const amount_cents = body?.amount_cents ?? 99000;

  if (simulate === "failure") {
    const result = await store.failBookingPayment({
      booking_id: id,
      provider_ref: body?.provider_ref,
    });
    if ("error" in result) {
      const status = result.code === "BOOKING_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: result.error, code: result.code }, { status });
    }
    return NextResponse.json({ data: result.booking, payment: result.payment });
  }

  // success path -> confirm with capacity + duplicate check inside transaction/mutex
  const result = await store.confirmBooking({
    booking_id: id,
    amount_cents,
    provider_ref: body?.provider_ref ?? `mock_${Date.now()}`,
  });

  if ("error" in result) {
    const status =
      result.code === "CLASS_FULL" ? 409 : result.code === "DUPLICATE_BOOKING" ? 409 : result.code === "BOOKING_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  return NextResponse.json({ data: result.booking, payment: result.payment });
}
