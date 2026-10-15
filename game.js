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
      this.state = 'AIRBORNE'; // 'GROUNDED' | 'ANCHORED' | 'WALL_CLING' | 'SWINGING' | 'FACEPLANT' | 'AIRBORNE'
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
    }

    invMass() {
      // Masa infinita si está anclado en suelo o pegado a pared
      if (this.state === 'ANCHORED' || this.state === 'WALL_CLING') return 0;
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

    update(dt, p1, p2, taut, platforms) {
      this.taut = taut;
      const x1 = p1.x + p1.w / 2;
      const y1 = p1.y + p1.h * 0.55;
      const x2 = p2.x + p2.w / 2;
      const y2 = p2.y + p2.h * 0.55;

      // Si la cuerda está tensa, alinear nodos rígidamente con leve vibración
      if (taut) {
        const vib = Math.sin(performance.now() * 0.05) * 0.8;
        for (let i = 0; i < this.n; i++) {
          const t = i / (this.n - 1);
          const px = x1 + (x2 - x1) * t;
          const py = y1 + (y2 - y1) * t + (i > 0 && i < this.n - 1 ? vib : 0);
          this.pts[i].x = px;
          this.pts[i].y = py;
          this.pts[i].ox = px;
          this.pts[i].oy = py;
        }
        return;
      }

      // Si la cuerda tiene comba, aplicar física Verlet con gravedad
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

    // Sistema de viento cíclico (4s calma -> 2s aviso -> 3.5s ráfaga)
    windDir: 0,
    windTimer: 4.0,
    windPhase: 'calm', // 'calm' | 'alert' | 'gust'

    // Cuenta atrás cooperativa ("3... 2... 1... ¡YA!")
    countdownActive: false,
    countdownTimer: 0,
    countdownPhase: -1,
    countdownLastPhase: -1,

    // Bucle principal
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
          accumulator += dt;
          while (accumulator >= fixedStep) {
            this.updateFixed(fixedStep);
            accumulator -= fixedStep;
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
      SaveSys.updateMaxAltitude(m);
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

      const assists = SaveSys.cur().assists;
      const infiniteStamina = assists.infiniteStamina;

      // =====================================================================
      // 1. ESTADO FACEPLANT (Estampado tras gran caída)
      // =====================================================================
      if (p.state === 'FACEPLANT') {
        p.vx = 0;
        // Solo se levanta si el jugador pulsa Izquierda, Derecha o Salto
        if (cmd.left || cmd.right || cmd.jump) {
          p.state = p.onGround ? 'GROUNDED' : 'AIRBORNE';
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
        // Desanclar si se suelta Grab o si se pierde el suelo
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

        // Si se agota la stamina: soltar a la fuerza
        if (p.staminaTimer <= 0) {
          p.grabLocked = true;
          p.state = 'AIRBORNE';
          p.vy = 60;
          p.say("¡Se me resbala el piolet!", 1.8);
        }
        // En los últimos 1.2s: resbalar lentamente hacia abajo
        else if (p.staminaTimer <= WALL_LOW_TIME) {
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
          Sfx.jump();
          this.spawnParticles(p.x + p.w / 2, p.y + p.h, '#e0f2fe', 8);
        }

        // Si se suelta Grab o ya no toca la pared
        if (p.state === 'WALL_CLING' && (!cmd.grab || !p.touchingWall)) {
          p.state = 'AIRBORNE';
        }
      }

      // =====================================================================
      // 4. ESTADO SWINGING (En el aire con cuerda tensa al máximo)
      // =====================================================================
      else if (p.state === 'SWINGING') {
        // Bombeo tangencial con Izquierda/Derecha
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
          Sfx.jump();
          this.spawnParticles(p.x + p.w / 2, p.y + p.h, '#fff', 8);
        }

        // Agarre a pared desde el balanceo
        if (p.state === 'SWINGING' && cmd.grab && p.touchingWall && !p.grabLocked && p.clingCooldown <= 0 && p.staminaTimer > 0) {
          p.state = 'WALL_CLING';
          p.vx = 0;
          p.vy = 0;
          Sfx.pick();
          this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#e0f2fe', 6);
        }
      }

      // =====================================================================
      // 5. ESTADO GROUNDED (En suelo firme)
      // =====================================================================
      else if (p.state === 'GROUNDED') {
        const accel = p.onIce ? ICE_ACCEL : GROUND_ACCEL;
        const maxSpd = p.onIce ? ICE_MAX_SPD : GROUND_MAX_SPD;

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

        // Salto individual bajo
        if (cmd.jump && !p.jumpHeld) {
          p.jumpHeld = true;
          p.jumpHoldTimer = JUMP_HOLD_T;
          p.vy = -JUMP_V;
          p.state = 'AIRBORNE';
          Sfx.jump();
          this.spawnParticles(p.x + p.w / 2, p.y + p.h, '#fff', 6);
        }

        // Anclarse con piolet en suelo
        if (cmd.grab && p.state === 'GROUNDED') {
          if (p.onIce) {
            if (p.iceMsgTimer <= 0) {
              p.say("¡El piolet resbala en el hielo!", 1.6);
              p.iceMsgTimer = 2.5;
            }
          } else {
            p.state = 'ANCHORED';
            p.vx = 0;
            p.vy = 0;
            Sfx.pick();
            this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#e0f2fe', 6);
          }
        }
      }

      // =====================================================================
      // 6. ESTADO AIRBORNE (En el aire libre)
      // =====================================================================
      else {
        if (cmd.left) {
          p.vx = Math.max(-GROUND_MAX_SPD, p.vx - AIR_ACCEL * dt);
          p.facing = -1;
        } else if (cmd.right) {
          p.vx = Math.min(GROUND_MAX_SPD, p.vx + AIR_ACCEL * dt);
          p.facing = 1;
        }

        // Agarre a pared vertical en el aire
        if (cmd.grab && p.touchingWall && !p.onGround && !p.grabLocked && p.clingCooldown <= 0 && p.staminaTimer > 0) {
          p.state = 'WALL_CLING';
          p.vx = 0;
          p.vy = 0;
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

      // Fricción aérea sutil
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
        if (p.impactVy >= FACEPLANT_CRITICAL_VY && p.state !== 'ANCHORED') {
          p.state = 'FACEPLANT';
          p.vx = 0;
          p.vy = 0;
          Camera.shake(14, 0.45);
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

      const dx = c2x - c1x;
      const dy = c2y - c1y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const maxL = this.lvl.ropeLength || 185;

      // Estado de cuerda tensa
      this.ropeTaut = dist >= maxL - 1;
      this.rope.update(dt, p1, p2, this.ropeTaut, this.platforms);

      // Si la distancia es menor al límite, movimiento 100% independiente
      if (dist <= maxL) return;

      // Vector unitario de la cuerda y vector tangente perpendicular
      const nx = dx / dist;
      const ny = dy / dist;
      const tx = -ny;
      const ty = nx;

      const w1 = p1.invMass();
      const w2 = p2.invMass();
      const totalW = w1 + w2;
      if (totalW <= 0) return; // Ambos anclados inamovibles

      // 1. Corrección posicional rígida sin elasticidad de muelle
      const over = dist - maxL;
      p1.x += nx * over * (w1 / totalW);
      p1.y += ny * over * (w1 / totalW);
      p2.x -= nx * over * (w2 / totalW);
      p2.y -= ny * over * (w2 / totalW);

      // 2. Velocidad relativa radial (alejamiento)
      const relVx = p2.vx - p1.vx;
      const relVy = p2.vy - p1.vy;
      const rvn = relVx * nx + relVy * ny;

      // Eliminar componente radial y transformar caída en velocidad tangencial pura
      if (rvn > 0) {
        // Transferencia de momento lineal
        const impulse = rvn / totalW;
        p1.vx += nx * impulse * w1;
        p1.vy += ny * impulse * w1;
        p2.vx -= nx * impulse * w2;
        p2.vy -= ny * impulse * w2;

        // Si uno es pivote fijo (invMass = 0) y el otro está en el aire:
        // Convertir la caída vertical en velocidad tangencial pura de oscilación
        if (w1 === 0 && w2 === 1 && !p2.onGround) {
          const tangSpeed = p2.vx * tx + p2.vy * ty;
          const fallingEnergy = Math.max(0, p2.vy);
          const swingDir = tangSpeed !== 0 ? Math.sign(tangSpeed) : Math.sign(nx);
          const finalTang = tangSpeed + swingDir * fallingEnergy * 0.45;

          p2.vx = finalTang * tx;
          p2.vy = finalTang * ty;
          p2.state = 'SWINGING';
          Sfx.ropeTension();
        } else if (w2 === 0 && w1 === 1 && !p1.onGround) {
          const tangSpeed = p1.vx * tx + p1.vy * ty;
          const fallingEnergy = Math.max(0, p1.vy);
          const swingDir = tangSpeed !== 0 ? Math.sign(tangSpeed) : -Math.sign(nx);
          const finalTang = tangSpeed + swingDir * fallingEnergy * 0.45;

          p1.vx = finalTang * tx;
          p1.vy = finalTang * ty;
          p1.state = 'SWINGING';
          Sfx.ropeTension();
        }

        // Arrastre por el suelo si el compañero que cae no encuentra anclaje
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

      // 1. Degradado dinámico de cielo según la altitud (de azul glacial a noche espacial con estrellas)
      const altRatio = Math.max(0, Math.min(1, this.currentAltitude / 500));
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      if (altRatio < 0.4) {
        skyGrad.addColorStop(0, '#061329');
        skyGrad.addColorStop(0.6, '#0d2242');
        skyGrad.addColorStop(1, '#1b3b64');
      } else if (altRatio < 0.8) {
        skyGrad.addColorStop(0, '#030814');
        skyGrad.addColorStop(0.6, '#081730');
        skyGrad.addColorStop(1, '#11294d');
      } else {
        skyGrad.addColorStop(0, '#020409');
        skyGrad.addColorStop(0.7, '#050c1c');
        skyGrad.addColorStop(1, '#0a162e');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Estrellas en la cumbre
      if (altRatio > 0.5) {
        ctx.fillStyle = `rgba(255, 255, 255, ${(altRatio - 0.5) * 1.6})`;
        for (let i = 0; i < 40; i++) {
          const sx = (i * 47) % w;
          const sy = (i * 29) % (h * 0.7);
          ctx.fillRect(sx, sy, 1.8, 1.8);
        }
      }

      // Montañas de fondo con parallax suave
      const drawParallaxMountain = (factor, color, baseH, amp) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w + 100; x += 80) {
          const wx = x + Camera.x * factor;
          const py = h - baseH - Math.abs(Math.sin(wx * 0.002) * amp + Math.cos(wx * 0.005) * (amp * 0.5));
          ctx.lineTo(x, py);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
      };
      drawParallaxMountain(0.08, '#0a172c', 230, 130);
      drawParallaxMountain(0.2, '#122544', 150, 100);
      drawParallaxMountain(0.35, '#1b365d', 80, 70);

      // Actualizar cámara Lerp
      Camera.update(dt, this.p1, this.p2);
      const shake = Camera.getShakeOffsets();

      ctx.save();
      ctx.translate(w / 2 + shake.sx, h / 2 + shake.sy);
      ctx.scale(Camera.zoom, Camera.zoom);
      ctx.translate(-Camera.x, -Camera.y);

      // 2. Carteles de historia y consejos en español
      for (const sg of (this.lvl ? this.lvl.signs || [] : [])) {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(sg.x - 4, sg.y, 8, 32);
        ctx.font = 'bold 13px Segoe UI, sans-serif';
        const tw = ctx.measureText(sg.text).width + 28;
        ctx.fillStyle = 'rgba(11, 21, 38, 0.92)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(sg.x - tw / 2, sg.y - 36, tw, 30, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.fillText(sg.text, sg.x, sg.y - 16);
      }

      // 3. Plataformas normales, de hielo, paredes de escalada y crumbles
      for (const pl of this.platforms) {
        if (pl.broken) continue;
        const ox = pl.cracking ? (Math.random() - 0.5) * 6 : 0;

        if (pl.type === 'normal') {
          ctx.fillStyle = '#334155';
          ctx.beginPath();
          ctx.roundRect(pl.x + ox, pl.y, pl.w, pl.h, 6);
          ctx.fill();
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.roundRect(pl.x + ox, pl.y, pl.w, 12, 6);
          ctx.fill();
        } else if (pl.type === 'ice') {
          ctx.fillStyle = '#0284c7';
          ctx.beginPath();
          ctx.roundRect(pl.x, pl.y, pl.w, pl.h, 6);
          ctx.fill();
          ctx.fillStyle = '#bae6fd';
          ctx.beginPath();
          ctx.roundRect(pl.x, pl.y, pl.w, 11, 6);
          ctx.fill();
          // Brillo de hielo
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pl.x + 8, pl.y + 4);
          ctx.lineTo(pl.x + pl.w - 8, pl.y + 4);
          ctx.stroke();
        } else if (pl.type === 'climbWall') {
          ctx.fillStyle = '#0369a1';
          ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
          ctx.strokeStyle = '#7dd3fc';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
          // Textura de hielo vertical para piolet
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = 1.5;
          for (let py = pl.y + 20; py < pl.y + pl.h - 10; py += 30) {
            ctx.beginPath();
            ctx.moveTo(pl.x + 6, py);
            ctx.lineTo(pl.x + pl.w - 6, py);
            ctx.stroke();
          }
        } else if (pl.type === 'crumble') {
          ctx.fillStyle = pl.cracking ? '#f87171' : '#38bdf8';
          ctx.beginPath();
          ctx.roundRect(pl.x + ox, pl.y, pl.w, pl.h, 5);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
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
    // DIBUJO DETALLADO DEL PINGÜINO
    // =======================================================================
    drawPenguin(ctx, p, isActiveSolo) {
      if (!p) return;
      ctx.save();

      const moving = Math.abs(p.vx) > 12 && p.onGround;
      const walkCycle = moving ? Math.sin(p.anim * 1.5) : 0;
      const tilt = p.state === 'FACEPLANT'
        ? p.facing * 1.45
        : (moving ? walkCycle * 0.08 : (!p.onGround ? Math.max(-0.24, Math.min(0.24, p.vy * 0.0004)) : 0));

      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);

      // Bocadillo de diálogo flotante en español
      if (p.speech && p.speechTimer > 0) {
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

      // Aplastado contra el suelo si está ANCHORED
      if (p.state === 'ANCHORED') {
        ctx.scale(1.14, 0.76);
      }

      const lowCling = p.state === 'WALL_CLING' && p.staminaTimer <= WALL_LOW_TIME;

      // 1. Patitas naranjas animadas
      const footLiftL = moving ? Math.max(0, Math.sin(p.anim * 1.6)) * 4 : (!p.onGround ? 2 : 0);
      const footLiftR = moving ? Math.max(0, -Math.sin(p.anim * 1.6)) * 4 : (!p.onGround ? -2 : 0);
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.ellipse(-6, p.h / 2 - 2 - footLiftL, 6.5, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(6, p.h / 2 - 2 - footLiftR, 6.5, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // 2. Cuerpo negro
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.ellipse(0, 1, p.w / 2, p.h / 2 - 3, 0, 0, Math.PI * 2);
      ctx.fill();

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

      // 3. Barriga blanca
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.ellipse(p.facing * 2.5, 3.5, p.w / 2.9, p.h / 2.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // 4. Arnés de cuerda
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2 + 2, 4, p.w - 4, 4.5);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(0, 6.2, 3, 0, Math.PI * 2);
      ctx.fill();

      // 5. Aleta animada
      const wingAngle = !p.onGround ? -0.55 : (moving ? walkCycle * 0.35 : 0.15);
      ctx.save();
      ctx.translate(-p.facing * 3, 0);
      ctx.rotate(p.facing * wingAngle);
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.ellipse(0, 5, 4.2, 9.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 6. Ojos expresivos
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

      // Ojos en cruz si está estampado en Faceplant
      if (p.state === 'FACEPLANT') {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.facing * 3.5, -8);
        ctx.lineTo(p.facing * 9.5, -3);
        ctx.moveTo(p.facing * 9.5, -8);
        ctx.lineTo(p.facing * 3.5, -3);
        ctx.stroke();
      }

      // 7. Pico naranja
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(p.facing * 9, -4.5);
      ctx.lineTo(p.facing * 18.5, -1.5);
      ctx.lineTo(p.facing * 9, 2);
      ctx.closePath();
      ctx.fill();

      // 8. Gorro de lana con pompón
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
        ctx.font = 'bold 12px Segoe UI, sans-serif';
        const pad = 16;
        const bw = ctx.measureText(j.speech).width + pad * 2;
        const by = -j.h / 2 - 46;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-bw / 2, by, bw, 26, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.fillText(j.speech, 0, by + 17);
        ctx.restore();
      }

      ctx.rotate(j.carried ? 0 : j.spin);

      // Silueta de roca facetada
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

      // Detalles de piedra
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(-8, 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(9, 7, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Ojos de Jeff que miran hacia P1
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(-6, -2, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(6, -2, 3.4, 0, Math.PI * 2);
      ctx.fill();

      const lookX = this.p1 ? Math.sign((this.p1.x - j.x) || 1) : 1;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-6 + lookX * 1.2, -2, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(6 + lookX * 1.2, -2, 1.7, 0, Math.PI * 2);
      ctx.fill();

      // Resplandor de anclaje
      if (j.state === 'ANCHORED') {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.2;
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
