// The game clock follows real local time: when it's evening where you are, it's evening in the
// borough. A dev offset (window.__setHour) can shift it for testing.
let offsetMs = 0;

const now = () => new Date(Date.now() + offsetMs);

export function gameHour(d = now()) {
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

// Shift the clock so it reads hour h (dev tooling only); setHour(null) returns to real time.
export function setHour(h: number | null) {
  if (h == null) { offsetMs = 0; return; }
  offsetMs += ((h - gameHour() + 24) % 24) * 3600_000;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// 0 in full daylight, 1 in deep night; eases through dawn (5–7) and dusk (17.5–19.5).
export function nightAmount(h = gameHour()) {
  if (h < 12) return 1 - smooth(5, 7, h);
  return smooth(17.5, 19.5, h);
}

export function clockLabel(d = now()) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

export function dateLabel(d = now()) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
