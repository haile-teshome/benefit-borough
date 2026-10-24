import { NextResponse } from "next/server";
import { SAMPLE_DOCS, type SourceDoc } from "@/lib/documents";
import { scan } from "@/lib/pipeline";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { docs?: SourceDoc[] };
  const docs = body.docs?.length ? body.docs : SAMPLE_DOCS;
  return NextResponse.json({ state: await scan(docs) });
}
