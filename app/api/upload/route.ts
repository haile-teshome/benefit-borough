import { NextResponse } from "next/server";
import { SAMPLE_DOCS } from "@/lib/documents";
import { scan } from "@/lib/pipeline";
import { pdfText } from "@/lib/statement/read";
import { load } from "@/lib/store";
import { claudeEnabled, transcribe } from "@/lib/engine/claude";

const MAX_BYTES = 10 * 1024 * 1024;

// Plant a real document: a bank or card statement (CSV/PDF), a benefits guide or plan summary
// (PDF/text), or a photo or scan of either, which Claude transcribes first. It's added to the
// documents you already have (your planted plans stay) and the board is rescanned.
// The file stays on this machine (.data/); only a configured Claude key sends it to Anthropic.
export async function POST(req: Request) {
  const form = await req.formData();
  const pid = String(form.get("pid") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is over 10 MB" }, { status: 400 });
  const buf = await file.arrayBuffer();
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const image = /^image\/(png|jpeg|webp|gif)$/.test(file.type) ? file.type : /\.(png|jpe?g|webp|gif)$/i.test(file.name) ? `image/${file.name.split(".").pop()!.toLowerCase().replace("jpg", "jpeg")}` : null;
  let text = "";
  let read: "pdf" | "csv" | "text" | "scan" = isPdf ? "pdf" : /\.csv$/i.test(file.name) ? "csv" : "text";
  try {
    if (image || isPdf) {
      if (isPdf) text = await pdfText(buf);
      // A photo, or a PDF with no text layer (a scan): have Claude read it.
      if (!text.trim() && claudeEnabled()) { text = await transcribe(buf, image ?? "application/pdf"); read = "scan"; }
    } else text = new TextDecoder().decode(buf);
  } catch {
    return NextResponse.json({ error: "Couldn't read that file. Try a PDF, a CSV export, or a clear photo." }, { status: 400 });
  }
  if (!text.trim()) return NextResponse.json({ error: image ? "Reading photos needs Claude connected. Try a PDF or CSV instead." : "That file has no readable text. Try a PDF, a CSV export, or a clear photo." }, { status: 400 });
  // Keep what's already planted (library plans, earlier uploads); the sample person's documents
  // are only the starting point when nothing else is there yet.
  const have = load(pid).docs;
  const prev = have.filter((d) => d.id.startsWith("upload_"));
  const doc = { id: `upload_${prev.length + 1}`, name: file.name, text: text.slice(0, 200_000) };
  const planted = have.filter((d) => !d.id.startsWith("upload_") && d.id !== "statements");
  const docs = [...(planted.length ? planted : SAMPLE_DOCS.filter((d) => d.id !== "statements")), ...prev, doc];
  const state = await scan(docs, pid);
  const found = state.tiles.filter((t) => t.balanceIds.some((id) => id.startsWith(`up_${doc.id.replace(/\W/g, "")}_`))).length;
  return NextResponse.json({ state, found, kind: read });
}
