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

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};

class NativeDataConnection {
  constructor() {
    this.events = {};
    this.open = false;
  }
  on(event, cb) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(cb);
  }
  emit(event, data) {
    if (this.events[event]) this.events[event].forEach(cb => cb(data));
  }
  send(data) {
    if (this.open && this._dc && this._dc.readyState === 'open') {
      try {
        this._dc.send(JSON.stringify(data));
      } catch (e) {
        console.error("DC send error:", e);
      }
    }
  }
  close() {
    this.open = false;
    if (this._dc) this._dc.close();
    this.emit('close');
  }
}

class NativeMQTTFallback {
  constructor(brokerUrl, roomCode, isHost) {
    this.brokerUrl = brokerUrl;
    this.roomCode = roomCode;
    this.isHost = isHost;
    this.mqttClient = null;
    this.pc = null;
    this.conn = new NativeDataConnection();
    this.destroyed = false;
    this.topicBase = `picos_unidos_${roomCode}`;

    this.events = {};
  }

  on(event, cb) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(cb);
  }

  emit(event, data) {
    if (this.events[event]) this.events[event].forEach(cb => cb(data));
  }

  destroy() {
    this.destroyed = true;
    if (this.mqttClient) {
      try { this.mqttClient.disconnect(); } catch (e) {}
    }
    if (this.pc) {
      this.pc.close();
    }
    this.conn.close();
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (!window.Paho || !window.Paho.MQTT || !window.Paho.MQTT.Client) {
        return reject(new Error('Paho MQTT not loaded'));
      }

      const clientId = `picos_${Math.random().toString(36).substr(2, 9)}`;
      let host, port;
      const url = new URL(this.brokerUrl);
      host = url.hostname;
      port = parseInt(url.port) || (url.protocol === 'wss:' ? 443 : 80);

      this.mqttClient = new window.Paho.MQTT.Client(host, port, url.pathname, clientId);

      this.mqttClient.onConnectionLost = (resp) => {
        if (!this.destroyed) {
          console.log("MQTT Connection lost:", resp);
          this.emit('disconnected');
        }
      };

      this.mqttClient.onMessageArrived = (message) => {
        if (this.destroyed) return;
        try {
          const payload = JSON.parse(message.payloadString);
          this.handleSignaling(payload);
        } catch (e) {
          console.error("MQTT parse error:", e);
        }
      };

      this.mqttClient.connect({
        useSSL: url.protocol === 'wss:',
        timeout: 4,
        onSuccess: () => {
          this.mqttClient.subscribe(`${this.topicBase}/${this.isHost ? 'host' : 'guest'}`);
          resolve();
          if (this.isHost) {
            this.emit('open', this.roomCode);
          } else {
            this.emit('open');
            this.initWebRTC();
          }
        },
        onFailure: (err) => {
          reject(new Error(err.errorMessage || 'MQTT connect failed'));
        }
      });
    });
  }

  sendSignaling(data) {
    if (this.destroyed || !this.mqttClient) return;
    const topic = `${this.topicBase}/${this.isHost ? 'guest' : 'host'}`;
    const message = new window.Paho.MQTT.Message(JSON.stringify(data));
    message.destinationName = topic;
    this.mqttClient.send(message);
  }

  initWebRTC() {
    this.pc = new RTCPeerConnection(ICE_CONFIG);

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignaling({ type: 'candidate', candidate: event.candidate });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed') {
        this.conn.close();
      }
    };

    if (this.isHost) {
      this.pc.ondatachannel = (event) => {
        this.setupDataChannel(event.channel);
      };
    } else {
      const dc = this.pc.createDataChannel('game_data');
      this.setupDataChannel(dc);

      this.pc.createOffer()
        .then(offer => this.pc.setLocalDescription(offer))
        .then(() => {
          this.sendSignaling({ type: 'offer', sdp: this.pc.localDescription });
        })
        .catch(e => {
          this.emit('error', { type: 'webrtc-error', message: e.message });
        });
    }
  }

  setupDataChannel(dc) {
    this.conn._dc = dc;
    dc.onopen = () => {
      this.conn.open = true;
      if (this.isHost) {
        this.emit('connection', this.conn);
      }
      this.conn.emit('open');
    };
    dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.conn.emit('data', data);
      } catch(e) {}
    };
    dc.onclose = () => {
      this.conn.close();
    };
    dc.onerror = () => {
      this.conn.emit('error', new Error("DataChannel error"));
    };

    if (!this.isHost) {
      // Guest returns the connection object
      setTimeout(() => {
        // Mock peer.connect returning the connection
      }, 0);
    }
  }

  handleSignaling(payload) {
    if (payload.type === 'offer' && this.isHost) {
      if (!this.pc) this.initWebRTC();
      this.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        .then(() => this.pc.createAnswer())
        .then(answer => this.pc.setLocalDescription(answer))
        .then(() => {
          this.sendSignaling({ type: 'answer', sdp: this.pc.localDescription });
        })
        .catch(e => console.error(e));
    } else if (payload.type === 'answer' && !this.isHost) {
      this.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp)).catch(e => console.error(e));
    } else if (payload.type === 'candidate') {
      if (!this.pc) return;
      this.pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(e => console.error(e));
    }
  }
}

window.Net = {
  peer: null,
  conn: null,
  role: 'none',
  connected: false,
  sendT: 0,
  guestIn: null,

  brokers: [
    { type: 'peerjs', desc: 'PeerJS Nube' },
    { type: 'mqtt', url: 'wss://broker.emqx.io:8084/mqtt', desc: 'EMQX MQTT' },
    { type: 'mqtt', url: 'wss://test.mosquitto.org:8081', desc: 'Mosquitto MQTT' }
  ],
  currentBrokerIdx: 0,
  isHosting: false,
  roomCode: '',

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
    try { if (this.peer && this.peer.destroy) this.peer.destroy(); } catch (error) {}
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
    this.role = 'host';
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    this.roomCode = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    this.currentBrokerIdx = 0;
    this.isHosting = true;
    this.tryNextBroker();
  },

  join(code) {
    this.clean();
    const room = String(code || '').trim().toUpperCase();
    if (room.length !== 4) {
      this.status('Escribe un código de 4 letras', 'b-error');
      return;
    }
    this.role = 'guest';
    this.roomCode = room;
    this.currentBrokerIdx = 0;
    this.isHosting = false;
    this.tryNextBroker();
  },

  tryNextBroker() {
    if (this.currentBrokerIdx >= this.brokers.length) {
      this.status('Todos los servidores fallaron', 'b-error');
      toast('Imposible conectar. Tu red bloquea todas las vías de conexión.');
      return;
    }

    const broker = this.brokers[this.currentBrokerIdx];
    this.status(`Probando servidor ${this.currentBrokerIdx + 1}/${this.brokers.length} (${broker.desc})...`, 'b-wait');

    if (this.peer && this.peer.destroy) {
      try { this.peer.destroy(); } catch(e) {}
    }

    if (broker.type === 'peerjs') {
      if (!window.Peer) {
        this.currentBrokerIdx++;
        return this.tryNextBroker();
      }

      let timeoutId;

      const config = {
        config: ICE_CONFIG,
        debug: 0
      };

      if (this.isHosting) {
        this.peer = new Peer(this.roomCode, config);
      } else {
        this.peer = new Peer(config);
      }

      timeoutId = setTimeout(() => {
        console.warn('PeerJS Timeout. Switching broker...');
        if (this.peer && this.peer.destroy) this.peer.destroy();
        this.currentBrokerIdx++;
        this.tryNextBroker();
      }, 4500);

      this.peer.on('open', id => {
        clearTimeout(timeoutId);
        this.onBrokerConnected();
      });

      this.peer.on('error', err => {
        console.error('PeerJS Error:', err);
        clearTimeout(timeoutId);
        if (err.type === 'unavailable-id' && this.isHosting) {
           toast('Código ocupado, vuelve a crear la sala');
           this.status('Error al crear sala', 'b-error');
           return;
        }
        if (err.type === 'network' || err.type === 'server-error' || err.type === 'peer-unavailable') {
          this.currentBrokerIdx++;
          this.tryNextBroker();
        } else {
          this.status('Error: ' + err.type, 'b-error');
        }
      });

      this.peer.on('connection', connection => this.bindConnection(connection));

    } else if (broker.type === 'mqtt') {
      this.peer = new NativeMQTTFallback(broker.url, this.roomCode, this.isHosting);

      this.peer.on('open', () => {
        this.onBrokerConnected();
      });

      this.peer.on('error', err => {
        console.error('MQTT Fallback Error:', err);
        this.currentBrokerIdx++;
        this.tryNextBroker();
      });

      this.peer.on('connection', connection => {
         this.bindConnection(connection);
      });

      this.peer.connect().catch(err => {
         console.error('MQTT Connect fail:', err);
         this.currentBrokerIdx++;
         this.tryNextBroker();
      });
    }
  },

  onBrokerConnected() {
    const broker = this.brokers[this.currentBrokerIdx];
    this.status(`Conectado en Servidor ${this.currentBrokerIdx + 1} (${broker.desc})`, 'b-live');
    if (this.isHosting) {
      document.getElementById('roomCodeTxt').textContent = this.roomCode;
      document.getElementById('hostCodeWrap').classList.remove('hidden');
      this.status(`Sala ${this.roomCode} lista`, 'b-live');
    } else {
      if (broker.type === 'peerjs') {
        const conn = this.peer.connect(this.roomCode, { reliable: true });
        this.bindConnection(conn);
      } else {
         // NativeMQTTFallback auto-connects to the host using the data channel
         this.bindConnection(this.peer.conn);
      }
    }
  }
};
