/**
 * Tiny canvas particle engine for coins and sparks.
 *
 * The render loop only runs while particles are alive, so an idle machine costs
 * nothing. Coordinates are CSS pixels relative to the canvas.
 */

interface Particle {
  kind: "coin" | "spark" | "bolt";
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  spin: number;
  phase: number;
  hue: number;
  gravity: number;
}

export class ParticleField {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private raf: number | null = null;
  private last = 0;
  private dpr = 1;
  private resizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
  }

  get width(): number {
    return this.canvas.width / this.dpr;
  }

  get height(): number {
    return this.canvas.height / this.dpr;
  }

  /** Coins exploding outwards from a point (a win on a cell). */
  coinBurst(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const speed = 260 + Math.random() * 420;
      this.particles.push({
        kind: "coin",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 1.3 + Math.random() * 0.9,
        size: 7 + Math.random() * 7,
        spin: 6 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        hue: 0,
        gravity: 900,
      });
    }
    this.kick();
  }

  /** Coins raining from the top edge (big-win celebration). */
  coinRain(count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.particles.push({
        kind: "coin",
        x: Math.random() * this.width,
        y: -20 - Math.random() * this.height * 0.6,
        vx: (Math.random() - 0.5) * 80,
        vy: 120 + Math.random() * 260,
        life: 0,
        maxLife: 3.5 + Math.random() * 1.5,
        size: 9 + Math.random() * 9,
        spin: 4 + Math.random() * 8,
        phase: Math.random() * Math.PI * 2,
        hue: 0,
        gravity: 380,
      });
    }
    this.kick();
  }

  sparks(x: number, y: number, count: number, hue = 45): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 260;
      this.particles.push({
        kind: "spark",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.6,
        size: 1.5 + Math.random() * 2.5,
        spin: 0,
        phase: 0,
        hue: hue + (Math.random() - 0.5) * 20,
        gravity: 120,
      });
    }
    this.kick();
  }

  clear(): void {
    this.particles = [];
  }

  private kick(): void {
    if (this.raf !== null) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.maxLife || p.y > this.height + 40) continue;
      p.vy += p.gravity * dt;
      p.vx *= 0.995;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.phase += p.spin * dt;
      const fade = Math.min(1, (p.maxLife - p.life) / 0.35);
      if (p.kind === "coin") this.drawCoin(p, fade);
      else this.drawSpark(p, fade);
      alive.push(p);
    }
    this.particles = alive;

    if (alive.length > 0) {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      this.raf = null;
      ctx.clearRect(0, 0, this.width, this.height);
    }
  };

  private drawCoin(p: Particle, alpha: number): void {
    const ctx = this.ctx;
    const squash = Math.abs(Math.cos(p.phase));
    const w = Math.max(0.12, squash) * p.size;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    const g = ctx.createLinearGradient(-w, -p.size, w, p.size);
    g.addColorStop(0, "#fff4c2");
    g.addColorStop(0.45, "#f1c24a");
    g.addColorStop(1, "#8f5e12");
    ctx.fillStyle = "#7a4d0c";
    ctx.beginPath();
    ctx.ellipse(0, 1.5, w, p.size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, w, p.size, 0, 0, Math.PI * 2);
    ctx.fill();
    if (squash > 0.35) {
      ctx.strokeStyle = "rgba(122,77,12,0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.68, p.size * 0.68, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSpark(p: Particle, alpha: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `hsl(${p.hue} 100% 70%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.35;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  dispose(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.particles = [];
  }
}
