import { NextResponse } from "next/server";
import { applyCheckin, transcribe, understand } from "@/lib/checkin";
import { hydrate, load } from "@/lib/store";

// The check-in, out loud: Cartesia transcribes what you said, Claude maps it onto your plans'
// questions, and the farm rescans. Send audio (multipart "audio") or typed text ("text").
export async function POST(req: Request) {
  try {
    let pid: string | null = null, said = "";
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      pid = String(form.get("pid") ?? "");
      const audio = form.get("audio");
      if (audio instanceof Blob && audio.size) said = await transcribe(audio, (audio as File).name || "checkin.webm");
      else said = String(form.get("text") ?? "");
    } else {
      const b = (await req.json()) as { pid?: string; text?: string };
      pid = b.pid ?? null; said = b.text ?? "";
    }
    if (!said.trim()) return NextResponse.json({ heard: "", reply: "I didn't hear anything. Hold the button while you talk.", changes: [] });
    await hydrate(pid);
    const { updates, changes, reply } = await understand(said, load(pid));
    const out = changes.length ? await applyCheckin(pid, updates, "voice") : null;
    return NextResponse.json({ heard: said, reply, changes, state: out?.state ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
