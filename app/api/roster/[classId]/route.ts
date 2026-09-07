import { NextRequest } from "next/server";
import { store } from "@/lib/store";
import { idSchema } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { jsonOk, jsonError, logRequest } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/roster/[classId] — teacher/admin view
// Returns ONLY confirmed bookings (authoritative roster).
// Best practice: roster is a projection, not a table; computed from bookings WHERE status='confirmed'.
// Never trust UI count — this endpoint is source of truth before class starts.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  logRequest(_req);
  try {
    const { classId } = await params;
    const parsed = idSchema.safeParse(classId);
    if (!parsed.success) throw new AppError("BAD_REQUEST", "Invalid classId");

    const trialClass = store.getTrialClass(classId);
    if (!trialClass) throw new AppError("CLASS_NOT_FOUND", "Class not found");

    const roster = store.getRoster(classId);
    return jsonOk({ trialClass, roster, confirmed_count: roster.length, capacity: trialClass.capacity });
  } catch (err) {
    return jsonError(err);
  }
}
