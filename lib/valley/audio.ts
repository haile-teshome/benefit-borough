import { SPECIES_OF_VOICE } from "./people";
// All sound is synthesized with Web Audio: no asset files, nothing to license, works offline.
// Browsers only allow audio after a user gesture, so the title screen's Play button calls start().

type Wave = OscillatorType;

// How each animal "talks": pitch, its contour (start, middle, end), length, vocal formant, wobble.
type Call = { base: number; glide: [number, number, number]; dur: number; gap: number; wave: Wave; formant: [number, number, number]; q: number; vibrato: [number, number]; vol: number; breath?: number };
const CALLS: Record<string, Call> = {
  cow: { base: 125, glide: [0.9, 1.12, 0.82], dur: 0.5, gap: 0.1, wave: "sawtooth", formant: [380, 620, 420], q: 3, vibrato: [5, 0.025], vol: 0.5 }, // mooo
  cat: { base: 560, glide: [0.85, 1.22, 0.78], dur: 0.3, gap: 0.08, wave: "sawtooth", formant: [900, 1700, 800], q: 4, vibrato: [7, 0.02], vol: 0.35 }, // meow
  husky: { base: 190, glide: [1.25, 1, 0.8], dur: 0.14, gap: 0.1, wave: "sawtooth", formant: [800, 650, 500], q: 2, vibrato: [0, 0], vol: 0.45, breath: 0.12 }, // woof
  shiba: { base: 330, glide: [1.3, 1.05, 0.85], dur: 0.12, gap: 0.09, wave: "sawtooth", formant: [1100, 900, 700], q: 2.5, vibrato: [0, 0], vol: 0.4, breath: 0.1 }, // arf
  rabbit: { base: 1300, glide: [1, 1.3, 1.1], dur: 0.08, gap: 0.07, wave: "triangle", formant: [1800, 2400, 2000], q: 1.5, vibrato: [0, 0], vol: 0.3 }, // squeak
  bear: { base: 82, glide: [1, 1.12, 0.9], dur: 0.32, gap: 0.1, wave: "sawtooth", formant: [420, 520, 360], q: 2, vibrato: [17, 0.06], vol: 0.55 }, // hrrumph
  deer: { base: 360, glide: [1, 1.06, 0.95], dur: 0.28, gap: 0.09, wave: "sawtooth", formant: [1000, 1200, 900], q: 5, vibrato: [11, 0.05], vol: 0.35 }, // meh-eh-eh
  fox: { base: 780, glide: [1.3, 1, 0.72], dur: 0.1, gap: 0.08, wave: "sawtooth", formant: [1500, 1200, 950], q: 4, vibrato: [0, 0], vol: 0.35 }, // yip
  alpaca: { base: 250, glide: [1, 1.08, 0.94], dur: 0.34, gap: 0.08, wave: "triangle", formant: [650, 760, 520], q: 3, vibrato: [6, 0.02], vol: 0.45 }, // hmmm
};

class ValleyAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private timer: number | null = null;
  private nextNote = 0;
  private step = 0;
  muted = false;

  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.22;
    this.musicBus.connect(this.master);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.55;
    this.sfxBus.connect(this.master);
    this.startMusic();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  private tone(freq: number, at: number, dur: number, opts: { wave?: Wave; vol?: number; bus?: GainNode | null; slideTo?: number; attack?: number } = {}) {
    const ctx = this.ctx;
    const bus = opts.bus ?? this.sfxBus;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.wave ?? "square";
    osc.frequency.setValueAtTime(freq, at);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, at + dur);
    const vol = opts.vol ?? 0.2;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + (opts.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private noise(at: number, dur: number, vol: number, bus: GainNode | null = this.sfxBus, hp = 4000) {
    const ctx = this.ctx;
    if (!ctx || !bus) return;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(at);
  }

  private get now() { return this.ctx?.currentTime ?? 0; }

  // ---- effects ----
  click() { this.tone(880, this.now, 0.05, { wave: "square", vol: 0.08 }); }
  prompt() { const t = this.now; this.tone(660, t, 0.07, { vol: 0.07 }); this.tone(990, t + 0.06, 0.08, { vol: 0.07 }); }
  step2() { this.noise(this.now, 0.04, 0.05, this.sfxBus, 1800); }
  blip() { this.tone(520 + Math.random() * 80, this.now, 0.03, { wave: "square", vol: 0.035 }); }
  // An old-fashioned phone ring: two quick trills.
  ring() { const t = this.now; for (let i = 0; i < 2; i++) for (let j = 0; j < 8; j++) { const at = t + i * 0.55 + j * 0.05; this.tone(j % 2 ? 1046 : 1318, at, 0.045, { wave: "square", vol: 0.06 }); } }
  // Picking up the receiver: a plastic clack, then a little "hello" chirp.
  pickup() { const t = this.now; this.noise(t, 0.05, 0.18, this.sfxBus, 1800); this.tone(180, t, 0.06, { wave: "square", vol: 0.08 }); this.tone(660, t + 0.12, 0.08, { wave: "triangle", vol: 0.1 }); this.tone(880, t + 0.2, 0.12, { wave: "triangle", vol: 0.1 }); }
  dial() { const t = this.now; for (let i = 0; i < 2; i++) { this.tone(440, t + i * 0.5, 0.35, { wave: "sine", vol: 0.12 }); this.tone(480, t + i * 0.5, 0.35, { wave: "sine", vol: 0.12 }); } }
  coins() {
    const t = this.now;
    [1318, 1568, 2093, 1760, 2637].forEach((f, i) => this.tone(f, t + i * 0.07, 0.18, { wave: "square", vol: 0.09 }));
    this.tone(523, t, 0.5, { wave: "triangle", vol: 0.12 });
    this.tone(784, t + 0.12, 0.5, { wave: "triangle", vol: 0.1 });
  }
  harvest() { const t = this.now; this.tone(330, t, 0.12, { wave: "triangle", vol: 0.15, slideTo: 660 }); this.noise(t, 0.12, 0.08, this.sfxBus, 900); }
  refuse() { const t = this.now; this.tone(196, t, 0.22, { wave: "sawtooth", vol: 0.1 }); this.tone(147, t + 0.2, 0.35, { wave: "sawtooth", vol: 0.1 }); }
  hmm() { this.tone(220, this.now, 0.4, { wave: "triangle", vol: 0.1, slideTo: 180 }); }
  gift() { const t = this.now; [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, t + i * 0.09, 0.3, { wave: "triangle", vol: 0.12 })); }
  sprout() { const t = this.now; [392, 523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.08, 0.22, { wave: "triangle", vol: 0.12 })); }

  // ---- animal voices: each word becomes one call in the character's own animal voice ----
  private line: GainNode | null = null;
  stopLine() {
    if (this.line && this.ctx) this.line.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    this.line = null;
  }
  animal(text: string, species: string, who: string) {
    const ctx = this.ctx, out = this.sfxBus;
    if (!ctx || !out) return;
    this.stopLine();
    const bus = ctx.createGain();
    bus.gain.value = 1.4;
    bus.connect(out);
    this.line = bus;
    const c = CALLS[species] ?? CALLS.alpaca;
    // Every character sounds a little different: their own pitch, from who they are.
    let h = 0;
    for (const ch of who) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pitch = 0.86 + ((h % 1000) / 1000) * 0.32;
    let at = ctx.currentTime + 0.03;
    const words = text.split(/\s+/).filter(Boolean).slice(0, 16);
    words.forEach((w, i) => {
      const jitter = 0.92 + ((h >> (i % 16)) & 7) / 40;
      const f = c.base * pitch * jitter * (w.endsWith("?") ? 1.15 : 1);
      this.call(c, f, at, bus);
      at += c.dur * (w.length > 6 ? 1.15 : 1) + c.gap + (/[,;:]$/.test(w) ? 0.14 : /[.!?]$/.test(w) ? 0.3 : 0);
    });
  }
  private call(c: Call, f: number, at: number, bus: GainNode) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = c.wave;
    const [a, b, z] = c.glide;
    osc.frequency.setValueAtTime(f * a, at);
    osc.frequency.linearRampToValueAtTime(f * b, at + c.dur * 0.4);
    osc.frequency.linearRampToValueAtTime(f * z, at + c.dur);
    // Vibrato (a cow's wobble, a deer's bleat, a bear's grumble).
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = c.vibrato[0];
    depth.gain.value = f * c.vibrato[1];
    lfo.connect(depth).connect(osc.frequency);
    // A vocal formant that moves through the call ("mmm-ooo", "mee-ow").
    const form = ctx.createBiquadFilter();
    form.type = "bandpass";
    form.Q.value = c.q;
    form.frequency.setValueAtTime(c.formant[0], at);
    form.frequency.linearRampToValueAtTime(c.formant[1], at + c.dur * 0.45);
    form.frequency.linearRampToValueAtTime(c.formant[2], at + c.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(c.vol, at + Math.min(0.04, c.dur * 0.25));
    g.gain.setValueAtTime(c.vol, at + c.dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, at + c.dur);
    osc.connect(form).connect(g).connect(bus);
    osc.start(at); lfo.start(at);
    osc.stop(at + c.dur + 0.05); lfo.stop(at + c.dur + 0.05);
    if (c.breath) this.noise(at, Math.min(0.08, c.dur), c.breath, bus, 1200);
  }

  // ---- music: a gentle pentatonic farm loop ----
  private startMusic() {
    if (!this.ctx) return;
    this.nextNote = this.ctx.currentTime + 0.1;
    const bpm = 92;
    const eighth = 60 / bpm / 2;
    // C major pentatonic melody, 32 eighths; 0 = rest.
    const mel = [659, 0, 784, 659, 587, 0, 523, 0, 587, 659, 0, 523, 440, 0, 0, 0, 523, 0, 587, 659, 784, 0, 880, 784, 659, 0, 587, 0, 523, 0, 0, 0];
    const bass = [131, 131, 165, 165, 110, 110, 98, 98];
    const tick = () => {
      if (!this.ctx) return;
      while (this.nextNote < this.ctx.currentTime + 0.25) {
        const s = this.step % 32;
        const f = mel[s];
        if (f) this.tone(f, this.nextNote, eighth * 1.6, { wave: "triangle", vol: 0.16, bus: this.musicBus, attack: 0.01 });
        if (s % 4 === 0) this.tone(bass[Math.floor(s / 4)], this.nextNote, eighth * 3.6, { wave: "sine", vol: 0.22, bus: this.musicBus, attack: 0.02 });
        if (s % 2 === 1) this.noise(this.nextNote, 0.03, 0.02, this.musicBus, 7000);
        this.nextNote += eighth;
        this.step++;
      }
    };
    this.timer = window.setInterval(tick, 60);
  }
}

export const sound = new ValleyAudio();

// Spoken lines. "people": each character's Cartesia voice, streamed and cached (see /api/voice),
// and preloaded as you walk up to someone so it starts the moment the dialogue opens.
// "animals": the same lines as the character's own animal calls, synthesized instantly.
export type VoiceMode = "people" | "animals";
let mode: VoiceMode = (() => { try { return localStorage.getItem("ev-voices") === "animals" ? "animals" : "people"; } catch { return "people"; } })();
export const voiceMode = () => mode;
export function setVoiceMode(m: VoiceMode) {
  mode = m;
  try { localStorage.setItem("ev-voices", m); } catch { /* a per-device preference */ }
}

let voiceEl: HTMLAudioElement | null = null;
const primed = new Map<string, Promise<HTMLAudioElement | null>>();
function voiceLine(text: string, voice?: string) {
  const key = `${voice ?? ""}|${text}`;
  let p = primed.get(key);
  if (!p) {
    p = fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice }) })
      .then(async (res) => {
        if (res.status !== 200) return null;
        const { id, cached } = (await res.json()) as { id: string; cached: boolean };
        const url = `/api/voice?id=${id}`;
        // Have the server render (and cache) the line now, while you're still walking up; playing it
        // later is then a read from the cache.
        if (!cached) void fetch(url).then((r) => r.arrayBuffer()).catch(() => {});
        const a = new Audio(url);
        a.preload = "auto";
        a.load();
        return a;
      })
      .catch(() => null);
    primed.set(key, p);
    if (primed.size > 30) primed.delete(primed.keys().next().value!);
  }
  return p;
}

// Get a line ready ahead of time (walking up to a villager, the next line of a dialogue).
export function primeVoice(text: string | undefined, voice?: string) {
  if (text && !sound.muted && mode === "people") void voiceLine(text, voice);
}

export function stopVoice() { voiceEl?.pause(); sound.stopLine(); }

export async function speak(text: string, voice?: string) {
  if (sound.muted || !text) return;
  stopVoice();
  if (mode === "animals") { sound.animal(text, SPECIES_OF_VOICE.get(voice ?? "") ?? "alpaca", voice ?? "ruth"); return; }
  const a = await voiceLine(text, voice);
  if (!a) return; // voice is a nicety; the text is already on screen
  voiceEl?.pause();
  voiceEl = a;
  a.currentTime = 0;
  void a.play().catch(() => {});
}
export function playAudio(src: string) {
  stopVoice();
  voiceEl = new Audio(src);
  void voiceEl.play().catch(() => {});
}
