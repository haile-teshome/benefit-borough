// One shared game clock: a full valley day lasts DAY_SECONDS of real time, starting at 7 AM.
// Six minutes means a 3-minute demo runs from morning to sunset.
export const DAY_SECONDS = 360;
const START_HOUR = 7;
let t0 = typeof performance !== "undefined" ? performance.now() : 0;

export function gameHour(now = performance.now()) {
  return (START_HOUR + ((now - t0) / 1000 / DAY_SECONDS) * 24) % 24;
}

// Jump the clock to a given hour (dev tooling and the title screen's restart).
export function setHour(h: number) {
  t0 = performance.now() - (((h - START_HOUR + 24) % 24) / 24) * DAY_SECONDS * 1000;
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

export function clockLabel(h = gameHour()) {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 6) * 10; // Stardew ticks in 10-minute steps
  const ampm = hh < 12 ? "am" : "pm";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}
