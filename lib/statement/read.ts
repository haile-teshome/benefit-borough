import { getDocumentProxy } from "unpdf";

// PDF text, rebuilt line by line from the text layer so each transaction stays on one line.
export async function pdfText(buf: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items as { str?: string; transform?: number[] }[]) {
      if (!it.str?.trim() || !it.transform) continue;
      const y = Math.round(it.transform[5] / 2) * 2;
      rows.set(y, [...(rows.get(y) ?? []), { x: it.transform[4], s: it.str }]);
    }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r.sort((a, b) => a.x - b.x).map((c) => c.s.trim()).join("  "));
    pages.push(lines.join("\n"));
  }
  return pages.join("\n");
}
