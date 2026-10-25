import { NextResponse } from "next/server";
import { runShift, setMandate } from "@/lib/autopilot";
import { hydrate, load, save } from "@/lib/store";
import type { Mandate } from "@/lib/types";

// Ruth's Autopilot. POST mandate: sign or change what she may do at night. POST run: start a shift
// now (for the demo). POST seen: you've read the morning report.
export async function POST(req: Request) {
  const b = (await req.json()) as { pid: string; action: "mandate" | "run" | "seen"; mandate?: Partial<Mandate> };
  try {
    if (b.action === "mandate") return NextResponse.json({ state: await setMandate(b.pid, b.mandate ?? {}) });
    if (b.action === "run") {
      await hydrate(b.pid);
      if (!load(b.pid).autopilot) await setMandate(b.pid, {});
      return NextResponse.json(await runShift(b.pid, "now"));
    }
    if (b.action === "seen") {
      await hydrate(b.pid);
      const s = load(b.pid);
      if (s.autopilot) { s.autopilot.seen = s.autopilot.reports[0]?.at; save(s, b.pid); }
      return NextResponse.json({ state: s });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
