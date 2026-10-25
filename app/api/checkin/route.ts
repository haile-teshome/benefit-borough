import { NextResponse } from "next/server";
import { buildDoc, type Answers } from "@/lib/library/build";
import { scan } from "@/lib/pipeline";
import { hydrate, load, save } from "@/lib/store";

// The weekly check-in: update answers for the library plans you planted (credits used, balances),
// then rescan so the farm matches your week. Harvests already confirmed stay confirmed.
export async function POST(req: Request) {
  const { pid, updates } = (await req.json()) as { pid?: string; updates: Record<string, Answers> };
  await hydrate(pid);
  const s = load(pid);
  const docs = s.docs.map((d) => {
    const plan = d.meta?.plan;
    if (!plan || !updates?.[plan]) return d;
    return buildDoc({ plan, answers: { ...(d.meta!.answers as Answers), ...updates[plan] } }) ?? d;
  });
  const state = await scan(docs, pid);
  state.checkedInAt = new Date().toISOString();
  save(state, pid);
  return NextResponse.json({ state });
}
