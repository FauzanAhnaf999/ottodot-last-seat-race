import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET(req: NextRequest) {
  const parentId = req.nextUrl.searchParams.get("parentId");
  if (parentId) {
    const students = store.getStudentsByParent(parentId);
    return NextResponse.json({ data: students });
  }
  return NextResponse.json({ data: store.getStudents() });
}
