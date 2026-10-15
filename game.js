const SAVE_KEY = 'picos_modular_save_v3';
const LEGACY_SAVE_KEY = 'picos_modular_save_v2';

window.toast = function(message) {
  const el = document.getElementById('saveToast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(window.toast.timer);
  window.toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
};

window.toggleFS = function() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    const target = document.documentElement.requestFullscreen ? document.documentElement : document.body;
    target.requestFullscreen?.();
  }
};

window.SaveSys = {
  key: SAVE_KEY,
  slot: 1,
  data: { slots: {} },

  emptySlot() {
    return { records: {}, fishes: {}, run: null };
  },

  normalize() {
    if (!this.data || typeof this.data !== 'object') this.data = { slots: {} };
    if (!this.data.slots || typeof this.data.slots !== 'object') this.data.slots = {};
    [1, 2, 3].forEach(slot => {
      const current = this.data.slots[slot] || this.emptySlot();
      current.records = current.records && typeof current.records === 'object' ? current.records : {};
      current.fishes = current.fishes && typeof current.fishes === 'object' ? current.fishes : {};
      current.run = current.run && typeof current.run === 'object' ? current.run : null;
      this.data.slots[slot] = current;
    });
  },

  init() {
    try {
      const raw = localStorage.getItem(this.key) || localStorage.getItem(LEGACY_SAVE_KEY);
      if (raw) this.data = JSON.parse(raw);
    } catch (error) {
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
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (error) {}
  },

  saveCheckpoint(level, checkpoint, timer, falls, mode) {
    this.cur().run = { lvl: level, cp: checkpoint, timer, falls, mode };
    this.save();
  },

  saveWin(level, timer, falls, mode) {
    const current = this.cur();
    const medal = falls <= 2 ? '🥇' : (falls <= 6 ? '🥈' : '🥉');
    const previous = current.records[level];
    if (!previous || timer < previous.time || (timer === previous.time && falls < previous.falls)) {
      current.records[level] = { time: timer, falls, medal, mode };
    }
    if (current.run && current.run.lvl <= level) current.run = null;
    this.save();
  },

  collectFish(id) {
    const current = this.cur();
    if (current.fishes[id]) return false;
    current.fishes[id] = true;
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

  importStr(value) {
    try {
      const parsed = JSON.parse(decodeURIComponent(escape(atob(value.trim()))));
      if (!parsed || !parsed.slots) return false;
      this.data = parsed;
      this.normalize();
      this.save();
      return true;
    } catch (error) {
      return false;
    }
  }
};

window.Sfx = {
  muted: false,
  ctx: null,
  musicStarted: false,
  musicTimer: null,
  musicStep: 0,
  musicNodes: new Set(),

  ensureCtx() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },

  tone(frequency, duration = 0.12, wave = 'sine', volume = 0.04, delay = 0) {
    if (this.muted) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  },

  jump() { this.tone(420, 0.11, 'triangle', 0.045); },
  land() { this.tone(145, 0.08, 'sine', 0.035); },
  pick() { this.tone(540, 0.09, 'triangle', 0.035); },
  crack() { this.tone(110, 0.2, 'sawtooth', 0.045); },
  cp() { this.tone(660, 0.12, 'sine', 0.05); this.tone(880, 0.18, 'sine', 0.045, 0.11); },
  win() { [523, 659, 784, 1046].forEach((note, i) => this.tone(note, 0.3, 'triangle', 0.045, i * 0.12)); },
  fall() { this.tone(180, 0.22, 'sine', 0.05); },
  fish() {
    this.tone(784, 0.13, 'triangle', 0.055);
    this.tone(1175, 0.2, 'sine', 0.05, 0.12);
  },

  playMusicTone(frequency, duration, wave, volume) {
    const ctx = this.ctx;
    if (!ctx) return;
    const start = ctx.currentTime + 0.02;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.5);
    gain.gain.setValueAtTime(volume, Math.max(start + 0.5, start + duration - 0.8));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
    const node = { oscillator, gain };
    this.musicNodes.add(node);
    oscillator.onended = () => this.musicNodes.delete(node);
  },

  stopAmbientNotes() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const node of this.musicNodes) {
      const value = Math.max(node.gain.gain.value, 0.0001);
      node.gain.gain.cancelScheduledValues(now);
      node.gain.gain.setValueAtTime(value, now);
      node.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      try { node.oscillator.stop(now + 0.2); } catch (error) {}
    }
    this.musicNodes.clear();
  },

  startAmbientMusic() {
    if (this.musicStarted) return;
    this.musicStarted = true;
    if (!this.ensureCtx()) return;
    const chords = [
      [146.83, 220, 293.66],
      [130.81, 196, 261.63],
      [110, 164.81, 220],
      [123.47, 185, 246.94]
    ];
    const arpeggio = [587.33, 698.46, 880, 698.46, 523.25, 659.25, 783.99, 659.25];
    const tick = () => {
      this.musicTimer = null;
      const active = window.Game && Game.running && !Game.paused && !this.muted;
      if (!active || !this.ensureCtx()) {
        this.stopAmbientNotes();
        this.musicTimer = setTimeout(tick, 220);
        return;
      }
      if (this.musicStep % 8 === 0) {
        chords[(this.musicStep / 8) % chords.length].forEach(note => this.playMusicTone(note, 4.5, 'sine', 0.014));
      }
      this.playMusicTone(arpeggio[this.musicStep % arpeggio.length], 0.72, 'triangle', 0.022);
      this.musicStep++;
      this.musicTimer = setTimeout(tick, 560);
    };
    tick();
  }
};

window.Input = {
  keys: new Set(),
  swapHit: false,

  init() {
    const controls = new Set(['a', 'd', 'w', 's', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'q']);
    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (controls.has(key)) event.preventDefault();
      if (key === 'q' && !event.repeat) this.swapHit = true;
      this.keys.add(key);
      Sfx.startAmbientMusic();
    });
    window.addEventListener('keyup', event => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', () => Sfx.startAmbientMusic(), { once: true });

    const bindTouch = (id, key) => {
      const button = document.getElementById(id);
      if (!button) return;
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        this.keys.add(key);
        button.setPointerCapture?.(event.pointerId);
        Sfx.startAmbientMusic();
      });
      const release = event => {
        event.preventDefault();
        this.keys.delete(key);
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    };
    bindTouch('tLeft', 'arrowleft');
    bindTouch('tRight', 'arrowright');
    bindTouch('tJump', 'arrowup');
    bindTouch('tGrab', 'arrowdown');
    document.getElementById('tSwap')?.addEventListener('click', () => { this.swapHit = true; });
  },

  command(left, right, jump, grab) {
    return {
      left: this.keys.has(left),
      right: this.keys.has(right),
      jump: this.keys.has(jump),
      grab: this.keys.has(grab)
    };
  },

  get(mode, soloIndex, guestInput) {
    if (mode === 'online') {
      if (Net.role === 'guest') return { p1: this.command('a', 'd', 'w', 's'), p2: { left: false, right: false, jump: false, grab: false } };
      return {
        p1: this.command('a', 'd', 'w', 's'),
        p2: guestInput || { left: false, right: false, jump: false, grab: false }
      };
    }
    if (mode === 'solo') {
      const active = this.command('a', 'd', 'w', 's');
      return soloIndex === 0
        ? { p1: active, p2: { left: false, right: false, jump: false, grab: false } }
        : { p1: { left: false, right: false, jump: false, grab: false }, p2: active };
    }
    return {
      p1: this.command('a', 'd', 'w', 's'),
      p2: this.command('arrowleft', 'arrowright', 'arrowup', 'arrowdown')
    };
  }
};

window.Net = {
  peer: null,
  conn: null,
  role: 'none',
  connected: false,
  sendT: 0,
  guestIn: null,

  status(message, className = 'b-idle') {
    const badge = document.getElementById('netBadge');
    if (badge) {
      badge.textContent = message;
      badge.className = `badge ${className}`;
    }
    const messageEl = document.getElementById('netMsg');
    if (messageEl) messageEl.textContent = message;
  },

  clean() {
    try { this.conn?.close(); } catch (error) {}
    try { this.peer?.destroy(); } catch (error) {}
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
      this.status('Conectado', 'b-live');
      document.getElementById('btnLocalFallback')?.classList.remove('hidden');
      toast(this.role === 'host' ? '🌐 Compañero conectado' : '🌐 Conectado a la sala');
    });
    connection.on('data', data => {
      if (!data || typeof data !== 'object') return;
      if (this.role === 'host' && data.type === 'in') this.guestIn = data.state;
      if (this.role === 'guest' && data.type === 'st' && window.Game) Game.applyNet(data);
      if (this.role === 'guest' && data.type === 'win' && window.Game) Game.onWin(true);
    });
    connection.on('close', () => {
      this.connected = false;
      this.status('Conexión cerrada');
      document.getElementById('btnLocalFallback')?.classList.remove('hidden');
    });
    connection.on('error', () => this.status('Error de conexión', 'b-error'));
  },

  host() {
    this.clean();
    if (!window.Peer) {
      this.status('PeerJS todavía no está disponible', 'b-error');
      toast('No se pudo iniciar el modo online');
      return;
    }
    this.role = 'host';
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    this.peer = new Peer(code, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });
    this.status('Creando sala...', 'b-live');
    this.peer.on('open', id => {
      document.getElementById('roomCodeTxt').textContent = id;
      document.getElementById('hostCodeWrap').classList.remove('hidden');
      this.status(`Sala ${id} lista`, 'b-live');
    });
    this.peer.on('connection', connection => this.bindConnection(connection));
    this.peer.on('error', error => {
      this.status('No se pudo crear la sala', 'b-error');
      toast(error.type === 'unavailable-id' ? 'Código ocupado, vuelve a crear la sala' : 'Error al crear la sala online');
    });
  },

  join(code) {
    this.clean();
    if (!window.Peer) {
      this.status('PeerJS todavía no está disponible', 'b-error');
      toast('No se pudo iniciar el modo online');
      return;
    }
    const room = String(code || '').trim().toUpperCase();
    if (room.length !== 4) {
      this.status('Escribe un código de 4 letras', 'b-error');
      return;
    }
    this.role = 'guest';
    this.peer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });
    this.status('Conectando...', 'b-live');
    this.peer.on('open', () => this.bindConnection(this.peer.connect(room, { reliable: true })));
    this.peer.on('error', () => {
      this.status('No se pudo conectar a la sala', 'b-error');
      toast('Revisa el código e inténtalo de nuevo');
    });
  }
};
