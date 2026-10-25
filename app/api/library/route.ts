import { NextResponse } from "next/server";
import { LIBRARY } from "@/lib/library/catalog";
import { buildDoc, type Pick } from "@/lib/library/build";
import { scan } from "@/lib/pipeline";
import { load } from "@/lib/store";

// The plan library: GET lists it; POST plants the plans someone picked (plus their answers).
// Picked plans replace the sample documents; uploaded statements are kept.
export function GET() {
  return NextResponse.json({ plans: LIBRARY });
}

export async function POST(req: Request) {
  const { pid, picks } = (await req.json()) as { pid?: string; picks: Pick[] };
  const docs = (picks ?? []).map(buildDoc).filter((d): d is NonNullable<typeof d> => Boolean(d));
  if (!docs.length) return NextResponse.json({ error: "Pick at least one plan" }, { status: 400 });
  const uploads = load(pid).docs.filter((d) => d.id.startsWith("upload_"));
  const state = await scan([...docs, ...uploads], pid);
  return NextResponse.json({ state, found: state.tiles.length });
}
