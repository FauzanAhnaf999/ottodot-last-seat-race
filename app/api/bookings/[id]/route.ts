import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const booking = store.getBooking(id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found", code: "BOOKING_NOT_FOUND" }, { status: 404 });
  }
  const payments = store.getPaymentsForBooking(id);
  const trialClass = store.getTrialClass(booking.trial_class_id);
  return NextResponse.json({ data: booking, payments, trialClass });
}
