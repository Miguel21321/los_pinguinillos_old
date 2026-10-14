/**
 * SISTEMAS AUXILIARES:
 * 1. SaveSys (Guardado en 3 ranuras, Checkpoints y Exportación Base64)
 * 2. Sfx (Sintetizador de sonido Web Audio API)
 * 3. Input (Teclado, Controles táctiles y Atajos)
 * 4. Net (Multijugador P2P con PeerJS)
 */

window.toast = function(msg) {
  const el = document.getElementById('saveToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.toast._t);
  window.toast._t = setTimeout(() => el.classList.remove('show'), 2100);
};

window.toggleFS = function() {
  const doc = document;
  const el = doc.documentElement;
  if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } else {
    if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
    else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
  }
};

/* ================= 1. SISTEMA DE GUARDADO ================= */
window.SaveSys = {
  slot: 1,
  data: {
    activeSlot: 1,
    slots: {
      1: { records: {}, run: null },
      2: { records: {}, run: null },
      3: { records: {}, run: null }
    }
  },
  init() {
    try {
      const raw = localStorage.getItem('picos_modular_save_v2');
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.slots) {
          this.data = p;
          this.slot = p.activeSlot || 1;
        }
      }
    } catch (e) {}
  },
  save() {
    try {
      this.data.activeSlot = this.slot;
      localStorage.setItem('picos_modular_save_v2', JSON.stringify(this.data));
    } catch (e) {}
  },
  cur() {
    if (!this.data.slots[this.slot]) {
      this.data.slots[this.slot] = { records: {}, run: null };
    }
    return this.data.slots[this.slot];
  },
  saveCheckpoint(lvl, cp, timer, falls, mode) {
    this.cur().run = {
      lvl,
      cp,
      timer: Math.round(timer * 10) / 10,
      falls,
      mode
    };
    this.save();
  },
  saveWin(lvl, timer, falls, mode) {
    const s = this.cur();
    const prev = s.records[lvl];
    const medal = falls <= 2 ? '🥇' : (falls <= 6 ? '🥈' : '🥉');
    if (!prev || timer < prev.time) {
      s.records[lvl] = {
        time: Math.round(timer * 10) / 10,
        falls: prev ? Math.min(prev.falls, falls) : falls,
        medal
      };
    } else if (falls < prev.falls) {
      s.records[lvl].falls = falls;
      s.records[lvl].medal = medal;
    }
    s.run = (lvl + 1 < window.LEVELS.length)
      ? { lvl: lvl + 1, cp: 0, timer: 0, falls: 0, mode }
      : null;
    this.save();
  },
  exportStr() {
    try {
      return btoa(encodeURIComponent(JSON.stringify(this.cur())));
    } catch (e) {
      return '';
    }
  },
  importStr(str) {
    try {
      const obj = JSON.parse(decodeURIComponent(atob(str.trim())));
      if (obj && typeof obj.records === 'object') {
        this.data.slots[this.slot] = {
          records: obj.records || {},
          run: obj.run || null
        };
        this.save();
        return true;
      }
    } catch (e) {}
    return false;
  }
};

/* ================= 2. AUDIO WEB AUDIO API ================= */
window.Sfx = {
  ctx: null,
  muted: false,
  tone(f1, f2, dur, type = 'sine', v = 0.14) {
    if (this.muted) return;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(25, f2), t + dur);
      g.gain.setValueAtTime(v, t);
      g.gain.linearRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur);
    } catch (e) {}
  },
  jump()  { this.tone(250, 560, 0.14, 'triangle', 0.15); },
  land()  { this.tone(130, 55, 0.08, 'sine', 0.1); },
  pick()  { this.tone(880, 1300, 0.06, 'square', 0.08); },
  crack() { this.tone(210, 75, 0.2, 'sawtooth', 0.13); },
  cp()    { this.tone(440, 660, 0.12, 'triangle', 0.15); setTimeout(() => this.tone(660, 880, 0.16, 'triangle', 0.15), 90); },
  fall()  { this.tone(350, 90, 0.32, 'sawtooth', 0.15); },
  win()   { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, f * 1.02, 0.18, 'triangle', 0.16), i * 100)); }
};

/* ================= 3. ENTRADA (TECLADO + TÁCTIL) ================= */
window.Input = {
  keys: {},
  touch: { left: false, right: false, jump: false, grab: false },
  swapHit: false,
  init() {
    window.addEventListener('keydown', e => {
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && !['INPUT', 'TEXTAREA'].includes(tag)) {
        e.preventDefault();
      }
      if (!this.keys[e.code]) {
        if (e.code === 'KeyQ') this.swapHit = true;
        if (e.code === 'Escape' && window.Game && window.Game.running) window.Game.togglePause();
        if (e.code === 'KeyF' && !['INPUT', 'TEXTAREA'].includes(tag)) window.toggleFS();
        if (e.code === 'KeyH' && !['INPUT', 'TEXTAREA'].includes(tag)) document.getElementById('hud').classList.toggle('hud-min');
      }
      this.keys[e.code] = true;
    });

    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
    });

    const bindT = (id, k) => {
      const b = document.getElementById(id);
      if (!b) return;
      const set = v => { this.touch[k] = v; b.classList.toggle('active', v); };
      b.addEventListener('pointerdown', e => { e.preventDefault(); set(true); });
      b.addEventListener('pointerup', e => { e.preventDefault(); set(false); });
      b.addEventListener('pointerleave', () => set(false));
    };
    bindT('tLeft', 'left');
    bindT('tRight', 'right');
    bindT('tJump', 'jump');
    bindT('tGrab', 'grab');

    const swapBtn = document.getElementById('tSwap');
    if (swapBtn) {
      swapBtn.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.swapHit = true;
      });
    }
  },
  get(mode, soloIdx, guest) {
    const p1 = { left: false, right: false, jump: false, grab: false };
    const p2 = { left: false, right: false, jump: false, grab: false };
    const k1L = !!this.keys['KeyA'], k1R = !!this.keys['KeyD'], k1J = !!this.keys['KeyW'] || !!this.keys['Space'], k1G = !!this.keys['KeyS'];
    const k2L = !!this.keys['ArrowLeft'], k2R = !!this.keys['ArrowRight'], k2J = !!this.keys['ArrowUp'], k2G = !!this.keys['ArrowDown'];

    if (mode === 'local') {
      p1.left = k1L || this.touch.left; p1.right = k1R || this.touch.right; p1.jump = k1J || this.touch.jump; p1.grab = k1G || this.touch.grab;
      p2.left = k2L; p2.right = k2R; p2.jump = k2J; p2.grab = k2G;
    } else if (mode === 'solo') {
      const t = soloIdx === 0 ? p1 : p2;
      t.left = k1L || k2L || this.touch.left; t.right = k1R || k2R || this.touch.right; t.jump = k1J || k2J || this.touch.jump; t.grab = k1G || k2G || this.touch.grab;
    } else if (mode === 'online') {
      p1.left = k1L || k2L || this.touch.left; p1.right = k1R || k2R || this.touch.right; p1.jump = k1J || k2J || this.touch.jump; p1.grab = k1G || k2G || this.touch.grab;
      if (guest) {
        p2.left = !!guest.left; p2.right = !!guest.right; p2.jump = !!guest.jump; p2.grab = !!guest.grab;
      }
    }
    return { p1, p2 };
  }
};

/* ================= 4. RED WEBRTC (PEERJS) ================= */
window.Net = {
  peer: null, conn: null, role: 'none', code: '', connected: false,
  guestIn: { left: false, right: false, jump: false, grab: false }, sendT: 0,
  badge(txt, cls, msg) {
    const b = document.getElementById('netBadge');
    if (b) { b.textContent = txt; b.className = 'badge ' + cls; }
    if (msg) document.getElementById('netMsg').textContent = msg;
  },
  clean() {
    if (this.conn) { try { this.conn.close(); } catch (e) {} this.conn = null; }
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
    this.connected = false;
    this.role = 'none';
  },
  host() {
    if (typeof Peer === 'undefined') {
      this.badge('Error CDN', 'b-err', 'PeerJS no cargó. Puedes jugar en modo Local.');
      document.getElementById('btnLocalFallback').classList.remove('hidden');
      return;
    }
    this.clean();
    this.role = 'host';
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    this.code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    this.badge('Creando...', 'b-wait', 'Reservando sala en PeerJS...');
    try {
      this.peer = new Peer('PICOS-MOD-' + this.code);
      this.peer.on('open', () => {
        document.getElementById('hostCodeWrap').classList.remove('hidden');
        document.getElementById('roomCodeTxt').textContent = this.code;
        this.badge('Esperando amigo', 'b-wait', 'Pasa el código ' + this.code + ' a tu compañero.');
      });
      this.peer.on('connection', c => {
        this.conn = c;
        c.on('open', () => {
          this.connected = true;
          this.badge('Conectado', 'b-ok', '¡Jugador 2 conectado! Pulsa Comenzar Escalada.');
          c.send({ type: 'start', lvl: window.Game.lvlIdx });
        });
        c.on('data', d => { if (d && d.type === 'in') this.guestIn = d.state; });
        c.on('close', () => this.onDrop());
      });
      this.peer.on('error', () => {
        this.badge('Error Red', 'b-err', 'No se pudo abrir la sala.');
        document.getElementById('btnLocalFallback').classList.remove('hidden');
      });
    } catch (e) {}
  },
  join(raw) {
    const cStr = (raw || '').trim().toUpperCase();
    if (cStr.length !== 4 || typeof Peer === 'undefined') {
      this.badge('Código inválido', 'b-err', 'Introduce las 4 letras del anfitrión.');
      return;
    }
    this.clean();
    this.role = 'guest';
    this.code = cStr;
    this.badge('Conectando...', 'b-wait', 'Uniendo a sala ' + cStr + '...');
    try {
      this.peer = new Peer();
      this.peer.on('open', () => {
        const c = this.peer.connect('PICOS-MOD-' + cStr, { reliable: false });
        this.conn = c;
        c.on('open', () => {
          this.connected = true;
          this.badge('Conectado', 'b-ok', '¡Conectado! Esperando al anfitrión.');
        });
        c.on('data', d => {
          if (!d) return;
          if (d.type === 'start') {
            window.Game.loadLevel(d.lvl, 0, 0, 0);
            window.UI.hideMenus();
            window.Game.running = true;
            window.Game.paused = false;
          } else if (d.type === 'st') window.Game.applyNet(d);
          else if (d.type === 'win') window.Game.onWin(true);
        });
        c.on('close', () => this.onDrop());
      });
      this.peer.on('error', () => {
        this.badge('No encontrado', 'b-err', 'No se pudo conectar con ' + cStr + '.');
        document.getElementById('btnLocalFallback').classList.remove('hidden');
      });
    } catch (e) {}
  },
  onDrop() {
    this.connected = false;
    this.badge('Desconectado', 'b-err', 'Conexión cerrada. Puedes volver a modo Local.');
    document.getElementById('btnLocalFallback').classList.remove('hidden');
  }
};