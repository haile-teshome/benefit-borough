import { NextResponse } from "next/server";
import { checkPayday, simulatePaycheck } from "@/lib/payday";

// POST check: look for a new paycheck in Nessie. POST simulate: (demo) deposit one in the sandbox, then check.
export async function POST(req: Request) {
  const { pid, action } = (await req.json()) as { pid: string; action: "check" | "simulate" };
  try {
    if (action === "simulate") await simulatePaycheck();
    return NextResponse.json(await checkPayday(pid));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
