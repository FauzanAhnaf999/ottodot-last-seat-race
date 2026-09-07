import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { idSchema } from "@/lib/validation";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const parentId = req.nextUrl.searchParams.get("parentId");
  if (parentId) {
    const parsed = idSchema.safeParse(parentId);
    if (!parsed.success) return jsonError(parsed.error);
    return NextResponse.json({ data: await store.getStudentsByParent(parentId) }, { headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ data: await store.getStudents() }, { headers: { "cache-control": "no-store" } });
}
