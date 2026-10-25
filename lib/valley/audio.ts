// All sound is synthesized with Web Audio: no asset files, nothing to license, works offline.
// Browsers only allow audio after a user gesture, so the title screen's Play button calls start().

type Wave = OscillatorType;

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

// Spoken lines (Ruth, booking calls) via the Cartesia route; silent when muted or not configured.
let voiceEl: HTMLAudioElement | null = null;
export async function speak(text: string, voice?: string) {
  if (sound.muted || !text) return;
  try {
    const res = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice }) });
    if (res.status !== 200) return;
    playAudio(URL.createObjectURL(await res.blob()));
  } catch { /* voice is a nicety; the text is already on screen */ }
}
export function playAudio(src: string) {
  voiceEl?.pause();
  voiceEl = new Audio(src);
  void voiceEl.play().catch(() => {});
}
