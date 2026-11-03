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
  const PUMP_RATE = 18;     // litres per second
  const CAN_LITRES = 25;

  function round(v, f) { return Math.round(v * f) / f; }

  class Game {
    constructor(seed, onEvent) {
      this.seed = seed;
      this.world = W.createWorld(seed);
      this.r = W.rng(seed ^ 0x51ED270B);
      this.onEvent = onEvent || function () {};
      const x0 = this.world.roadX(0);
      this.cars = [S.createCar(x0 - 40, 0), S.createCar(x0 + 40, 0)];
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
      this.env = { wind: 0 };
      this.lastInput = [{ s: 0, g: 0, b: 0, x: 0 }, { s: 0, g: 0, b: 0, x: 0 }];
    }

    emit(e) { this.onEvent(e); }

    // One fixed simulation step for a player. Each client input advances its own car.
    input(p, seq, inp) {
      if (seq <= this.acks[p]) return;
      this.acks[p] = seq;
      this.lastInput[p] = inp;
      if (this.phase !== 'race') return;
      const car = this.cars[p];
      const hadFuel = car.fuel > 0;
      S.step(car, inp, this.world, this.env);
      if (hadFuel && car.fuel <= 0) this.onEmpty(p);
      if (car.y <= this.world.goalY && this.winner < 0) this.finish(p);
    }

    onEmpty(p) {
      this.emit({ k: 'empty', p });
      this.spawnCan(p);
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
        if (e.type === 'can') {
          if (e.y > this.cars[0].y + 2500 && e.y > this.cars[1].y + 2500) { this.ents.splice(i, 1); continue; }
          for (let p = 0; p < 2; p++) {
            const c = this.cars[p];
            if (Math.hypot(c.x - e.x, c.y - e.y) < 46) {
              c.fuel = Math.min(S.TANK, c.fuel + CAN_LITRES);
              this.emit({ k: 'can', p, stolen: e.owner !== p });
              this.ents.splice(i, 1);
              break;
            }
          }
        }
      }
      // A stolen or missed canister gets replaced while its owner is still dry.
      for (let p = 0; p < 2; p++) {
        if (this.cars[p].fuel > 0) continue;
        if (!this.ents.some((e) => e.type === 'can' && e.owner === p && e.y < this.cars[p].y + 200)) this.spawnCan(p);
      }
    }

    snapshot() {
      return {
        t: 's',
        T: round(this.time, 100),
        ph: this.phase,
        si: round(Math.max(0, this.startIn), 100),
        rt: round(this.raceTime, 10),
        w: this.winner,
        cars: this.cars.map((c, p) => packCar(c, this.acks[p])),
        ents: this.ents.map((e) => [e.id, e.type, round(e.x, 10), round(e.y, 10), e.owner === undefined ? -1 : e.owner]),
        stock: this.stock.map((v) => Math.round(v)),
        env: this.env,
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

  return { Game, COUNTDOWN, PUMP_RADIUS };
});
