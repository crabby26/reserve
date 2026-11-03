// Room management on top of the shared game rules. The server owns fuel, items,
// collisions and the win condition; it only ever receives inputs from clients.
'use strict';

const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { Game } = require('../shared/game.js');

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TICK_MS = 1000 / 30;
const SNAPSHOT_MS = 50;
const SLOT_HOLD_MS = Number(process.env.SLOT_HOLD_MS) || 45000;   // a bit longer than the client retries
const WAITING_ROOM_MS = 30 * 60 * 1000;
const FINISHED_ROOM_MS = 10 * 60 * 1000;
const IDLE_SOCKET_MS = 15000;
const MAX_ROOMS = 500;
const MAX_MSGS_PER_SEC = 150;
const INPUT_RATE = 62;      // simulation steps per second a client may spend
const INPUT_BURST = 90;

function makeCode(rooms) {
  for (let i = 0; i < 200; i++) {
    let c = '';
    for (let j = 0; j < 4; j++) c += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}

function finite(v, min, max) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0;
}

class Room {
  constructor(code) {
    this.code = code;
    this.slots = [null, null];
    this.game = null;
    this.created = Date.now();
    this.lastSnap = 0;
    this.again = [false, false];
    this.overAt = 0;
  }

  send(p, msg) {
    const s = this.slots[p];
    if (s && s.ws && s.ws.readyState === WebSocket.OPEN) s.ws.send(JSON.stringify(msg));
  }

  broadcast(msg) {
    const text = JSON.stringify(msg);
    for (const s of this.slots) {
      if (s && s.ws && s.ws.readyState === WebSocket.OPEN) s.ws.send(text);
    }
  }

  startGame() {
    const seed = crypto.randomInt(0x7fffffff);
    this.game = new Game(seed, (e) => this.broadcast(Object.assign({ t: 'e' }, e)));
    this.again = [false, false];
    this.overAt = 0;
    this.slots.forEach((s) => { s.tokens = INPUT_BURST; });
    this.slots.forEach((_, p) => this.send(p, this.startMsg(p, false)));
  }

  startMsg(p, resume) {
    const g = this.game;
    return {
      t: 'start', seed: g.seed, you: p, resume, ack: g.acks[p],
      looted: g.looted ? g.looted() : [],
    };
  }
}

function attachRooms(httpServer, opts) {
  const options = opts || {};
  const rooms = new Map();
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: 8 * 1024,
    verifyClient: (info) => !allowed.length || allowed.includes(info.origin),
  });

  function err(ws, m) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'err', m })); }

  function detach(ws) {
    if (!ws.room) return;
    const room = ws.room, p = ws.slot, s = room.slots[p];
    ws.room = null;
    if (s && s.ws === ws) {
      s.ws = null;
      s.lostAt = Date.now();
      room.send(1 - p, { t: 'peer', on: false });
    }
  }

  function bind(ws, room, p) {
    const s = room.slots[p];
    if (s.ws && s.ws !== ws) { s.ws.room = null; s.ws.close(4000, 'replaced'); }
    s.ws = ws; s.lostAt = 0;
    ws.room = room; ws.slot = p;
  }

  function handle(ws, m) {
    switch (m.t) {
      case 'ping':
        ws.send(JSON.stringify({ t: 'pong', c: m.c }));
        return;
      case 'create': {
        detach(ws);
        if (rooms.size >= MAX_ROOMS) return err(ws, 'full');
        const code = makeCode(rooms);
        if (!code) return err(ws, 'full');
        const room = new Room(code);
        room.slots[0] = { token: crypto.randomUUID(), ws: null, lostAt: 0, tokens: INPUT_BURST };
        rooms.set(code, room);
        bind(ws, room, 0);
        room.send(0, { t: 'room', code, you: 0, token: room.slots[0].token });
        return;
      }
      case 'join': {
        detach(ws);
        const code = String(m.code || '').toUpperCase().slice(0, 4);
        const room = rooms.get(code);
        if (!room) return err(ws, 'unknown');
        if (room.slots[1]) return err(ws, 'taken');
        room.slots[1] = { token: crypto.randomUUID(), ws: null, lostAt: 0, tokens: INPUT_BURST };
        bind(ws, room, 1);
        room.send(1, { t: 'room', code, you: 1, token: room.slots[1].token });
        room.send(0, { t: 'peer', on: true });
        room.startGame();
        return;
      }
      case 'rejoin': {
        detach(ws);
        const room = rooms.get(String(m.code || '').toUpperCase().slice(0, 4));
        const p = room ? room.slots.findIndex((s) => s && s.token === m.token) : -1;
        if (p < 0) return err(ws, 'gone');
        bind(ws, room, p);
        room.send(p, { t: 'room', code: room.code, you: p, token: m.token, resumed: true });
        if (room.game) room.send(p, room.startMsg(p, true));
        room.send(1 - p, { t: 'peer', on: true });
        return;
      }
      case 'leave':
        if (ws.room) {
          const room = ws.room, p = ws.slot;
          detach(ws);
          // Leaving on purpose gives the win away right now instead of after the timeout.
          room.slots[p].lostAt = 1;
        }
        return;
      default:
    }

    const room = ws.room;
    if (!room) return;
    const p = ws.slot, g = room.game;
    if (!g) return;

    if (m.t === 'i' && Array.isArray(m.l)) {
      const slot = room.slots[p];
      for (const r of m.l.slice(0, 40)) {
        if (!Array.isArray(r) || slot.tokens < 1) continue;
        slot.tokens -= 1;
        g.input(p, finite(r[0], 0, 1e12), {
          s: finite(r[1], -1, 1), g: finite(r[2], 0, 1), b: finite(r[3], 0, 1), x: r[4] ? 1 : 0,
        });
      }
      if (g.setFlags) g.setFlags(p, !!m.h);
    } else if (m.t === 'a' && typeof m.a === 'string') {
      if (g.act) g.act(p, m.a);
    } else if (m.t === 'again' && g.phase === 'over') {
      room.again[p] = true;
      if (room.again[0] && room.again[1]) room.startGame();
      else room.send(1 - p, { t: 'peer', again: true });
    }
    return undefined;
  }

  wss.on('connection', (ws) => {
    ws.room = null;
    ws.lastSeen = Date.now();
    ws.msgs = 0;
    ws.on('message', (data) => {
      ws.lastSeen = Date.now();
      if (++ws.msgs > MAX_MSGS_PER_SEC) { ws.close(4008, 'too many messages'); return; }
      let m;
      try { m = JSON.parse(data); } catch (e) { return; }
      if (m && typeof m === 'object') handle(ws, m);
    });
    ws.on('close', () => detach(ws));
    ws.on('error', () => detach(ws));
  });

  let lastTick = Date.now();
  let lastSec = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    const elapsed = Math.min(0.25, (now - lastTick) / 1000);
    lastTick = now;
    const secTick = now - lastSec >= 1000;
    if (secTick) {
      lastSec = now;
      for (const ws of wss.clients) {
        ws.msgs = 0;
        if (now - ws.lastSeen > IDLE_SOCKET_MS) ws.terminate();
      }
    }

    for (const [code, room] of rooms) {
      const g = room.game;
      if (g) {
        room.slots.forEach((s) => { s.tokens = Math.min(INPUT_BURST, s.tokens + INPUT_RATE * elapsed); });
        g.tick(elapsed);
        if (now - room.lastSnap >= SNAPSHOT_MS) {
          room.lastSnap = now;
          room.broadcast(g.snapshot());
        }
        if (g.phase === 'over' && !room.overAt) room.overAt = now;
      }
      if (secTick) {
        const hold = options.slotHoldMs || SLOT_HOLD_MS;
        const gone = room.slots.map((s) => !s || (s.lostAt && now - s.lostAt > hold));
        if (g && g.phase !== 'over') {
          if (gone[0] !== gone[1]) g.forfeit(gone[0] ? 1 : 0);
          else if (gone[0]) rooms.delete(code);
        } else if ((gone[0] && gone[1])
          || (!g && (gone[0] || now - room.created > WAITING_ROOM_MS))
          || (room.overAt && now - room.overAt > FINISHED_ROOM_MS)) {
          for (const s of room.slots) if (s && s.ws) s.ws.close(4001, 'room closed');
          rooms.delete(code);
        }
      }
    }
  }, TICK_MS);

  return { wss, rooms, close() { clearInterval(timer); wss.close(); } };
}

module.exports = { attachRooms };
