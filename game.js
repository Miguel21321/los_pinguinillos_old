/**
 * ============================================================================
 * PICOS UNIDOS (BREAD & FRED EDITION) — GAME.JS
 * ============================================================================
 * Motor Central de Físicas de Péndulo Rígido, Cuerda Verlet y Máquina de Estados
 *
 * Características Físicas Implementadas:
 * 1. Restricción Rígida de Cuerda (Distance Joint Unilateral sin elasticidad)
 * 2. Proyección y conversión de velocidad radial de caída a velocidad tangencial pura
 * 3. Masas e Inercias: ANCHORED/WALL_CLING = masa infinita (invMass = 0); unanchored = arrastre
 * 4. Bombeo Tangencial en SWINGING para ganar altura de péndulo + Salto Slingshot
 * 5. Máquina de Estados: GROUNDED, ANCHORED, WALL_CLING (3s stamina), SWINGING, FACEPLANT
 * 6. Roca Jeff en Modo Solo: lanzamiento parabólico, anclaje y recogida
 * 7. Asistencias Bread & Fred: Bandera Checkpoint móvil, Polea/Recoger cuerda, Stamina infinita
 * 8. Ciclo de Viento, Bloques Crumble (1.2s temblor, 3.5s rotura) y Plataformas Móviles
 * ============================================================================
 */

(function () {
  'use strict';

  // Constantes de calibración física Bread & Fred
  const GRAVITY = 1180;
  const MAX_FALL = 820;
  const JUMP_V = 430;
  const JUMP_HOLD_T = 0.15;
  const JUMP_EXTRA_ACCEL = 440;
  const WALL_JUMP_VY = 390;
  const WALL_JUMP_VX = 210;
  const WALL_CLING_MAX_TIME = 3.0;
  const WALL_LOW_TIME = 1.2;
  const WALL_SLIDE_SPEED = 36; // px/s (~0.6 px/frame)
  const SLING_JUMP_VY = 540;
  const SLING_JUMP_MAX_VX = 450;
  const PUMP_TANGENTIAL_FORCE = 680;
  const GROUND_ACCEL = 1520;
  const ICE_ACCEL = 480;
  const AIR_ACCEL = 980;
  const GROUND_MAX_SPD = 250;
  const ICE_MAX_SPD = 320;
  const FACEPLANT_CRITICAL_VY = 690;
  const JEFF_PICK_RANGE = 54;
  const JEFF_THROW_VX = 440;
  const JEFF_THROW_VY = -380;

  const FUNNY_FALL_QUOTES = [
    ["¡Te dije que a la de tres!", "¿Contabas el cero o empezabas en el uno?"],
    ["¡Mis patitas no sienten nada!", "¡Al menos hemos caído con dignidad!"],
    ["¡Tira de la cuerda, que peso poco!", "¡Si desayunaste 14 sardinas, Fredo!"],
    ["¡Eso ha sido culpa de la gravedad!", "¡Sí, claro, échale la culpa a Newton!"],
    ["¡Casi lo teníamos!", "Define «casi», porque hemos bajado 80 metros."]
  ];

  // =========================================================================
  // CLASE PENGUIN — MÁQUINA DE ESTADOS EXACTA
  // =========================================================================
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
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.state = 'AIRBORNE'; // 'GROUNDED' | 'ANCHORED' | 'WALL_CLING' | 'SWINGING' | 'FACEPLANT' | 'AIRBORNE' | 'BELLY_SLIDE' | 'PIGGYBACK'
      this.onGround = false;
      this.onIce = false;
      this.touchingWall = false;
      this.wallDir = 0;
      this.facing = 1;
      this.anim = 0;
      this.jumpHeld = false;
      this.jumpHoldTimer = 0;
      this.staminaTimer = WALL_CLING_MAX_TIME;
      this.grabLocked = false;
      this.clingCooldown = 0;
      this.draggedTimer = 0;
      this.impactVy = 0;
      this.iceMsgTimer = 0;
      this.speech = '';
      this.speechTimer = 0;
      this.slideTimer = 0;
      this.carrying = null;
      this.carriedBy = null;
      this.squashX = 1;
      this.squashY = 1;
      this.blinkTimer = 2.0 + Math.random() * 3.0;
      this.isBlinking = false;
      this.skidTimer = 0;
      this.isEmoting = false;
      this.emoteTimer = 0;
      this.highFived = false;
    }

    invMass() {
      // Masa infinita si está anclado en suelo o pegado a pared
      if (this.state === 'ANCHORED' || this.state === 'WALL_CLING') return 0;
      if (this.state === 'PIGGYBACK' || this.carriedBy) return 0;
      return 1;
    }

    say(text, duration = 3.2) {
      this.speech = text;
      this.speechTimer = duration;
    }
  }

  // =========================================================================
  // CLASE JEFF — LA ROCA COMPAÑERA EN MODO 1 JUGADOR
  // =========================================================================
  class Jeff {
    constructor(x, y) {
      this.id = 2;
      this.name = 'Jeff';
      this.color = '#94a3b8';
      this.w = 38;
      this.h = 32;
      this.reset(x, y);
    }

    reset(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.state = 'AIRBORNE';
      this.onGround = false;
      this.carried = false;
      this.spin = 0;
      this.facing = 1;
      this.speech = '';
      this.speechTimer = 0;
    }

    invMass() {
      // Cuando Jeff aterriza se ancla como roca sólida (invMass = 0)
      if (this.state === 'ANCHORED' || this.carried) return 0;
      return 1;
    }

    say(text, duration = 2.5) {
      this.speech = text;
      this.speechTimer = duration;
    }
  }

  // =========================================================================
  // CUERDA VISUAL VERLET (CON COMBA Y COLISIÓN BÁSICA)
  // =========================================================================
  class RopeVisualVerlet {
    constructor(nodeCount, totalLen) {
      this.n = nodeCount;
      this.seg = totalLen / (nodeCount - 1);
      this.pts = [];
      for (let i = 0; i < nodeCount; i++) {
        this.pts.push({ x: 0, y: 0, ox: 0, oy: 0 });
      }
      this.taut = false;
    }

    reset(p1, p2) {
      const x1 = p1.x + p1.w / 2;
      const y1 = p1.y + p1.h * 0.55;
      const x2 = p2.x + p2.w / 2;
      const y2 = p2.y + p2.h * 0.55;
      for (let i = 0; i < this.n; i++) {
        const t = i / (this.n - 1);
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;
        this.pts[i] = { x: px, y: py, ox: px, oy: py };
      }
      this.taut = false;
    }

    update(dt, p1, p2, taut, platforms, pins = []) {
      this.taut = taut;
      const x1 = p1.x + p1.w / 2;
      const y1 = p1.y + p1.h * 0.55;
      const x2 = p2.x + p2.w / 2;
      const y2 = p2.y + p2.h * 0.55;

      const poly = [{ x: x1, y: y1 }, ...pins.map(p => ({ x: p.x, y: p.y })), { x: x2, y: y2 }];
      const segLens = [];
      let totalL = 0;
      for (let i = 0; i < poly.length - 1; i++) {
        const d = Math.hypot(poly[i + 1].x - poly[i].x, poly[i + 1].y - poly[i].y) || 0.001;
        segLens.push(d);
        totalL += d;
      }

      // Si la cuerda está tensa o envuelve esquinas, alinear nodos a lo largo de los segmentos con leve vibración
      if (taut || pins.length > 0) {
        const vib = taut ? Math.sin(performance.now() * 0.05) * 0.8 : 0;
        for (let i = 0; i < this.n; i++) {
          const targetD = (i / (this.n - 1)) * totalL;
          let acc = 0;
          for (let s = 0; s < segLens.length; s++) {
            if (targetD <= acc + segLens[s] || s === segLens.length - 1) {
              const u = Math.min(1, Math.max(0, (targetD - acc) / segLens[s]));
              const px = poly[s].x + (poly[s + 1].x - poly[s].x) * u;
              const py = poly[s].y + (poly[s + 1].y - poly[s].y) * u + (i > 0 && i < this.n - 1 ? vib : 0);
              this.pts[i].x = px;
              this.pts[i].y = py;
              this.pts[i].ox = px;
              this.pts[i].oy = py;
              break;
            }
            acc += segLens[s];
          }
        }
        return;
      }

      // Si la cuerda tiene comba y no hay pines, física Verlet con gravedad
      const g = 960 * dt * dt;
      for (let i = 1; i < this.n - 1; i++) {
        const p = this.pts[i];
        const vx = (p.x - p.ox) * 0.985;
        const vy = (p.y - p.oy) * 0.985;
        p.ox = p.x;
        p.oy = p.y;
        p.x += vx;
        p.y += vy + g;
      }

      // Relajación de distancias entre nodos Verlet
      for (let k = 0; k < 8; k++) {
        this.pts[0].x = x1;
        this.pts[0].y = y1;
        this.pts[this.n - 1].x = x2;
        this.pts[this.n - 1].y = y2;

        for (let i = 0; i < this.n - 1; i++) {
          const a = this.pts[i];
          const b = this.pts[i + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          if (d > this.seg) {
            const diff = (d - this.seg) / d;
            const ox = dx * diff * 0.5;
            const oy = dy * diff * 0.5;
            if (i !== 0) { a.x += ox; a.y += oy; }
            if (i + 1 !== this.n - 1) { b.x -= ox; b.y -= oy; }
          }
        }

        // Colisión básica de la cuerda contra plataformas
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
    }
  }

  // =========================================================================
  // OBJETO PRINCIPAL DEL JUEGO: WINDOW.GAME
  // =========================================================================
  window.Game = {
    canvas: null,
    ctx: null,
    w: 1280,
    h: 720,
    mode: 'local', // 'local' | 'solo' | 'online'
    lvlIdx: 0,
    lvl: null,
    running: false,
    paused: false,
    timer: 0,
    falls: 0,
    cpIdx: 0,
    soloIdx: 0,
    currentAltitude: 0,

    // Entidades
    p1: null,
    p2: null,
    jeff: null,
    rope: null,
    ropeTaut: false,
    customFlag: null,

    // Nivel
    platforms: [],
    movingPlatforms: [],
    hazards: [],
    checkpoints: [],
    collectibles: [],
    dialogues: [],
    particles: [],
    snow: [],
    clouds: [],

    // Sistema de viento cíclico (4s calma -> 2s aviso -> 3.5s ráfaga)
    windDir: 0,
    windTimer: 4.0,
    windPhase: 'calm', // 'calm' | 'alert' | 'gust'

    // Sistema de pines de esquina de cuerda (Dynamic Corner Wrapping)
    ropePins: [],

    // Sistema de telemetría de caídas ("Trail of Shame")
    fallSamples: [],
    fallPeakAlt: 0,
    fallBannerTimer: 0,
    shameTrail: [],
    shameTrailAlpha: 0,

    // Bucle principal
    init() {
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      if ('webkitImageSmoothingEnabled' in this.ctx) this.ctx.webkitImageSmoothingEnabled = false;
      if ('mozImageSmoothingEnabled' in this.ctx) this.ctx.mozImageSmoothingEnabled = false;
      if ('msImageSmoothingEnabled' in this.ctx) this.ctx.msImageSmoothingEnabled = false;

      const resize = () => {
        this.w = window.innerWidth;
        this.h = window.innerHeight;
        this.canvas.width = this.w;
        this.canvas.height = this.h;
        this.ctx.imageSmoothingEnabled = false;
        if ('webkitImageSmoothingEnabled' in this.ctx) this.ctx.webkitImageSmoothingEnabled = false;
        if ('mozImageSmoothingEnabled' in this.ctx) this.ctx.mozImageSmoothingEnabled = false;
      };
      window.addEventListener('resize', resize);
      resize();

      // Nieve de partículas atmosféricas
      for (let i = 0; i < 140; i++) {
        this.snow.push({
          x: Math.random() * 2000,
          y: Math.random() * 1200,
          r: 1.5 + Math.random() * 2.5,
          vy: 35 + Math.random() * 55,
          vx: -15 + Math.random() * 30
        });
      }

      // Nubes cumulus esponjosas estilo Bread & Fred
      this.clouds = [];
      for (let i = 0; i < 9; i++) {
        this.clouds.push({
          x: (i * 260) % 2400,
          y: 40 + (i % 3) * 65 + Math.random() * 30,
          speed: 6 + (i % 4) * 3,
          scale: 0.85 + (i % 3) * 0.25,
          puffs: [
            { ox: 0, oy: 0, r: 24 },
            { ox: 20, oy: -8, r: 30 },
            { ox: 44, oy: -10, r: 35 },
            { ox: 68, oy: -4, r: 28 },
            { ox: 86, oy: 4, r: 20 },
            { ox: 36, oy: 10, r: 24 }
          ]
        });
      }

      SaveSys.init();
      Input.init();
      UI.init();

      // Cargar Nivel 0 (Gran Montaña Continua) por defecto
      this.loadLevel(0, 0, 0, 0);

      let lastTime = performance.now();
      let accumulator = 0;
      const fixedStep = 1 / 60;

      const loop = now => {
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;

        if (this.running && !this.paused) {
          // HIT-STOP: Congela la física durante micro-impactos para dar contundencia física táctil
          if (Camera.hitStopT > 0) {
            Camera.hitStopT = Math.max(0, Camera.hitStopT - dt);
          } else {
            accumulator += dt;
            while (accumulator >= fixedStep) {
              this.updateFixed(fixedStep);
              accumulator -= fixedStep;
            }
          }
        }

        this.render(dt);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },

    loadLevel(idx, startCp = 0, savedTimer = 0, savedFalls = 0, savedCustomFlag = null) {
      this.lvlIdx = idx;
      const src = LEVELS[idx] || LEVELS[0];
      this.lvl = src;
      this.timer = savedTimer;
      this.falls = savedFalls;
      this.cpIdx = Math.min(startCp, src.checkpoints.length - 1);
      this.soloIdx = 0;
      this.customFlag = savedCustomFlag;

      // Clonar plataformas con estados dinámicos
      this.platforms = src.platforms.map(p => ({
        ...p,
        crackT: 0,
        cracking: false,
        broken: false,
        respT: 0
      }));

      this.movingPlatforms = (src.movingPlatforms || []).map(mp => ({
        ...mp,
        progress: mp.progress || 0,
        dir: mp.dir || 1
      }));

      this.hazards = src.hazards.map(h => ({ ...h }));
      this.checkpoints = src.checkpoints.map((c, i) => ({ ...c, reached: i <= this.cpIdx }));
      this.collectibles = (src.collectibles || []).map(f => ({ ...f, collected: SaveSys.hasFish(f.id) }));
      this.dialogues = (src.dialogues || []).map(d => ({ ...d, triggered: false }));
      this.particles = [];

      this.windDir = 0;
      this.windTimer = 4.0;
      this.windPhase = 'calm';

      this.countdownActive = false;
      this.countdownTimer = 0;
      this.countdownPhase = -1;

      // Spawn inicial
      const sp = this.customFlag || this.checkpoints[this.cpIdx] || src.spawn;
      this.p1 = new Penguin(1, 'Pingo', sp.x - 24, sp.y - 38, '#38bdf8', '#bae6fd');

      if (this.mode === 'solo') {
        this.jeff = new Jeff(sp.x + 40, sp.y - 34);
        this.p2 = this.jeff;
      } else {
        this.jeff = null;
        this.p2 = new Penguin(2, 'Fredo', sp.x + 20, sp.y - 38, '#fb923c', '#fed7aa');
      }

      this.ropePins = [];
      this.fallSamples = [];
      this.rope = new RopeVisualVerlet(12, src.ropeLength || 185);
      this.rope.reset(this.p1, this.p2);

      Camera.init(sp.x, sp.y - 80);
      this.updateAltitude();
      this.updateHUD();
    },

    ensureCompanion() {
      const wantJeff = this.mode === 'solo';
      if (wantJeff && !this.jeff) {
        const px = this.p2 ? this.p2.x : this.p1.x + 40;
        const py = this.p2 ? this.p2.y : this.p1.y;
        this.jeff = new Jeff(px, py);
        this.p2 = this.jeff;
        this.rope.reset(this.p1, this.p2);
        toast('🪨 Modo Solo: ¡La roca Jeff te acompaña!');
      } else if (!wantJeff && this.jeff) {
        const px = this.jeff.x;
        const py = this.jeff.y;
        this.p2 = new Penguin(2, 'Fredo', px, py, '#fb923c', '#fed7aa');
        this.jeff = null;
        this.rope.reset(this.p1, this.p2);
        toast('🐧 Cooperativo: ¡Fredo se une a la cuerda!');
      }
    },

    placeCustomFlag() {
      if (!this.p1 || !this.p1.onGround) {
        toast('⚠️ Debes estar en suelo firme para clavar la bandera');
        return;
      }
      this.customFlag = { x: this.p1.x + this.p1.w / 2, y: this.p1.y + this.p1.h, active: true };
      Sfx.cp();
      this.spawnParticles(this.customFlag.x, this.customFlag.y - 20, '#34d399', 16);
      SaveSys.saveCheckpoint(this.lvlIdx, this.cpIdx, this.timer, this.falls, this.mode, this.customFlag, this.currentAltitude);
      toast('🚩 Bandera personal de Checkpoint fijada');

      if (this.mode === 'online' && Net.role === 'guest' && Net.conn) {
        try { Net.conn.send({ type: 'flag' }); } catch (e) {}
      }
    },

    teleportToFlag() {
      const target = this.customFlag || this.checkpoints[this.cpIdx] || this.lvl.spawn;
      this.p1.reset(target.x - 22, target.y - 38);
      if (this.mode === 'solo' && this.jeff) {
        this.jeff.reset(target.x + 38, target.y - 34);
      } else {
        this.p2.reset(target.x + 18, target.y - 38);
      }
      this.rope.reset(this.p1, this.p2);
      this.spawnParticles(target.x, target.y - 20, '#38bdf8', 20);
      toast('🚩 Reubicados en la bandera');

      if (this.mode === 'online' && Net.role === 'guest' && Net.conn) {
        try { Net.conn.send({ type: 'tp' }); } catch (e) {}
      }
    },

    clearCustomFlag() {
      this.customFlag = null;
      SaveSys.saveCheckpoint(this.lvlIdx, this.cpIdx, this.timer, this.falls, this.mode, null, this.currentAltitude);
      toast('🚩 Bandera personal retirada (usando checkpoints del nivel)');

      if (this.mode === 'online' && Net.role === 'guest' && Net.conn) {
        try { Net.conn.send({ type: 'clearflag' }); } catch (e) {}
      }
    },

    respawnAtCP(countFall = true) {
      if (countFall) {
        this.falls++;
        Sfx.fall();
      }

      const target = this.customFlag || this.checkpoints[this.cpIdx] || this.lvl.spawn;
      this.p1.reset(target.x - 22, target.y - 38);
      if (this.mode === 'solo' && this.jeff) {
        this.jeff.reset(target.x + 38, target.y - 34);
      } else {
        this.p2.reset(target.x + 18, target.y - 38);
      }
      this.ropePins = [];
      this.fallSamples = [];
      this.rope.reset(this.p1, this.p2);

      // Restaurar plataformas quebradizas
      this.platforms.forEach(p => {
        if (p.type === 'crumble') {
          p.cracking = false;
          p.broken = false;
          p.crackT = 0;
        }
      });

      this.spawnParticles(target.x, target.y - 20, '#7dd3fc', 18);

      if (countFall) {
        const pair = FUNNY_FALL_QUOTES[Math.floor(Math.random() * FUNNY_FALL_QUOTES.length)];
        this.p1.say(pair[0], 3.2);
        setTimeout(() => {
          if (this.p2 && this.mode !== 'solo') this.p2.say(pair[1], 3.2);
        }, 900);
      }

      SaveSys.saveCheckpoint(this.lvlIdx, this.cpIdx, this.timer, this.falls, this.mode, this.customFlag, this.currentAltitude);
      this.updateHUD();
    },

    spawnParticles(x, y, color, count = 8) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 40 + Math.random() * 140;
        this.particles.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 40,
          life: 0.35 + Math.random() * 0.3,
          max: 0.65,
          color
        });
      }
    },

    startCountdown() {
      if (this.countdownActive) return;
      this.countdownActive = true;
      this.countdownTimer = 0;
      this.countdownPhase = -1;

      if (this.mode === 'online' && Net.role === 'guest' && Net.conn) {
        try { Net.conn.send({ type: 'cd' }); } catch (e) {}
      }
    },

    updateCountdown(dt) {
      if (!this.countdownActive) return;
      this.countdownTimer += dt;
      const phase = Math.min(3, Math.floor(this.countdownTimer));

      if (phase !== this.countdownPhase) {
        this.countdownPhase = phase;
        Sfx.countdown(phase);

        const texts = ['3...', '2...', '1...', '¡YA!'];
        const text = texts[phase];
        if (this.p1) this.p1.say(text, 0.95);
        if (this.p2) this.p2.say(text, 0.95);
      }

      if (this.countdownTimer >= 3.8) {
        this.countdownActive = false;
        this.countdownPhase = -1;
      }
    },

    updateAltitude() {
      const topY = Math.min(this.p1 ? this.p1.y : 0, this.p2 ? this.p2.y : 0);
      const m = Math.max(0, Math.min(500, Math.round(-topY / window.PIXELS_PER_METER)));
      this.currentAltitude = m;
      if (m > this.fallPeakAlt) this.fallPeakAlt = m;
      SaveSys.updateMaxAltitude(m);
    },

    // =======================================================================
    // EMOTE / CHOCAR LOS CINCO (HIGH-FIVE COOPERATIVO BREAD & FRED)
    // =======================================================================
    triggerEmote(pNum) {
      const p = pNum === 2 && this.p2 ? this.p2 : this.p1;
      const other = p === this.p1 ? this.p2 : this.p1;
      if (!p) return;

      p.isEmoting = true;
      p.emoteTimer = 1.2;
      p.squashX = 0.86;
      p.squashY = 1.18;
      Sfx.squeak('highFive');

      // Si ambos están en el suelo y cerca: ¡Chocar los cinco sincronizado!
      if (other && p.onGround && other.onGround) {
        const dist = Math.hypot((p.x + p.w / 2) - (other.x + other.w / 2), (p.y + p.h / 2) - (other.y + other.h / 2));
        if (dist < 68) {
          p.facing = p.x < other.x ? 1 : -1;
          other.facing = other.x < p.x ? 1 : -1;
          other.isEmoting = true;
          other.emoteTimer = 1.2;
          other.squashX = 0.86;
          other.squashY = 1.18;

          const midX = (p.x + other.x + p.w) / 2;
          const midY = (p.y + other.y) / 2;
          this.spawnParticles(midX, midY - 14, '#fbbf24', 12);
          this.spawnParticles(midX, midY - 18, '#f43f5e', 8);
          Camera.shake(6, 0.22);

          const cheers = ['¡Choca esos cinco!', '¡Buena esa!', '¡A tope!', '¡Increíble!'];
          const cheer = cheers[Math.floor(Math.random() * cheers.length)];
          p.say(cheer, 1.8);
          other.say(cheer, 1.8);
        }
      }

      // Replicar en red si es online
      if (this.mode === 'online' && Net.conn && Net.connected) {
        try { Net.conn.send({ type: 'emote', p: pNum }); } catch (e) {}
      }
    },

    // =======================================================================
    // BUCLE DE FÍSICA FIJO (60 FPS)
    // =======================================================================
    updateFixed(dt) {
      // Si somos Huésped en online, enviar comandos al Anfitrión y esperar réplica
      if (this.mode === 'online' && Net.role === 'guest') {
        const cmd = Input.get('solo', 0, null).p1;
        let cdSent = false;
        if (Input.countdownHit) {
          Input.countdownHit = false;
          cdSent = true;
        }
        Net.sendT += dt;
        if (Net.sendT >= 0.033 && Net.conn && Net.connected) {
          Net.sendT = 0;
          try { Net.conn.send({ type: 'in', state: cmd }); } catch (e) {}
        }
        if (cdSent && Net.conn && Net.connected) {
          try { Net.conn.send({ type: 'cd' }); } catch (e) {}
        }
        return;
      }

      this.ensureCompanion();
      this.timer += dt;

      // Actualizar temporizadores de bocadillos de diálogo
      if (this.p1.speechTimer > 0) this.p1.speechTimer -= dt;
      if (this.p2.speechTimer > 0) this.p2.speechTimer -= dt;

      // Disparador de cuenta atrás
      if (Input.countdownHit) {
        Input.countdownHit = false;
        this.startCountdown();
      }
      this.updateCountdown(dt);

      // Atajos de bandera
      if (Input.customFlagHit) {
        Input.customFlagHit = false;
        this.placeCustomFlag();
      }
      if (Input.tpFlagHit) {
        Input.tpFlagHit = false;
        this.teleportToFlag();
      }

      // =====================================================================
      // CICLO DE VIENTO (4s calma -> 2s aviso nieve -> 3.5s ráfaga fuerte)
      // =====================================================================
      const windBanner = document.getElementById('windAlert');
      if (this.lvl.windForce > 0) {
        this.windTimer -= dt;
        if (this.windPhase === 'calm' && this.windTimer <= 0) {
          this.windPhase = 'alert';
          this.windTimer = 2.0;
          if (windBanner) windBanner.classList.remove('hidden');
        } else if (this.windPhase === 'alert' && this.windTimer <= 0) {
          this.windPhase = 'gust';
          this.windTimer = 3.5;
          this.windDir = (Math.random() > 0.5 ? 1 : -1) * this.lvl.windForce;
          Sfx.windRumble();
        } else if (this.windPhase === 'gust' && this.windTimer <= 0) {
          this.windPhase = 'calm';
          this.windTimer = 4.0;
          this.windDir = 0;
          if (windBanner) windBanner.classList.add('hidden');
        }
      } else {
        this.windDir = 0;
        this.windPhase = 'calm';
        if (windBanner) windBanner.classList.add('hidden');
      }

      // =====================================================================
      // ACTUALIZAR PLATAFORMAS CRUMBLE Y MÓVILES
      // =====================================================================
      // 1. Crumbles
      for (const pl of this.platforms) {
        if (pl.type === 'crumble') {
          if (pl.cracking && !pl.broken) {
            pl.crackT += dt;
            if (pl.crackT >= 1.2) {
              pl.broken = true;
              pl.respT = 3.5;
              Sfx.crack();
              this.spawnParticles(pl.x + pl.w / 2, pl.y + pl.h / 2, '#7dd3fc', 16);
            }
          } else if (pl.broken) {
            pl.respT -= dt;
            if (pl.respT <= 0) {
              pl.broken = false;
              pl.cracking = false;
              pl.crackT = 0;
            }
          }
        }
      }

      // 2. Plataformas Móviles
      for (const mp of this.movingPlatforms) {
        const dx = mp.x2 - mp.x1;
        const dy = mp.y2 - mp.y1;
        const dist = Math.hypot(dx, dy) || 1;
        const prevX = mp.x;
        const prevY = mp.y;

        mp.progress += (mp.speed * dt * mp.dir) / dist;
        if (mp.progress >= 1) {
          mp.progress = 1;
          mp.dir = -1;
        } else if (mp.progress <= 0) {
          mp.progress = 0;
          mp.dir = 1;
        }

        mp.x = mp.x1 + dx * mp.progress;
        mp.y = mp.y1 + dy * mp.progress;

        const moveDeltaX = mp.x - prevX;
        const moveDeltaY = mp.y - prevY;

        // Transportar solidariamente a los pingüinos que estén sobre la plataforma móvil
        for (const p of [this.p1, this.p2]) {
          if (!p) continue;
          const onTop = p.x + p.w > mp.x && p.x < mp.x + mp.w && Math.abs((p.y + p.h) - mp.y) <= 4;
          if (onTop || (p.state === 'ANCHORED' && onTop)) {
            p.x += moveDeltaX;
            p.y += moveDeltaY;
          }
        }
      }

      // Obtener comandos de entrada
      const cmds = Input.get(this.mode, this.soloIdx, Net.guestIn);
      const isSolo = this.mode === 'solo';

      // Actualizar Roca Jeff si estamos en modo solitario
      if (isSolo && this.jeff) {
        this.updateJeff(cmds.p1, dt);
      }

      // Paso de simulación individual para cada pingüino
      this.stepPenguin(this.p1, cmds.p1, this.p2, dt);
      if (!isSolo && this.p2) {
        this.stepPenguin(this.p2, cmds.p2, this.p1, dt);
      }

      // Comprobar si alguno tocó un pincho mortal
      if (this.p1.hazardHit || (this.p2 && this.p2.hazardHit)) {
        this.respawnAtCP(true);
        return;
      }

      // =====================================================================
      // ASISTENCIA: RECOGER CUERDA / POLEA (BREAD & FRED ROPE PULL)
      // =====================================================================
      const assists = SaveSys.cur().assists;
      if (assists.ropePull) {
        const p1WantsPull = cmds.p1.ropePull && (this.p1.state === 'ANCHORED' || this.p1.state === 'WALL_CLING');
        const p2WantsPull = !isSolo && cmds.p2.ropePull && (this.p2.state === 'ANCHORED' || this.p2.state === 'WALL_CLING');

        if (p1WantsPull && this.p2) {
          this.applyPulleyPull(this.p1, this.p2, dt);
        } else if (p2WantsPull && this.p1) {
          this.applyPulleyPull(this.p2, this.p1, dt);
        }
      }

      // =====================================================================
      // RESOLVER RESTRICCIÓN RÍGIDA DE CUERDA (DISTANCE JOINT UNILATERAL)
      // =====================================================================
      this.solveRigidRope(dt);

      // Asentar en plataformas tras corrección de cuerda
      if (this.p1.invMass() === 1) this.settleAgainstPlatforms(this.p1);
      if (this.p2 && this.p2.invMass() === 1) this.settleAgainstPlatforms(this.p2);

      // Actualizar altitud
      this.updateAltitude();

      // =====================================================================
      // DIÁLOGOS DE HISTORIA Y SARDINAS DORADAS
      // =====================================================================
      for (const dg of this.dialogues) {
        if (!dg.triggered) {
          const d1 = Math.hypot(this.p1.x - dg.x, this.p1.y - dg.y);
          const d2 = this.p2 ? Math.hypot(this.p2.x - dg.x, this.p2.y - dg.y) : 999;
          if (d1 < 100 || d2 < 100) {
            dg.triggered = true;
            const speakerP = dg.speaker === 2 && this.p2 ? this.p2 : this.p1;
            speakerP.say(dg.text, 3.8);
            if (dg.nextText) {
              setTimeout(() => {
                const second = speakerP === this.p1 ? this.p2 : this.p1;
                if (second) second.say(dg.nextText, 3.8);
              }, 1600);
            }
          }
        }
      }

      for (const fish of this.collectibles) {
        if (!fish.collected) {
          const d1 = Math.hypot((this.p1.x + 15) - fish.x, (this.p1.y + 19) - fish.y);
          const d2 = this.p2 ? Math.hypot((this.p2.x + 15) - fish.x, (this.p2.y + 19) - fish.y) : 999;
          if (d1 < 36 || d2 < 36) {
            fish.collected = true;
            Sfx.fish();
            SaveSys.collectFish(fish.id);
            this.spawnParticles(fish.x, fish.y, '#fbbf24', 20);
            const finder = d1 < d2 ? this.p1 : this.p2;
            finder.say("🐟 ¡Sardina Dorada pa' la saca!", 2.8);
            toast(`🐟 ¡Sardina Dorada encontrada! (${SaveSys.totalFishes()}/20)`);
          }
        }
      }

      // Checkpoints
      for (let i = 0; i < this.checkpoints.length; i++) {
        const cp = this.checkpoints[i];
        if (!cp.reached) {
          const d1 = Math.hypot((this.p1.x + 15) - cp.x, (this.p1.y + 19) - cp.y);
          const d2 = this.p2 ? Math.hypot((this.p2.x + 15) - cp.x, (this.p2.y + 19) - cp.y) : 999;
          if (d1 < 55 || d2 < 55) {
            cp.reached = true;
            this.cpIdx = Math.max(this.cpIdx, i);
            Sfx.cp();
            this.spawnParticles(cp.x, cp.y - 25, '#34d399', 16);
            SaveSys.saveCheckpoint(this.lvlIdx, this.cpIdx, this.timer, this.falls, this.mode, this.customFlag, this.currentAltitude);
            toast(`💾 Checkpoint ${cp.label || (this.cpIdx + 1)} guardado`);
          }
        }
      }

      // Meta final del nivel / Cumbre
      const g = this.lvl.goal;
      const inGoal = p => p && p.x + p.w > g.x && p.x < g.x + g.w && p.y + p.h > g.y && p.y < g.y + g.h;
      const reached = isSolo ? inGoal(this.p1) : (inGoal(this.p1) && inGoal(this.p2));
      if (reached) {
        this.onWin(false);
        return;
      }

      // =====================================================================
      // TELEMETRÍA DE CAÍDA ("TRAIL OF SHAME" Y BANNER DE METROS PERDIDOS)
      // =====================================================================
      if (this.fallBannerTimer > 0) {
        this.fallBannerTimer -= dt;
        if (this.fallBannerTimer <= 0) {
          document.getElementById('fallBanner')?.classList.add('hidden');
        }
      }

      const fallingFast = this.p1 && (this.p1.vy > 380 || (this.p2 && this.p2.vy > 380));
      if (fallingFast) {
        const mx = (this.p1.x + (this.p2 ? this.p2.x : this.p1.x)) / 2;
        const my = (this.p1.y + (this.p2 ? this.p2.y : this.p1.y)) / 2;
        if (this.fallSamples.length === 0 || Math.hypot(mx - this.fallSamples[this.fallSamples.length - 1].x, my - this.fallSamples[this.fallSamples.length - 1].y) > 30) {
          this.fallSamples.push({ x: mx, y: my });
          if (this.fallSamples.length > 70) this.fallSamples.shift();
        }
      } else if ((this.p1.onGround || (this.p2 && this.p2.onGround)) && this.fallSamples.length > 4) {
        const startPt = this.fallSamples[0];
        const endPt = this.fallSamples[this.fallSamples.length - 1];
        const dropPx = endPt.y - startPt.y;
        const dropM = Math.round(dropPx / window.PIXELS_PER_METER);
        if (dropM >= 8) {
          this.shameTrail = [...this.fallSamples];
          this.shameTrailAlpha = 1.0;
          const banner = document.getElementById('fallBanner');
          if (banner) {
            banner.textContent = `💥 ¡Caída de -${dropM}m!`;
            banner.classList.remove('hidden');
            this.fallBannerTimer = 3.8;
          }
          const pair = FUNNY_FALL_QUOTES[Math.floor(Math.random() * FUNNY_FALL_QUOTES.length)];
          this.p1.say(pair[0], 3.2);
          if (this.p2) {
            setTimeout(() => { if (this.p2) this.p2.say(pair[1], 3.2); }, 1400);
          }
        }
        this.fallSamples = [];
      }

      // Caída al vacío (embudo de castigo por debajo del último checkpoint)
      const refY = (this.checkpoints[this.cpIdx] ? this.checkpoints[this.cpIdx].y : 0) + 650;
      if (Math.max(this.p1.y, this.p2 ? this.p2.y : 0) > refY) {
        this.respawnAtCP(true);
        return;
      }

      // =====================================================================
      // MULTIJUGADOR ONLINE: TRANSMISIÓN DE PAYLOAD ENRIQUECIDO
      // =====================================================================
      if (this.mode === 'online' && Net.role === 'host' && Net.connected && Net.conn) {
        Net.sendT += dt;
        if (Net.sendT >= 0.033) {
          Net.sendT = 0;
          try {
            Net.conn.send({
              type: 'st',
              t: this.timer,
              f: this.falls,
              alt: this.currentAltitude,
              maxAlt: SaveSys.cur().maxAltitude,
              cp: this.cpIdx,
              flag: this.customFlag,
              wind: { dir: this.windDir, phase: this.windPhase },
              crumbles: this.platforms.filter(p => p.type === 'crumble').map(p => ({ b: p.broken, c: p.cracking })),
              movings: this.movingPlatforms.map(mp => ({ x: Math.round(mp.x), y: Math.round(mp.y), p: mp.progress, d: mp.dir })),
              p1: this.packNet(this.p1),
              p2: this.packNet(this.p2),
              rp: this.rope.pts.map(pt => [Math.round(pt.x), Math.round(pt.y)]),
              cd: this.countdownActive ? this.countdownTimer : 0,
              fc: this.collectibles.map(f => (f.collected ? 1 : 0)).join('')
            });
          } catch (e) {}
        }
      }

      this.updateHUD();
    },

    // =======================================================================
    // ASISTENCIA DE POLEA (ROPE PULL)
    // =======================================================================
    applyPulleyPull(puller, target, dt) {
      const px = puller.x + puller.w / 2;
      const py = puller.y + puller.h / 2;
      const tx = target.x + target.w / 2;
      const ty = target.y + target.h / 2;
      const dx = px - tx;
      const dy = py - ty;
      const d = Math.hypot(dx, dy) || 1;

      if (d > 45) {
        const nx = dx / d;
        const ny = dy / d;
        const reelSpeed = 260;
        target.x += nx * reelSpeed * dt;
        target.y += ny * reelSpeed * dt;
        target.vx = nx * 120;
        target.vy = Math.min(target.vy, ny * 120);

        if (Math.random() < dt * 10) {
          Sfx.ropePull();
          this.spawnParticles(tx, ty, '#fbbf24', 2);
        }
      }
    },

    // =======================================================================
    // FÍSICA Y CONTROL DE LA ROCA JEFF (MODO 1 JUGADOR)
    // =======================================================================
    updateJeff(cmdP1, dt) {
      const j = this.jeff;
      const p1 = this.p1;
      const jx = j.x + j.w / 2;
      const jy = j.y + j.h / 2;
      const cx = p1.x + p1.w / 2;
      const cy = p1.y + p1.h / 2;
      const dist = Math.hypot(cx - jx, cy - jy);

      // Si Jeff está siendo llevado en brazos
      if (j.carried) {
        j.x = p1.x + p1.w / 2 - j.w / 2;
        j.y = p1.y - j.h - 4;
        j.vx = 0;
        j.vy = 0;
        j.facing = p1.facing;

        // Lanzar a Jeff con Salto (W)
        if (cmdP1.jump && !p1.jumpHeld) {
          j.carried = false;
          j.state = 'AIRBORNE';
          j.vx = p1.facing * JEFF_THROW_VX;
          j.vy = JEFF_THROW_VY;
          j.spin = 0;
          p1.jumpHeld = true;
          p1.jumpHoldTimer = 0;
          Sfx.pick();
          p1.say("¡Allá va Jeff!", 1.4);
          return;
        }

        // Soltar a Jeff si se deja de mantener Grab (S)
        if (!cmdP1.grab) {
          j.carried = false;
          j.state = 'AIRBORNE';
          j.vx = p1.vx * 0.4;
          j.vy = 20;
        }
        return;
      }

      // Recoger a Jeff si está cerca y P1 mantiene Grab (S) en el suelo o en reposo
      const canPick = (j.state === 'ANCHORED' || j.onGround) && (p1.state === 'GROUNDED' || p1.state === 'AIRBORNE');
      if (canPick && cmdP1.grab && dist < JEFF_PICK_RANGE) {
        j.carried = true;
        j.state = 'AIRBORNE';
        j.vx = 0;
        j.vy = 0;
        Sfx.pick();
        p1.say("¡Te llevo, Jeff!", 1.2);
        return;
      }

      // Física aérea de Jeff en parábola
      if (j.state === 'AIRBORNE' && !j.carried) {
        j.vy = Math.min(MAX_FALL, j.vy + GRAVITY * dt);
        j.x += j.vx * dt;
        j.y += j.vy * dt;
        j.spin += dt * 8 * (j.vx >= 0 ? 1 : -1);
        j.onGround = false;

        // Colisión con plataformas: Jeff se ancla al impactar
        let collided = false;
        const allPlats = [...this.platforms, ...this.movingPlatforms];
        for (const pl of allPlats) {
          if (pl.broken) continue;
          const overlapX = j.x + j.w > pl.x && j.x < pl.x + pl.w;
          const overlapY = j.y + j.h > pl.y && j.y < pl.y + pl.h;
          if (!overlapX || !overlapY) continue;

          if (j.vy >= 0 && (j.y + j.h - j.vy * dt) <= pl.y + 16) {
            j.y = pl.y - j.h;
            collided = true;
          } else {
            collided = true;
          }
          if (collided) break;
        }

        if (collided) {
          j.state = 'ANCHORED';
          j.onGround = true;
          j.vx = 0;
          j.vy = 0;
          j.spin = 0;
          Sfx.land();
          this.spawnParticles(j.x + j.w / 2, j.y + j.h, '#cbd5e1', 12);
        }
      }
    },

    // =======================================================================
    // SIMULACIÓN INDIVIDUAL DE PENGUIN Y MÁQUINA DE ESTADOS
    // =======================================================================
    stepPenguin(p, cmd, other, dt) {
      const wasGround = p.onGround;
      p.hazardHit = false;

      if (p.clingCooldown > 0) p.clingCooldown -= dt;
      if (p.draggedTimer > 0) p.draggedTimer -= dt;
      if (p.iceMsgTimer > 0) p.iceMsgTimer -= dt;

      // Actualizar temporizador de parpadeo y squash & stretch
      p.squashX += (1 - p.squashX) * Math.min(1, dt * 10);
      p.squashY += (1 - p.squashY) * Math.min(1, dt * 10);
      p.blinkTimer -= dt;
      if (p.blinkTimer <= 0) {
        p.isBlinking = true;
        if (p.blinkTimer <= -0.16) {
          p.isBlinking = false;
          p.blinkTimer = 2.4 + Math.random() * 3.6;
        }
      }
      if (p.emoteTimer > 0) p.emoteTimer -= dt;
      else p.isEmoting = false;

      const assists = SaveSys.cur().assists;
      const infiniteStamina = assists.infiniteStamina;

      // =====================================================================
      // 0. ESTADO PIGGYBACK (A caballito en la cabeza del compañero)
      // =====================================================================
      if (p.carriedBy) {
        const c = p.carriedBy;
        p.x = c.x + (c.w - p.w) / 2;
        p.y = c.y - p.h + 8;
        p.vx = c.vx;
        p.vy = c.vy;
        p.facing = c.facing;
        p.onGround = true;
        p.anim += dt * 7;
        p.state = 'PIGGYBACK';
        return;
      }

      // =====================================================================
      // 1. ESTADO FACEPLANT (Estampado tras gran caída)
      // =====================================================================
      if (p.state === 'FACEPLANT') {
        p.vx = 0;
        if (cmd.left || cmd.right || cmd.jump) {
          p.state = p.onGround ? 'GROUNDED' : 'AIRBORNE';
          p.squashX = 0.9;
          p.squashY = 1.15;
          this.spawnParticles(p.x + p.w / 2, p.y + p.h, '#e2e8f0', 8);
        }
        if (!p.onGround) p.state = 'AIRBORNE';
      }

      // =====================================================================
      // 2. ESTADO ANCHORED (Anclado con piolet en suelo firme)
      // =====================================================================
      else if (p.state === 'ANCHORED') {
        p.vx = 0;
        p.vy = 0;
        p.staminaTimer = WALL_CLING_MAX_TIME;
        if (!cmd.grab || !p.onGround) {
          p.state = p.onGround ? 'GROUNDED' : 'AIRBORNE';
        }
      }

      // =====================================================================
      // 3. ESTADO WALL_CLING (Pegado a pared vertical de hielo)
      // =====================================================================
      else if (p.state === 'WALL_CLING') {
        p.vx = 0;
        if (!infiniteStamina) {
          p.staminaTimer = Math.max(0, p.staminaTimer - dt);
        }

        if (p.staminaTimer <= 0) {
          p.grabLocked = true;
          p.state = 'AIRBORNE';
          p.vy = 60;
          p.say("¡Se me resbala el piolet!", 1.8);
          Sfx.squeak('panic');
        } else if (p.staminaTimer <= WALL_LOW_TIME) {
          p.vy = WALL_SLIDE_SPEED;
          if (Math.random() < dt * 14) {
            this.spawnParticles(p.x + p.w / 2 + p.wallDir * 8, p.y + p.h / 2, '#38bdf8', 1);
          }
        } else {
          p.vy = 0;
        }

        // Salto desde la pared (Wall Jump)
        if (p.state === 'WALL_CLING' && cmd.jump && !p.jumpHeld) {
          p.jumpHeld = true;
          p.vy = -WALL_JUMP_VY;
          p.vx = -p.wallDir * WALL_JUMP_VX;
          p.facing = -p.wallDir;
          p.state = 'AIRBORNE';
          p.clingCooldown = 0.14;
          p.squashX = 0.84;
          p.squashY = 1.2;
          Sfx.squeak('jump');
          Sfx.jump();
          this.spawnParticles(p.x + p.w / 2, p.y + p.h, '#e0f2fe', 8);
        }

        if (p.state === 'WALL_CLING' && (!cmd.grab || !p.touchingWall)) {
          p.state = 'AIRBORNE';
        }
      }

      // =====================================================================
      // 4. ESTADO BELLY_SLIDE (Panzazo / Tobogán sobre la barriga)
      // =====================================================================
      else if (p.state === 'BELLY_SLIDE') {
        p.slideTimer += dt;
        const friction = p.onIce ? 0.996 : 0.964;
        p.vx *= Math.pow(friction, dt * 60);

        if (cmd.left && p.vx > -GROUND_MAX_SPD * 1.35) p.vx -= 440 * dt;
        if (cmd.right && p.vx < GROUND_MAX_SPD * 1.35) p.vx += 440 * dt;

        if (Math.abs(p.vx) > 35 && Math.random() < dt * 25) {
          this.spawnParticles(p.x + (p.facing > 0 ? 0 : p.w), p.y + p.h - 2, '#fff', 2);
        }

        // Salto catapultado desde el panzazo (Slide-Jump)
        if (cmd.jump && !p.jumpHeld) {
          p.jumpHeld = true;
          p.vy = -340;
          p.vx = Math.sign(p.vx || p.facing) * Math.max(Math.abs(p.vx) * 1.25, 310);
          p.state = 'AIRBORNE';
          p.squashX = 0.82;
          p.squashY = 1.22;
          Sfx.squeak('jump');
          this.spawnParticles(p.x + p.w / 2, p.y + p.h, '#38bdf8', 10);
        }

        if (!p.onGround) {
          p.state = 'AIRBORNE';
        } else if (Math.abs(p.vx) < 18 || (!cmd.down && !p.onIce)) {
          p.state = 'GROUNDED';
        }
      }

      // =====================================================================
      // 5. ESTADO SWINGING (En el aire con cuerda tensa al máximo)
      // =====================================================================
      else if (p.state === 'SWINGING') {
        const pumpDir = (cmd.right ? 1 : 0) - (cmd.left ? 1 : 0);
        if (pumpDir !== 0 && other) {
          p.facing = pumpDir;
          this.applyTangentialPump(p, other, pumpDir, dt);
        }

        // Salto Slingshot catapultado
        if (cmd.jump && !p.jumpHeld) {
          p.jumpHeld = true;
          p.vy = Math.min(p.vy, -SLING_JUMP_VY);
          p.vx = Math.max(-SLING_JUMP_MAX_VX, Math.min(SLING_JUMP_MAX_VX, p.vx * 1.25));
          p.state = 'AIRBORNE';
          p.squashX = 0.8;
          p.squashY = 1.25;
          Sfx.squeak('jump');
          Sfx.jump();
          this.spawnParticles(p.x + p.w / 2, p.y + p.h, '#fff', 8);
        }

        if (p.state === 'SWINGING' && cmd.grab && p.touchingWall && !p.grabLocked && p.clingCooldown <= 0 && p.staminaTimer > 0) {
          p.state = 'WALL_CLING';
          p.vx = 0;
          p.vy = 0;
          Sfx.squeak('grunt');
          Sfx.pick();
          this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#e0f2fe', 6);
        }
      }

      // =====================================================================
      // 6. ESTADO GROUNDED (En suelo firme)
      // =====================================================================
      else if (p.state === 'GROUNDED') {
        const accel = p.onIce ? ICE_ACCEL : GROUND_ACCEL;
        const maxSpd = p.carrying ? (p.onIce ? ICE_MAX_SPD * 0.85 : GROUND_MAX_SPD * 0.85) : (p.onIce ? ICE_MAX_SPD : GROUND_MAX_SPD);

        // Si está llevando al compañero a caballito
        if (p.carrying) {
          const pass = p.carrying;
          // Lanzar al compañero con Salto (W)
          if (cmd.jump && !p.jumpHeld) {
            p.jumpHeld = true;
            p.carrying = null;
            pass.carriedBy = null;
            pass.state = 'AIRBORNE';
            pass.vx = p.facing * 440 + p.vx * 0.5;
            pass.vy = -490;
            pass.jumpHeld = true;
            pass.jumpHoldTimer = 0.15;
            pass.squashX = 0.82;
            pass.squashY = 1.24;
            Sfx.squeak('jump');
            Sfx.pick();
            p.say("¡Vuela!", 1.2);
            this.spawnParticles(pass.x + pass.w / 2, pass.y + pass.h, '#fff', 8);
          } else if (!cmd.grab && !cmd.down) {
            p.carrying = null;
            pass.carriedBy = null;
            pass.state = 'GROUNDED';
          }
        }
        // Si no lleva a nadie: opción de coger al compañero a caballito
        else if (other && other.state === 'GROUNDED' && !other.carrying && !other.carriedBy && this.mode !== 'solo') {
          const distMid = Math.hypot((p.x + p.w / 2) - (other.x + other.w / 2), (p.y + p.h / 2) - (other.y + other.h / 2));
          if (distMid < 36 && cmd.grab && cmd.down) {
            p.carrying = other;
            other.carriedBy = p;
            other.state = 'PIGGYBACK';
            Sfx.pick();
            p.say("¡A caballito!", 1.2);
          }
        }

        // Panzazo: lanzarse de barriga al pulsar abajo en carrera
        if (cmd.down && (Math.abs(p.vx) > 30 || cmd.left || cmd.right) && !p.carrying) {
          p.state = 'BELLY_SLIDE';
          p.slideTimer = 0;
          p.squashX = 1.34;
          p.squashY = 0.66;
          Sfx.slide();
          this.spawnParticles(p.x + p.w / 2, p.y + p.h, '#e0f2fe', 6);
        }

        if (cmd.left) {
          p.vx = Math.max(-maxSpd, p.vx - accel * dt);
          p.facing = -1;
          p.anim += dt * 11;
        } else if (cmd.right) {
          p.vx = Math.min(maxSpd, p.vx + accel * dt);
          p.facing = 1;
          p.anim += dt * 11;
        } else {
          const slippery = p.onIce || p.draggedTimer > 0;
          p.vx *= Math.pow(slippery ? 0.985 : 0.76, dt * 60);
        }

        // Skid dust al cambiar de sentido bruscamente
        if (Math.abs(p.vx) > 60 && ((p.vx > 0 && cmd.left) || (p.vx < 0 && cmd.right))) {
          p.skidTimer += dt;
          if (Math.random() < dt * 18) {
            Sfx.skid();
            this.spawnParticles(p.x + p.w / 2, p.y + p.h - 2, '#cbd5e1', 3);
          }
        } else {
          p.skidTimer = 0;
        }

        // Salto individual
        if (cmd.jump && !p.jumpHeld && !p.carrying) {
          p.jumpHeld = true;
          p.jumpHoldTimer = JUMP_HOLD_T;
          p.vy = -JUMP_V;
          p.state = 'AIRBORNE';
          p.squashX = 0.84;
          p.squashY = 1.22;
          Sfx.squeak('jump');
          Sfx.jump();
          this.spawnParticles(p.x + p.w / 2, p.y + p.h, '#fff', 6);
        }

        // Anclarse con piolet en suelo
        if (cmd.grab && !cmd.down && p.state === 'GROUNDED' && !p.carrying) {
          if (p.onIce) {
            if (p.iceMsgTimer <= 0) {
              p.say("¡El piolet resbala en el hielo!", 1.6);
              p.iceMsgTimer = 2.5;
            }
          } else {
            p.state = 'ANCHORED';
            p.vx = 0;
            p.vy = 0;
            p.squashX = 1.24;
            p.squashY = 0.76;
            Sfx.pick();
            this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#e0f2fe', 6);
          }
        }
      }

      // =====================================================================
      // 7. ESTADO AIRBORNE (En el aire libre)
      // =====================================================================
      else {
        if (cmd.left) {
          p.vx = Math.max(-GROUND_MAX_SPD, p.vx - AIR_ACCEL * dt);
          p.facing = -1;
        } else if (cmd.right) {
          p.vx = Math.min(GROUND_MAX_SPD, p.vx + AIR_ACCEL * dt);
          p.facing = 1;
        }

        if (cmd.grab && p.touchingWall && !p.onGround && !p.grabLocked && p.clingCooldown <= 0 && p.staminaTimer > 0) {
          p.state = 'WALL_CLING';
          p.vx = 0;
          p.vy = 0;
          Sfx.squeak('grunt');
          Sfx.pick();
          this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#e0f2fe', 6);
        }
      }

      // Mantenimiento de altura de salto (variable jump height)
      if (p.state === 'AIRBORNE' && cmd.jump && p.jumpHoldTimer > 0) {
        p.vy -= JUMP_EXTRA_ACCEL * dt;
        p.jumpHoldTimer -= dt;
      } else {
        p.jumpHoldTimer = 0;
      }
      if (!cmd.jump) p.jumpHeld = false;

      // Gravedad y viento
      if (p.state !== 'ANCHORED' && p.state !== 'WALL_CLING') {
        if (this.windDir !== 0) {
          p.vx += this.windDir * (p.onGround ? 180 : 340) * dt;
        }
        p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
      }

      if (!p.onGround && p.state !== 'WALL_CLING' && p.state !== 'ANCHORED') {
        p.vx *= Math.pow(0.998, dt * 60);
      }

      p.impactVy = p.vy;
      this.moveAndCollidePlatforms(p, dt);

      // Restaurar stamina timer solo al pisar suelo firme (GROUNDED)
      if (p.onGround) {
        p.staminaTimer = WALL_CLING_MAX_TIME;
        p.grabLocked = false;
      }

      // Transición al aterrizar
      if (!wasGround && p.onGround) {
        p.squashX = 1.25;
        p.squashY = 0.75;
        if (p.impactVy >= FACEPLANT_CRITICAL_VY && p.state !== 'ANCHORED') {
          p.state = 'FACEPLANT';
          p.vx = 0;
          p.vy = 0;
          p.squashX = 1.45;
          p.squashY = 0.55;
          Camera.hitStop(0.06);
          Camera.shake(16, 0.45);
          Sfx.squeak('panic');
          Sfx.faceplant();
          this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#e2e8f0', 16);
          p.say("¡SPLAT!", 1.2);
        } else {
          Sfx.land();
          this.spawnParticles(p.x + p.w / 2, p.y + p.h, '#e2e8f0', 4);
          if (p.state !== 'ANCHORED') p.state = 'GROUNDED';
        }
      } else if (wasGround && !p.onGround && p.state === 'GROUNDED') {
        p.state = 'AIRBORNE';
      }

      // Transiciones de balanceo SWINGING
      if (p.state === 'AIRBORNE' && !p.onGround && this.ropeTaut) {
        p.state = 'SWINGING';
      }
      if (p.state === 'SWINGING' && (p.onGround || !this.ropeTaut)) {
        p.state = p.onGround ? 'GROUNDED' : 'AIRBORNE';
      }
    },

    // =======================================================================
    // BOMBEO TANGENCIAL PERPENDICULAR AL VECTOR DE LA CUERDA
    // =======================================================================
    applyTangentialPump(p, other, dir, dt) {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const ox = other.x + other.w / 2;
      const oy = other.y + other.h / 2;

      let dx = cx - ox;
      let dy = cy - oy;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist;
      dy /= dist;

      // Vector tangente perpendicular
      let tx = -dy;
      let ty = dx;

      // Asegurar que el vector apunte en la dirección del botón pulsado
      if (tx * dir < 0) {
        tx = -tx;
        ty = -ty;
      }

      p.vx += tx * PUMP_TANGENTIAL_FORCE * dt;
      p.vy += ty * PUMP_TANGENTIAL_FORCE * dt;
    },

    // =======================================================================
    // DETECCIÓN Y RESPUESTA DE COLISIÓN CONTRA PLATAFORMAS
    // =======================================================================
    moveAndCollidePlatforms(p, dt) {
      p.x += p.vx * dt;
      p.touchingWall = false;
      p.wallDir = 0;

      const allPlats = [...this.platforms, ...this.movingPlatforms];

      // Colisión horizontal (Paredes)
      for (const pl of allPlats) {
        if (pl.broken) continue;
        const overlapX = p.x + p.w > pl.x && p.x < pl.x + pl.w;
        const overlapY = p.y + p.h > pl.y + 4 && p.y < pl.y + pl.h - 4;

        if (overlapX && overlapY) {
          if (p.vx > 0) p.x = pl.x - p.w;
          else if (p.vx < 0) p.x = pl.x + pl.w;
          p.vx = 0;

          if (pl.type === 'climbWall') {
            p.touchingWall = true;
            p.wallDir = -1;
          }
        }

        // Tolerancia lateral para paredes de escalada
        if (pl.type === 'climbWall' && p.y + p.h > pl.y && p.y < pl.y + pl.h) {
          if (Math.abs((p.x + p.w) - pl.x) <= 6) {
            p.touchingWall = true;
            p.wallDir = -1;
          } else if (Math.abs(p.x - (pl.x + pl.w)) <= 6) {
            p.touchingWall = true;
            p.wallDir = 1;
          }
        }
      }

      // Colisión vertical (Suelo y Techo)
      p.y += p.vy * dt;
      p.onGround = false;
      p.onIce = false;

      for (const pl of allPlats) {
        if (pl.broken) continue;
        const overlapX = p.x + p.w > pl.x + 3 && p.x < pl.x + pl.w - 3;
        const overlapY = p.y + p.h >= pl.y && p.y < pl.y + pl.h;

        if (overlapX && overlapY) {
          // Aterrizaje en la superficie superior
          if (p.vy >= 0 && (p.y + p.h - p.vy * dt) <= pl.y + 16) {
            p.y = pl.y - p.h;
            p.vy = 0;
            p.onGround = true;

            if (pl.type === 'ice' || pl.subType === 'ice') p.onIce = true;
            if (pl.type === 'crumble' && !pl.cracking) {
              pl.cracking = true;
              Sfx.crack();
            }
          }
          // Choque contra el techo
          else if (p.vy < 0 && (p.y - p.vy * dt) >= pl.y + pl.h - 14) {
            p.y = pl.y + pl.h;
            p.vy = 0;
          }
        }
      }

      // Colisión mortal con pinchos
      for (const hz of this.hazards) {
        if (p.x + p.w > hz.x + 5 && p.x < hz.x + hz.w - 5 && p.y + p.h > hz.y + 4 && p.y < hz.y + hz.h) {
          p.hazardHit = true;
          return;
        }
      }
    },

    settleAgainstPlatforms(p) {
      const allPlats = [...this.platforms, ...this.movingPlatforms];
      for (const pl of allPlats) {
        if (pl.broken) continue;
        const overlapX = p.x + p.w > pl.x + 2 && p.x < pl.x + pl.w - 2;
        const overlapY = p.y + p.h > pl.y && p.y < pl.y + pl.h;
        if (!overlapX || !overlapY) continue;

        const oxL = (p.x + p.w) - pl.x;
        const oxR = (pl.x + pl.w) - p.x;
        const oyT = (p.y + p.h) - pl.y;
        const oyB = (pl.y + pl.h) - p.y;
        const minOverlap = Math.min(oxL, oxR, oyT, oyB);

        if (minOverlap === oyT) {
          p.y = pl.y - p.h;
          if (p.vy > 0) p.vy = 0;
          p.onGround = true;
          if (pl.type === 'ice' || pl.subType === 'ice') p.onIce = true;
        } else if (minOverlap === oxL) {
          p.x = pl.x - p.w;
          p.vx = Math.min(0, p.vx);
        } else if (minOverlap === oxR) {
          p.x = pl.x + pl.w;
          p.vx = Math.max(0, p.vx);
        } else {
          p.y = pl.y + pl.h;
          if (p.vy < 0) p.vy = 0;
        }
      }
    },

    // =======================================================================
    // DETECCIÓN Y GESTIÓN DE PINES DE CUERDA (DYNAMIC CORNER WRAPPING)
    // =======================================================================
    checkCornerPinning(c1x, c1y, c2x, c2y) {
      if (this.ropePins.length >= 4) return;

      const pA = this.ropePins.length > 0 ? this.ropePins[this.ropePins.length - 1] : { x: c1x, y: c1y };
      const pB = { x: c2x, y: c2y };

      const minX = Math.min(pA.x, pB.x) - 12;
      const maxX = Math.max(pA.x, pB.x) + 12;
      const minY = Math.min(pA.y, pB.y) - 12;
      const maxY = Math.max(pA.y, pB.y) + 12;

      const allPlats = [...this.platforms, ...this.movingPlatforms];
      for (const pl of allPlats) {
        if (pl.broken) continue;
        if (pl.x + pl.w < minX || pl.x > maxX || pl.y + pl.h < minY || pl.y > maxY) continue;

        const corners = [
          { x: pl.x, y: pl.y, type: 'TL' },
          { x: pl.x + pl.w, y: pl.y, type: 'TR' },
          { x: pl.x, y: pl.y + pl.h, type: 'BL' },
          { x: pl.x + pl.w, y: pl.y + pl.h, type: 'BR' }
        ];

        for (const c of corners) {
          if (this.ropePins.some(p => Math.hypot(p.x - c.x, p.y - c.y) < 14)) continue;

          const dx = pB.x - pA.x;
          const dy = pB.y - pA.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq === 0) continue;

          const u = Math.max(0, Math.min(1, ((c.x - pA.x) * dx + (c.y - pA.y) * dy) / lenSq));
          const projX = pA.x + u * dx;
          const projY = pA.y + u * dy;
          const distToSeg = Math.hypot(c.x - projX, c.y - projY);

          if (distToSeg < 9 && u > 0.08 && u < 0.92) {
            const cross = (c.x - pA.x) * (pB.y - c.y) - (c.y - pA.y) * (pB.x - c.x);
            const sign = Math.sign(cross) || 1;
            this.ropePins.push({ x: c.x, y: c.y, plat: pl, type: c.type, sign });
            Sfx.tone(360, 0.05, 'sine', 0.025);
            return;
          }
        }
      }
    },

    checkCornerUnpinning(c1x, c1y, c2x, c2y) {
      if (this.ropePins.length === 0) return;
      const lastPin = this.ropePins[this.ropePins.length - 1];
      const prevPt = this.ropePins.length > 1 ? this.ropePins[this.ropePins.length - 2] : { x: c1x, y: c1y };
      const nextPt = { x: c2x, y: c2y };

      if (lastPin.plat && lastPin.plat.broken) {
        this.ropePins.pop();
        return;
      }

      const cross = (lastPin.x - prevPt.x) * (nextPt.y - lastPin.y) - (lastPin.y - prevPt.y) * (nextPt.x - lastPin.x);
      const curSign = Math.sign(cross);

      if (curSign !== 0 && curSign !== lastPin.sign) {
        this.ropePins.pop();
        Sfx.tone(260, 0.04, 'triangle', 0.02);
      }
    },

    // =======================================================================
    // MOTOR DE CUERDA RÍGIDA (DISTANCE JOINT UNILATERAL + MOMENTUM TRANSFER)
    // =======================================================================
    solveRigidRope(dt) {
      const p1 = this.p1;
      const p2 = this.p2;
      if (!p1 || !p2) return;

      const c1x = p1.x + p1.w / 2;
      const c1y = p1.y + p1.h * 0.55;
      const c2x = p2.x + p2.w / 2;
      const c2y = p2.y + p2.h * 0.55;

      // Actualizar detección de esquinas para Rope Corner Wrapping
      if (this.ropePins.length === 0) {
        this.checkCornerPinning(c1x, c1y, c2x, c2y);
      } else {
        this.checkCornerUnpinning(c1x, c1y, c2x, c2y);
        const last = this.ropePins[this.ropePins.length - 1];
        this.checkCornerPinning(last.x, last.y, c2x, c2y);
      }

      // Calcular longitud fija consumida por los pines
      let pinnedLen = 0;
      let prevPt = { x: c1x, y: c1y };
      for (const pin of this.ropePins) {
        pinnedLen += Math.hypot(pin.x - prevPt.x, pin.y - prevPt.y);
        prevPt = pin;
      }

      const maxTotalL = this.lvl.ropeLength || 185;
      const freeL = Math.max(26, maxTotalL - pinnedLen);

      // El pivote efectivo para la cuerda activa
      const pivot = this.ropePins.length > 0 ? this.ropePins[this.ropePins.length - 1] : { x: c1x, y: c1y };
      const dx = c2x - pivot.x;
      const dy = c2y - pivot.y;
      const dist = Math.hypot(dx, dy) || 0.001;

      // Estado de cuerda tensa
      this.ropeTaut = dist >= freeL - 1;
      this.rope.update(dt, p1, p2, this.ropeTaut, this.platforms, this.ropePins);

      if (dist <= freeL) return;

      const nx = dx / dist;
      const ny = dy / dist;
      const tx = -ny;
      const ty = nx;

      const w1 = this.ropePins.length > 0 ? 0 : p1.invMass();
      const w2 = p2.invMass();
      const totalW = w1 + w2;
      if (totalW <= 0) return;

      const over = dist - freeL;
      if (this.ropePins.length === 0) {
        p1.x += nx * over * (w1 / totalW);
        p1.y += ny * over * (w1 / totalW);
      }
      p2.x -= nx * over * (w2 / totalW);
      p2.y -= ny * over * (w2 / totalW);

      const relVx = p2.vx - (this.ropePins.length > 0 ? 0 : p1.vx);
      const relVy = p2.vy - (this.ropePins.length > 0 ? 0 : p1.vy);
      const rvn = relVx * nx + relVy * ny;

      if (rvn > 0) {
        const impulse = rvn / totalW;
        if (this.ropePins.length === 0) {
          p1.vx += nx * impulse * w1;
          p1.vy += ny * impulse * w1;
        }
        p2.vx -= nx * impulse * w2;
        p2.vy -= ny * impulse * w2;

        // Péndulo de 360 grados y oscilación con conversión de caída a velocidad tangencial pura
        if (w1 === 0 && w2 === 1 && !p2.onGround) {
          const tangSpeed = p2.vx * tx + p2.vy * ty;
          const fallingEnergy = Math.max(0, p2.vy);
          const swingDir = tangSpeed !== 0 ? Math.sign(tangSpeed) : Math.sign(nx);
          const finalTang = tangSpeed + swingDir * fallingEnergy * 0.45;

          p2.vx = finalTang * tx;
          p2.vy = finalTang * ty;
          p2.state = 'SWINGING';
          Sfx.ropeTension();

          // Hit-stop táctico en tirón súbito de cuerda
          if (rvn > 480) {
            Camera.hitStop(0.035);
            Camera.shake(7, 0.22);
            Sfx.squeak('panic');
          }
        } else if (w2 === 0 && w1 === 1 && !p1.onGround && this.ropePins.length === 0) {
          const tangSpeed = p1.vx * tx + p1.vy * ty;
          const fallingEnergy = Math.max(0, p1.vy);
          const swingDir = tangSpeed !== 0 ? Math.sign(tangSpeed) : -Math.sign(nx);
          const finalTang = tangSpeed + swingDir * fallingEnergy * 0.45;

          p1.vx = finalTang * tx;
          p1.vy = finalTang * ty;
          p1.state = 'SWINGING';
          Sfx.ropeTension();

          if (rvn > 480) {
            Camera.hitStop(0.035);
            Camera.shake(7, 0.22);
            Sfx.squeak('panic');
          }
        }

        if (w1 === 1 && p1.onGround && w2 === 0) p1.draggedTimer = 0.2;
        if (w2 === 1 && p2.onGround && w1 === 0) p2.draggedTimer = 0.2;
        if (w1 === 1 && p1.onGround && w2 === 1 && !p2.onGround) p1.draggedTimer = 0.25;
        if (w2 === 1 && p2.onGround && w1 === 1 && !p1.onGround) p2.draggedTimer = 0.25;
      }
    },

    // =======================================================================
    // EMPAQUETADO Y APLICACIÓN DE ESTADO MULTIJUGADOR
    // =======================================================================
    packNet(p) {
      if (!p) return null;
      return {
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        vx: Math.round(p.vx),
        vy: Math.round(p.vy),
        s: p.state,
        st: p.staminaTimer,
        f: p.facing,
        a: p.anim,
        sp: p.speech || '',
        spT: p.speechTimer || 0
      };
    },

    applyNet(d) {
      this.timer = d.t;
      this.falls = d.f;
      this.cpIdx = d.cp;
      this.currentAltitude = d.alt || 0;
      this.customFlag = d.flag || null;

      if (d.wind) {
        this.windDir = d.wind.dir;
        this.windPhase = d.wind.phase;
      }

      if (Array.isArray(d.crumbles)) {
        const crumbles = this.platforms.filter(p => p.type === 'crumble');
        for (let i = 0; i < Math.min(crumbles.length, d.crumbles.length); i++) {
          crumbles[i].broken = d.crumbles[i].b;
          crumbles[i].cracking = d.crumbles[i].c;
        }
      }

      if (Array.isArray(d.movings)) {
        for (let i = 0; i < Math.min(this.movingPlatforms.length, d.movings.length); i++) {
          this.movingPlatforms[i].x = d.movings[i].x;
          this.movingPlatforms[i].y = d.movings[i].y;
          this.movingPlatforms[i].progress = d.movings[i].p;
          this.movingPlatforms[i].dir = d.movings[i].d;
        }
      }

      const lerp = (a, b, f) => a + (b - a) * f;
      const syncEntity = (p, n) => {
        if (!p || !n) return;
        p.x = lerp(p.x, n.x, 0.48);
        p.y = lerp(p.y, n.y, 0.48);
        p.vx = n.vx;
        p.vy = n.vy;
        p.state = n.s || 'AIRBORNE';
        p.staminaTimer = typeof n.st === 'number' ? n.st : WALL_CLING_MAX_TIME;
        p.facing = n.f || 1;
        p.anim = n.a || 0;
        p.speech = n.sp || '';
        p.speechTimer = n.sp ? n.spT || 1 : 0;
      };

      syncEntity(this.p1, d.p1);
      syncEntity(this.p2, d.p2);

      if (d.rp && d.rp.length === this.rope.pts.length) {
        for (let i = 0; i < d.rp.length; i++) {
          this.rope.pts[i].x = d.rp[i][0];
          this.rope.pts[i].y = d.rp[i][1];
        }
        const dist = Math.hypot(d.p2.x - d.p1.x, d.p2.y - d.p1.y);
        this.rope.taut = dist >= (this.lvl.ropeLength || 185) - 2;
      }

      if (typeof d.fc === 'string') {
        for (let i = 0; i < this.collectibles.length; i++) {
          if (!this.collectibles[i].collected && d.fc[i] === '1') {
            this.collectibles[i].collected = true;
            SaveSys.collectFish(this.collectibles[i].id);
          }
        }
      }

      if (typeof d.cd === 'number' && d.cd > 0) {
        const ph = Math.min(3, Math.floor(d.cd));
        if (ph !== this.countdownLastPhase) {
          this.countdownLastPhase = ph;
          Sfx.countdown(ph);
          const t = ['3...', '2...', '1...', '¡YA!'][ph];
          if (this.p1) this.p1.say(t, 0.95);
          if (this.p2) this.p2.say(t, 0.95);
        }
      } else {
        this.countdownLastPhase = -1;
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
      const m = Math.floor(s / 60);
      const sec = (s % 60).toFixed(1);
      return `${String(m).padStart(2, '0')}:${sec.padStart(4, '0')}`;
    },

    updateHUD() {
      document.getElementById('hudAlt').textContent = `${this.currentAltitude}m`;
      document.getElementById('hudMaxAlt').textContent = `${SaveSys.cur().maxAltitude || 0}m`;
      document.getElementById('hudLevel').textContent = this.lvl ? this.lvl.name : 'Montaña';
      document.getElementById('hudCP').textContent = `${this.cpIdx + 1}/${this.checkpoints.length}`;
      document.getElementById('hudTime').textContent = this.fmtTime(this.timer);
      document.getElementById('hudFalls').textContent = this.falls;

      const collectedCount = this.collectibles.filter(f => f.collected).length;
      document.getElementById('hudFish').textContent = `${collectedCount}/${this.collectibles.length}`;

      const s1 = document.getElementById('stam1');
      const s2 = document.getElementById('stam2');
      const pct = p => Math.max(0, Math.min(100, (p.staminaTimer / WALL_CLING_MAX_TIME) * 100));

      if (s1 && this.p1) {
        s1.style.width = `${pct(this.p1)}%`;
        s1.classList.toggle('stam-low', this.p1.staminaTimer <= WALL_LOW_TIME && this.p1.state === 'WALL_CLING');
      }

      if (s2) {
        if (this.mode === 'solo') {
          s2.style.width = '100%';
          s2.classList.remove('stam-low');
          document.getElementById('p2Dot').textContent = '🪨';
        } else if (this.p2) {
          s2.style.width = `${pct(this.p2)}%`;
          s2.classList.toggle('stam-low', this.p2.staminaTimer <= WALL_LOW_TIME && this.p2.state === 'WALL_CLING');
          document.getElementById('p2Dot').textContent = 'P2';
        }
      }
    },

    // =======================================================================
    // RENDERIZADO VISUAL EN CANVAS 2D
    // =======================================================================
    render(dt) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;

      // 1. Cielo pastel Bread & Fred dinámico según la altitud (de amanecer alpino a noche cósmica con auroras)
      const altRatio = Math.max(0, Math.min(1, this.currentAltitude / 500));
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      if (altRatio < 0.35) {
        // Base y Glaciar (0m - 175m): Amanecer pastel alpino icónico Bread & Fred
        skyGrad.addColorStop(0, '#5372e9');
        skyGrad.addColorStop(0.26, '#7684ef');
        skyGrad.addColorStop(0.55, '#b998f4');
        skyGrad.addColorStop(0.78, '#f1a8d4');
        skyGrad.addColorStop(1, '#fdd8c7');
      } else if (altRatio < 0.7) {
        // Alturas intermedias (175m - 350m): Atardecer violeta / rosa alpino
        skyGrad.addColorStop(0, '#362f6b');
        skyGrad.addColorStop(0.3, '#5c4687');
        skyGrad.addColorStop(0.6, '#935e98');
        skyGrad.addColorStop(0.85, '#cf7f9e');
        skyGrad.addColorStop(1, '#f6c3b7');
      } else {
        // Cumbres (350m - 500m): Noche cósmica alpina con estrellas y resplandor violeta
        skyGrad.addColorStop(0, '#0c0f2b');
        skyGrad.addColorStop(0.35, '#191b45');
        skyGrad.addColorStop(0.7, '#2f245a');
        skyGrad.addColorStop(1, '#5a3d78');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Auroras boreales mágicas en alta montaña (altRatio > 0.65)
      if (altRatio > 0.65) {
        const auroraA = (altRatio - 0.65) * 2.8;
        ctx.save();
        ctx.globalAlpha = Math.min(0.42, auroraA);
        const timeNow = performance.now() * 0.001;
        for (let j = 0; j < 2; j++) {
          ctx.beginPath();
          ctx.moveTo(0, h * 0.2);
          for (let x = 0; x <= w + 60; x += 40) {
            const ay = h * (0.15 + j * 0.12) + Math.sin(x * 0.005 + timeNow + j) * 45 + Math.cos(x * 0.003 - timeNow * 0.6) * 30;
            ctx.lineTo(x, ay);
          }
          ctx.lineTo(w, h * 0.65);
          ctx.lineTo(0, h * 0.65);
          ctx.closePath();
          ctx.fillStyle = j === 0 ? 'rgba(52, 211, 153, 0.35)' : 'rgba(192, 132, 252, 0.28)';
          ctx.fill();
        }
        ctx.restore();
      }

      // Estrellas brillantes en la cumbre
      if (altRatio > 0.45) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, (altRatio - 0.45) * 1.8)})`;
        for (let i = 0; i < 48; i++) {
          const sx = (i * 53 + 17) % w;
          const sy = (i * 37 + 11) % (h * 0.72);
          const starSz = (i % 5 === 0) ? 2.5 : 1.5;
          ctx.fillRect(sx, sy, starSz, starSz);
        }
      }

      // Nubes cumulus pastel con suave deriva horizontal
      if (this.clouds) {
        ctx.save();
        for (const cl of this.clouds) {
          cl.x += cl.speed * dt;
          if (cl.x > w + 160) cl.x = -160;
          ctx.save();
          ctx.translate(cl.x, cl.y);
          ctx.scale(cl.scale, cl.scale);
          // Sombra inferior de la nube (lila pastel)
          ctx.fillStyle = altRatio < 0.6 ? 'rgba(224, 204, 238, 0.48)' : 'rgba(100, 85, 140, 0.35)';
          for (const pf of cl.puffs) {
            ctx.beginPath();
            ctx.arc(pf.ox, pf.oy + 5, pf.r, 0, Math.PI * 2);
            ctx.fill();
          }
          // Cuerpo blanco esponjoso de la nube cumulus
          ctx.fillStyle = altRatio < 0.6 ? 'rgba(255, 255, 255, 0.82)' : 'rgba(220, 215, 245, 0.65)';
          for (const pf of cl.puffs) {
            ctx.beginPath();
            ctx.arc(pf.ox, pf.oy, pf.r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
        ctx.restore();
      }

      // Montañas de fondo con 3 capas de parallax lila / violeta pastel con picos nevados
      const drawParallaxMountain = (factor, color, snowColor, baseH, amp, freq1, freq2) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, h);
        const pts = [];
        for (let x = 0; x <= w + 80; x += 40) {
          const wx = x + Camera.x * factor;
          const py = h - baseH - Math.abs(Math.sin(wx * freq1) * amp + Math.cos(wx * freq2) * (amp * 0.55));
          pts.push({ x, py });
          ctx.lineTo(x, py);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();

        // Cimas nevadas en los picos de las montañas de fondo
        if (snowColor) {
          ctx.fillStyle = snowColor;
          ctx.beginPath();
          for (let i = 0; i < pts.length; i++) {
            const pt = pts[i];
            const isPeak = (i > 0 && i < pts.length - 1 && pt.py < pts[i - 1].py && pt.py < pts[i + 1].py);
            if (isPeak) {
              ctx.moveTo(pt.x, pt.py);
              ctx.lineTo(pt.x - 22, pt.py + 26);
              ctx.lineTo(pt.x + 22, pt.py + 26);
              ctx.closePath();
            }
          }
          ctx.fill();
        }
      };

      if (altRatio < 0.6) {
        // Capas diurnas pastel Bread & Fred
        drawParallaxMountain(0.04, '#a89bc4', '#ebe4f7', 260, 140, 0.0018, 0.0042);
        drawParallaxMountain(0.12, '#7a6899', '#d2c7e8', 180, 110, 0.0026, 0.0055);
        drawParallaxMountain(0.25, '#4e3b6d', '#a493c4', 95, 75, 0.0038, 0.0075);
      } else {
        // Capas nocturnas / crepúsculo violeta
        drawParallaxMountain(0.04, '#242048', '#54467c', 260, 140, 0.0018, 0.0042);
        drawParallaxMountain(0.12, '#1b173b', '#413466', 180, 110, 0.0026, 0.0055);
        drawParallaxMountain(0.25, '#120f2b', '#302550', 95, 75, 0.0038, 0.0075);
      }

      // Actualizar cámara Lerp
      Camera.update(dt, this.p1, this.p2);
      const shake = Camera.getShakeOffsets();

      ctx.save();
      ctx.translate(w / 2 + shake.sx, h / 2 + shake.sy);
      ctx.scale(Camera.zoom, Camera.zoom);
      ctx.translate(-Camera.x, -Camera.y);

      // 2. Carteles de historia y consejos en madera Bread & Fred
      for (const sg of (this.lvl ? this.lvl.signs || [] : [])) {
        // Poste de madera
        ctx.fillStyle = '#78350f';
        ctx.fillRect(sg.x - 4, sg.y, 8, 32);
        ctx.font = 'bold 12px "Courier New", Courier, monospace, sans-serif';
        const tw = ctx.measureText(sg.text).width + 24;

        // Tabla de madera con nieve
        ctx.fillStyle = '#92400e';
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(sg.x - tw / 2, sg.y - 36, tw, 28, 6);
        ctx.fill();
        ctx.stroke();

        // Nieve encima del cartel
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(sg.x - tw / 2 - 2, sg.y - 39, tw + 4, 6, 3);
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        ctx.textAlign = 'center';
        ctx.fillText(sg.text, sg.x, sg.y - 18);
      }

      // 3. Plataformas Bread & Fred: Tierra chocolate stippled, manto de nieve esponjoso con drips, carámbanos y troncos
      for (const pl of this.platforms) {
        if (pl.broken) continue;
        const ox = pl.cracking ? (Math.random() - 0.5) * 6 : 0;
        const px = pl.x + ox;
        const py = pl.y;
        const pw = pl.w;
        const ph = pl.h;

        if (pl.type === 'normal') {
          // ¿Es un puente estrecho de troncos? (pl.w <= 90 y altura reducida)
          const isLogBridge = pw <= 90 && ph <= 22;
          if (isLogBridge) {
            const numLogs = Math.max(2, Math.floor(pw / 18));
            const logW = pw / numLogs;
            for (let li = 0; li < numLogs; li++) {
              const lx = px + li * logW;
              ctx.fillStyle = '#78350f';
              ctx.beginPath();
              ctx.roundRect(lx + 1, py + 2, logW - 2, ph - 2, 4);
              ctx.fill();
              ctx.fillStyle = '#92400e';
              ctx.fillRect(lx + 3, py + 4, logW - 6, 3);
              ctx.strokeStyle = '#d97706';
              ctx.lineWidth = 1.5;
              ctx.strokeRect(lx + 2, py + 3, logW - 4, ph - 4);
            }
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(px, py, pw, 5, 2);
            ctx.fill();
          } else {
            // Masa rocosa terrosa chocolate estilo Bread & Fred
            ctx.fillStyle = '#452312';
            ctx.beginPath();
            ctx.roundRect(px, py + 8, pw, ph - 8, [0, 0, 7, 7]);
            ctx.fill();

            // Borde inferior oscuro
            ctx.fillStyle = '#261208';
            ctx.fillRect(px, py + ph - 4, pw, 4);

            // Punteado pixel-art de textura rocosa (estrato mineral)
            const seed = (Math.floor(px) * 31 + Math.floor(py) * 17);
            ctx.fillStyle = '#5c321b';
            for (let rx = 12; rx < pw - 12; rx += 18) {
              const rHash = ((seed + rx) * 11) % 19;
              if (rHash > 7 && ph > 20) {
                ctx.fillRect(px + rx, py + 16 + (rHash % 4) * 3, 4, 3);
              }
            }
            ctx.fillStyle = '#2d150a';
            for (let rx = 8; rx < pw - 8; rx += 22) {
              const rHash = ((seed + rx * 3) * 7) % 17;
              if (rHash > 8 && ph > 22) {
                ctx.fillRect(px + rx, py + 14 + (rHash % 3) * 4, 3, 3);
              }
            }

            // Manto de nieve esponjoso y grueso (Pillowy Snow Blanket)
            const snowH = Math.min(14, ph * 0.65);
            // Sombra azul-hielo debajo del manto de nieve
            ctx.fillStyle = '#b3c7f5';
            ctx.beginPath();
            ctx.roundRect(px, py, pw, snowH + 3.5, [7, 7, 4, 4]);
            ctx.fill();

            // Manto de nieve blanco brillante
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(px, py, pw, snowH, [7, 7, 3, 3]);
            ctx.fill();

            // Gotas de nieve redondeadas colgantes (Snow Drips) estilo Bread & Fred
            const dripStep = 18;
            for (let dx = px + 10; dx <= px + pw - 10; dx += dripStep) {
              const dripHash = ((seed + dx) * 7) % 5;
              const dripR = 3.2 + (dripHash % 3);
              ctx.fillStyle = '#b3c7f5';
              ctx.beginPath();
              ctx.arc(dx, py + snowH + 1.2, dripR + 0.8, 0, Math.PI);
              ctx.fill();
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(dx, py + snowH, dripR, 0, Math.PI);
              ctx.fill();
            }

            // Carámbanos de hielo colgantes bajo salientes (Icicles)
            if (ph >= 30 && pw >= 40) {
              for (let ix = px + 14; ix <= px + pw - 14; ix += 36) {
                const iHash = ((seed + ix * 5) * 13) % 7;
                if (iHash > 2) {
                  const iLen = 8 + (iHash % 4) * 3;
                  ctx.fillStyle = '#bae6fd';
                  ctx.beginPath();
                  ctx.moveTo(ix - 3.5, py + ph);
                  ctx.lineTo(ix + 3.5, py + ph);
                  ctx.lineTo(ix, py + ph + iLen);
                  ctx.closePath();
                  ctx.fill();
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(ix - 1, py + ph, 1.5, iLen * 0.55);
                }
              }
            }
          }
        } else if (pl.type === 'ice') {
          // Bloque de hielo glacial translúcido con brillo Bread & Fred
          const grad = ctx.createLinearGradient(px, py, px, py + ph);
          grad.addColorStop(0, '#38bdf8');
          grad.addColorStop(0.3, '#0284c7');
          grad.addColorStop(1, '#0369a1');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(px, py, pw, ph, 7);
          ctx.fill();

          // Grietas cristalinas internas
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(px + 12, py + 8);
          ctx.lineTo(px + 28, py + ph - 8);
          ctx.lineTo(px + 38, py + ph - 4);
          if (pw > 70) {
            ctx.moveTo(px + pw - 24, py + 6);
            ctx.lineTo(px + pw - 38, py + ph - 10);
          }
          ctx.stroke();

          // Capa de escarcha brillante superior
          ctx.fillStyle = '#e0f2fe';
          ctx.beginPath();
          ctx.roundRect(px, py, pw, 7, [7, 7, 2, 2]);
          ctx.fill();

          // Reflejo especular blanco fino
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px + 10, py + 2.5);
          ctx.lineTo(px + pw - 10, py + 2.5);
          ctx.stroke();

          // Carámbanos de hielo afilados debajo
          for (let ix = px + 12; ix <= px + pw - 12; ix += 24) {
            const iLen = 9 + ((ix * 7) % 7);
            ctx.fillStyle = 'rgba(186, 230, 253, 0.85)';
            ctx.beginPath();
            ctx.moveTo(ix - 3, py + ph);
            ctx.lineTo(ix + 3, py + ph);
            ctx.lineTo(ix, py + ph + iLen);
            ctx.closePath();
            ctx.fill();
          }
        } else if (pl.type === 'climbWall') {
          // Muro de escalada / Cascada de hielo congelada para piolet
          ctx.fillStyle = '#075985';
          ctx.fillRect(px, py, pw, ph);

          // Rayas verticales de cascada helada
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          for (let lx = px + 6; lx < px + pw - 4; lx += 12) {
            ctx.beginPath();
            ctx.moveTo(lx, py);
            ctx.lineTo(lx, py + ph);
            ctx.stroke();
          }

          // Bordes de hielo cristalino
          ctx.strokeStyle = '#bae6fd';
          ctx.lineWidth = 2;
          ctx.strokeRect(px, py, pw, ph);

          // Puntos de agarre / muescas de piolet
          ctx.fillStyle = '#e0f2fe';
          for (let wy = py + 16; wy < py + ph - 8; wy += 22) {
            ctx.fillRect(px + 4, wy, pw - 8, 3);
          }
        } else if (pl.type === 'crumble') {
          // Bloque quebradizo
          ctx.fillStyle = pl.cracking ? '#ef4444' : '#67e8f9';
          ctx.beginPath();
          ctx.roundRect(px, py, pw, ph, 5);
          ctx.fill();

          // Fisuras de fractura
          ctx.strokeStyle = pl.cracking ? '#fef08a' : '#ffffff';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(px + 6, py + 4);
          ctx.lineTo(px + pw / 2, py + ph / 2);
          ctx.lineTo(px + pw - 8, py + ph - 4);
          ctx.stroke();
        }
      }

      // 4. Plataformas móviles
      for (const mp of this.movingPlatforms) {
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.roundRect(mp.x, mp.y, mp.w, mp.h, 8);
        ctx.fill();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.strokeRect(mp.x, mp.y, mp.w, mp.h);

        // Engranaje central
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(mp.x + mp.w / 2, mp.y + mp.h / 2, 7, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Pinchos de escarcha (Hazards)
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

      // 6. Sardinas Doradas coleccionables
      const bob = Math.sin(performance.now() * 0.005) * 5;
      for (const fish of this.collectibles) {
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

      // 7. Checkpoints oficiales
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

      // 8. Bandera de Checkpoint personal (Asistencia Bread & Fred)
      if (this.customFlag) {
        const cf = this.customFlag;
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(cf.x - 2, cf.y - 50, 4, 50);
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(cf.x + 2, cf.y - 50);
        ctx.lineTo(cf.x + 26, cf.y - 40);
        ctx.lineTo(cf.x + 2, cf.y - 30);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText('CP', cf.x + 6, cf.y - 37);
      }

      // 9. Meta / Altar Dorado de la Cumbre
      if (this.lvl && this.lvl.goal) {
        const g = this.lvl.goal;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(g.x + g.w / 2, g.y + g.h, g.w / 2, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(g.x + g.w / 2, g.y + g.h, 18, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🏁 CUMBRE 500m', g.x + g.w / 2, g.y + 25);
      }

      // 9.5 Rastro de telemetría de caída ("Trail of Shame")
      if (this.shameTrail && this.shameTrail.length > 1 && this.shameTrailAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, this.shameTrailAlpha);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        this.shameTrail.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#f87171';
        for (let i = 1; i < this.shameTrail.length; i += 3) {
          const pt = this.shameTrail[i];
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y + 7);
          ctx.lineTo(pt.x - 5, pt.y - 4);
          ctx.lineTo(pt.x + 5, pt.y - 4);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        this.shameTrailAlpha = Math.max(0, this.shameTrailAlpha - dt * 0.22);
      }

      // Pines de esquinas envueltas (Carabineros de contacto)
      if (this.ropePins && this.ropePins.length > 0) {
        for (const pin of this.ropePins) {
          ctx.save();
          ctx.fillStyle = '#fbbf24';
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pin.x, pin.y, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      // 10. Cuerda (Tensa con vibración sutil vs Comba Verlet)
      if (this.rope) {
        ctx.strokeStyle = this.rope.taut ? '#fbbf24' : '#d97706';
        ctx.lineWidth = this.rope.taut ? 4.2 : 4.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        this.rope.pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.stroke();
      }

      // 11. Pingüinos y Roca Jeff
      if (this.mode === 'solo' && this.jeff) {
        this.drawPenguin(ctx, this.p1, true);
        this.drawJeff(ctx, this.jeff);
      } else {
        this.drawPenguin(ctx, this.p1, false);
        this.drawPenguin(ctx, this.p2, false);
      }

      // 12. Partículas
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt;
        if (pt.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, pt.life / pt.max);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // 13. Nieve atmosférica en primer plano
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      const windPush = this.windDir * (this.windPhase === 'gust' ? 380 : 120);
      for (const s of this.snow) {
        s.x += (s.vx + windPush) * dt;
        s.y += s.vy * dt;
        if (s.y > h) s.y = -10;
        if (s.x > w) s.x = 0;
        else if (s.x < 0) s.x = w;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    // =======================================================================
    // DIBUJO DETALLADO DEL PINGÜINO (16-BIT RETRO PIXEL-ART EXACTO)
    // =======================================================================
    drawPenguin(ctx, p, isActiveSolo) {
      if (!p) return;
      ctx.save();

      const moving = Math.abs(p.vx) > 12 && p.onGround;
      const walkCycle = moving ? Math.sin(p.anim * 1.5) : 0;
      const isSlide = p.state === 'BELLY_SLIDE';
      const isFaceplant = p.state === 'FACEPLANT';
      const isPiggy = p.state === 'PIGGYBACK';
      const isPanic = !p.onGround && p.vy > 550;
      const tilt = isFaceplant
        ? p.facing * 1.5
        : (isSlide ? p.facing * 0.22 : (moving ? walkCycle * 0.08 : (!p.onGround ? Math.max(-0.24, Math.min(0.24, p.vy * 0.0004)) : 0)));

      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);

      // Bocadillo de diálogo flotante estilo Bread & Fred (Violeta / Indigo retro)
      if (p.speech && p.speechTimer > 0) {
        ctx.save();
        ctx.font = 'bold 12px "Courier New", Courier, monospace, sans-serif';
        const pad = 14;
        const bw = ctx.measureText(p.speech).width + pad * 2;
        const bh = 26;
        const by = -p.h / 2 - 46;

        // Sombra suave del bocadillo
        ctx.fillStyle = 'rgba(15, 10, 30, 0.45)';
        ctx.beginPath();
        ctx.roundRect(-bw / 2 + 2, by + 2, bw, bh, 9);
        ctx.fill();

        // Fondo violeta-indigo oscuro Bread & Fred
        ctx.fillStyle = '#261b44';
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-bw / 2, by, bw, bh, 8);
        ctx.fill();
        ctx.stroke();

        // Cola triangular del bocadillo apuntando a la cabeza
        ctx.fillStyle = '#261b44';
        ctx.beginPath();
        ctx.moveTo(-4, by + bh);
        ctx.lineTo(4, by + bh);
        ctx.lineTo(0, by + bh + 7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-4, by + bh);
        ctx.lineTo(0, by + bh + 7);
        ctx.lineTo(4, by + bh);
        ctx.stroke();

        // Texto brillante retro en amarillo arcade
        ctx.fillStyle = '#fef08a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.speech, 0, by + bh / 2);
        ctx.restore();
      }

      ctx.rotate(tilt);

      // Indicador de control en modo solo
      if (isActiveSolo) {
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.moveTo(0, -p.h / 2 - 14);
        ctx.lineTo(-6, -p.h / 2 - 22);
        ctx.lineTo(6, -p.h / 2 - 22);
        ctx.closePath();
        ctx.fill();
      }

      // Deformaciones físicas por estado: squash & stretch elástico
      if (p.state === 'ANCHORED') {
        ctx.scale(1.22, 0.72);
      } else if (isSlide) {
        ctx.scale(1.36, 0.62);
      } else if (isFaceplant) {
        ctx.scale(1.42, 0.58);
      } else {
        ctx.scale(p.squashX || 1, p.squashY || 1);
      }

      const lowCling = p.state === 'WALL_CLING' && p.staminaTimer <= WALL_LOW_TIME;

      // 1. Patitas naranjas animadas
      ctx.fillStyle = '#f97316';
      if (isSlide) {
        // En panzazo las patitas se levantan por detrás
        ctx.beginPath();
        ctx.ellipse(-p.facing * 12, -4, 5.5, 3.2, p.facing * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const footLiftL = moving ? Math.max(0, Math.sin(p.anim * 1.6)) * 4 : (!p.onGround ? 2 : 0);
        const footLiftR = moving ? Math.max(0, -Math.sin(p.anim * 1.6)) * 4 : (!p.onGround ? -2 : 0);
        ctx.beginPath();
        ctx.ellipse(-6, p.h / 2 - 2 - footLiftL, 6.5, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(6, p.h / 2 - 2 - footLiftR, 6.5, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Silueta retro del cuerpo (chunky rounded egg)
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.ellipse(0, 1, p.w / 2, p.h / 2 - 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Borde exterior pixel-art oscuro
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Parpadeo rojo en Wall Cling bajo de stamina
      if (lowCling) {
        const blink = Math.sin(performance.now() * 0.02) > 0;
        if (blink) {
          ctx.strokeStyle = 'rgba(248, 113, 113, 0.95)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(0, 1, p.w / 2 + 2, p.h / 2 - 1, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // 3. Barriga blanca acolchada
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      if (isSlide) {
        // Barriga orientada hacia el suelo durante el deslizamiento
        ctx.ellipse(0, p.h / 4 + 2, p.w / 2.2, p.h / 3.4, 0, 0, Math.PI * 2);
      } else {
        ctx.ellipse(p.facing * 2.5, 3.5, p.w / 2.9, p.h / 2.6, 0, 0, Math.PI * 2);
      }
      ctx.fill();

      // 4. Arnés de escalada y mosquetón de anclaje de cuerda
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2 + 2, 4, p.w - 4, 4.5);
      // Mosquetón metálico dorado con brillo
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 6.2, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 5. Aleta animada con estados (panzazo, a caballito, pánico, emote)
      ctx.save();
      let wingAngle = 0.15;
      if (p.isEmoting) {
        wingAngle = -1.6;
      } else if (isPanic) {
        wingAngle = -1.4 + Math.sin(performance.now() * 0.04) * 0.35;
      } else if (isPiggy) {
        wingAngle = -1.1 + Math.sin(performance.now() * 0.02) * 0.3;
      } else if (!p.onGround) {
        wingAngle = -0.55;
      } else if (moving) {
        wingAngle = walkCycle * 0.35;
      }

      ctx.translate(-p.facing * 3, isSlide ? 4 : 0);
      ctx.rotate(p.facing * wingAngle);
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.ellipse(0, 5, 4.2, 9.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Destello de chocar los cinco si está en emote
      if (p.isEmoting) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(p.facing * 14, -p.h / 2 - 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. Ojos expresivos con animación de parpadeo, pánico y faceplant
      if (isFaceplant) {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.facing * 3.5, -8);
        ctx.lineTo(p.facing * 9.5, -3);
        ctx.moveTo(p.facing * 9.5, -8);
        ctx.lineTo(p.facing * 3.5, -3);
        ctx.stroke();

        const rotS = performance.now() * 0.005;
        ctx.fillStyle = '#fbbf24';
        for (let i = 0; i < 3; i++) {
          const ang = rotS + (i * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * 14, -p.h / 2 - 12 + Math.sin(ang) * 4, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (p.isBlinking) {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.facing * 4, -5.5);
        ctx.lineTo(p.facing * 9.5, -5.5);
        ctx.stroke();
      } else if (isPanic) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.facing * 6, -6, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#090d16';
        ctx.beginPath();
        ctx.arc(p.facing * 7, -6, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (isPiggy || p.isEmoting) {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.facing * 6, -5, 3.5, Math.PI, 0);
        ctx.stroke();
      } else {
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
      }

      // 7. Pico naranja con apertura al gritar
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      if (isPanic) {
        ctx.moveTo(p.facing * 8, -6);
        ctx.lineTo(p.facing * 19, -3);
        ctx.lineTo(p.facing * 8, 4);
        ctx.closePath();
      } else {
        ctx.moveTo(p.facing * 9, -4.5);
        ctx.lineTo(p.facing * 18.5, -1.5);
        ctx.lineTo(p.facing * 9, 2);
        ctx.closePath();
      }
      ctx.fill();

      // 8. Gorro de lana tejido retro con pompón esponjoso y textura de punto
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, -8.5, p.w / 2 - 0.5, Math.PI, 0);
      ctx.fill();

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.lineWidth = 1.2;
      for (let rx = -p.w / 3; rx <= p.w / 3; rx += 5) {
        ctx.beginPath();
        ctx.moveTo(rx, -9);
        ctx.lineTo(rx * 0.7, -19);
        ctx.stroke();
      }

      ctx.fillStyle = p.hatTrim;
      ctx.beginPath();
      ctx.roundRect(-p.w / 2, -11, p.w, 4.5, 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -20.5, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
      ctx.beginPath();
      ctx.arc(1, -21.5, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // 9. Piolet en mano
      const holdingAxe = p.state === 'ANCHORED' || p.state === 'WALL_CLING';
      if (holdingAxe) {
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

      // Gotas de sudor en low stamina
      if (lowCling) {
        ctx.fillStyle = '#38bdf8';
        const dropY = -12 + ((performance.now() * 0.03) % 8);
        ctx.beginPath();
        ctx.arc(-p.facing * 11, dropY, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    },

    // =======================================================================
    // DIBUJO DE LA ROCA JEFF (MODO SOLO)
    // =======================================================================
    drawJeff(ctx, j) {
      if (!j) return;
      ctx.save();
      ctx.translate(j.x + j.w / 2, j.y + j.h / 2);

      if (j.speech && j.speechTimer > 0) {
        ctx.save();
        ctx.font = 'bold 12px "Courier New", Courier, monospace, sans-serif';
        const pad = 14;
        const bw = ctx.measureText(j.speech).width + pad * 2;
        const bh = 26;
        const by = -j.h / 2 - 46;

        // Sombra suave del bocadillo
        ctx.fillStyle = 'rgba(15, 10, 30, 0.45)';
        ctx.beginPath();
        ctx.roundRect(-bw / 2 + 2, by + 2, bw, bh, 9);
        ctx.fill();

        // Fondo violeta-indigo oscuro Bread & Fred
        ctx.fillStyle = '#261b44';
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-bw / 2, by, bw, bh, 8);
        ctx.fill();
        ctx.stroke();

        // Cola triangular del bocadillo apuntando a la roca
        ctx.fillStyle = '#261b44';
        ctx.beginPath();
        ctx.moveTo(-4, by + bh);
        ctx.lineTo(4, by + bh);
        ctx.lineTo(0, by + bh + 7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(-4, by + bh);
        ctx.lineTo(0, by + bh + 7);
        ctx.lineTo(4, by + bh);
        ctx.stroke();

        // Texto brillante retro
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(j.speech, 0, by + bh / 2);
        ctx.restore();
      }

      ctx.rotate(j.carried ? 0 : j.spin);

      // Silueta de roca facetada con sombreado pixel-art
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.moveTo(-j.w / 2 + 4, j.h / 2);
      ctx.lineTo(-j.w / 2, -j.h / 8);
      ctx.lineTo(-j.w / 5, -j.h / 2);
      ctx.lineTo(j.w / 5, -j.h / 2 - 3);
      ctx.lineTo(j.w / 2, -j.h / 10);
      ctx.lineTo(j.w / 2 - 3, j.h / 2);
      ctx.closePath();
      ctx.fill();

      // Borde exterior
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Facetas y grietas de piedra
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(-8, 4, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(9, 7, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Ojos de Jeff que miran hacia P1
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(-6, -2, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(6, -2, 3.6, 0, Math.PI * 2);
      ctx.fill();

      const lookX = this.p1 ? Math.sign((this.p1.x - j.x) || 1) : 1;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-6 + lookX * 1.3, -2, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(6 + lookX * 1.3, -2, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Resplandor de anclaje
      if (j.state === 'ANCHORED') {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-j.w / 2 - 6, -j.h / 2 - 8);
        ctx.lineTo(j.w / 2 + 6, -j.h / 2 - 8);
        ctx.stroke();
      }

      ctx.restore();
    }
  };

  // Inicializar juego al cargar el DOM
  window.addEventListener('DOMContentLoaded', () => {
    window.Game.init();
  });
})();
