// Solo opponent "Onkel Horst": drives a bit worse than a person and never asks for directions.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sim.js'));
  else root.ReserveBot = factory(root.ReserveSim);
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';

  function createBot(game, p, skill) {
    return function botInput() {
      const car = game.cars[p], world = game.world;
      const v = S.speedOf(car);
      let tx = world.roadX(car.y - 140) + 30 * Math.sin(car.y / 700);
      let ty = car.y - 140;
      let g = 0.72 + 0.2 * skill, b = 0;

      const st = world.nextStation(car.y + 80);
      if (st && car.fuel < 62 && game.stock[st.i] > 5) {
        const d = Math.hypot(car.x - st.x, car.y - st.y);
        if (d < 700) {
          tx = st.x; ty = st.y;
          if (d < 240 && v > 60) { g = 0; b = 1; }
          else if (d < 70) { g = 0; b = 1; }
          else if (d < 400) g = 0.45;
        }
      }
      if (car.fuel <= 0) {
        const can = game.ents.find((e) => e.type === 'can' && e.owner === p && e.y < car.y + 150);
        if (can) { tx = can.x; ty = can.y; }
        g = 1; b = 0;
      }

      // Horst reads speed limit signs only when he happens to look up.
      for (const r of world.radars) {
        if (car.y > r.y && car.y - r.y < 500 && r.i % 2 === 0) g = Math.min(g, 0.55);
      }

      const want = Math.atan2(tx - car.x, car.y - ty);
      const err = S.angleDiff(want, car.a);
      return { s: S.clamp(err * 2.6, -1, 1), g, b, x: 0 };
    };
  }

  // Occasional mischief, called about once per second by the solo transport.
  function botMischief(game, p) {
    const car = game.cars[p], other = game.cars[1 - p];
    if (game.items[p].length && Math.random() < 0.08) game.act(p, 'item');
    const d = Math.hypot(car.x - other.x, car.y - other.y);
    if (d < 80 && Math.random() < 0.35) game.act(p, 'hose');
    if (d < 200 && Math.random() < 0.12) game.act(p, 'horn');
    if (game.hose && game.hose.to === p && Math.random() < 0.3) game.act(p, 'horn');
    game.setFlags(p, !!car.panne);
  }

  return { createBot, botMischief };
});
