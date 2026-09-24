/**
 * Procedural slot audio (Web Audio API).
 *
 * Every sound is synthesised at runtime, so the prototype ships with no audio
 * files and no licensing questions. Browsers only allow audio after a user
 * gesture; call `unlock()` from a click handler before anything else.
 */

type Ctx = AudioContext;

class SlotAudio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private spinLoop: number | null = null;
  private muted = false;
  private musicOn = true;

  get ready(): boolean {
    return this.ctx !== null;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isMusicOn(): boolean {
    return this.musicOn;
  }

  unlock(): void {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.8;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
      const sfx = ctx.createGain();
      sfx.gain.value = 0.9;
      sfx.connect(master);
      const music = ctx.createGain();
      music.gain.value = 0.22;
      music.connect(master);

      const len = ctx.sampleRate * 1.5;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this.master = master;
      this.sfxBus = sfx;
      this.musicBus = music;
      this.noise = buf;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (this.musicOn) this.startMusic();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    }
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  // ─── primitives ──────────────────────────────────────────────────────────

  private tone(
    freq: number,
    start: number,
    dur: number,
    opts: {
      type?: OscillatorType;
      gain?: number;
      attack?: number;
      to?: number;
      bus?: GainNode | null;
      detune?: number;
    } = {},
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(freq, start);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, start + dur);
    if (opts.detune) osc.detune.value = opts.detune;
    const peak = opts.gain ?? 0.3;
    const attack = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(opts.bus ?? this.sfxBus!);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private noiseBurst(
    start: number,
    dur: number,
    opts: { gain?: number; type?: BiquadFilterType; freq?: number; to?: number; q?: number } = {},
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type ?? "bandpass";
    filter.frequency.setValueAtTime(opts.freq ?? 1200, start);
    if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, start + dur);
    filter.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.3, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter).connect(g).connect(this.sfxBus!);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.05);
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  // ─── sound effects ───────────────────────────────────────────────────────

  click(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.tone(1800, t, 0.05, { type: "triangle", gain: 0.12, to: 900 });
  }

  betChange(up: boolean): void {
    if (!this.ctx) return;
    const t = this.now();
    this.tone(up ? 660 : 520, t, 0.08, { type: "triangle", gain: 0.14, to: up ? 990 : 390 });
  }

  spinStart(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.noiseBurst(t, 0.45, { freq: 400, to: 3200, gain: 0.35, q: 0.8 });
    this.tone(180, t, 0.35, { type: "sawtooth", gain: 0.08, to: 520 });
    this.startSpinLoop();
  }

  private startSpinLoop(): void {
    this.stopSpinLoop();
    let n = 0;
    this.spinLoop = window.setInterval(() => {
      if (!this.ctx) return;
      const t = this.now();
      this.noiseBurst(t, 0.03, { freq: 2600 + (n % 3) * 300, gain: 0.08, q: 6 });
      n += 1;
    }, 55);
  }

  stopSpinLoop(): void {
    if (this.spinLoop !== null) {
      window.clearInterval(this.spinLoop);
      this.spinLoop = null;
    }
  }

  reelStop(index: number, anticipation = false): void {
    if (!this.ctx) return;
    const t = this.now();
    this.tone(110 - index * 6, t, 0.18, { type: "sine", gain: 0.55, to: 45 });
    this.noiseBurst(t, 0.07, { freq: 900, gain: 0.25, q: 1.5 });
    this.tone(1320 + index * 110, t + 0.01, 0.09, { type: "triangle", gain: 0.06 });
    if (anticipation) this.anticipation();
  }

  anticipation(): void {
    if (!this.ctx) return;
    const t = this.now();
    for (let i = 0; i < 6; i += 1) {
      this.tone(440 * Math.pow(2, i / 12), t + i * 0.11, 0.14, { type: "square", gain: 0.05 });
    }
  }

  scatterLand(): void {
    if (!this.ctx) return;
    const t = this.now();
    [987.8, 1318.5, 1975.5].forEach((f, i) =>
      this.tone(f, t + i * 0.05, 0.6, { type: "sine", gain: 0.16 }),
    );
    this.noiseBurst(t, 0.5, { type: "highpass", freq: 6000, gain: 0.08 });
  }

  smallWin(): void {
    if (!this.ctx) return;
    const t = this.now();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.tone(f, t + i * 0.07, 0.35, { type: "triangle", gain: 0.18 }),
    );
  }

  lineHighlight(i: number): void {
    if (!this.ctx) return;
    const t = this.now();
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
    this.tone(scale[i % scale.length]!, t, 0.25, { type: "sine", gain: 0.14 });
    this.tone(scale[i % scale.length]! * 2, t, 0.15, { type: "triangle", gain: 0.04 });
  }

  coinTick(): void {
    if (!this.ctx) return;
    const t = this.now();
    const f = 2200 + Math.random() * 900;
    this.tone(f, t, 0.07, { type: "square", gain: 0.035 });
    this.tone(f * 1.5, t + 0.015, 0.06, { type: "sine", gain: 0.04 });
  }

  bigWin(): void {
    if (!this.ctx) return;
    const t = this.now();
    const chord = [261.63, 329.63, 392, 523.25];
    const melody = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    melody.forEach((f, i) => {
      this.tone(f, t + i * 0.12, 0.3, { type: "square", gain: 0.07 });
      this.tone(f, t + i * 0.12, 0.35, { type: "triangle", gain: 0.12 });
    });
    chord.forEach((f) => {
      this.tone(f, t + 0.84, 1.8, { type: "sawtooth", gain: 0.05, attack: 0.05 });
      this.tone(f / 2, t + 0.84, 1.8, { type: "triangle", gain: 0.12, attack: 0.05 });
    });
    this.noiseBurst(t + 0.84, 1.4, { type: "highpass", freq: 7000, gain: 0.07 });
  }

  thunder(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.noiseBurst(t, 0.12, { type: "highpass", freq: 3000, gain: 0.5 });
    this.noiseBurst(t + 0.05, 2.2, { type: "lowpass", freq: 900, to: 90, gain: 0.8, q: 0.5 });
    this.tone(55, t + 0.05, 1.6, { type: "sine", gain: 0.5, to: 30 });
  }

  bonusStart(): void {
    if (!this.ctx) return;
    this.thunder();
    const t = this.now() + 0.4;
    [392, 493.88, 587.33, 783.99].forEach((f, i) =>
      this.tone(f, t + i * 0.16, 0.9, { type: "sawtooth", gain: 0.05, attack: 0.03 }),
    );
  }

  error(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.tone(220, t, 0.15, { type: "square", gain: 0.08 });
    this.tone(180, t + 0.12, 0.2, { type: "square", gain: 0.08 });
  }

  // ─── ambient music ───────────────────────────────────────────────────────

  private startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    // A slow Dorian arpeggio over a drone: "temple at night", not a jingle.
    const roots = [146.83, 130.81, 116.54, 130.81]; // D, C, Bb, C
    const arp = [0, 7, 12, 15, 19, 15, 12, 7];
    const stepDur = 0.32;
    const tick = () => {
      if (!this.ctx || !this.musicBus) return;
      const t = this.now() + 0.05;
      const bar = Math.floor(this.musicStep / 8) % roots.length;
      const root = roots[bar]!;
      const step = this.musicStep % 8;
      if (step === 0) {
        this.tone(root / 2, t, stepDur * 8.2, { type: "triangle", gain: 0.5, attack: 0.4, bus: this.musicBus });
        this.tone(root * 1.5, t, stepDur * 8.2, { type: "sine", gain: 0.18, attack: 0.8, bus: this.musicBus, detune: 6 });
      }
      const semis = arp[step]!;
      this.tone(root * 2 * Math.pow(2, semis / 12), t, stepDur * 1.8, {
        type: "sine",
        gain: 0.22,
        attack: 0.01,
        bus: this.musicBus,
      });
      this.musicStep += 1;
    };
    tick();
    this.musicTimer = window.setInterval(tick, stepDur * 1000);
  }

  private stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  dispose(): void {
    this.stopMusic();
    this.stopSpinLoop();
  }
}

let instance: SlotAudio | null = null;

export function getSlotAudio(): SlotAudio {
  if (!instance) instance = new SlotAudio();
  return instance;
}

export type { SlotAudio };
