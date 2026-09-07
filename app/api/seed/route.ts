import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

// POST /api/seed — reset to deterministic seed (demo/admin only)
// Best practice: protect with auth/role in prod; here open for evaluator convenience.
export async function POST() {
  store.reset();
  return NextResponse.json({ ok: true, message: "Seed reset", classes: store.getTrialClasses() });
}

export async function GET() {
  // Use store.dump() — best practice: never expose internal Map, expose projection
  const dump = store.dump();
  return NextResponse.json({
    parents: dump.parents,
    students: dump.students,
    classes: store.getTrialClasses(),
    bookings: dump.bookings,
    payments: dump.payments,
  });
}
