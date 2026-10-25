import { NextResponse } from "next/server";
import { claudeEnabled } from "@/lib/engine/claude";
import { apifyEnabled } from "@/lib/integrations/apify";
import { convexEnabled, hydrate, load } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const pid = new URL(req.url).searchParams.get("pid");
  await hydrate(pid);
  return NextResponse.json({
    state: load(pid),
    integrations: {
      claude: claudeEnabled(),
      cartesia: Boolean(process.env.CARTESIA_API_KEY && process.env.CARTESIA_VOICE_ID),
      nessie: Boolean(process.env.NESSIE_API_KEY && process.env.NESSIE_ACCOUNT_ID && process.env.NESSIE_PAYEE_ACCOUNT_ID),
      convex: convexEnabled(),
      apify: apifyEnabled(),
    },
  });
}
