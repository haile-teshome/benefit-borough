// Starts Ruth's Autopilot worker with the server (Node runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node");
}
