import { NextResponse } from "next/server";
import { SAMPLE_DOCS } from "@/lib/documents";
import { scan } from "@/lib/pipeline";
import { pdfText } from "@/lib/statement/read";
import { load } from "@/lib/store";

const MAX_BYTES = 10 * 1024 * 1024;

// Plant a real statement: it replaces the sample statement and the board is rescanned.
// The file stays on this machine (.data/); only a configured Claude key sends text to Anthropic.
export async function POST(req: Request) {
  const form = await req.formData();
  const pid = String(form.get("pid") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is over 10 MB" }, { status: 400 });
  const buf = await file.arrayBuffer();
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  let text: string;
  try {
    text = isPdf ? await pdfText(buf) : new TextDecoder().decode(buf);
  } catch {
    return NextResponse.json({ error: "Couldn't read that file. Try a CSV export from your bank." }, { status: 400 });
  }
  if (!text.trim()) return NextResponse.json({ error: "That file has no readable text (is it a scanned image?). Try a CSV export." }, { status: 400 });
  const prev = load(pid).docs.filter((d) => d.id.startsWith("upload_"));
  const doc = { id: `upload_${prev.length + 1}`, name: file.name, text: text.slice(0, 200_000) };
  const docs = [...SAMPLE_DOCS.filter((d) => d.id !== "statements"), ...prev, doc];
  const state = await scan(docs, pid);
  const found = state.tiles.filter((t) => t.balanceIds.some((id) => id.startsWith(`up_${doc.id.replace(/\W/g, "")}_`))).length;
  return NextResponse.json({ state, found, kind: isPdf ? "pdf" : "csv" });
}
