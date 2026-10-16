/**
 * ============================================================================
 * PICOS UNIDOS (BREAD & FRED EDITION) — SYSTEMS.JS
 * ============================================================================
 * Módulos Centrales de Soporte:
 * 1. SaveSys: Guardado de 3 ranuras en localStorage, altitud máxima, sardinas y asistencias.
 * 2. Sfx: Motor procedimental Web Audio API con síntesis de sonido y música ambiental alpina.
 * 3. Input: Controles de teclado y táctiles multitáctil (WASD, Flechas, Cuerda, Cuenta atrás, Bandera).
 * 4. Net: Multijugador WebRTC P2P con PeerJS (STUN/TURN) y Host como autoridad física absoluta.
 * 5. Camera: Cámara de seguimiento suave vertical Lerp con look-ahead hacia arriba y screen-shake.
 * 6. UI: Controlador de HUD (Altímetro 0m-500m), menús, modales de asistencia y gestión de partidas.
 * ============================================================================
 */

(function () {
  'use strict';

  const SAVE_KEY = 'picos_modular_save_v4';
  const LEGACY_SAVE_KEYS = ['picos_modular_save_v3', 'picos_modular_save_v2'];

  // =========================================================================
  // 1. UTILIDADES GLOBALES
  // =========================================================================
  window.toast = function (message) {
    const el = document.getElementById('saveToast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(window.toast._timer);
    window.toast._timer = setTimeout(() => el.classList.remove('show'), 2400);
  };

  window.toggleFS = function () {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    } else {
      const root = document.documentElement;
      if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
    }
  };

  // =========================================================================
  // 2. SISTEMA DE GUARDADO (3 RANURAS EN LOCALSTORAGE)
  // =========================================================================
  window.SaveSys = {
    key: SAVE_KEY,
    slot: 1,
    data: { slots: {} },

    emptySlot() {
      return {
        records: {},
        maxAltitude: 0,
        fishes: {},
        run: null,
        assists: {
          infiniteStamina: false,
          ropePull: true,
          customFlag: true
        }
      };
    },

    normalize() {
      if (!this.data || typeof this.data !== 'object') this.data = { slots: {} };
      if (!this.data.slots || typeof this.data.slots !== 'object') this.data.slots = {};
      [1, 2, 3].forEach(s => {
        const cur = this.data.slots[s] || this.emptySlot();
        cur.records = cur.records && typeof cur.records === 'object' ? cur.records : {};
        cur.maxAltitude = typeof cur.maxAltitude === 'number' ? cur.maxAltitude : 0;
        cur.fishes = cur.fishes && typeof cur.fishes === 'object' ? cur.fishes : {};
        cur.run = cur.run && typeof cur.run === 'object' ? cur.run : null;
        cur.assists = Object.assign({ infiniteStamina: false, ropePull: true, customFlag: true }, cur.assists || {});
        this.data.slots[s] = cur;
      });
    },

    init() {
      try {
        let raw = localStorage.getItem(this.key);
        if (!raw) {
          for (const leg of LEGACY_SAVE_KEYS) {
            raw = localStorage.getItem(leg);
            if (raw) break;
          }
        }
        if (raw) this.data = JSON.parse(raw);
      } catch (e) {
        this.data = { slots: {} };
      }
      this.normalize();
      this.save();
    },

    cur() {
      this.normalize();
      return this.data.slots[this.slot];
    },

    save() {
      this.normalize();
      try {
        localStorage.setItem(this.key, JSON.stringify(this.data));
      } catch (e) {}
    },

    updateMaxAltitude(meter) {
      const c = this.cur();
      if (meter > c.maxAltitude) {
        c.maxAltitude = Math.min(500, Math.max(0, meter));
        this.save();
      }
    },

    saveCheckpoint(levelIdx, cpIdx, timer, falls, mode, customFlag = null, alt = 0) {
      const c = this.cur();
      c.run = {
        lvl: levelIdx,
        cp: cpIdx,
        timer,
        falls,
        mode,
        customFlag,
        alt
      };
      this.updateMaxAltitude(alt);
      this.save();
    },

    saveWin(levelIdx, timer, falls, mode) {
      const c = this.cur();
      const medal = falls <= 2 ? '🥇' : (falls <= 6 ? '🥈' : '🥉');
      const prev = c.records[levelIdx];
      if (!prev || timer < prev.time || (timer === prev.time && falls < prev.falls)) {
        c.records[levelIdx] = { time: timer, falls, medal, mode };
      }
      if (c.run && c.run.lvl === levelIdx) c.run = null;
      this.updateMaxAltitude(500);
      this.save();
    },

    collectFish(id) {
      const c = this.cur();
      if (c.fishes[id]) return false;
      c.fishes[id] = true;
      this.save();
      return true;
    },

    hasFish(id) {
      return Boolean(this.cur().fishes[id]);
    },

    totalFishes() {
      return Object.keys(this.cur().fishes).length;
    },

    exportStr() {
      return btoa(unescape(encodeURIComponent(JSON.stringify(this.data))));
    },

    importStr(str) {
      try {
        const parsed = JSON.parse(decodeURIComponent(escape(atob(String(str).trim()))));
        if (!parsed || !parsed.slots) return false;
        this.data = parsed;
        this.normalize();
        this.save();
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  // =========================================================================
  // 3. MOTOR DE SONIDO PROCEDIMENTAL CON WEB AUDIO API
  // =========================================================================
  window.Sfx = {
    muted: false,
    ctx: null,
    musicStarted: false,
    musicTimer: null,
    musicStep: 0,
    musicNodes: new Set(),

    ensureCtx() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    },

    tone(freq, duration = 0.12, type = 'sine', volume = 0.05, delay = 0) {
      if (this.muted) return;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + duration + 0.02);
    },

    jump() {
      this.tone(420, 0.12, 'triangle', 0.045);
    },

    land() {
      this.tone(135, 0.09, 'sine', 0.04);
    },

    pick() {
      this.tone(580, 0.08, 'triangle', 0.04);
    },

    crack() {
      this.tone(115, 0.22, 'sawtooth', 0.05);
    },

    cp() {
      this.tone(660, 0.12, 'sine', 0.05);
      this.tone(880, 0.2, 'sine', 0.045, 0.1);
    },

    win() {
      [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => this.tone(n, 0.32, 'triangle', 0.05, i * 0.12));
    },

    fall() {
      this.tone(190, 0.24, 'sine', 0.055);
    },

    fish() {
      this.tone(784, 0.12, 'triangle', 0.055);
      this.tone(1174.6, 0.24, 'sine', 0.05, 0.11);
    },

    // NUEVO: Impacto de Faceplant (Estampado contra el suelo)
    faceplant() {
      if (this.muted) return;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const t = ctx.currentTime;

      // Golpe grave
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);

      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);

      // Crujido de nieve (ruido blanco procesado)
      try {
        const bufferSize = ctx.sampleRate * 0.12;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.04, t);
        nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        noise.connect(nGain);
        nGain.connect(ctx.destination);
        noise.start(t);
      } catch (e) {}
    },

    // NUEVO: Pitidos de Cuenta Atrás (3... 2... 1... ¡YA!)
    countdown(phase) {
      if (phase === 0) this.tone(440, 0.14, 'square', 0.04);        // 3...
      else if (phase === 1) this.tone(494, 0.14, 'square', 0.04);   // 2...
      else if (phase === 2) this.tone(587, 0.16, 'square', 0.045);  // 1...
      else if (phase === 3) {                                       // ¡YA!
        this.tone(880, 0.28, 'triangle', 0.06);
        this.tone(1046.5, 0.32, 'sine', 0.05, 0.05);
      }
    },

    // NUEVO: Tensión máxima de la cuerda
    ropeTension() {
      this.tone(330, 0.07, 'triangle', 0.028);
    },

    // NUEVO: Trinquete de polea / Recoger cuerda
    ropePull() {
      this.tone(740, 0.04, 'square', 0.022);
    },

    // NUEVO: Silbido de viento polar
    windRumble() {
      this.tone(85, 0.35, 'sawtooth', 0.035);
    },

    // NUEVO: Voces procedimentales de pingüino (Bread & Fred squeaks)
    squeak(type = 'jump') {
      if (this.muted) return;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'jump') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(480, t);
        osc.frequency.exponentialRampToValueAtTime(740, t + 0.07);
        gain.gain.setValueAtTime(0.04, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      } else if (type === 'panic') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(620, t);
        osc.frequency.exponentialRampToValueAtTime(320, t + 0.16);
        gain.gain.setValueAtTime(0.035, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      } else if (type === 'grunt') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.09);
        gain.gain.setValueAtTime(0.045, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      } else if (type === 'highFive') {
        this.tone(880, 0.18, 'triangle', 0.05);
        this.tone(1318.5, 0.25, 'sine', 0.045, 0.05);
        return;
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    },

    slide() {
      this.tone(160, 0.06, 'sine', 0.02);
    },

    skid() {
      this.tone(110, 0.08, 'sawtooth', 0.03);
    },

    // Música ambiental alpina procedimental
    playMusicTone(freq, dur, type, vol) {
      const ctx = this.ctx;
      if (!ctx) return;
      const t = ctx.currentTime + 0.02;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.5);
      gain.gain.setValueAtTime(vol, Math.max(t + 0.5, t + dur - 0.7));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + dur + 0.03);

      const node = { osc, gain };
      this.musicNodes.add(node);
      osc.onended = () => this.musicNodes.delete(node);
    },

    stopAmbientNotes() {
      const ctx = this.ctx;
      if (!ctx) return;
      const now = ctx.currentTime;
      for (const node of this.musicNodes) {
        const val = Math.max(node.gain.gain.value, 0.0001);
        node.gain.gain.cancelScheduledValues(now);
        node.gain.gain.setValueAtTime(val, now);
        node.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
        try { node.osc.stop(now + 0.18); } catch (e) {}
      }
      this.musicNodes.clear();
    },

    startAmbientMusic() {
      if (this.musicStarted) return;
      this.musicStarted = true;
      if (!this.ensureCtx()) return;

      const chords = [
        [146.83, 220.0, 293.66],
        [130.81, 196.0, 261.63],
        [110.0, 164.81, 220.0],
        [123.47, 185.0, 246.94]
      ];
      const arpeggio = [587.33, 698.46, 880.0, 698.46, 523.25, 659.25, 783.99, 659.25];

      const tick = () => {
        this.musicTimer = null;
        const active = window.Game && Game.running && !Game.paused && !this.muted;
        if (!active || !this.ensureCtx()) {
          this.stopAmbientNotes();
          this.musicTimer = setTimeout(tick, 250);
          return;
        }

        if (this.musicStep % 8 === 0) {
          const chord = chords[(this.musicStep / 8) % chords.length];
          chord.forEach(n => this.playMusicTone(n, 4.4, 'sine', 0.012));
        }

        const note = arpeggio[this.musicStep % arpeggio.length];
        this.playMusicTone(note, 0.72, 'triangle', 0.02);

        this.musicStep++;
        this.musicTimer = setTimeout(tick, 560);
      };
      tick();
    }
  };

  // =========================================================================
  // 4. CONTROLADOR DE ENTRADA (TECLADO Y TÁCTIL MULTITÁCTIL)
  // =========================================================================
  window.Input = {
    keys: new Set(),
    countdownHit: false,
    customFlagHit: false,
    tpFlagHit: false,
    swapHit: false,
    ropePullP1: false,
    ropePullP2: false,
    emoteHitP1: false,
    emoteHitP2: false,

    init() {
      const controls = new Set([
        'a', 'd', 'w', 's',
        'arrowleft', 'arrowright', 'arrowup', 'arrowdown',
        'c', 'r', 'b', 'q', 'e', 'o', 'k', ' '
      ]);

      window.addEventListener('keydown', e => {
        const k = e.key.toLowerCase();
        if (controls.has(k)) e.preventDefault();

        if (k === 'c' && !e.repeat) this.countdownHit = true;
        if (k === 'b' && !e.repeat) {
          if (e.shiftKey) this.tpFlagHit = true;
          else this.customFlagHit = true;
        }
        if (k === 'q' && !e.repeat) this.swapHit = true;
        if (k === 'e' && !e.repeat) {
          this.emoteHitP1 = true;
          if (window.Game) Game.triggerEmote(1);
        }
        if ((k === 'o' || k === 'k') && !e.repeat) {
          this.emoteHitP2 = true;
          if (window.Game) Game.triggerEmote(2);
        }

        this.keys.add(k);
        Sfx.startAmbientMusic();
      });

      window.addEventListener('keyup', e => {
        this.keys.delete(e.key.toLowerCase());
      });

      window.addEventListener('blur', () => {
        this.keys.clear();
      });

      window.addEventListener('pointerdown', () => Sfx.startAmbientMusic(), { once: true });

      // Enlace de botones táctiles
      const bindTouch = (id, onDown, onUp) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('pointerdown', e => {
          e.preventDefault();
          btn.classList.add('active');
          btn.setPointerCapture?.(e.pointerId);
          onDown();
          Sfx.startAmbientMusic();
        });
        const release = e => {
          e.preventDefault();
          btn.classList.remove('active');
          onUp();
        };
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('lostpointercapture', release);
      };

      bindTouch('tLeft', () => this.keys.add('arrowleft'), () => this.keys.delete('arrowleft'));
      bindTouch('tRight', () => this.keys.add('arrowright'), () => this.keys.delete('arrowright'));
      bindTouch('tJump', () => this.keys.add('arrowup'), () => this.keys.delete('arrowup'));
      bindTouch('tGrab', () => this.keys.add('arrowdown'), () => this.keys.delete('arrowdown'));
      bindTouch('tPull', () => this.keys.add('r'), () => this.keys.delete('r'));

      document.getElementById('tCd')?.addEventListener('click', () => { this.countdownHit = true; });
      document.getElementById('tFlag')?.addEventListener('click', () => { this.customFlagHit = true; });
      document.getElementById('tSwap')?.addEventListener('click', () => { this.swapHit = true; });
      document.getElementById('tEmote')?.addEventListener('click', () => {
        this.emoteHitP1 = true;
        if (window.Game) Game.triggerEmote(1);
      });
      document.getElementById('btnEmote')?.addEventListener('click', () => {
        this.emoteHitP1 = true;
        if (window.Game) Game.triggerEmote(1);
      });
    },

    command(leftKey, rightKey, jumpKey, grabKey, pullKey, downKey, emoteKey) {
      const has = k => Array.isArray(k) ? k.some(key => this.keys.has(key)) : this.keys.has(k);
      return {
        left: has(leftKey),
        right: has(rightKey),
        jump: has(jumpKey),
        grab: has(grabKey),
        ropePull: has(pullKey),
        down: downKey ? has(downKey) : has(grabKey),
        emote: emoteKey ? has(emoteKey) : false
      };
    },

    get(mode, soloIdx, guestInput) {
      if (mode === 'online') {
        if (Net.role === 'guest') {
          return {
            p1: this.command('a', 'd', 'w', 's', 'r', 's', 'e'),
            p2: { left: false, right: false, jump: false, grab: false, ropePull: false, down: false, emote: false }
          };
        }
        return {
          p1: this.command('a', 'd', 'w', 's', 'r', 's', 'e'),
          p2: guestInput || { left: false, right: false, jump: false, grab: false, ropePull: false, down: false, emote: false }
        };
      }

      if (mode === 'solo') {
        return {
          p1: this.command('a', 'd', 'w', 's', 'r', 's', 'e'),
          p2: { left: false, right: false, jump: false, grab: false, ropePull: false, down: false, emote: false }
        };
      }

      // Cooperativo Local: P1 en WASD + R + E, P2 en Flechas + [Shift, Enter, L, R] + O
      return {
        p1: this.command('a', 'd', 'w', 's', 'r', 's', 'e'),
        p2: this.command('arrowleft', 'arrowright', 'arrowup', 'arrowdown', ['r', 'shift', 'enter', 'l'], 'arrowdown', ['o', 'k', '1', 'end', '.'])
      };
    }
  };

  // =========================================================================
  // 5. MULTIJUGADOR WEBRTC P2P (PEERJS CON STUN/TURN)
  // =========================================================================
  window.Net = {
    peer: null,
    conn: null,
    role: 'none',
    connected: false,
    sendT: 0,
    guestIn: null,

    peerConfig: {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    },

    status(msg, badgeClass = 'b-idle') {
      const b = document.getElementById('netBadge');
      if (b) {
        b.textContent = msg;
        b.className = `badge ${badgeClass}`;
      }
      const m = document.getElementById('netMsg');
      if (m) m.textContent = msg;
    },

    clean() {
      try { this.conn?.close(); } catch (e) {}
      try { this.peer?.destroy(); } catch (e) {}
      this.conn = null;
      this.peer = null;
      this.role = 'none';
      this.connected = false;
      this.guestIn = null;
      this.sendT = 0;
      this.status('Sin conectar');
    },

    bindConnection(connection) {
      this.conn = connection;
      connection.on('open', () => {
        this.connected = true;
        this.status('Conectado P2P', 'b-ok');
        document.getElementById('btnLocalFallback')?.classList.remove('hidden');
        toast(this.role === 'host' ? '🌐 Compañero conectado como Huésped' : '🌐 Conectado al Anfitrión');
      });

      connection.on('data', data => {
        if (!data || typeof data !== 'object') return;

        // Comandos recibidos en el Anfitrión desde el Huésped
        if (this.role === 'host') {
          if (data.type === 'in') this.guestIn = data.state;
          if (data.type === 'cd' && window.Game) Game.startCountdown();
          if (data.type === 'flag' && window.Game) Game.placeCustomFlag();
          if (data.type === 'clearflag' && window.Game) Game.clearCustomFlag();
          if (data.type === 'tp' && window.Game) Game.teleportToFlag();
          if (data.type === 'emote' && window.Game) Game.triggerEmote(2);
        }

        // Estado del mundo recibido en el Huésped desde el Anfitrión Autoridad
        if (this.role === 'guest') {
          if (data.type === 'st' && window.Game) Game.applyNet(data);
          if (data.type === 'win' && window.Game) Game.onWin(true);
          if (data.type === 'emote' && window.Game) Game.triggerEmote(data.p);
        }
      });

      connection.on('close', () => {
        this.connected = false;
        this.status('Conexión perdida', 'b-err');
        document.getElementById('btnLocalFallback')?.classList.remove('hidden');
      });

      connection.on('error', () => {
        this.status('Error de conexión', 'b-err');
      });
    },

    host() {
      this.clean();
      if (!window.Peer) {
        this.status('PeerJS cargando...', 'b-wait');
        toast('Cargando librería WebRTC...');
        return;
      }
      this.role = 'host';
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      const code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

      this.peer = new Peer(code, this.peerConfig);
      this.status('Creando sala WebRTC...', 'b-wait');

      this.peer.on('open', id => {
        document.getElementById('roomCodeTxt').textContent = id;
        document.getElementById('hostCodeWrap').classList.remove('hidden');
        this.status(`Sala ${id} lista (Esperando Huésped)`, 'b-wait');
      });

      this.peer.on('connection', c => this.bindConnection(c));
      this.peer.on('error', err => {
        this.status('No se pudo crear la sala', 'b-err');
        toast(err.type === 'unavailable-id' ? 'Código ocupado, reintentando...' : 'Error al conectar STUN');
      });
    },

    join(code) {
      this.clean();
      if (!window.Peer) {
        this.status('PeerJS cargando...', 'b-wait');
        return;
      }
      const room = String(code || '').trim().toUpperCase();
      if (room.length !== 4) {
        this.status('Escribe un código de 4 letras', 'b-err');
        return;
      }
      this.role = 'guest';
      this.peer = new Peer(this.peerConfig);
      this.status('Conectando a la sala...', 'b-wait');

      this.peer.on('open', () => {
        const conn = this.peer.connect(room, { reliable: true });
        this.bindConnection(conn);
      });

      this.peer.on('error', () => {
        this.status('No se encontró la sala', 'b-err');
        toast('Revisa el código e inténtalo de nuevo');
      });
    }
  };

  // =========================================================================
  // 6. CÁMARA DE SEGUIMIENTO VERTICAL LERP CON LOOK-AHEAD Y SCREEN-SHAKE
  // =========================================================================
  window.Camera = {
    x: 0,
    y: 0,
    zoom: 1,
    targetZoom: 1,
    shakeT: 0,
    shakeMag: 0,
    lookAheadY: 0,
    hitStopT: 0,

    init(x, y) {
      this.x = x;
      this.y = y;
      this.zoom = 1;
      this.targetZoom = 1;
      this.shakeT = 0;
      this.shakeMag = 0;
      this.lookAheadY = 0;
      this.hitStopT = 0;
    },

    hitStop(duration = 0.045) {
      this.hitStopT = duration;
    },

    shake(mag = 12, duration = 0.4) {
      this.shakeMag = mag;
      this.shakeT = duration;
    },

    update(dt, p1, p2) {
      if (!p1 || !p2) return;

      const midX = (p1.x + p2.x) / 2 + 15;
      const midY = (p1.y + p2.y) / 2 + 15;
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

      // Look-ahead vertical: mira hacia arriba si los pingüinos están escalando o saltando
      const avgVy = (p1.vy + p2.vy) / 2;
      const targetLookAhead = avgVy < -50 ? -85 : (avgVy > 150 ? 30 : -45);
      this.lookAheadY += (targetLookAhead - this.lookAheadY) * 0.08;

      // Zoom dinámico según la separación de los pingüinos
      const desiredZoom = Math.max(0.68, Math.min(1.08, 920 / Math.max(500, dist + 320)));
      this.targetZoom = desiredZoom;

      // Lerp suave
      this.x += (midX - this.x) * 0.12;
      this.y += (midY + this.lookAheadY - this.y) * 0.12;
      this.zoom += (this.targetZoom - this.zoom) * 0.09;

      if (this.shakeT > 0) this.shakeT -= dt;
    },

    getShakeOffsets() {
      if (this.shakeT <= 0) return { sx: 0, sy: 0 };
      const decay = this.shakeT / 0.4;
      return {
        sx: (Math.random() * 2 - 1) * this.shakeMag * decay,
        sy: (Math.random() * 2 - 1) * this.shakeMag * decay
      };
    }
  };

  // =========================================================================
  // 7. CONTROLADOR DE INTERFAZ DE USUARIO (UI & HUD)
  // =========================================================================
  window.UI = {
    init() {
      this.renderMenu();
      this.bindInputs();
    },

    bindInputs() {
      // Modos de juego
      document.querySelectorAll('.mode-opt').forEach(el => {
        el.addEventListener('click', () => {
          document.querySelectorAll('.mode-opt').forEach(o => o.classList.remove('selected'));
          el.classList.add('selected');
          Game.mode = el.dataset.mode;
          document.getElementById('onlinePanel').classList.toggle('hidden', Game.mode !== 'online');
          this.syncQuickBtn();
        });
      });

      // Botón comenzar escalada
      document.getElementById('btnStart').addEventListener('click', () => {
        Sfx.ensureCtx();
        Game.loadLevel(Game.lvlIdx, 0, 0, 0);
        this.hideMenus();
        Game.running = true;
        Game.paused = false;
      });

      // Botón continuar partida
      document.getElementById('btnContinue').addEventListener('click', () => {
        Sfx.ensureCtx();
        const r = SaveSys.cur().run;
        if (r) {
          Game.mode = r.mode || Game.mode;
          this.syncQuickBtn();
          Game.loadLevel(r.lvl, r.cp || 0, r.timer || 0, r.falls || 0, r.customFlag);
          this.hideMenus();
          Game.running = true;
          Game.paused = false;
          toast(`▶ Escalada reanudada en CP ${r.cp + 1}`);
        }
      });

      // Pantalla completa
      ['btnFS', 'btnMenuFS', 'btnPauseFS'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', window.toggleFS);
      });

      // Botón Cuenta atrás 3-2-1
      document.getElementById('btnCountdown')?.addEventListener('click', () => {
        Game.startCountdown();
      });

      // Botón Asistencias rápido en HUD
      document.getElementById('btnAssists')?.addEventListener('click', () => {
        this.openAssists();
      });
      document.getElementById('btnPauseAssists')?.addEventListener('click', () => {
        this.openAssists();
      });
      document.getElementById('btnCloseAssist')?.addEventListener('click', () => {
        document.getElementById('assistModal').classList.add('hidden');
      });

      // Asistencias dentro del juego
      document.getElementById('btnPlaceFlagIngame')?.addEventListener('click', () => {
        Game.placeCustomFlag();
      });
      document.getElementById('btnTeleportFlagIngame')?.addEventListener('click', () => {
        Game.teleportToFlag();
        document.getElementById('assistModal').classList.add('hidden');
      });
      document.getElementById('btnRespawnFlag')?.addEventListener('click', () => {
        Game.togglePause();
        Game.teleportToFlag();
      });
      document.getElementById('btnClearFlag')?.addEventListener('click', () => {
        Game.clearCustomFlag();
      });
      document.getElementById('btnClearFlagIngame')?.addEventListener('click', () => {
        Game.clearCustomFlag();
        document.getElementById('assistModal').classList.add('hidden');
      });

      // Sincronizar checkboxes de asistencia
      const syncAssistBox = (menuId, gameId, key) => {
        const m = document.getElementById(menuId);
        const g = document.getElementById(gameId);
        if (!m || !g) return;
        const setVal = val => {
          m.checked = val;
          g.checked = val;
          SaveSys.cur().assists[key] = val;
          SaveSys.save();
        };
        m.addEventListener('change', () => setVal(m.checked));
        g.addEventListener('change', () => setVal(g.checked));
      };
      syncAssistBox('chkInfiniteStamina', 'chkIngameStamina', 'infiniteStamina');
      syncAssistBox('chkRopePull', 'chkIngamePull', 'ropePull');
      syncAssistBox('chkCustomFlag', 'chkIngameFlag', 'customFlag');

      // Botones HUD
      document.getElementById('btnPause')?.addEventListener('click', () => Game.togglePause());
      document.getElementById('btnResume')?.addEventListener('click', () => Game.togglePause());
      document.getElementById('btnRestart')?.addEventListener('click', () => {
        Game.togglePause();
        Game.loadLevel(Game.lvlIdx, 0, 0, 0);
      });
      document.getElementById('btnExit')?.addEventListener('click', () => {
        SaveSys.saveCheckpoint(Game.lvlIdx, Game.cpIdx, Game.timer, Game.falls, Game.mode, Game.customFlag, Game.currentAltitude);
        Game.running = false;
        Game.paused = false;
        this.renderMenu();
        document.getElementById('pauseMenu').classList.add('hidden');
        document.getElementById('mainMenu').classList.remove('hidden');
        toast('💾 Partida guardada en la ranura');
      });

      // Alternar modo rápido
      document.getElementById('btnQuickMode')?.addEventListener('click', () => {
        if (Game.mode === 'local') Game.mode = 'solo';
        else if (Game.mode === 'solo') Game.mode = 'local';
        this.syncQuickBtn();
        Game.ensureCompanion();
        toast(Game.mode === 'solo' ? '🪨 Modo Solo con Roca Jeff' : '🎮 Modo 2J Cooperativo');
      });

      // Táctil toggle
      document.getElementById('btnTouch')?.addEventListener('click', () => {
        document.getElementById('touchControls').classList.toggle('hidden');
      });

      // Mute toggle
      document.getElementById('btnMute')?.addEventListener('click', e => {
        Sfx.muted = !Sfx.muted;
        e.currentTarget.textContent = Sfx.muted ? '🔇' : '🔊';
      });

      // Multijugador
      document.getElementById('btnCreateRoom')?.addEventListener('click', () => Net.host());
      document.getElementById('btnJoinRoom')?.addEventListener('click', () => Net.join(document.getElementById('joinInput').value));
      document.getElementById('btnLocalFallback')?.addEventListener('click', () => {
        Net.clean();
        Game.mode = 'local';
        this.syncQuickBtn();
        document.getElementById('onlinePanel').classList.add('hidden');
      });

      // Gestor de partidas
      const openSaves = () => {
        this.renderSlots();
        document.getElementById('saveModal').classList.remove('hidden');
      };
      document.getElementById('btnOpenSaves')?.addEventListener('click', openSaves);
      document.getElementById('btnHudSave')?.addEventListener('click', openSaves);
      document.getElementById('btnCloseSaves')?.addEventListener('click', () => document.getElementById('saveModal').classList.add('hidden'));

      // Exportar / Importar
      document.getElementById('btnExport')?.addEventListener('click', () => {
        const code = SaveSys.exportStr();
        const area = document.getElementById('saveCodeArea');
        area.value = code;
        area.select();
        try { navigator.clipboard.writeText(code); } catch (e) {}
        document.getElementById('saveStatusMsg').textContent = '✅ Código copiado al portapapeles.';
      });

      document.getElementById('btnImport')?.addEventListener('click', () => {
        const ok = SaveSys.importStr(document.getElementById('saveCodeArea').value);
        document.getElementById('saveStatusMsg').textContent = ok ? '✅ ¡Partida restaurada!' : '❌ Código inválido.';
        if (ok) { this.renderSlots(); this.renderMenu(); }
      });

      document.getElementById('btnClearSlot')?.addEventListener('click', () => {
        SaveSys.data.slots[SaveSys.slot] = SaveSys.emptySlot();
        SaveSys.save();
        this.renderSlots();
        this.renderMenu();
        document.getElementById('saveStatusMsg').textContent = '🗑️ Ranura vaciada.';
      });

      // Pantalla de victoria
      document.getElementById('btnWinMenu')?.addEventListener('click', () => {
        document.getElementById('winMenu').classList.add('hidden');
        this.renderMenu();
        document.getElementById('mainMenu').classList.remove('hidden');
      });

      document.getElementById('btnNextLvl')?.addEventListener('click', () => {
        document.getElementById('winMenu').classList.add('hidden');
        Game.loadLevel((Game.lvlIdx + 1) % LEVELS.length, 0, 0, 0);
        Game.running = true;
        Game.paused = false;
      });
    },

    openAssists() {
      const ast = SaveSys.cur().assists;
      const m1 = document.getElementById('chkIngameStamina');
      const m2 = document.getElementById('chkIngamePull');
      const m3 = document.getElementById('chkIngameFlag');
      if (m1) m1.checked = ast.infiniteStamina;
      if (m2) m2.checked = ast.ropePull;
      if (m3) m3.checked = ast.customFlag;
      document.getElementById('assistModal').classList.remove('hidden');
    },

    syncQuickBtn() {
      const el = document.getElementById('btnQuickMode');
      if (!el) return;
      el.textContent = Game.mode === 'solo' ? '🪨 Solo' : (Game.mode === 'online' ? '🌐 Net' : '🎮 2J');
    },

    renderMenu() {
      const cur = SaveSys.cur();
      const fishes = SaveSys.totalFishes();
      document.getElementById('progBadge').textContent = `🏆 ${cur.maxAltitude}m Récord · 🐟 ${fishes}/20`;
      document.getElementById('slotLabel').textContent = `Ranura activa: #${SaveSys.slot}`;

      const contBtn = document.getElementById('btnContinue');
      if (cur.run) {
        contBtn.classList.remove('hidden');
        contBtn.textContent = `▶ Continuar en ${cur.run.alt || 0}m (CP ${cur.run.cp + 1})`;
      } else {
        contBtn.classList.add('hidden');
      }

      // Checkboxes de asistencias
      const ast = cur.assists;
      const c1 = document.getElementById('chkInfiniteStamina');
      const c2 = document.getElementById('chkRopePull');
      const c3 = document.getElementById('chkCustomFlag');
      if (c1) c1.checked = ast.infiniteStamina;
      if (c2) c2.checked = ast.ropePull;
      if (c3) c3.checked = ast.customFlag;

      // Selector de rutas
      const box = document.getElementById('levelSelector');
      box.innerHTML = '';
      LEVELS.forEach((lv, i) => {
        const rec = cur.records[i];
        const d = document.createElement('div');
        d.className = 'lvl-btn' + (i === Game.lvlIdx ? ' selected' : '') + (rec ? ' done' : '');
        d.innerHTML = `
          <div style="display:flex; justify-content:space-between; font-size:0.7rem; font-weight:800; color:var(--blue);">
            <span>${i === 0 ? '🏔️ CONTINUA' : `SECTOR ${lv.id}`}</span><span>${rec ? rec.medal : ''}</span>
          </div>
          <div style="font-size:0.77rem; font-weight:700; margin:3px 0;">${lv.name}</div>
          <div style="font-size:0.68rem; color:#a7f3d0;">${rec ? `⏱ ${Game.fmtTime(rec.time)} · 💥${rec.falls}` : `${lv.stepCount} tramos`}</div>
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
        const s = SaveSys.data.slots[n] || SaveSys.emptySlot();
        const fCount = Object.keys(s.fishes || {}).length;
        const el = document.createElement('div');
        el.className = 'slot-card' + (SaveSys.slot === n ? ' active' : '');
        el.innerHTML = `
          <div style="font-weight:800; font-size:0.86rem; color:${SaveSys.slot === n ? 'var(--green)' : '#fff'}">Ranura #${n}</div>
          <div style="font-size:0.74rem; color:var(--blue); margin-top:3px;">Altitud Máx: <b>${s.maxAltitude || 0}m</b></div>
          <div style="font-size:0.7rem; color:var(--dim); margin-top:2px;">Sardinas: 🐟 ${fCount}/20 · ${s.run ? 'Partida en curso' : 'Vacía'}</div>
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
      document.getElementById('assistModal').classList.add('hidden');
    },

    showWin() {
      document.getElementById('winMedal').textContent = Game.falls <= 2 ? '👑' : (Game.falls <= 6 ? '🥈' : '🥉');
      document.getElementById('winTitle').textContent = `¡Cumbre de ${Game.currentAltitude || 500}m Conquistada!`;
      document.getElementById('winTime').textContent = Game.fmtTime(Game.timer);
      document.getElementById('winFalls').textContent = Game.falls;
      const fishes = SaveSys.totalFishes();
      document.getElementById('winFish').textContent = `${fishes}/20`;
      document.getElementById('winMenu').classList.remove('hidden');
    }
  };
})();