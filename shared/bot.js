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

      const want = Math.atan2(tx - car.x, car.y - ty);
      const err = S.angleDiff(want, car.a);
      return { s: S.clamp(err * 2.6, -1, 1), g, b, x: 0 };
    };
  }

  return { createBot };
});
