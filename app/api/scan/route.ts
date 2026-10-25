import { NextResponse } from "next/server";
import { SAMPLE_DOCS, type SourceDoc } from "@/lib/documents";
import { NESSIE_COVERS, nessieEnabled, nessieStatement } from "@/lib/integrations/nessie";
import { scan } from "@/lib/pipeline";

// With Nessie configured, checking and card activity comes from the live sandbox bank; the sample
// statement keeps only the account terms Nessie can't hold (bonus rules, promo terms, miles, renewals).
async function defaultDocs(): Promise<SourceDoc[]> {
  if (!nessieEnabled()) return SAMPLE_DOCS;
  try {
    const live = await nessieStatement();
    const terms = SAMPLE_DOCS.map((d) => (d.id === "statements" ? { ...d, text: d.text.split("\n").filter((l) => !NESSIE_COVERS.some((re) => re.test(l))).join("\n") } : d));
    return [...terms, live];
  } catch (err) {
    console.warn("[nessie] couldn't read accounts, using the sample statement", err);
    return SAMPLE_DOCS;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { docs?: SourceDoc[]; pid?: string };
  const docs = body.docs?.length ? body.docs : await defaultDocs();
  return NextResponse.json({ state: await scan(docs, body.pid) });
}
