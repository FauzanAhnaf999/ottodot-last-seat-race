import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  const classes = store.getTrialClasses();
  return NextResponse.json({ data: classes });
}
