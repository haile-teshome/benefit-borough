import { NextResponse } from "next/server";
import { claudeEnabled } from "@/lib/engine/claude";
import { load } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    state: load(),
    integrations: {
      claude: claudeEnabled(),
      cartesia: Boolean(process.env.CARTESIA_API_KEY && process.env.CARTESIA_VOICE_ID),
      nessie: Boolean(process.env.NESSIE_API_KEY && process.env.NESSIE_ACCOUNT_ID && process.env.NESSIE_PAYEE_ACCOUNT_ID),
    },
  });
}
