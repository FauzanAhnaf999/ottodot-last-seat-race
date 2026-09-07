import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { parent_id, student_id, trial_class_id } = body ?? {};

  if (!parent_id || !student_id || !trial_class_id) {
    return NextResponse.json(
      { error: "parent_id, student_id, trial_class_id required", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const result = store.createPendingBooking({ parent_id, student_id, trial_class_id });

  if ("error" in result) {
    const status =
      result.code === "DUPLICATE_BOOKING" ? 409 : result.code === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  return NextResponse.json({ data: result.booking }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const b = store.getBooking(id);
    if (!b) return NextResponse.json({ error: "Not found", code: "BOOKING_NOT_FOUND" }, { status: 404 });
    const payments = store.getPaymentsForBooking(id);
    return NextResponse.json({ data: b, payments });
  }
  // list all for debug (admin)
  const all = [...(store as any).state?.bookings?.values?.() ?? []];
  // fallback if private: iterate via getBookingsForClass etc - simpler: expose via store method
  return NextResponse.json({ error: "Use ?id= or /api/roster" }, { status: 400 });
}
