// Car physics. A pure, fixed-step function shared by client prediction and the
// authoritative server, so both arrive at (nearly) the same result.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReserveSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DT = 1 / 60;
  const V_MAX = 350;          // world units per second at full health
  const TANK = 100;           // litres
  const PUSH_SPEED = 42;      // how fast a person pushes an empty car

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  function createCar(x, y) {
    return {
      x, y,
      a: 0,          // heading, 0 = up the screen, positive = clockwise
      vx: 0, vy: 0,
      st: 0,         // smoothed steering
      fuel: 72,      // nobody leaves with a full tank in this game
      hp: 100, tire: 100, oil: 100,
      slip: 0,       // oil on the tyres, seconds
      boost: 0,      // gas burst, seconds
      boostCd: 0,
      stall: 0,      // engine forced off, seconds
      gag: 0,        // fake flat tyre, seconds
      panne: 0,      // 1 while broken down
      clock: 0,      // sim steps, drives deterministic wobble
    };
  }

  function topSpeed(car, offroad) {
    let m = 0.72 + 0.28 * clamp(car.hp, 0, 100) / 100;
    if (car.oil < 15) m *= 0.8;
    if (car.tire <= 0) m *= 0.6;
    if (car.gag > 0) m *= 0.65;
    if (offroad) m *= 0.48;
    if (car.boost > 0) m *= 1.38;
    return V_MAX * m;
  }

  // input: { s: steer -1..1, g: throttle 0..1, b: brake 0..1, x: boost request }
  // env:   { wind: sideways push in units/s }
  function step(car, input, world, env) {
    const dt = DT;
    car.clock++;
    const hx = Math.sin(car.a), hy = -Math.cos(car.a);
    let v = car.vx * hx + car.vy * hy;          // forward speed
    let lat = -car.vx * hy + car.vy * hx;       // sideways speed
    const off = !world.paved(car.x, car.y);
    const engineOn = car.fuel > 0 && car.stall <= 0 && !car.panne;

    if (input.x && car.boostCd <= 0 && car.fuel > 3 && engineOn) {
      car.boost = 1.25; car.boostCd = 6; car.fuel -= 3;
    }
    const top = topSpeed(car, off);
    const speedFrac = clamp(Math.abs(v) / V_MAX, 0, 1.4);

    // Steering: quick smoothing only, so the wheel feels direct but not twitchy.
    car.st += (clamp(input.s, -1, 1) - car.st) * Math.min(1, dt * 16);
    let wobble = 0;
    if (car.gag > 0 || car.tire <= 0) wobble = Math.sin(car.clock * 0.42) * 0.16 * Math.min(1, speedFrac * 2);
    const yawGain = clamp(Math.abs(v) / 80, 0, 1) * (2.15 - 0.85 * Math.min(speedFrac, 1));
    const gripFactor = car.tire < 15 ? 0.8 : 1;
    car.a += (car.st * yawGain * gripFactor + wobble) * (v < -2 ? -1 : 1) * dt;

    // Lane assist: with the wheel centred on tarmac the car settles along the road.
    if (!off && Math.abs(car.st) < 0.06 && v > 60 && car.slip <= 0) {
      const d = angleDiff(world.roadAngle(car.y), car.a);
      if (Math.abs(d) < 0.7) car.a += d * Math.min(1, dt * 1.5);
    }

    // Longitudinal forces.
    if (engineOn) {
      // Pedal position sets the cruising speed, so a light foot really saves fuel.
      const cruise = top * (car.boost > 0 ? 1 : 0.4 + 0.6 * input.g);
      if (input.g > 0 && v < cruise) {
        const accel = (car.boost > 0 ? 300 : 175) * (1 - clamp(v / top, 0, 1) * 0.72);
        v = Math.min(cruise, v + accel * dt);
      } else if (input.g > 0 && v > cruise) {
        v = Math.max(cruise, v - 60 * dt);
      }
    } else if (car.fuel <= 0 && car.stall <= 0 && !car.panne && input.g > 0 && v < PUSH_SPEED) {
      v += 60 * input.g * dt; // out of fuel: get out and push
    }
    if (input.b > 0) {
      if (v > 4) v = Math.max(0, v - 430 * input.b * dt);
      else if (engineOn && v > -95) v -= 120 * input.b * dt;
    }
    const roll = off ? 150 : 34;
    if (v > top) v = Math.max(top, v - 240 * dt);
    const pushing = car.fuel <= 0 && input.g > 0 && v <= PUSH_SPEED;
    if ((input.g <= 0 || !engineOn) && !pushing) {
      if (v > 0) v = Math.max(0, v - roll * dt);
      else if (v < 0 && input.b <= 0) v = Math.min(0, v + roll * dt);
    }
    if (car.stall > 0 || car.panne) v -= v * Math.min(1, dt * 3.2);

    // Lateral grip.
    const grip = car.slip > 0 ? 1.1 : off ? 6 : 11;
    lat -= lat * Math.min(1, dt * grip);

    // Rebuild the velocity along the new heading. While slipping keep momentum.
    const nx = Math.sin(car.a), ny = -Math.cos(car.a);
    const keep = car.slip > 0 ? Math.min(1, dt * 2.2) : 1;
    const fx = hx + (nx - hx) * keep, fy = hy + (ny - hy) * keep;
    car.vx = fx * v - fy * lat;
    car.vy = fy * v + fx * lat;
    const wind = (env && env.wind) || 0;
    // Crosswind only pushes a moving car. A parked one stays where it is.
    car.x += (car.vx + wind * clamp(Math.abs(v) / 120, 0, 1)) * dt;
    car.y += car.vy * dt;

    // Consumption grows with the square of speed: patience saves fuel.
    if (car.fuel > 0) {
      let burn = 0.04;
      if (engineOn && input.g > 0) burn = 0.1 + 0.95 * speedFrac * speedFrac;
      car.fuel = Math.max(0, car.fuel - burn * dt);
    }
    const wear = clamp(Math.abs(v) / V_MAX, 0, 1) * dt;
    car.oil = Math.max(0, car.oil - 0.22 * wear);
    car.tire = Math.max(0, car.tire - (off ? 0.5 : 0.13) * wear);

    if (car.slip > 0) car.slip = Math.max(0, car.slip - dt);
    if (car.boost > 0) car.boost = Math.max(0, car.boost - dt);
    if (car.boostCd > 0) car.boostCd = Math.max(0, car.boostCd - dt);
    if (car.stall > 0) car.stall = Math.max(0, car.stall - dt);
    if (car.gag > 0) car.gag = Math.max(0, car.gag - dt);
  }

  function speedOf(car) {
    return car.vx * Math.sin(car.a) - car.vy * Math.cos(car.a);
  }

  return { DT, V_MAX, TANK, PUSH_SPEED, createCar, step, speedOf, topSpeed, clamp, angleDiff };
});
