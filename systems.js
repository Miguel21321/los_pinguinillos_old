/**
 * MOTOR PRINCIPAL DE FÍSICA, CUERDA VERLET, BOCADILLOS DE DIÁLOGO, SARDINAS Y UI
 */

const FUNNY_FALL_QUOTES = [
  ["¡Te dije que a la de tres!", "¿Contabas el cero o empezabas en el uno?"],
  ["¡Mis patitas no sienten nada!", "¡Al menos hemos vuelto a la bandera!"],
  ["¡Tira de la cuerda, que peso poco!", "¡Si desayunaste 14 sardinas, Fredo!"],
  ["¡Eso ha sido culpa de la gravedad!", "¡Sí, claro, échale la culpa a Newton!"],
  ["¡Casi lo teníamos!", "Define «casi», porque hemos caído 80 metros."]
];

class Penguin {
  constructor(id, name, x, y, color, hatTrim) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.hatTrim = hatTrim;
    this.w = 30;
    this.h = 38;
    this.reset(x, y);
  }
  reset(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.onIce = false;
    this.touchingWall = false;
    this.grabbing = false;
    this.soloHold = false;
    this.stamina = 100;
    this.facing = 1;
    this.anim = 0;
    this.jumpHeld = false;
    this.jumpHoldT = 0;
    this.speech = '';
    this.speechT = 0;
  }
  say(text, duration = 3.5) {
    this.speech = text;
    this.speechT = duration;
  }
}

class RopeVerlet {
  constructor(n, totalLen, x, y) {
    this.n = n;
    this.seg = totalLen / (n - 1);
    this.pts = [];
    for (let i = 0; i < n; i++) this.pts.push({ x, y, ox: x, oy: y });
  }
  reset(x1, y1, x2, y2) {
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      this.pts[i] = { x: px, y: py, ox: px, oy: py };
    }
  }
  update(dt, p1, p2, platforms) {
    const g = 980 * dt * dt;
    for (let i = 1; i < this.n - 1; i++) {
      const p = this.pts[i];
      const vx = (p.x - p.ox) * 0.985;
      const vy = (p.y - p.oy) * 0.985;
      p.ox = p.x; p.oy = p.y;
      p.x += vx; p.y += vy + g;
    }

    for (let k = 0; k < 14; k++) {
      this.pts[0].x = p1.x + p1.w / 2;
      this.pts[0].y = p1.y + p1.h * 0.58;
      this.pts[this.n - 1].x = p2.x + p2.w / 2;
      this.pts[this.n - 1].y = p2.y + p2.h * 0.58;

      for (let i = 0; i < this.n - 1; i++) {
        const a = this.pts[i], b = this.pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        if (d > this.seg) {
          const diff = (d - this.seg) / d;
          const ox = dx * diff * 0.5, oy = dy * diff * 0.5;
          if (i !== 0) { a.x += ox; a.y += oy; }
          if (i + 1 !== this.n - 1) { b.x -= ox; b.y -= oy; }
        }
      }

      for (let i = 1; i < this.n - 1; i++) {
        const pt = this.pts[i];
        for (const pl of platforms) {
          if (pl.broken) continue;
          if (pt.x > pl.x && pt.x < pl.x + pl.w && pt.y > pl.y && pt.y < pl.y + pl.h) {
            if (pt.y - pl.y < 14) pt.y = pl.y;
          }
        }
      }
    }

    const c1x = p1.x + p1.w / 2, c1y = p1.y + p1.h * 0.58;
    const c2x = p2.x + p2.w / 2, c2y = p2.y + p2.h * 0.58;
    const dx = c2x - c1x, dy = c2y - c1y;
    const dist = Math.hypot(dx, dy) || 0.001;
    const maxL = this.seg * (this.n - 1);
    this.taut = dist > maxL * 0.94;

    if (dist > maxL) {
      const over = dist - maxL, nx = dx / dist, ny = dy / dist;
      const a1 = p1.grabbing || (p1.onGround && Math.abs(p1.vx) < 15);
      const a2 = p2.grabbing || (p2.onGround && Math.abs(p2.vx) < 15);
      let w1 = 0.5, w2 = 0.5;
      if (p1.grabbing && !p2.grabbing) { w1 = 0.02; w2 = 0.98; }
      else if (p2.grabbing && !p1.grabbing) { w1 = 0.98; w2 = 0.02; }
      else if (a1 && !a2) { w1 = 0.14; w2 = 0.86; }
      else if (a2 && !a1) { w1 = 0.86; w2 = 0.14; }

      p1.x += nx * over * w1; p1.y += ny * over * w1;
      p2.x -= nx * over * w2; p2.y -= ny * over * w2;

      const rvx = p2.vx - p1.vx, rvy = p2.vy - p1.vy;
      const dot = rvx * nx + rvy * ny;
      if (dot > 0) {
        const imp = dot * 0.85;
        p1.vx += nx * imp * w1; p1.vy += ny * imp * w1;
        p2.vx -= nx * imp * w2; p2.vy -= ny * imp * w2;
      }
    }
  }
}

window.Game = {
  canvas: null, ctx: null, w: 1280, h: 720,
  mode: 'local', lvlIdx: 0, lvl: null,
  running: false, paused: false,
  timer: 0, falls: 0, cpIdx: 0, soloIdx: 0,
  p1: null, p2: null, rope: null,
  platforms: [], hazards: [], checkpoints: [], collectibles: [], dialogues: [],
  rocks: [], rockTimers: [], particles: [], snow: [],
  windDir: 0, windT: 0, lowestPlatY: 300,
  cam: { x: 0, y: 0, zoom: 1 },

  init() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    const resize = () => {
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.canvas.width = this.w;
      this.canvas.height = this.h;
    };
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < 120; i++) {
      this.snow.push({
        x: Math.random() * 2000,
        y: Math.random() * 1200,
        r: 1.5 + Math.random() * 2.5,
        vy: 35 + Math.random() * 55,
        vx: -15 + Math.random() * 30
      });
    }

    SaveSys.init();
    Input.init();
    UI.init();
    this.loadLevel(0, 0, 0, 0);

    let last = performance.now(), acc = 0;
    const step = 1 / 60;
    const loop = now => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (this.running && !this.paused) {
        acc += dt;
        while (acc >= step) {
          this.updateFixed(step);
          acc -= step;
        }
      }
      this.render(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  loadLevel(idx, startCp = 0, savedTimer = 0, savedFalls = 0) {
    this.lvlIdx = idx;
    const src = LEVELS[idx];
    this.lvl = src;
    this.timer = savedTimer;
    this.falls = savedFalls;
    this.cpIdx = Math.min(startCp, src.checkpoints.length - 1);
    this.soloIdx = 0;

    this.platforms = src.platforms.map(p => ({ ...p, crackT: 0, cracking: false, broken: false, respT: 0 }));
    this.hazards = src.hazards.map(h => ({ ...h }));
    this.checkpoints = src.checkpoints.map((c, i) => ({ ...c, reached: i <= this.cpIdx }));
    this.collectibles = (src.collectibles || []).map(f => ({ ...f, collected: SaveSys.hasFish(f.id) }));
    this.dialogues = (src.dialogues || []).map(d => ({ ...d, triggered: false }));
    this.rocks = [];
    this.rockTimers = (src.rockSpawners || []).map(s => ({ ...s, t: 0 }));
    this.particles = [];
    this.windDir = 0; this.windT = 2.5;

    this.lowestPlatY = Math.max(...this.platforms.map(p => p.y)) + 340;

    const sp = this.checkpoints[this.cpIdx] || src.spawn;
    this.p1 = new Penguin(1, 'Pingo', sp.x - 22, sp.y - 38, '#38bdf8', '#bae6fd');
    this.p2 = new Penguin(2, 'Fredo', sp.x + 18, sp.y - 38, '#fb923c', '#fed7aa');
    this.rope = new RopeVerlet(12, src.ropeLength, sp.x, sp.y - 22);
    this.rope.reset(this.p1.x, this.p1.y, this.p2.x, this.p2.y);

    this.cam.x = sp.x; this.cam.y = sp.y - 80; this.cam.zoom = 1;
    this.updateHUD();
  },

  respawnAtCP(countFall = true) {
    if (countFall) {
      this.falls++;
      Sfx.fall();
    }
    const cp = this.checkpoints[this.cpIdx] || this.lvl.spawn;
    this.p1.reset(cp.x - 22, cp.y - 38);
    this.p2.reset(cp.x + 18, cp.y - 38);
    this.rope.reset(this.p1.x, this.p1.y, this.p2.x, this.p2.y);
    this.platforms.forEach(p => { p.cracking = false; p.broken = false; p.crackT = 0; });
    this.spawnParticles(cp.x, cp.y - 20, '#7dd3fc', 18);

    if (countFall) {
      const pair = FUNNY_FALL_QUOTES[Math.floor(Math.random() * FUNNY_FALL_QUOTES.length)];
      this.p1.say(pair[0], 3.2);
      setTimeout(() => { if (this.p2) this.p2.say(pair[1], 3.2); }, 900);
    }

    SaveSys.saveCheckpoint(this.lvlIdx, this.cpIdx, this.timer, this.falls, this.mode);
    this.updateHUD();
  },

  spawnParticles(x, y, color, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 140;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life: 0.35 + Math.random() * 0.3,
        max: 0.65,
        color
      });
    }
  },

  updateFixed(dt) {
    if (this.mode === 'online' && Net.role === 'guest') {
      const cmd = Input.get('solo', 0, null).p1;
      Net.sendT += dt;
      if (Net.sendT >= 0.033 && Net.conn && Net.connected) {
        Net.sendT = 0;
        try { Net.conn.send({ type: 'in', state: cmd }); } catch (e) {}
      }
      return;
    }

    this.timer += dt;
    if (this.p1.speechT > 0) this.p1.speechT -= dt;
    if (this.p2.speechT > 0) this.p2.speechT -= dt;

    // Alternar pingüino en Modo Solo
    if (Input.swapHit) {
      Input.swapHit = false;
      if (this.mode === 'solo') {
        const prev = this.soloIdx === 0 ? this.p1 : this.p2;
        if ((prev.onGround || prev.touchingWall || prev.grabbing) && prev.stamina > 10) {
          prev.soloHold = true;
          prev.grabbing = true;
        }
        this.soloIdx = this.soloIdx === 0 ? 1 : 0;
        const next = this.soloIdx === 0 ? this.p1 : this.p2;
        next.soloHold = false;
        Sfx.pick();
      }
    }

    // Ventisca dinámica con aviso en pantalla
    if (this.lvl.windForce > 0) {
      this.windT -= dt;
      if (this.windT <= 0) {
        this.windDir = this.windDir === 0 ? (Math.random() > 0.5 ? 1 : -1) * this.lvl.windForce : 0;
        this.windT = this.windDir === 0 ? 3.5 : 2.5;
        if (this.windDir !== 0 && Math.random() < 0.35) {
          this.p1.say("¡Ráfaga de viento! ¡Agárrate con S/▼!", 2.4);
        }
      }
    } else this.windDir = 0;

    // Plataformas frágiles
    for (const pl of this.platforms) {
      if (pl.type === 'fragile') {
        if (pl.cracking && !pl.broken) {
          pl.crackT += dt;
          if (pl.crackT >= 0.85) {
            pl.broken = true; pl.respT = 3.0; Sfx.crack();
            this.spawnParticles(pl.x + pl.w / 2, pl.y + pl.h / 2, '#bae6fd', 14);
          }
        } else if (pl.broken) {
          pl.respT -= dt;
          if (pl.respT <= 0) { pl.broken = false; pl.cracking = false; pl.crackT = 0; }
        }
      }
    }

    // Rocas
    for (const rs of this.rockTimers) {
      rs.t += dt;
      if (rs.t >= rs.interval) {
        rs.t = 0;
        this.rocks.push({ x: rs.x + (Math.random() * 140 - 70), y: rs.y, r: 15, vy: 70 });
      }
    }
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const rk = this.rocks[i];
      rk.vy += 650 * dt; rk.y += rk.vy * dt;
      for (const p of [this.p1, this.p2]) {
        if (Math.hypot((p.x + p.w / 2) - rk.x, (p.y + p.h / 2) - rk.y) < rk.r + 15) {
          this.respawnAtCP(true); return;
        }
      }
      if (rk.y > this.lowestPlatY) this.rocks.splice(i, 1);
    }

    const cmds = Input.get(this.mode, this.soloIdx, Net.guestIn);
    this.stepPenguin(this.p1, cmds.p1, this.p2, dt);
    this.stepPenguin(this.p2, cmds.p2, this.p1, dt);
    this.rope.update(dt, this.p1, this.p2, this.platforms);

    // Disparadores de diálogos de historia
    for (const dg of this.dialogues) {
      if (!dg.triggered) {
        const d1 = Math.hypot(this.p1.x - dg.x, this.p1.y - dg.y);
        const d2 = Math.hypot(this.p2.x - dg.x, this.p2.y - dg.y);
        if (d1 < 95 || d2 < 95) {
          dg.triggered = true;
          const first = dg.speaker === 2 ? this.p2 : this.p1;
          const second = dg.speaker === 2 ? this.p1 : this.p2;
          first.say(dg.text, 3.8);
          if (dg.nextText) {
            setTimeout(() => { if (second) second.say(dg.nextText, 3.8); }, 1500);
          }
        }
      }
    }

    // Sardinas Doradas coleccionables
    for (const fish of this.collectibles) {
      if (!fish.collected) {
        const d1 = Math.hypot((this.p1.x + 15) - fish.x, (this.p1.y + 19) - fish.y);
        const d2 = Math.hypot((this.p2.x + 15) - fish.x, (this.p2.y + 19) - fish.y);
        if (d1 < 34 || d2 < 34) {
          fish.collected = true;
          Sfx.fish();
          SaveSys.collectFish(fish.id);
          this.spawnParticles(fish.x, fish.y, '#fbbf24', 20);
          const finder = d1 < d2 ? this.p1 : this.p2;
          finder.say("🐟 ¡Sardina Dorada pa' la saca!", 3.0);
          toast(`🐟 ¡Sardina Dorada encontrada! (${SaveSys.totalFishes()}/15)`);
        }
      }
    }

    // Checkpoints
    for (let i = 0; i < this.checkpoints.length; i++) {
      const cp = this.checkpoints[i];
      if (!cp.reached) {
        const d1 = Math.hypot((this.p1.x + 15) - cp.x, (this.p1.y + 19) - cp.y);
        const d2 = Math.hypot((this.p2.x + 15) - cp.x, (this.p2.y + 19) - cp.y);
        if (d1 < 55 || d2 < 55) {
          cp.reached = true;
          this.cpIdx = Math.max(this.cpIdx, i);
          Sfx.cp();
          this.spawnParticles(cp.x, cp.y - 25, '#34d399', 16);
          SaveSys.saveCheckpoint(this.lvlIdx, this.cpIdx, this.timer, this.falls, this.mode);
          toast(`💾 Checkpoint ${this.cpIdx + 1}/${this.checkpoints.length} guardado`);
        }
      }
    }

    // Meta
    const g = this.lvl.goal;
    const inGoal = p => p.x + p.w > g.x && p.x < g.x + g.w && p.y + p.h > g.y && p.y < g.y + g.h;
    if (inGoal(this.p1) && inGoal(this.p2)) {
      this.onWin(false);
      return;
    }

    // Caída al vacío (si ambos caen muy por debajo de su último checkpoint)
    const cpRefY = (this.checkpoints[this.cpIdx] ? this.checkpoints[this.cpIdx].y : 0) + 460;
    if (Math.max(this.p1.y, this.p2.y) > Math.max(this.lowestPlatY, cpRefY)) {
      this.respawnAtCP(true);
      return;
    }

    if (this.mode === 'online' && Net.role === 'host' && Net.connected && Net.conn) {
      Net.sendT += dt;
      if (Net.sendT >= 0.04) {
        Net.sendT = 0;
        try {
          Net.conn.send({
            type: 'st', t: this.timer, f: this.falls, cp: this.cpIdx,
            p1: { x: this.p1.x, y: this.p1.y, vx: this.p1.vx, vy: this.p1.vy, g: this.p1.grabbing, s: this.p1.stamina, f: this.p1.facing, a: this.p1.anim },
            p2: { x: this.p2.x, y: this.p2.y, vx: this.p2.vx, vy: this.p2.vy, g: this.p2.grabbing, s: this.p2.stamina, f: this.p2.facing, a: this.p2.anim },
            rp: this.rope.pts.map(pt => [Math.round(pt.x), Math.round(pt.y)])
          });
        } catch (e) {}
      }
    }

    this.updateHUD();
  },

  stepPenguin(p, cmd, other, dt) {
    const wantGrab = cmd.grab || p.soloHold;
    if (cmd.left || cmd.right || cmd.jump) p.soloHold = false;

    const canAnchor = (p.onGround || p.touchingWall) && p.stamina > 0;
    if (wantGrab && canAnchor) {
      if (!p.grabbing) { Sfx.pick(); this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#e0f2fe', 5); }
      p.grabbing = true;
      p.vx = 0;
      p.vy = p.touchingWall && !p.onGround ? (cmd.jump ? -145 : 0) : 0;
      if (p.vy < 0) p.anim += dt * 12;
      p.stamina = Math.max(0, p.stamina - 19 * dt);
      if (p.stamina <= 0) { p.grabbing = false; p.soloHold = false; p.say("¡Se me resbala el piolet!", 2.0); }
    } else {
      p.grabbing = false;
      if (p.onGround) p.stamina = Math.min(100, p.stamina + 60 * dt);
    }

    if (!p.grabbing) {
      const accel = p.onGround ? (p.onIce ? 540 : 1480) : 960;
      const maxSpd = p.onIce ? 315 : 250;
      if (cmd.left) {
        p.vx = Math.max(-maxSpd, p.vx - accel * dt);
        p.facing = -1;
        p.anim += dt * 11;
      } else if (cmd.right) {
        p.vx = Math.min(maxSpd, p.vx + accel * dt);
        p.facing = 1;
        p.anim += dt * 11;
      } else {
        const fric = p.onGround ? (p.onIce ? 0.985 : 0.78) : 0.95;
        p.vx *= Math.pow(fric, dt * 60);
      }

      if (this.windDir !== 0) p.vx += this.windDir * (p.onGround ? 195 : 340) * dt;

      // Salto calibrado (118 px máx de altura, impulso extra si cuelga de cuerda tensa)
      const hangingOnTautRope = !p.onGround && this.rope.taut && (other.grabbing || other.onGround) && p.y > other.y + 30;
      if (cmd.jump && !p.jumpHeld && (p.onGround || hangingOnTautRope)) {
        p.vy = hangingOnTautRope ? -495 : -450;
        p.onGround = false; p.jumpHeld = true; p.jumpHoldT = 0.19;
        Sfx.jump();
        this.spawnParticles(p.x + p.w / 2, p.y + p.h, '#fff', 7);
      }
      if (cmd.jump && p.jumpHoldT > 0) {
        p.vy -= 520 * dt; p.jumpHoldT -= dt;
      } else {
        p.jumpHoldT = 0;
      }
      if (!cmd.jump) p.jumpHeld = false;

      p.vy = Math.min(780, p.vy + 1150 * dt);
    }

    p.x += p.vx * dt;
    p.touchingWall = false;
    for (const pl of this.platforms) {
      if (pl.broken) continue;
      if (p.x + p.w > pl.x && p.x < pl.x + pl.w && p.y + p.h > pl.y + 4 && p.y < pl.y + pl.h - 4) {
        if (p.vx > 0) p.x = pl.x - p.w;
        else if (p.vx < 0) p.x = pl.x + pl.w;
        p.vx = 0;
        if (pl.type === 'climbWall') p.touchingWall = true;
      }
      if (pl.type === 'climbWall' && p.y + p.h > pl.y && p.y < pl.y + pl.h) {
        if (Math.abs((p.x + p.w) - pl.x) <= 5 || Math.abs(p.x - (pl.x + pl.w)) <= 5) p.touchingWall = true;
      }
    }

    const wasGround = p.onGround;
    p.y += p.vy * dt;
    p.onGround = false; p.onIce = false;
    for (const pl of this.platforms) {
      if (pl.broken) continue;
      if (p.x + p.w > pl.x + 3 && p.x < pl.x + pl.w - 3 && p.y + p.h >= pl.y && p.y < pl.y + pl.h) {
        if (p.vy >= 0 && (p.y + p.h - p.vy * dt) <= pl.y + 15) {
          p.y = pl.y - p.h; p.vy = 0; p.onGround = true;
          if (pl.type === 'ice') p.onIce = true;
          if (pl.type === 'fragile' && !pl.cracking) pl.cracking = true;
          if (!wasGround) { Sfx.land(); this.spawnParticles(p.x + p.w / 2, p.y + p.h, '#e2e8f0', 4); }
        } else if (p.vy < 0 && (p.y - p.vy * dt) >= pl.y + pl.h - 12) {
          p.y = pl.y + pl.h; p.vy = 0;
        }
      }
    }

    for (const hz of this.hazards) {
      if (p.x + p.w > hz.x + 4 && p.x < hz.x + hz.w - 4 && p.y + p.h > hz.y + 4 && p.y < hz.y + hz.h) {
        this.respawnAtCP(true); return;
      }
    }
  },

  applyNet(d) {
    this.timer = d.t; this.falls = d.f; this.cpIdx = d.cp;
    const lerp = (a, b, f) => a + (b - a) * f;
    this.p1.x = lerp(this.p1.x, d.p1.x, 0.45); this.p1.y = lerp(this.p1.y, d.p1.y, 0.45);
    this.p1.grabbing = d.p1.g; this.p1.stamina = d.p1.s; this.p1.facing = d.p1.f; this.p1.anim = d.p1.a || 0;
    this.p2.x = lerp(this.p2.x, d.p2.x, 0.45); this.p2.y = lerp(this.p2.y, d.p2.y, 0.45);
    this.p2.grabbing = d.p2.g; this.p2.stamina = d.p2.s; this.p2.facing = d.p2.f; this.p2.anim = d.p2.a || 0;
    if (d.rp && d.rp.length === this.rope.pts.length) {
      for (let i = 0; i < d.rp.length; i++) {
        this.rope.pts[i].x = d.rp[i][0]; this.rope.pts[i].y = d.rp[i][1];
      }
    }
    this.updateHUD();
  },

  onWin(fromNet) {
    this.running = false;
    Sfx.win();
    SaveSys.saveWin(this.lvlIdx, this.timer, this.falls, this.mode);
    if (this.mode === 'online' && Net.role === 'host' && Net.conn && !fromNet) {
      try { Net.conn.send({ type: 'win' }); } catch (e) {}
    }
    UI.showWin();
  },

  togglePause() {
    this.paused = !this.paused;
    document.getElementById('pauseMenu').classList.toggle('hidden', !this.paused);
  },

  fmtTime(s) {
    const m = Math.floor(s / 60), sec = (s % 60).toFixed(1);
    return `${String(m).padStart(2, '0')}:${sec.padStart(4, '0')}`;
  },

  updateHUD() {
    const fishesInLvl = (this.collectibles || []).filter(f => f.collected).length;
    const totalInLvl = (this.collectibles || []).length;
    document.getElementById('hudLevel').textContent = `${this.lvl.id}. ${this.lvl.name} · 🐟 ${fishesInLvl}/${totalInLvl}`;
    document.getElementById('hudCP').textContent = `${this.cpIdx + 1}/${this.checkpoints.length}`;
    document.getElementById('hudTime').textContent = this.fmtTime(this.timer);
    document.getElementById('hudFalls').textContent = this.falls;
    const s1 = document.getElementById('stam1'), s2 = document.getElementById('stam2');
    s1.style.width = `${this.p1.stamina}%`;
    s2.style.width = `${this.p2.stamina}%`;
    s1.classList.toggle('stam-low', this.p1.stamina < 28);
    s2.classList.toggle('stam-low', this.p2.stamina < 28);
  },

  render(dt) {
    const ctx = this.ctx, w = this.w, h = this.h;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#071022');
    grad.addColorStop(0.6, '#122645');
    grad.addColorStop(1, '#1e3a5f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Montañas con parallax
    const drawMtn = (par, col, baseH, amp) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 100; x += 90) {
        const wx = x + this.cam.x * par;
        const py = h - baseH - Math.abs(Math.sin(wx * 0.0022) * amp + Math.cos(wx * 0.0051) * (amp * 0.55));
        ctx.lineTo(x, py);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    };
    drawMtn(0.12, '#0c1b33', 220, 140);
    drawMtn(0.25, '#152a4a', 140, 110);
    drawMtn(0.42, '#1f395e', 70, 75);

    if (this.p1 && this.p2) {
      const mx = (this.p1.x + this.p2.x) / 2 + 15;
      const my = (this.p1.y + this.p2.y) / 2 - 35;
      const dist = Math.hypot(this.p1.x - this.p2.x, this.p1.y - this.p2.y);
      const tZoom = Math.max(0.68, Math.min(1.06, 900 / Math.max(520, dist + 340)));
      this.cam.x += (mx - this.cam.x) * 0.1;
      this.cam.y += (my - this.cam.y) * 0.1;
      this.cam.zoom += (tZoom - this.cam.zoom) * 0.08;
    }

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    // Carteles de historia y pistas
    for (const sg of (this.lvl.signs || [])) {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(sg.x - 4, sg.y, 8, 30);
      ctx.font = 'bold 13px Segoe UI, sans-serif';
      const tw = ctx.measureText(sg.text).width + 26;
      ctx.fillStyle = 'rgba(11, 21, 38, 0.9)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(sg.x - tw / 2, sg.y - 34, tw, 30, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.fillText(sg.text, sg.x, sg.y - 14);
    }

    // Plataformas
    for (const pl of this.platforms) {
      if (pl.broken) continue;
      const ox = pl.cracking ? (Math.random() - 0.5) * 5 : 0;
      if (pl.type === 'normal') {
        ctx.fillStyle = '#334155';
        ctx.beginPath(); ctx.roundRect(pl.x + ox, pl.y, pl.w, pl.h, 6); ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath(); ctx.roundRect(pl.x + ox, pl.y, pl.w, 12, 6); ctx.fill();
      } else if (pl.type === 'ice') {
        ctx.fillStyle = '#0284c7';
        ctx.beginPath(); ctx.roundRect(pl.x, pl.y, pl.w, pl.h, 6); ctx.fill();
        ctx.fillStyle = '#bae6fd';
        ctx.beginPath(); ctx.roundRect(pl.x, pl.y, pl.w, 11, 6); ctx.fill();
      } else if (pl.type === 'climbWall') {
        ctx.fillStyle = '#0369a1';
        ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 2;
        ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
      } else if (pl.type === 'fragile') {
        ctx.fillStyle = pl.cracking ? '#f87171' : '#7dd3fc';
        ctx.beginPath(); ctx.roundRect(pl.x + ox, pl.y, pl.w, pl.h, 5); ctx.fill();
      }
    }

    // Pinchos
    for (const hz of this.hazards) {
      const step = 18;
      for (let x = hz.x; x < hz.x + hz.w; x += step) {
        ctx.fillStyle = '#f43f5e';
        ctx.strokeStyle = '#ffe4e6';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, hz.y + hz.h);
        ctx.lineTo(x + step / 2, hz.y);
        ctx.lineTo(x + step, hz.y + hz.h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // Sardinas Doradas coleccionables
    const bob = Math.sin(performance.now() * 0.005) * 5;
    for (const fish of (this.collectibles || [])) {
      if (fish.collected) continue;
      ctx.save();
      ctx.translate(fish.x, fish.y + bob);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-18, -6);
      ctx.lineTo(-18, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(6, -1.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Checkpoints
    for (const cp of this.checkpoints) {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(cp.x - 2, cp.y - 46, 4, 46);
      ctx.fillStyle = cp.reached ? '#34d399' : '#f43f5e';
      ctx.beginPath();
      ctx.moveTo(cp.x + 2, cp.y - 46);
      ctx.lineTo(cp.x + 28, cp.y - 36);
      ctx.lineTo(cp.x + 2, cp.y - 26);
      ctx.closePath();
      ctx.fill();
    }

    // Meta (Iglú Dorado)
    const g = this.lvl.goal;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(g.x + g.w / 2, g.y + g.h, g.w / 2, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(g.x + g.w / 2, g.y + g.h, 18, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏁 CUMBRE', g.x + g.w / 2, g.y + 25);

    // Cuerda Verlet
    if (this.rope) {
      ctx.strokeStyle = this.rope.taut ? '#fbbf24' : '#d97706';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      this.rope.pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
      ctx.stroke();
    }

    // Pingüinos con sus pies naranjas y bocadillos de diálogo
    this.drawPenguin(ctx, this.p1, this.mode === 'solo' && this.soloIdx === 0);
    this.drawPenguin(ctx, this.p2, this.mode === 'solo' && this.soloIdx === 1);

    // Rocas
    for (const rk of this.rocks) {
      ctx.fillStyle = '#64748b';
      ctx.beginPath(); ctx.arc(rk.x, rk.y, rk.r, 0, Math.PI * 2); ctx.fill();
    }

    // Partículas
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt;
      if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Nieve atmosférica
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    for (const s of this.snow) {
      s.x += (s.vx + this.windDir * 220) * dt;
      s.y += s.vy * dt;
      if (s.y > h) s.y = -10;
      if (s.x > w) s.x = 0; else if (s.x < 0) s.x = w;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
  },

  drawPenguin(ctx, p, isActiveSolo) {
    if (!p) return;
    ctx.save();

    const moving = Math.abs(p.vx) > 12 && p.onGround;
    const walkCycle = moving ? Math.sin(p.anim * 1.4) : 0;
    const tilt = moving ? walkCycle * 0.08 : (!p.onGround ? Math.max(-0.22, Math.min(0.22, p.vy * 0.0004)) : 0);

    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);

    // BOCADILLO DE DIÁLOGO FLOTANTE EN ESPAÑOL
    if (p.speech && p.speechT > 0) {
      ctx.save();
      ctx.font = 'bold 12px Segoe UI, sans-serif';
      const pad = 16;
      const bw = ctx.measureText(p.speech).width + pad * 2;
      const by = -p.h / 2 - 46;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-bw / 2, by, bw, 26, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.fillText(p.speech, 0, by + 17);
      ctx.restore();
    }

    ctx.rotate(tilt);

    if (isActiveSolo) {
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.moveTo(0, -p.h / 2 - 14);
      ctx.lineTo(-6, -p.h / 2 - 22);
      ctx.lineTo(6, -p.h / 2 - 22);
      ctx.closePath();
      ctx.fill();
    }

    // 1. PIES NARANJAS ANIMADOS
    const footLiftL = moving ? Math.max(0, Math.sin(p.anim * 1.6)) * 4 : (!p.onGround ? 2 : 0);
    const footLiftR = moving ? Math.max(0, -Math.sin(p.anim * 1.6)) * 4 : (!p.onGround ? -2 : 0);
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.ellipse(-6, p.h / 2 - 2 - footLiftL, 6.5, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(6, p.h / 2 - 2 - footLiftR, 6.5, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. CUERPO
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(0, 1, p.w / 2, p.h / 2 - 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3. BARRIGA BLANCA
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.ellipse(p.facing * 2.5, 3.5, p.w / 2.9, p.h / 2.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. ARNÉS DE CUERDA
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2 + 2, 4, p.w - 4, 4.5);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 6.2, 3, 0, Math.PI * 2);
    ctx.fill();

    // 5. ALETA
    const wingAngle = !p.onGround ? -0.55 : (moving ? walkCycle * 0.35 : 0.15);
    ctx.save();
    ctx.translate(-p.facing * 3, 0);
    ctx.rotate(p.facing * wingAngle);
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(0, 5, 4.2, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 6. OJOS
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.facing * 5.5, -5.5, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.arc(p.facing * 6.8, -5.5, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.facing * 7.3, -6.3, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // 7. PICO
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.moveTo(p.facing * 9, -4.5);
    ctx.lineTo(p.facing * 18.5, -1.5);
    ctx.lineTo(p.facing * 9, 2);
    ctx.closePath();
    ctx.fill();

    // 8. GORRO CON FRANJA Y POMPÓN
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, -8.5, p.w / 2 - 0.5, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = p.hatTrim;
    ctx.beginPath();
    ctx.roundRect(-p.w / 2, -11, p.w, 4.5, 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -20.5, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // 9. PIOLET
    if (p.grabbing) {
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.facing * 7, 3);
      ctx.lineTo(p.facing * 18, -11);
      ctx.stroke();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(p.facing * 13, -13);
      ctx.lineTo(p.facing * 23, -6);
      ctx.stroke();
    }

    if (p.grabbing && p.stamina < 30) {
      ctx.fillStyle = '#38bdf8';
      const dropY = -12 + ((performance.now() * 0.03) % 8);
      ctx.beginPath();
      ctx.arc(-p.facing * 11, dropY, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
};

/* ================= CONTROLADOR DE INTERFAZ (UI) ================= */
window.UI = {
  init() {
    this.renderMenu();

    document.querySelectorAll('.mode-opt').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.mode-opt').forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
        Game.mode = el.dataset.mode;
        document.getElementById('onlinePanel').classList.toggle('hidden', Game.mode !== 'online');
        this.syncQuickBtn();
      });
    });

    document.getElementById('btnStart').addEventListener('click', () => {
      Sfx.ensureCtx();
      Game.loadLevel(Game.lvlIdx, 0, 0, 0);
      this.hideMenus();
      Game.running = true;
      Game.paused = false;
    });

    document.getElementById('btnContinue').addEventListener('click', () => {
      Sfx.ensureCtx();
      const r = SaveSys.cur().run;
      if (r) {
        Game.mode = r.mode || Game.mode;
        this.syncQuickBtn();
        Game.loadLevel(r.lvl, r.cp || 0, r.timer || 0, r.falls || 0);
        this.hideMenus();
        Game.running = true;
        Game.paused = false;
        toast(`▶ Reanudado en Nivel ${r.lvl + 1} (CP ${r.cp + 1})`);
      }
    });

    ['btnFS', 'btnMenuFS', 'btnPauseFS'].forEach(id => {
      document.getElementById(id).addEventListener('click', window.toggleFS);
    });

    document.getElementById('btnPause').addEventListener('click', () => Game.togglePause());
    document.getElementById('btnResume').addEventListener('click', () => Game.togglePause());
    document.getElementById('btnRespawn').addEventListener('click', () => { Game.togglePause(); Game.respawnAtCP(false); });
    document.getElementById('btnRestart').addEventListener('click', () => { Game.togglePause(); Game.loadLevel(Game.lvlIdx, 0, 0, 0); });
    document.getElementById('btnExit').addEventListener('click', () => {
      SaveSys.saveCheckpoint(Game.lvlIdx, Game.cpIdx, Game.timer, Game.falls, Game.mode);
      Game.running = false;
      Game.paused = false;
      this.renderMenu();
      document.getElementById('pauseMenu').classList.add('hidden');
      document.getElementById('mainMenu').classList.remove('hidden');
      toast('💾 Partida guardada');
    });

    document.getElementById('btnQuickMode').addEventListener('click', () => {
      Game.mode = Game.mode === 'local' ? 'solo' : 'local';
      this.syncQuickBtn();
      toast(Game.mode === 'solo' ? '👤 Modo Solo (Alterna con Q)' : '🎮 Modo 2J Local');
    });

    document.getElementById('btnTouch').addEventListener('click', () => {
      document.getElementById('touchControls').classList.toggle('hidden');
    });

    document.getElementById('btnMute').addEventListener('click', e => {
      Sfx.muted = !Sfx.muted;
      e.currentTarget.textContent = Sfx.muted ? '🔇' : '🔊';
    });

    document.getElementById('btnCreateRoom').addEventListener('click', () => Net.host());
    document.getElementById('btnJoinRoom').addEventListener('click', () => Net.join(document.getElementById('joinInput').value));
    document.getElementById('btnLocalFallback').addEventListener('click', () => {
      Net.clean();
      Game.mode = 'local';
      this.syncQuickBtn();
      document.getElementById('onlinePanel').classList.add('hidden');
    });

    const openSaves = () => {
      this.renderSlots();
      document.getElementById('saveModal').classList.remove('hidden');
    };
    document.getElementById('btnOpenSaves').addEventListener('click', openSaves);
    document.getElementById('btnHudSave').addEventListener('click', openSaves);
    document.getElementById('btnCloseSaves').addEventListener('click', () => document.getElementById('saveModal').classList.add('hidden'));

    document.getElementById('btnExport').addEventListener('click', () => {
      const code = SaveSys.exportStr();
      const area = document.getElementById('saveCodeArea');
      area.value = code;
      area.select();
      try { navigator.clipboard.writeText(code); } catch (e) {}
      document.getElementById('saveStatusMsg').textContent = '✅ Código copiado al portapapeles.';
    });

    document.getElementById('btnImport').addEventListener('click', () => {
      const ok = SaveSys.importStr(document.getElementById('saveCodeArea').value);
      document.getElementById('saveStatusMsg').textContent = ok ? '✅ ¡Partida restaurada!' : '❌ Código inválido.';
      if (ok) { this.renderSlots(); this.renderMenu(); }
    });

    document.getElementById('btnClearSlot').addEventListener('click', () => {
      SaveSys.data.slots[SaveSys.slot] = { records: {}, fishes: {}, run: null };
      SaveSys.save();
      this.renderSlots();
      this.renderMenu();
      document.getElementById('saveStatusMsg').textContent = '🗑️ Ranura vaciada.';
    });

    document.getElementById('btnWinMenu').addEventListener('click', () => {
      document.getElementById('winMenu').classList.add('hidden');
      this.renderMenu();
      document.getElementById('mainMenu').classList.remove('hidden');
    });

    document.getElementById('btnNextLvl').addEventListener('click', () => {
      document.getElementById('winMenu').classList.add('hidden');
      Game.loadLevel((Game.lvlIdx + 1) % LEVELS.length, 0, 0, 0);
      Game.running = true;
      Game.paused = false;
    });
  },

  syncQuickBtn() {
    document.getElementById('btnQuickMode').textContent =
      Game.mode === 'solo' ? '👤 Solo (Q)' : (Game.mode === 'online' ? '🌐 Online' : '🎮 2J');
  },

  renderMenu() {
    const cur = SaveSys.cur();
    const doneCount = Object.keys(cur.records).length;
    const fishes = SaveSys.totalFishes();
    document.getElementById('progBadge').textContent = `🏆 ${Math.round((doneCount / LEVELS.length) * 100)}% · 🐟 ${fishes}/15`;
    document.getElementById('slotLabel').textContent = `Ranura activa: #${SaveSys.slot}`;

    const contBtn = document.getElementById('btnContinue');
    if (cur.run) {
      contBtn.classList.remove('hidden');
      contBtn.textContent = `▶ Continuar Nivel ${cur.run.lvl + 1} (CP ${cur.run.cp + 1})`;
    } else {
      contBtn.classList.add('hidden');
    }

    const box = document.getElementById('levelSelector');
    box.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const rec = cur.records[i];
      const d = document.createElement('div');
      d.className = 'lvl-btn' + (i === Game.lvlIdx ? ' selected' : '') + (rec ? ' done' : '');
      d.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-size:0.68rem; font-weight:800; color:var(--blue);">
          <span>NIVEL ${lv.id}</span><span>${rec ? rec.medal : ''}</span>
        </div>
        <div style="font-size:0.75rem; font-weight:700; margin:3px 0;">${lv.name}</div>
        <div style="font-size:0.65rem; color:#a7f3d0;">${rec ? `⏱ ${Game.fmtTime(rec.time)} · 💥${rec.falls}` : `${lv.stepCount} tramos`}</div>
      `;
      d.addEventListener('click', () => {
        Game.lvlIdx = i;
        this.renderMenu();
      });
      box.appendChild(d);
    });
  },

  renderSlots() {
    const box = document.getElementById('slotsBox');
    box.innerHTML = '';
    [1, 2, 3].forEach(n => {
      const s = SaveSys.data.slots[n] || { records: {}, fishes: {}, run: null };
      const done = Object.keys(s.records).length;
      const fCount = Object.keys(s.fishes || {}).length;
      const el = document.createElement('div');
      el.className = 'slot-card' + (SaveSys.slot === n ? ' active' : '');
      el.innerHTML = `
        <div style="font-weight:800; font-size:0.84rem; color:${SaveSys.slot === n ? 'var(--green)' : '#fff'}">Ranura #${n}</div>
        <div style="font-size:0.72rem; color:var(--dim); margin-top:3px;">Niveles: ${done}/5 · 🐟 ${fCount}/15</div>
        <div style="font-size:0.7rem; color:var(--blue); margin-top:2px;">${s.run ? `En curso: Nv.${s.run.lvl + 1} (CP${s.run.cp + 1})` : 'Sin partida activa'}</div>
      `;
      el.addEventListener('click', () => {
        SaveSys.slot = n;
        SaveSys.save();
        this.renderSlots();
        this.renderMenu();
      });
      box.appendChild(el);
    });
  },

  hideMenus() {
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('pauseMenu').classList.add('hidden');
    document.getElementById('winMenu').classList.add('hidden');
  },

  showWin() {
    document.getElementById('winMedal').textContent = Game.falls <= 2 ? '🥇' : (Game.falls <= 6 ? '🥈' : '🥉');
    document.getElementById('winTitle').textContent = `${Game.lvl.id}. ${Game.lvl.name}`;
    document.getElementById('winTime').textContent = Game.fmtTime(Game.timer);
    document.getElementById('winFalls').textContent = Game.falls;
    document.getElementById('winMenu').classList.remove('hidden');
  }
};

window.addEventListener('DOMContentLoaded', () => window.Game.init());