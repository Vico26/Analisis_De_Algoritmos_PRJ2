// /arkanoid-ga/game.js
// Motor Arkanoid con velocidad de bola constante.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a ^ (a >>> 15);
    t = Math.imul(t, t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    t ^= t >>> 14;
    return (t >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class ArkanoidConfig {
  constructor() {
    this.width = 480; this.height = 320;
    this.paddle_w = 70; this.paddle_h = 10; this.paddle_y = 300; this.paddle_spd = 4.0;
    this.ball_r = 4; this.ball_spd = 2.8;
    this.rows = 5; this.cols = 10;
    this.brick_w = 42; this.brick_h = 12; this.brick_pad = 2;
    this.offset_x = 9; this.offset_y = 40;
    this.lives = 3;
    this.horizonT = 5000; this.episodes = 2;
  }
}

export class Arkanoid {
  constructor(cfg = new ArkanoidConfig(), seed = 1234) {
    this.cfg = cfg;
    this.baseSeed = seed >>> 0;
    this.rng = mulberry32(this.baseSeed);
    this.reset(seed);
  }

  // Mantener módulo de velocidad constante para evitar "aceleración fantasma".
  _setSpeedMag(spd) {
    const mag = Math.hypot(this.bdx, this.bdy);
    if (mag > 1e-9) {
      const k = spd / mag;
      this.bdx *= k;
      this.bdy *= k;
    } else {
      // Reinyectar un pequeño vector hacia arriba si quedó en cero por alguna colisión extraña.
      this.bdx = 0;
      this.bdy = -spd;
    }
  }

  reset(seed) {
    if (seed !== undefined) this.rng = mulberry32(seed >>> 0);
    const c = this.cfg;
    this.px = c.width / 2 - c.paddle_w / 2;
    this.py = c.paddle_y;
    const angle = (Math.PI / 4) + this.rng() * (Math.PI / 2);
    const spd = c.ball_spd;
    this.bx = c.width / 2; this.by = c.height * 0.6;
    this.bdx = Math.cos(angle) * spd; this.bdy = -Math.abs(Math.sin(angle) * spd);
    this._setSpeedMag(c.ball_spd); // ← asegurar módulo inicial
    this.bricksAlive = Array.from({ length: c.rows * c.cols }, () => true);
    this.score = 0; this.lives = c.lives; this.t = 0; this.done = false;
  }

  _brickRect(idx) {
    const c = this.cfg;
    const r = Math.floor(idx / c.cols), co = idx % c.cols;
    const x = c.offset_x + co * (c.brick_w + c.brick_pad);
    const y = c.offset_y + r * (c.brick_h + c.brick_pad);
    return [x, y, c.brick_w, c.brick_h];
  }

  observe() {
    const c = this.cfg;
    const dist_x = this.bx - (this.px + c.paddle_w / 2);
    const dist_y = this.by - this.py;
    const bricksLeft = this.bricksAlive.reduce((s, a) => s + (a ? 1 : 0), 0);
    const fx = (this.bx / c.width) * 2 - 1;
    const fy = (this.by / c.height) * 2 - 1;
    const fdx = clamp(this.bdx / (c.ball_spd * 1.2), -1, 1);
    const fdy = clamp(this.bdy / (c.ball_spd * 1.2), -1, 1);
    const fpx = (this.px / (c.width - c.paddle_w)) * 2 - 1;
    const fdxp = clamp(dist_x / (c.width / 2), -1, 1);
    const fdyp = clamp(dist_y / c.height, -1, 1);
    const fbr = bricksLeft / (c.rows * c.cols);
    return [fx, fy, fdx, fdy, fpx, fdxp, fdyp, fbr];
  }

  step(action) {
    if (this.done) return { reward: 0, done: true };
    const c = this.cfg;

    // Mover paleta
    this.px += c.paddle_spd * (action || 0);
    this.px = clamp(this.px, 0, c.width - c.paddle_w);

    // Mover bola
    this.bx += this.bdx;
    this.by += this.bdy;

    let reward = 0.01;

    // Paredes
    let touched = false;
    if (this.bx <= c.ball_r || this.bx >= c.width - c.ball_r) { this.bdx = -this.bdx; touched = true; }
    if (this.by <= c.ball_r) { this.bdy = -this.bdy; touched = true; }
    if (touched) this._setSpeedMag(c.ball_spd); // ← mantener módulo tras paredes

    // Paleta
    const hitPaddle = (this.py - c.ball_r - 1) <= this.by &&
                      this.by <= (this.py + c.paddle_h) &&
                      (this.px - c.ball_r) <= this.bx &&
                      this.bx <= (this.px + c.paddle_w + c.ball_r) &&
                      this.bdy > 0;
    if (hitPaddle) {
      const hit_pos = (this.bx - (this.px + c.paddle_w / 2)) / (c.paddle_w / 2); // [-1,1]
      this.bdy = -Math.abs(this.bdy);
      this.bdx = clamp(this.bdx + hit_pos * 0.9, -c.ball_spd * 1.5, c.ball_spd * 1.5);
      this._setSpeedMag(c.ball_spd); // ← asegurar módulo tras paleta
      reward += 0.2;
    }

    // Ladrillos
    for (let i = 0; i < this.bricksAlive.length; i++) {
      if (!this.bricksAlive[i]) continue;
      const [x, y, w, h] = this._brickRect(i);
      if ((x - c.ball_r) <= this.bx && this.bx <= (x + w + c.ball_r) &&
          (y - c.ball_r) <= this.by && this.by <= (y + h + c.ball_r)) {
        this.bricksAlive[i] = false;
        this.score += 1;
        reward += 10.0;
        this.bdy = -this.bdy;
        this._setSpeedMag(c.ball_spd); // ← asegurar módulo tras ladrillo
        break;
      }
    }

    // Victoria
    const allBricksDestroyed = this.bricksAlive.every(brick => !brick);
    if (allBricksDestroyed) {
      this.done = true;
      reward += 50.0;
      return { reward, done: true };
    }

    // Caída de la bola
    if (this.by >= c.height - c.ball_r) {
      this.lives -= 1;
      reward -= 3.0;
      if (this.lives <= 0) {
        this.done = true;
        reward -= 10.0;
      } else {
        const angle = (Math.PI / 4) + this.rng() * (Math.PI / 2);
        this.bx = c.width / 2;
        this.by = c.height * 0.6;
        this.bdx = Math.cos(angle) * c.ball_spd;
        this.bdy = -Math.abs(Math.sin(angle) * c.ball_spd);
        this._setSpeedMag(c.ball_spd); // ← robustez en respawn
      }
    }

    this.t += 1;

    if (this.t >= c.horizonT) {
      this.done = true;
      const progress = this.bricksAlive.filter(brick => !brick).length / this.bricksAlive.length;
      reward += progress * 20.0;
    }

    return { reward, done: this.done };
  }

  render(ctx) {
    const c = this.cfg;
    ctx.fillStyle = "#0b0c10";
    ctx.fillRect(0, 0, c.width, c.height);

    // Ladrillos
    ctx.fillStyle = "#7dd3fc";
    for (let i = 0; i < this.bricksAlive.length; i++) {
      if (!this.bricksAlive[i]) continue;
      const [x, y, w, h] = this._brickRect(i);
      ctx.fillRect(x, y, w, h);
    }

    // Paleta
    ctx.fillStyle = "#9aa3b2";
    ctx.fillRect(this.px, this.py, c.paddle_w, c.paddle_h);

    // Bola
    ctx.beginPath();
    ctx.arc(this.bx, this.by, c.ball_r, 0, Math.PI * 2);
    ctx.fillStyle = "#e8eaf1";
    ctx.fill();

    // HUD
    ctx.fillStyle = "#e8eaf1";
    ctx.font = "12px monospace";
    ctx.fillText(`Score: ${this.score} Lives: ${this.lives}`, 10, 20);
  }
}
