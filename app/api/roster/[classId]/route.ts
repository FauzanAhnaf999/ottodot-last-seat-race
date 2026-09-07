import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  const { classId } = await params;
  const trialClass = store.getTrialClass(classId);
  if (!trialClass) {
    return NextResponse.json({ error: "Class not found", code: "CLASS_NOT_FOUND" }, { status: 404 });
  }
  const roster = store.getRoster(classId);
  return NextResponse.json({
    data: {
      trialClass,
      roster,
      confirmed_count: roster.length,
      capacity: trialClass.capacity,
    },
  });
}
