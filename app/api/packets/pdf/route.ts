import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { hydrate, load } from "@/lib/store";

// The filled claim form as a PDF you can upload, mail or keep. Watermarked until you submit it.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const pid = q.get("pid");
  await hydrate(pid);
  const pk = load(pid).packets?.find((x) => x.id === q.get("id"));
  if (!pk) return new Response("Unknown packet", { status: 404 });

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]);
  let y = 740;
  const ink = rgb(0.18, 0.13, 0.25), muted = rgb(0.45, 0.42, 0.5);
  const clean = (t: string) => t.replace(/[^\x20-\x7E]/g, (c) => ({ "—": "-", "–": "-", "’": "'", "“": '"', "”": '"', "·": "|", "…": "..." } as Record<string, string>)[c] ?? "");
  const wrap = (t: string, size: number, width: number, f = font) => {
    const words = clean(t).split(" "), out: string[] = [];
    let cur = "";
    for (const w of words) { const next = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(next, size) > width && cur) { out.push(cur); cur = w; } else cur = next; }
    if (cur) out.push(cur);
    return out;
  };
  const text = (t: string, x: number, size = 10, f = font, color = ink) => {
    for (const l of wrap(t, size, 532 - (x - 40), f)) { if (y < 60) { page = doc.addPage([612, 792]); y = 740; } page.drawText(l, { x, y, size, font: f, color }); y -= size + 4; }
  };

  text(pk.form, 40, 18, bold);
  text(`To: ${pk.submitTo}`, 40, 10, font, muted);
  text(`Prepared by Ruth (Benefit Borough) on ${new Date(pk.preparedAt).toLocaleDateString("en-US", { dateStyle: "long" })}. Packet ${pk.id}, fingerprint ${pk.hash}.`, 40, 9, font, muted);
  y -= 10;
  for (const f of pk.fields) {
    page.drawLine({ start: { x: 40, y: y + 12 }, end: { x: 572, y: y + 12 }, thickness: 0.4, color: rgb(0.85, 0.82, 0.88) });
    text(f.label, 40, 8, bold, muted);
    text(f.value || "________________________ (you fill this in)", 40, 11);
    y -= 4;
  }
  if (pk.message) { y -= 8; text("Message", 40, 12, bold); text(pk.message, 40, 10); }
  for (const a of pk.attachments) {
    y -= 8; text(`Attached: ${a.name}`, 40, 12, bold);
    for (const l of a.lines) text(l, 52, 9);
    if (a.cite) text(`Source: ${a.cite}`, 52, 8, font, muted);
  }
  y -= 16;
  text(pk.status === "submitted" ? `Signed and submitted by you on ${new Date(pk.submittedAt!).toLocaleString("en-US")}. Confirmation ${pk.confirmation}.` : "Signature: ______________________   Date: __________", 40, 11, bold);
  if (pk.status !== "submitted") for (const p of doc.getPages()) p.drawText("DRAFT - REVIEW BEFORE SUBMITTING", { x: 120, y: 380, size: 30, font: bold, color: rgb(0.85, 0.3, 0.3), opacity: 0.12, rotate: { type: "degrees", angle: 35 } as never });

  return new Response(Buffer.from(await doc.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pk.id}.pdf"` } });
}
