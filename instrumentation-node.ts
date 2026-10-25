import { pollShifts } from "./lib/autopilot";

// Every minute, ask Convex which farmers' night shifts are due and run them.
setInterval(() => void pollShifts(), 60_000);
