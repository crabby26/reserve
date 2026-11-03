// Authoritative game rules. The WebSocket server runs this for online rooms;
// the browser runs the same class for solo practice.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./world.js'), require('./sim.js'));
  } else root.ReserveGame = factory(root.ReserveWorld, root.ReserveSim);
})(typeof self !== 'undefined' ? self : this, function (W, S) {
  'use strict';

  const COUNTDOWN = 3.5;
  const PUMP_RADIUS = 115;
  const PUMP_RATE = 18;       // litres per second
  const CAN_LITRES = 25;

  const HOSE_RANGE = 85;      // start distance
  const HOSE_SNAP = 130;      // the hose tears at this distance
  const HOSE_WARMUP = 0.7;    // warning time before anything flows
  const HOSE_FLOW = 7;        // litres per second
  const HOSE_DURATION = 5.7;
  const HOSE_COOLDOWN = 9;
  const HOSE_REVERSE = 2.6;
  const HORNS_TO_REVERSE = 3;

  const HOLD_RADIUS = 135;
  const HOLD_MAX_SPEED = 60;
  const HOLD_TIME = { car: 2, bus: 2.4, hut: 3, panne: 2.8 };
  const ITEM_SLOTS = 2;
  const ITEMS = ['oil', 'cow', 'gag', 'mirage'];

  const RADAR_LIMIT = 275;    // 110 km/h on the speedometer
  const CAR_RADIUS = 18;

  function round(v, f) { return Math.round(v * f) / f; }

  class Game {
    constructor(seed, onEvent) {
      this.seed = seed;
      this.world = W.createWorld(seed);
      this.r = W.rng(seed ^ 0x51ED270B);
      this.onEvent = onEvent || function () {};
      const x0 = this.world.roadX(0);
      this.cars = [S.createCar(x0 - 52, 0), S.createCar(x0 + 52, 0)];
      this.cars.forEach((c) => { c.a = this.world.roadAngle(0); });
      this.acks = [0, 0];
      this.time = 0;
      this.phase = 'countdown';
      this.startIn = COUNTDOWN;
      this.winner = -1;
      this.raceTime = 0;
      this.stock = this.world.stations.map((s) => s.stock);
      this.ents = [];
      this.nextEnt = 1;
      this.pumping = [-1, -1];
      this.env = { wind: 0, storm: 0 };

      this.items = [[], []];
      this.holdFlag = [false, false];
      this.holdT = [0, 0];
      this.holdFrac = [0, 0];
      this.lootedSet = new Set();
      this.takenSet = new Set();
      this.hose = null;
      this.hoseCd = [0, 0];
      this.hornAt = [0, 0];
      this.hornLog = [];
      this.bumpCd = 0;
      this.lastY = [0, 0];
      this.stormLeft = 0;
      this.nextEvent = 38 + this.r() * 25;
      this.lastPanne = 0;
    }

    emit(e) { this.onEvent(e); }

    looted() { return { w: Array.from(this.lootedSet), c: Array.from(this.takenSet) }; }

    // One fixed simulation step for a player. Each client input advances its own car.
    input(p, seq, inp) {
      if (seq <= this.acks[p]) return;
      this.acks[p] = seq;
      if (this.phase !== 'race') return;
      const car = this.cars[p];
      const hadFuel = car.fuel > 0;
      S.step(car, inp, this.world, this.env);
      if (hadFuel && car.fuel <= 0) this.onEmpty(p);
      if (car.y <= this.world.goalY && this.winner < 0) this.finish(p);
    }

    setFlags(p, hold) { this.holdFlag[p] = !!hold; }

    act(p, what) {
      if (this.phase !== 'race') return;
      if (what === 'horn') this.horn(p);
      else if (what === 'hose') this.startHose(p);
      else if (what === 'item') this.useItem(p);
    }

    horn(p) {
      if (this.time - this.hornAt[p] < 0.15) return;
      this.hornAt[p] = this.time;
      this.emit({ k: 'horn', p });
      const h = this.hose;
      if (h && h.to === p && h.rev <= 0 && !h.reversed) {
        this.hornLog = this.hornLog.filter((t) => this.time - t < 1.6);
        this.hornLog.push(this.time);
        if (this.hornLog.length >= HORNS_TO_REVERSE) {
          h.rev = HOSE_REVERSE; h.reversed = true;
          this.emit({ k: 'hoseRev', p });
        }
      }
    }

    dist() {
      const a = this.cars[0], b = this.cars[1];
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    startHose(p) {
      if (this.hose || this.hoseCd[p] > 0 || this.dist() > HOSE_RANGE) return;
      this.hose = { from: p, to: 1 - p, t: 0, rev: 0, reversed: false, moved: 0 };
      this.hornLog = [];
      this.emit({ k: 'hoseStart', p });
    }

    endHose(kind) {
      const h = this.hose;
      this.hoseCd[h.from] = HOSE_COOLDOWN;
      this.emit({ k: kind, p: h.from, litres: Math.round(h.moved) });
      this.hose = null;
    }

    tickHose(dt) {
      this.hoseCd[0] = Math.max(0, this.hoseCd[0] - dt);
      this.hoseCd[1] = Math.max(0, this.hoseCd[1] - dt);
      const h = this.hose;
      if (!h) return;
      if (this.dist() > HOSE_SNAP) { this.endHose('hoseSnap'); return; }
      h.t += dt;
      if (h.t > HOSE_WARMUP) {
        const reversing = h.rev > 0;
        const donor = this.cars[reversing ? h.from : h.to];
        const taker = this.cars[reversing ? h.to : h.from];
        const l = Math.min(HOSE_FLOW * dt * (reversing ? 1.4 : 1), donor.fuel);
        donor.fuel -= l;
        taker.fuel = Math.min(S.TANK, taker.fuel + l);  // an overfull tank just dribbles on the road
        h.moved += reversing ? -l : l;
        if (donor.fuel <= 0) this.onEmpty(reversing ? h.from : h.to);
        if (reversing) h.rev -= dt;
      }
      if (h.t > HOSE_DURATION) this.endHose('hoseEnd');
    }

    canAhead(p) {
      const y = this.cars[p].y;
      return this.ents.some((e) => e.type === 'can' && e.owner === p && e.y < y + 200);
    }

    onEmpty(p) {
      this.emit({ k: 'empty', p });
      if (!this.canAhead(p)) this.spawnCan(p);
    }

    // Nobody can get stuck for good: an empty car always gets a canister nearby.
    spawnCan(p) {
      const car = this.cars[p];
      const dist = 650 + this.r() * 450;
      const y = car.y - dist;
      const side = this.r() < 0.5 ? -1 : 1;
      this.ents.push({ id: this.nextEnt++, type: 'can', x: this.world.roadX(y) + side * 70, y, owner: p });
    }

    finish(p) {
      this.winner = p;
      this.phase = 'over';
      this.emit({ k: 'win', p, time: round(this.raceTime, 100) });
    }

    // The other player stayed away for too long.
    forfeit(p) {
      if (this.phase === 'over') return;
      this.winner = p;
      this.phase = 'over';
      this.forfeited = true;
      this.emit({ k: 'win', p, time: round(this.raceTime, 100), forfeit: true });
    }

    tick(dt) {
      this.time += dt;
      if (this.phase === 'countdown') {
        this.startIn -= dt;
        if (this.startIn <= 0) { this.phase = 'race'; this.emit({ k: 'go' }); }
        return;
      }
      if (this.phase !== 'race') return;
      this.raceTime += dt;
      this.tickStations(dt);
      this.tickEnts(dt);
      this.tickHose(dt);
      this.tickHold(dt);
      this.tickCrates();
      this.tickRadars();
      this.tickCollision(dt);
      this.tickEvents(dt);
    }

    tickStations(dt) {
      for (let p = 0; p < 2; p++) {
        const car = this.cars[p];
        let at = -1;
        const st = this.world.stations;
        for (let i = 0; i < st.length; i++) {
          if (Math.hypot(car.x - st[i].x, car.y - st[i].y) < PUMP_RADIUS) { at = i; break; }
        }
        const slow = Math.abs(S.speedOf(car)) < 70;
        if (at >= 0 && slow && car.fuel < S.TANK - 0.01) {
          if (this.stock[at] > 0) {
            const l = Math.min(PUMP_RATE * dt, this.stock[at], S.TANK - car.fuel);
            this.stock[at] -= l;
            car.fuel += l;
            if (this.pumping[p] !== at) { this.pumping[p] = at; this.emit({ k: 'pump', p, i: at }); }
            if (this.stock[at] <= 0.01) { this.stock[at] = 0; this.emit({ k: 'dry', p, i: at }); }
          } else if (this.pumping[p] !== at) {
            this.pumping[p] = at;
            this.emit({ k: 'dry', p, i: at });
          }
        } else if (at < 0) {
          this.pumping[p] = -1;
        }
      }
    }

    tickEnts(dt) {
      for (let i = this.ents.length - 1; i >= 0; i--) {
        const e = this.ents[i];
        if (this.tickEnt(e, dt)) this.ents.splice(i, 1);
      }
      // A stolen or missed canister gets replaced while its owner is still dry.
      for (let p = 0; p < 2; p++) {
        if (this.cars[p].fuel <= 0 && !this.canAhead(p)) this.spawnCan(p);
      }
    }

    // Returns true when the entity is finished.
    tickEnt(e, dt) {
      const [a, b] = this.cars;
      const near = (c, r) => Math.hypot(c.x - e.x, c.y - e.y) < r;
      if (e.type === 'can') {
        if (e.y > a.y + 2500 && e.y > b.y + 2500) return true;
        for (let p = 0; p < 2; p++) {
          if (near(this.cars[p], 46)) {
            const c = this.cars[p];
            c.fuel = Math.min(S.TANK, c.fuel + CAN_LITRES);
            this.emit({ k: 'can', p, stolen: e.owner !== p });
            return true;
          }
        }
      } else if (e.type === 'oil') {
        e.life -= dt;
        if (e.grace > 0) e.grace -= dt;
        if (e.life <= 0) return true;
        for (let p = 0; p < 2; p++) {
          const c = this.cars[p];
          if (p === e.owner && e.grace > 0) continue;
          if (near(c, 58) && c.slip <= 0 && Math.abs(S.speedOf(c)) > 40) {
            c.slip = 2.2;
            this.emit({ k: 'slip', p, own: p === e.owner });
          }
        }
      } else if (e.type === 'cow') {
        e.x += e.vx * dt;
        e.life -= dt;
        if (e.life <= 0) return true;
        for (let p = 0; p < 2; p++) {
          const c = this.cars[p];
          if (near(c, 40)) {
            c.vx *= 0.12; c.vy *= 0.12;
            c.hp = Math.max(0, c.hp - 9);
            c.stall = Math.max(c.stall, 1);
            this.emit({ k: 'cowHit', p });
            return true;
          }
        }
      } else if (e.type === 'mirage') {
        const c = this.cars[e.owner];
        if (near(c, 170)) { this.emit({ k: 'mirageGone', p: e.owner }); return true; }
        if (e.y > c.y + 200) return true;
      }
      return false;
    }

    giveItem(p) {
      if (this.items[p].length >= ITEM_SLOTS) return null;
      const behind = this.cars[p].y - this.cars[1 - p].y > 2 * W.KM;
      // Whoever is far behind more often finds a cow. Bertha evens things out.
      const it = behind && this.r() < 0.45 ? 'cow' : ITEMS[Math.floor(this.r() * ITEMS.length)];
      this.items[p].push(it);
      return it;
    }

    useItem(p) {
      const it = this.items[p].shift();
      if (!it) return;
      const me = this.cars[p], o = this.cars[1 - p];
      if (it === 'oil') {
        const hx = Math.sin(me.a), hy = -Math.cos(me.a);
        this.ents.push({ id: this.nextEnt++, type: 'oil', x: me.x - hx * 50, y: me.y - hy * 50, owner: p, life: 45, grace: 3 });
        this.emit({ k: 'oilDrop', p });
      } else if (it === 'cow') {
        const v = Math.abs(S.speedOf(o));
        const y = o.y - Math.max(460, v * 2.3);
        const side = this.r() < 0.5 ? -1 : 1;
        const cx = this.world.roadX(y);
        // Timed so the cow reaches the middle about when the target gets there.
        const arrive = Math.max(460, v * 2.3) / Math.max(v, 150);
        const start = this.world.ROAD_HALF + 90;
        this.ents.push({ id: this.nextEnt++, type: 'cow', x: cx + side * start, y, vx: -side * start / arrive, owner: 1 - p, life: arrive * 2.2 });
        this.emit({ k: 'cowSent', p });
      } else if (it === 'gag') {
        o.gag = 4.5;
        this.emit({ k: 'gag', p });
      } else if (it === 'mirage') {
        const y = o.y - 1100;
        const side = this.r() < 0.5 ? -1 : 1;
        this.ents.push({ id: this.nextEnt++, type: 'mirage', x: this.world.roadX(y) + side * 200, y, owner: 1 - p });
        this.emit({ k: 'mirageSent', p });
      }
    }

    tickHold(dt) {
      for (let p = 0; p < 2; p++) {
        const car = this.cars[p];
        let target = null, need = 0;
        if (this.holdFlag[p] && Math.abs(S.speedOf(car)) < HOLD_MAX_SPEED) {
          if (car.panne) { target = 'panne'; need = HOLD_TIME.panne; } else {
            const w = this.nearestWreck(car);
            if (w) { target = w; need = HOLD_TIME[w.kind]; }
          }
        }
        if (!target) { this.holdT[p] = 0; this.holdFrac[p] = 0; continue; }
        this.holdT[p] += dt;
        this.holdFrac[p] = Math.min(1, this.holdT[p] / need);
        if (this.holdT[p] >= need) {
          this.holdT[p] = 0; this.holdFrac[p] = 0;
          if (target === 'panne') {
            car.panne = 0;
            this.emit({ k: 'repaired', p });
          } else this.loot(p, target);
        }
      }
    }

    nearestWreck(car) {
      let best = null, bd = HOLD_RADIUS;
      for (const w of this.world.wrecks) {
        if (Math.abs(w.y - car.y) > HOLD_RADIUS || this.lootedSet.has(w.i)) continue;
        const d = Math.hypot(w.x - car.x, w.y - car.y);
        if (d < bd) { bd = d; best = w; }
      }
      return best;
    }

    loot(p, w) {
      this.lootedSet.add(w.i);
      const car = this.cars[p];
      const found = [];
      const rolls = w.kind === 'hut' ? 2 : 1;
      for (let i = 0; i < rolls; i++) {
        const r = this.r();
        if (r < 0.26) { car.fuel = Math.min(S.TANK, car.fuel + 14 + this.r() * 16); found.push('fuel'); }
        else if (r < 0.46) { car.tire = Math.min(100, car.tire + 55); found.push('tire'); }
        else if (r < 0.66) { car.oil = Math.min(100, car.oil + 55); found.push('oil'); }
        else if (r < 0.84) { car.hp = Math.min(100, car.hp + 40); found.push('part'); }
        else if (this.giveItem(p)) found.push('item');
        else { car.hp = Math.min(100, car.hp + 15); found.push('junk'); }
      }
      this.emit({ k: 'loot', p, w: w.i, found });
    }

    tickCrates() {
      const crates = this.world.crates;
      for (let p = 0; p < 2; p++) {
        const car = this.cars[p];
        if (this.items[p].length >= ITEM_SLOTS) continue;
        for (const c of crates) {
          if (Math.abs(c.y - car.y) > 44 || this.takenSet.has(c.i)) continue;
          if (Math.hypot(c.x - car.x, c.y - car.y) < 44) {
            this.takenSet.add(c.i);
            const it = this.giveItem(p);
            this.emit({ k: 'crate', p, c: c.i, item: it });
          }
        }
      }
    }

    tickRadars() {
      for (let p = 0; p < 2; p++) {
        const car = this.cars[p];
        const ly = this.lastY[p];
        for (const r of this.world.radars) {
          if (ly > r.y && car.y <= r.y) {
            const v = S.speedOf(car);
            if (v > RADAR_LIMIT) {
              car.stall = Math.max(car.stall, 2.2);
              this.emit({ k: 'radar', p, i: r.i, kmh: Math.round(v / S.V_MAX * 140) });
            } else this.emit({ k: 'radarOk', p, i: r.i });
          }
        }
        this.lastY[p] = car.y;
      }
    }

    // A friendly shove: costs speed and paint, never the game.
    tickCollision(dt) {
      this.bumpCd = Math.max(0, this.bumpCd - dt);
      const [a, b] = this.cars;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= CAR_RADIUS * 2 || d < 0.01) return;
      const nx = dx / d, ny = dy / d;
      const push = (CAR_RADIUS * 2 - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel > 0) {
        const j = rel * 0.7;
        a.vx -= nx * j; a.vy -= ny * j;
        b.vx += nx * j; b.vy += ny * j;
        if (rel > 70 && this.bumpCd <= 0) {
          this.bumpCd = 0.6;
          const dmg = Math.min(8, rel * 0.03);
          a.hp = Math.max(0, a.hp - dmg);
          b.hp = Math.max(0, b.hp - dmg);
          this.emit({ k: 'bump' });
        }
      }
    }

    tickEvents(dt) {
      if (this.stormLeft > 0) {
        this.stormLeft -= dt;
        const k = Math.min(1, Math.min(this.stormLeft, this.stormLen - this.stormLeft) / 2);
        this.env.storm = round(Math.max(0, k), 100);
        this.env.wind = round(this.stormWind * k, 10);
        if (this.stormLeft <= 0) { this.env.storm = 0; this.env.wind = 0; this.emit({ k: 'stormEnd' }); }
      }
      this.nextEvent -= dt;
      if (this.nextEvent > 0) return;
      this.nextEvent = 45 + this.r() * 40;
      const r = this.r();
      if (r < 0.55 && this.stormLeft <= 0) this.startStorm();
      else this.startPanne();
    }

    startStorm() {
      this.stormLen = 12 + this.r() * 8;
      this.stormLeft = this.stormLen;
      this.stormWind = (this.r() < 0.5 ? -1 : 1) * (28 + this.r() * 26);
      this.emit({ k: 'storm', len: Math.round(this.stormLen) });
    }

    startPanne() {
      // The leader, or the worse maintained car, is more likely to break down.
      const score = (c) => (c.oil + c.tire + c.hp) / 300 + (c.y / W.KM) * -0.02;
      const worse = score(this.cars[0]) < score(this.cars[1]) ? 0 : 1;
      const lead = this.cars[0].y < this.cars[1].y ? 0 : 1;
      const p = this.r() < 0.6 ? lead : worse;
      const c = this.cars[p];
      if (c.fuel <= 0 || c.panne || this.raceTime - this.lastPanne < 60) { this.startStorm(); return; }
      this.lastPanne = this.raceTime;
      c.panne = 1;
      this.emit({ k: 'panne', p });
    }

    snapshot() {
      const h = this.hose;
      return {
        t: 's',
        T: round(this.time, 100),
        ph: this.phase,
        si: round(Math.max(0, this.startIn), 100),
        rt: round(this.raceTime, 10),
        w: this.winner,
        ff: this.forfeited ? 1 : 0,
        cars: this.cars.map((c, p) => packCar(c, this.acks[p])),
        ents: this.ents.map((e) => [e.id, e.type, round(e.x, 10), round(e.y, 10), e.owner === undefined ? -1 : e.owner, e.vx ? Math.sign(e.vx) : 0]),
        stock: this.stock.map((v) => Math.round(v)),
        env: this.env,
        items: this.items,
        hold: [round(this.holdFrac[0], 100), round(this.holdFrac[1], 100)],
        cd: [round(this.hoseCd[0], 10), round(this.hoseCd[1], 10)],
        hose: h ? { f: h.from, to: h.to, flow: h.t > HOSE_WARMUP ? 1 : 0, rev: h.rev > 0 ? 1 : 0 } : null,
      };
    }
  }

  function packCar(c, ack) {
    return {
      x: round(c.x, 1000), y: round(c.y, 1000), a: round(c.a, 100000),
      vx: round(c.vx, 1000), vy: round(c.vy, 1000), st: round(c.st, 1000),
      fuel: round(c.fuel, 1000), hp: round(c.hp, 100), tire: round(c.tire, 100), oil: round(c.oil, 100),
      slip: round(c.slip, 100), boost: round(c.boost, 100), boostCd: round(c.boostCd, 100),
      stall: round(c.stall, 100), gag: round(c.gag, 100), panne: c.panne, clock: c.clock,
      ack,
    };
  }

  return { Game, COUNTDOWN, PUMP_RADIUS, HOSE_RANGE, HOSE_SNAP, HOLD_RADIUS, HOLD_MAX_SPEED, RADAR_LIMIT };
});
