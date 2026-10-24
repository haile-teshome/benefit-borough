import type { Action, DispatchResult } from "../types";

// Forms, chats and app taps on the user's behalf (payroll forms, fee refunds, disputes,
// cancellations). The scripted steps run as text; each provider's API is the seam for a real one.
export async function requestAction(action: Action): Promise<DispatchResult> {
  const p = action.payload;
  const transcript = [`Connecting to ${p.to}…`, ...String(p.steps).split("|"), "Done — confirmation saved."];
  return { status: "confirmed", confirmation: String(p.confirmation), transcript, integration: `${p.to} (mock)`, mocked: true };
}
