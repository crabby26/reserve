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

    return { seed, roadX, roadAngle, paved, nextStation, stations, ROAD_HALF, KM, GOAL_KM, goalY: -GOAL_KM * KM };
  }

  return { createWorld, rng, KM, GOAL_KM, ROAD_HALF };
});
