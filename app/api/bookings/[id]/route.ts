import { NextRequest } from "next/server";
import { store } from "@/lib/store";
import { idSchema } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { jsonOk, jsonError, logRequest } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  logRequest(_req);
  try {
    const { id } = await params;
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) throw new AppError("BAD_REQUEST", "Invalid booking id");

    const booking = await store.getBooking(id);
    if (!booking) throw new AppError("BOOKING_NOT_FOUND", "Booking not found");

    const payments = await store.getPaymentsForBooking(id);
    const trialClass = await store.getTrialClass(booking.trial_class_id);
    return jsonOk({ booking, payments, trialClass });
  } catch (err) {
    return jsonError(err);
  }
}
