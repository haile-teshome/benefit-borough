import { hydrate, load } from "@/lib/store";

// Every open deadline as a calendar file (.ics) with alerts 3 days and 1 day before, plus a weekly
// check-in. Works with Apple Calendar, Google Calendar and Outlook.
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const day = (iso: string) => iso.replace(/-/g, "");
const next = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
// Fold long lines at 75 octets, as the iCalendar spec asks.
const fold = (line: string) => line.length <= 74 ? line : line.match(/.{1,73}/g)!.join("\r\n ");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pid = url.searchParams.get("pid");
  await hydrate(pid);
  const s = load(pid);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const game = `${url.origin}/valley`;
  const open = s.tiles.filter((t) => !s.done.includes(t.id) && t.daysLeft >= 0);
  const events = open.flatMap((t) => [
    "BEGIN:VEVENT",
    `UID:${t.id}-${pid ?? "default"}@benefitborough`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day(t.deadline)}`,
    `DTEND;VALUE=DATE:${day(next(t.deadline))}`,
    `SUMMARY:${esc(`Benefit Borough: ${t.title}${t.atStake ? ` (${usd(t.atStake)})` : ""}`)}`,
    `DESCRIPTION:${esc(`${t.headline}\nIf you do nothing: ${t.doNothing}\nOpen the borough: ${game}`)}`,
    `URL:${game}`,
    ...[3, 1].flatMap((d) => ["BEGIN:VALARM", "ACTION:DISPLAY", `TRIGGER:-P${d}D`, `DESCRIPTION:${esc(`${t.title} is due in ${d} day${d > 1 ? "s" : ""}`)}`, "END:VALARM"]),
    "END:VEVENT",
  ]);
  // Weekly check-in, Sundays at 10am local time: mark credits you used, update balances.
  const sunday = new Date(); sunday.setDate(sunday.getDate() + ((7 - sunday.getDay()) % 7 || 7));
  const checkin = [
    "BEGIN:VEVENT",
    `UID:weekly-checkin-${pid ?? "default"}@benefitborough`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${day(sunday.toISOString().slice(0, 10))}T100000`,
    `DTEND:${day(sunday.toISOString().slice(0, 10))}T101000`,
    "RRULE:FREQ=WEEKLY",
    "SUMMARY:Benefit Borough weekly check-in (2 minutes)",
    `DESCRIPTION:${esc(`Tick the credits you used, update a balance or two, and see what's due this week.\n${game}?checkin=1`)}`,
    `URL:${game}?checkin=1`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:PT0M", "DESCRIPTION:Benefit Borough check-in", "END:VALARM",
    "END:VEVENT",
  ];
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Benefit Borough//Deadlines//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Benefit Borough", ...events, ...checkin, "END:VCALENDAR"].map(fold).join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="benefit-borough.ics"', "Cache-Control": "no-store" } });
}
