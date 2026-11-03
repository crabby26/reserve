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
      this.onMessage({ t: 'start', seed, you: 0, stations: this.game.stock, solo: true, looted: [], taken: [] });
      this.timers.push(setInterval(() => this.game.tick(1 / 30), 1000 / 30));
      this.timers.push(setInterval(() => {
        if (this.game.phase === 'race') {
          for (let i = 0; i < 2; i++) this.game.input(1, ++this.botSeq, this.bot());
        }
      }, 1000 / 30));
      this.timers.push(setInterval(() => this.onMessage(this.game.snapshot()), 50));
    }

    send(m) {
      if (m.t === 'i') {
        for (const r of m.l) this.game.input(0, r[0], { s: r[1], g: r[2], b: r[3], x: r[4] });
        if (this.game.setFlags) this.game.setFlags(0, m.h);
      } else if (m.t === 'a') {
        if (this.game.act) this.game.act(0, m.a);
      } else if (m.t === 'again') {
        this.start();
      }
    }

    stop() { this.timers.forEach(clearInterval); this.timers = []; }
    close() { this.stop(); }
    get ping() { return 0; }
  }

  return { LocalTransport };
})();
