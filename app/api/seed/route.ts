import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function POST() {
  store.reset();
  return NextResponse.json({ ok: true, message: "Seed reset", classes: store.getTrialClasses() });
}

export async function GET() {
  return NextResponse.json({
    parents: store.getParents(),
    students: store.getStudents(),
    classes: store.getTrialClasses(),
  });
}
