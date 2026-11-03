// Deterministic world generation. Runs unchanged in Node and in the browser:
// both clients and the server derive the same road from the same seed.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReserveWorld = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KM = 2000;           // world units per in-game kilometre
  const GOAL_KM = 100;
  const ROAD_HALF = 95;      // half road width in world units

  // Small seeded PRNG (mulberry32).
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createWorld(seed) {
    const r = rng(seed);
    const p1 = r() * 6.283, p2 = r() * 6.283, p3 = r() * 6.283;
    const l1 = 2600 + r() * 800, l2 = 1000 + r() * 300, l3 = 8000 + r() * 2500;

    // Road centre x for a given y. Progress runs towards negative y.
    function roadX(y) {
      return 200 * Math.sin(y / l1 * 6.283 + p1) +
             58 * Math.sin(y / l2 * 6.283 + p2) +
             400 * Math.sin(y / l3 * 6.283 + p3);
    }
    // Road direction as heading angle (0 = straight up the screen).
    function roadAngle(y) {
      const d = 8;
      return Math.atan2(roadX(y + d) - roadX(y - d), 2 * d) * -1;
    }

    // Filling stations: spaced so that a careful driver just makes it.
    const stations = [];
    for (let km = 9 + r() * 4; km < GOAL_KM - 4;) {
      const side = r() < 0.5 ? -1 : 1;
      const y = -km * KM;
      stations.push({
        i: stations.length, km, y, side,
        x: roadX(y) + side * (ROAD_HALF + 105),
        stock: Math.round(95 + r() * 45),
        nameIdx: Math.floor(r() * 1000),
      });
      km += 13 + r() * 7;
    }

    // Roadside content comes from its own stream, so tuning it never moves the stations.
    const r2 = rng(seed ^ 0x2F6E2B1);
    const nearStation = (y, d) => stations.some((s) => Math.abs(s.y - y) < d);

    const wrecks = [];
    for (let km = 2 + r2() * 2; km < GOAL_KM - 1; km += 1.4 + r2() * 1.8) {
      const y = -km * KM;
      const side = r2() < 0.5 ? -1 : 1, dist = 58 + r2() * 62, roll = r2(), rot = r2() * 6.283;
      if (nearStation(y, 400)) continue;
      wrecks.push({
        i: wrecks.length, y, side, rot,
        x: roadX(y) + side * (ROAD_HALF + dist),
        kind: roll < 0.2 ? 'hut' : roll < 0.4 ? 'bus' : 'car',
      });
    }

    const crates = [];
    for (let km = 1.5 + r2(); km < GOAL_KM - 2; km += 1.6 + r2() * 2) {
      const y = -km * KM;
      const off = (r2() - 0.5) * 2 * (ROAD_HALF - 32);
      if (nearStation(y, 300)) continue;
      crates.push({ i: crates.length, y, x: roadX(y) + off });
    }

    const radars = [];
    for (let km = 8 + r2() * 5; km < GOAL_KM - 3; km += 9 + r2() * 9) {
      const y = -km * KM;
      const side = r2() < 0.5 ? -1 : 1;
      radars.push({ i: radars.length, y, side, x: roadX(y) + side * (ROAD_HALF + 26) });
    }

    const billboards = [];
    for (let km = 0.7; km < GOAL_KM; km += 2.2 + r2() * 2.4) {
      const y = -km * KM;
      const side = r2() < 0.5 ? -1 : 1, idx = Math.floor(r2() * 1000);
      if (nearStation(y, 400)) continue;
      billboards.push({ y, side, idx, x: roadX(y) + side * (ROAD_HALF + 92) });
    }

    // Tarmac test: the road with a forgiving shoulder, plus station forecourts.
    function paved(x, y) {
      const cx = roadX(y);
      if (Math.abs(x - cx) <= ROAD_HALF + 14) return true;
      for (let i = 0; i < stations.length; i++) {
        const s = stations[i];
        if (Math.abs(y - s.y) < 150 && (x - cx) * s.side > 0 && Math.abs(x - s.x) < 150) return true;
      }
      return false;
    }

    function nextStation(y) {
      for (let i = 0; i < stations.length; i++) if (stations[i].y < y - 60) return stations[i];
      return null;
    }

    return { seed, roadX, roadAngle, paved, nextStation, stations, wrecks, crates, radars, billboards, ROAD_HALF, KM, GOAL_KM, goalY: -GOAL_KM * KM };
  }

  return { createWorld, rng, KM, GOAL_KM, ROAD_HALF };
});
