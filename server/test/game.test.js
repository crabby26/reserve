'use strict';
// Rule tests, plus an end-to-end run over a real WebSocket.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const WebSocket = require('ws');
const { Game } = require('../../shared/game.js');
const S = require('../../shared/sim.js');
const { createWorld } = require('../../shared/world.js');
const { createBot } = require('../../shared/bot.js');
const { attachRooms } = require('../rooms.js');

function raceReady(seed) {
  const events = [];
  const g = new Game(seed, (e) => events.push(e));
  g.tick(4);
  assert.strictEqual(g.phase, 'race');
  return { g, events };
}
const has = (events, k) => events.some((e) => e.k === k);

test('same seed gives the same world', () => {
  const a = createWorld(77), b = createWorld(77), c = createWorld(78);
  assert.deepStrictEqual(a.stations.map((s) => s.km), b.stations.map((s) => s.km));
  assert.deepStrictEqual(a.wrecks, b.wrecks);
  assert.strictEqual(a.roadX(-12345), b.roadX(-12345));
  assert.notStrictEqual(a.roadX(-12345), c.roadX(-12345));
});

test('client replay of inputs matches the authoritative car', () => {
  const { g } = raceReady(5);
  const pred = JSON.parse(JSON.stringify(g.cars[0]));
  for (let q = 1; q <= 900; q++) {
    const inp = { s: Math.sin(q / 40) * 0.5, g: 1, b: 0, x: q === 300 ? 1 : 0 };
    g.input(0, q, inp);
    S.step(pred, inp, g.world, g.env);
  }
  assert.ok(Math.abs(pred.x - g.cars[0].x) < 1e-9);
  assert.ok(Math.abs(pred.y - g.cars[0].y) < 1e-9);
  assert.ok(g.cars[0].y < -500, 'the car actually moved');
});

test('hose moves fuel, and pulling away snaps it', () => {
  const { g, events } = raceReady(6);
  const [a, b] = g.cars;
  a.x = b.x - 50; a.y = b.y; a.fuel = 40; b.fuel = 60;
  g.act(0, 'hose');
  assert.ok(g.hose);
  for (let i = 0; i < 60; i++) g.tick(1 / 30);
  assert.ok(a.fuel > 45, 'attacker gained fuel: ' + a.fuel);
  assert.ok(b.fuel < 55, 'victim lost fuel: ' + b.fuel);
  b.x += 400;
  g.tick(1 / 30);
  assert.strictEqual(g.hose, null);
  assert.ok(has(events, 'hoseSnap'));
  g.cars[1].x = a.x + 40;
  g.act(0, 'hose');
  assert.strictEqual(g.hose, null, 'cooldown blocks an immediate second hose');
});

test('hose cannot start from far away', () => {
  const { g } = raceReady(6);
  g.cars[0].x = g.cars[1].x - 300;
  g.act(0, 'hose');
  assert.strictEqual(g.hose, null);
});

test('three horns from the victim reverse the hose', () => {
  const { g, events } = raceReady(7);
  const [a, b] = g.cars;
  a.x = b.x - 50; a.y = b.y; a.fuel = 50; b.fuel = 50;
  g.act(0, 'hose');
  for (let i = 0; i < 30; i++) g.tick(1 / 30);
  for (let n = 0; n < 3; n++) { g.act(1, 'horn'); for (let i = 0; i < 6; i++) g.tick(1 / 30); }
  assert.ok(has(events, 'hoseRev'));
  const before = b.fuel;
  for (let i = 0; i < 20; i++) g.tick(1 / 30);
  assert.ok(b.fuel > before, 'victim now gains fuel');
});

test('wreck loots once through the hold gesture, only when slow', () => {
  const { g, events } = raceReady(8);
  const w = g.world.wrecks[0];
  const c = g.cars[0];
  c.x = w.x; c.y = w.y;
  g.cars[1].y = w.y + 3000;
  c.vy = -200;
  g.setFlags(0, true);
  for (let i = 0; i < 120; i++) g.tick(1 / 30);
  assert.ok(!has(events, 'loot'), 'driving past does not loot');
  c.vy = 0;
  for (let i = 0; i < 120; i++) g.tick(1 / 30);
  assert.ok(has(events, 'loot'));
  const n = events.filter((e) => e.k === 'loot').length;
  for (let i = 0; i < 120; i++) g.tick(1 / 30);
  assert.strictEqual(events.filter((e) => e.k === 'loot').length, n, 'same wreck is not looted twice');
});

test('releasing the hold resets progress', () => {
  const { g, events } = raceReady(8);
  const w = g.world.wrecks[0];
  const c = g.cars[0];
  c.x = w.x; c.y = w.y; g.cars[1].y = w.y + 3000;
  g.setFlags(0, true);
  for (let i = 0; i < 20; i++) g.tick(1 / 30);
  assert.ok(g.holdFrac[0] > 0);
  g.setFlags(0, false);
  g.tick(1 / 30);
  assert.strictEqual(g.holdFrac[0], 0);
  assert.ok(!has(events, 'loot'));
});

test('items reach the other player', () => {
  const { g, events } = raceReady(9);
  g.items[0] = ['cow', 'gag', 'oil', 'mirage'];
  g.act(0, 'item');
  assert.ok(g.ents.some((e) => e.type === 'cow'));
  g.act(0, 'item');
  assert.ok(g.cars[1].gag > 0);
  g.act(0, 'item');
  assert.ok(g.ents.some((e) => e.type === 'oil'));
  g.act(0, 'item');
  assert.ok(g.ents.some((e) => e.type === 'mirage' && e.owner === 1));
  assert.ok(has(events, 'cowSent') && has(events, 'gag'));
  assert.strictEqual(g.items[0].length, 0);
});

test('a cow in the way stops the car', () => {
  const { g, events } = raceReady(9);
  const c = g.cars[1];
  c.vy = -300;
  g.ents.push({ id: 99, type: 'cow', x: c.x, y: c.y, vx: 0, owner: 1, life: 5 });
  g.tick(1 / 30);
  assert.ok(has(events, 'cowHit'));
  assert.ok(Math.abs(c.vy) < 40);
  assert.ok(c.hp < 100);
});

test('an empty car can always recover through a canister', () => {
  const { g, events } = raceReady(10);
  const c = g.cars[0];
  c.fuel = 0.001;
  c.vy = -100;
  let q = 0;
  g.input(0, ++q, { s: 0, g: 1, b: 0, x: 0 });
  assert.ok(has(events, 'empty'));
  const can = g.ents.find((e) => e.type === 'can');
  assert.ok(can);
  const bot = createBot(g, 0, 0.5);
  for (let i = 0; i < 60 * 60 && c.fuel <= 0; i++) {
    if (i % 2 === 0) g.tick(1 / 30);
    g.input(0, ++q, bot());
  }
  assert.ok(c.fuel > 0, 'canister reached by pushing');
});

test('full race ends with a winner in a sensible time', () => {
  for (const seed of [11, 12]) {
    const { g } = raceReady(seed);
    const b0 = createBot(g, 0, 1), b1 = createBot(g, 1, 0.45);
    let q0 = 0, q1 = 0;
    for (let t = 0; t < 60 * 60 * 35 && g.phase !== 'over'; t++) {
      if (t % 2 === 0) { g.tick(1 / 30); if (g.cars[0].panne) g.setFlags(0, true); if (g.cars[1].panne) g.setFlags(1, true); }
      g.input(0, ++q0, b0()); g.input(1, ++q1, b1());
    }
    assert.strictEqual(g.phase, 'over', 'seed ' + seed);
    assert.ok(g.raceTime > 400 && g.raceTime < 1800, 'race time ' + g.raceTime);
  }
});

// End-to-end over a real socket.
function client(port) {
  const ws = new WebSocket('ws://127.0.0.1:' + port);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    inbox.push(m);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].f(m)) { waiters[i].res(m); waiters.splice(i, 1); }
    }
  });
  return {
    ws, inbox,
    open: new Promise((r) => ws.on('open', r)),
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (f, ms) => new Promise((res, rej) => {
      const hit = inbox.find(f);
      if (hit) { res(hit); return; }
      const t = setTimeout(() => rej(new Error('timeout')), ms || 6000);
      waiters.push({ f, res: (m) => { clearTimeout(t); res(m); } });
    }),
  };
}

test('room flow: create, join, drive, reconnect, wrong codes', async () => {
  const server = http.createServer();
  const rooms = attachRooms(server, { slotHoldMs: 1500 });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  try {
    const a = client(port), b = client(port);
    await a.open; await b.open;

    b.send({ t: 'join', code: 'ZZZZ' });
    assert.strictEqual((await b.wait((m) => m.t === 'err')).m, 'unknown');

    a.send({ t: 'create' });
    const room = await a.wait((m) => m.t === 'room');
    assert.match(room.code, /^[A-Z]{4}$/);
    b.inbox.length = 0;
    b.send({ t: 'join', code: room.code.toLowerCase() });
    const sa = await a.wait((m) => m.t === 'start');
    const sb = await b.wait((m) => m.t === 'start');
    assert.strictEqual(sa.seed, sb.seed, 'both get the same seed');
    assert.strictEqual(sb.you, 1);
    const roomB = await b.wait((m) => m.t === 'room');

    const c = client(port);
    await c.open;
    c.send({ t: 'join', code: room.code });
    assert.strictEqual((await c.wait((m) => m.t === 'err')).m, 'taken');
    c.ws.close();

    await a.wait((m) => m.t === 's' && m.ph === 'race', 6000);
    let q = 1000;
    for (let i = 0; i < 8; i++) {
      const l = [];
      for (let j = 0; j < 2; j++) l.push([q++, 0, 1, 0, 0]);
      a.send({ t: 'i', l, h: 0 });
      await new Promise((r) => setTimeout(r, 33));
    }
    a.inbox.length = 0;
    const s = await a.wait((m) => m.t === 's');
    assert.ok(s.cars[0].y < 0, 'server moved the car from inputs');

    // Junk must not bring the server down.
    a.ws.send('not json');
    a.send({ t: 'i', l: [['x', {}, null, 'y']], h: 'z' });
    a.send({ t: 'a', a: 'nonsense' });

    // Client B drops and comes back with its token.
    b.ws.terminate();
    await a.wait((m) => m.t === 'peer' && m.on === false);
    const b2 = client(port);
    await b2.open;
    b2.send({ t: 'rejoin', code: room.code, token: 'wrong' });
    assert.strictEqual((await b2.wait((m) => m.t === 'err')).m, 'gone');
    b2.send({ t: 'rejoin', code: room.code, token: roomB.token });
    const resumed = await b2.wait((m) => m.t === 'start');
    assert.ok(resumed.resume);
    assert.strictEqual(resumed.seed, sa.seed);
    await b2.wait((m) => m.t === 's');

    // Staying away past the hold time hands the win to the other player.
    a.inbox.length = 0;
    b2.ws.terminate();
    // A short dropout must not end the race, whichever player it hits.
    await new Promise((r) => setTimeout(r, 1100));
    assert.ok(!a.inbox.some((m) => m.t === 'e' && m.k === 'win'), 'race survives while the slot is held');
    const win = await a.wait((m) => m.t === 'e' && m.k === 'win', 5000);
    assert.strictEqual(win.p, 0);
    assert.ok(win.forfeit);
    a.ws.close();
  } finally {
    rooms.close();
    server.close();
  }
});
