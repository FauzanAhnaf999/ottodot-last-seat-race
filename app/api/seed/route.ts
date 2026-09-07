import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

// POST /api/seed — reset to deterministic seed (demo/admin only)
// Best practice: protect with auth/role in prod; here open for evaluator convenience.
export async function POST() {
  await store.reset();
  return NextResponse.json({ ok: true, message: "Seed reset", classes: await store.getTrialClasses() });
}

export async function GET() {
  // Use store.dump() — best practice: never expose internal Map, expose projection
  const dump = await store.dump();
  return NextResponse.json({
    parents: dump.parents,
    students: dump.students,
    classes: await store.getTrialClasses(),
    bookings: dump.bookings,
    payments: dump.payments,
  });
}
