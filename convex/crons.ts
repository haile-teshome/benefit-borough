import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
// Mark Autopilot shifts due at each farmer's chosen local hour.
crons.interval("autopilot tick", { minutes: 5 }, internal.autopilot.tick);
export default crons;
