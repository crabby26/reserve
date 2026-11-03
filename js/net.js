// Two interchangeable transports with the same message format: a local one that
// runs the rules in the browser for solo play, and a WebSocket one for online rooms.
window.ReserveNet = (function () {
  'use strict';

  class LocalTransport {
    constructor(onMessage) {
      this.onMessage = onMessage;
      this.timers = [];
      this.start();
    }

    start() {
      this.stop();
      const seed = (Math.random() * 0x7fffffff) | 0;
      this.game = new ReserveGame.Game(seed, (e) => this.onMessage(Object.assign({ t: 'e' }, e)));
      this.bot = ReserveBot.createBot(this.game, 1, 0.45);
      this.botSeq = 0;
      this.onMessage({ t: 'start', seed, you: 0, solo: true, ack: 0, looted: this.game.looted() });
      this.timers.push(setInterval(() => this.game.tick(1 / 30), 1000 / 30));
      this.timers.push(setInterval(() => {
        if (this.game.phase === 'race') {
          for (let i = 0; i < 2; i++) this.game.input(1, ++this.botSeq, this.bot());
        }
      }, 1000 / 30));
      this.timers.push(setInterval(() => {
        if (this.game.phase === 'race') ReserveBot.botMischief(this.game, 1);
      }, 1000));
      this.timers.push(setInterval(() => this.onMessage(this.game.snapshot()), 50));
    }

    send(m) {
      if (m.t === 'i') {
        for (const r of m.l) this.game.input(0, r[0], { s: r[1], g: r[2], b: r[3], x: r[4] });
        this.game.setFlags(0, m.h);
      } else if (m.t === 'a') {
        this.game.act(0, m.a);
      } else if (m.t === 'again') {
        this.start();
      }
    }

    stop() { this.timers.forEach(clearInterval); this.timers = []; }
    close() { this.stop(); }
    get ping() { return 0; }
  }

  const RECONNECT_MS = 30000;
  const WAKE_MS = 90000;        // a free-tier host can take about a minute to wake up
  const STALE_MS = 4000;        // no data for this long means the socket is dead

  function serverUrl() {
    const host = location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (isLocal) {
      const o = new URLSearchParams(location.search).get('server');
      return o || 'ws://' + host + ':8787';
    }
    return window.RESERVE_CONFIG.serverUrl;
  }

  // Pokes a sleeping host over plain HTTP, so it is awake by the time someone taps a button.
  function wake() {
    if (!serverUrl()) return Promise.resolve();
    const url = serverUrl().replace(/^ws/, 'http') + '/health';
    return fetch(url, { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
  }

  class WsTransport {
    // onState: 'waking' | 'open' | 'lost' | 'failed' | 'closed'
    constructor(onMessage, onState) {
      this.onMessage = onMessage;
      this.onState = onState;
      this.ws = null;
      this.hello = null;
      this.session = null;
      this.closed = false;
      this.deadline = 0;
      this.ping = 0;
      this.lastData = 0;
      this.pingTimer = null;
      this.retryTimer = null;
      this.onVisible = () => {
        if (document.visibilityState === 'visible' && !this.closed) {
          this.lastData = Math.max(this.lastData, performance.now() - STALE_MS + 1200);
          if (!this.ws && !this.retryTimer) this.beginRetry();
        }
      };
      document.addEventListener('visibilitychange', this.onVisible);
    }

    begin(hello) {
      this.hello = hello;
      this.deadline = Date.now() + WAKE_MS;
      this.onState('waking');
      this.open();
    }

    resume(session) {
      this.session = session;
      this.beginRetry();
    }

    beginRetry() {
      if (this.closed) return;
      if (!this.deadline || Date.now() > this.deadline) this.deadline = Date.now() + RECONNECT_MS;
      this.onState('lost', this.deadline);
      this.open();
    }

    open() {
      if (this.closed) return;
      clearTimeout(this.retryTimer); this.retryTimer = null;
      let ws;
      try { ws = new WebSocket(serverUrl()); } catch (e) { this.retry(); return; }
      this.ws = ws;
      ws.onopen = () => {
        if (ws !== this.ws) return;
        this.lastData = performance.now();
        const msg = this.session ? { t: 'rejoin', code: this.session.code, token: this.session.token } : this.hello;
        ws.send(JSON.stringify(msg));
        this.startPing();
      };
      ws.onmessage = (ev) => {
        if (ws !== this.ws) return;
        this.lastData = performance.now();
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'pong') {
          this.ping = Math.round(performance.now() - m.c);
          return;
        }
        if (m.t === 'room') {
          this.session = { code: m.code, token: m.token };
          this.deadline = 0;
          this.onState('open');
        }
        this.onMessage(m);
      };
      ws.onclose = () => {
        if (ws !== this.ws) return;
        this.ws = null;
        this.stopPing();
        if (this.closed) return;
        if (this.session || this.hello) this.retry();
      };
      ws.onerror = () => { /* onclose follows */ };
    }

    retry() {
      if (this.closed) return;
      if (!this.deadline) this.deadline = Date.now() + RECONNECT_MS;
      if (Date.now() > this.deadline) { this.onState('failed'); return; }
      this.onState(this.session ? 'lost' : 'waking', this.deadline);
      this.retryTimer = setTimeout(() => this.open(), 1200);
    }

    startPing() {
      this.stopPing();
      const beat = () => {
        if (!this.ws || this.ws.readyState !== 1) return;
        this.ws.send(JSON.stringify({ t: 'ping', c: performance.now() }));
        if (performance.now() - this.lastData > STALE_MS) { this.ws.close(); this.dropNow(); }
      };
      beat();
      this.pingTimer = setInterval(beat, 1500);
    }

    // A half-dead socket can take ages to fire onclose, so abandon it immediately.
    dropNow() {
      const w = this.ws;
      if (!w) return;
      this.ws = null;
      w.onclose = null;
      this.stopPing();
      this.retry();
    }

    stopPing() { clearInterval(this.pingTimer); this.pingTimer = null; }

    get connected() { return !!this.ws && this.ws.readyState === 1 && !!this.session; }

    send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }

    close() {
      this.closed = true;
      this.stopPing();
      clearTimeout(this.retryTimer);
      document.removeEventListener('visibilitychange', this.onVisible);
      if (this.ws) {
        const w = this.ws;
        this.ws = null;
        if (w.readyState === 1) w.send(JSON.stringify({ t: 'leave' }));
        w.close();
      }
    }
  }

  return { LocalTransport, WsTransport, serverUrl, wake };
})();
