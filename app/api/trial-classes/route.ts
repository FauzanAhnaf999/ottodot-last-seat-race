import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

// GET /api/trial-classes — list with live availability
// Best practice: compute availability server-side (confirmed_count) — never trust client count.
// Add cache-control for demo: no-store because bookings are mutable frequently.
export async function GET() {
  const classes = await store.getTrialClasses();
  return NextResponse.json(
    { data: classes },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    }
  );
}
