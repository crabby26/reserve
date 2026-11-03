// Local end-to-end run: two clients in iPad-sized frames, driven only through
// touch-style pointer events on the real controls. Start with runAll() in the console.
(function () {
  'use strict';

  const LOG = (window.LOG = []);
  const log = (name, data) => { LOG.push(Object.assign({ step: name }, data)); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = (id) => document.getElementById(id).contentWindow;
  const el = (w, id) => w.document.getElementById(id);

  function pe(w, target, type, id, x, y) {
    target.dispatchEvent(new w.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y }));
  }
  function tap(w, id) {
    const t = el(w, id), r = t.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    pe(w, t, 'pointerdown', 50, x, y);
    pe(w, t, 'pointerup', 50, x, y);
  }
  // fr: 0 top of gas pedal ... 1 bottom. -1 presses the brake.
  function pedal(w, fr) {
    const box = el(w, 'pedals');
    const g = el(w, fr < 0 ? 'pedalBrake' : 'pedalGas').getBoundingClientRect();
    const x = g.left + 40, y = fr < 0 ? g.top + g.height / 2 : g.top + g.height * fr;
    if (!w.__pedalDown) { pe(w, box, 'pointerdown', 12, x, y); w.__pedalDown = true; } else pe(w, box, 'pointermove', 12, x, y);
  }
  function release(w) {
    if (!w.__pedalDown) return;
    const box = el(w, 'pedals');
    pe(w, box, 'pointerup', 12, 0, 0);
    w.__pedalDown = false;
  }

  const pilots = {};
  function pilot(w, targetFn) {
    stop(w);
    const z = el(w, 'steerZone'), zr = z.getBoundingClientRect();
    const ox = 170, oy = zr.bottom - 90;
    pe(w, z, 'pointerdown', 11, ox, oy);
    pilots[w.name || w.location.search] = setInterval(() => {
      const R = w.__reserve;
      if (!R.car) return;
      const c = R.car;
      const t = targetFn(R);
      const look = 170;
      const want = Math.atan2(t - c.x, look);
      const s = Math.max(-1, Math.min(1, (want - c.a) * 2.2));
      pe(w, z, 'pointermove', 11, ox + s * 70, oy);
    }, 40);
  }
  function stop(w) {
    const k = w.name || w.location.search;
    if (pilots[k]) { clearInterval(pilots[k]); delete pilots[k]; pe(w, el(w, 'steerZone'), 'pointerup', 11, 0, 0); }
  }

  const fuels = (A) => A.__reserve.last.cars.map((c) => Math.round(c.fuel * 10) / 10);
  const gap = (A) => { const c = A.__reserve.last.cars; return Math.hypot(c[0].x - c[1].x, c[0].y - c[1].y); };
  const toasts = (w) => Array.from(w.document.querySelectorAll('.toast')).map((e) => e.textContent);
  const lane = (off) => (R) => R.world.roadX(R.car.y - 170) + off;

  async function alongside(A, B) {
    for (let i = 0; i < 300; i++) {
      const l = A.__reserve.last;
      if (gap(A) < 75 && l.cd[0] <= 0 && !el(A, 'btnHose').disabled) { pedal(A, 0.05); pedal(B, 0.05); return true; }
      const dy = l.cars[0].y - l.cars[1].y;
      pedal(B, dy > 30 ? 0.75 : 0.05);
      pedal(A, dy < -30 ? 0.75 : 0.05);
      await sleep(100);
    }
    return false;
  }

  window.runAll = async function (runOpts) {
    const opts = runOpts || {};
    window.DONE = false;
    try {
      const A = frame('a');
      const errors = [];
      el(A, 'btnCreate').click();
      await sleep(600);
      const code = el(A, 'roomCode').textContent;
      log('lobby', { code, lobbyVisible: !el(A, 'lobby').classList.contains('hidden'), link: el(A, 'roomLink').textContent });

      document.getElementById('b').src = '../index.html?p=b&room=' + code;
      await sleep(1200);
      const B = frame('b');
      window.A = A; window.B = B;
      [A, B].forEach((w) => w.addEventListener('error', (e) => errors.push(e.message)));
      while (!A.__reserve.last || A.__reserve.last.ph !== 'race') await sleep(100);
      log('start', { same: A.__reserve.world.seed === B.__reserve.world.seed, you: [A.__reserve.you, B.__reserve.you] });

      // A breakdown can hit at any time. Repair it the way a player would.
      [A, B].forEach((w) => {
        let down = false;
        w.__mech = setInterval(() => {
          const R = w.__reserve, c = R.last && R.last.cars[R.you];
          const hb = el(w, 'btnHold');
          if (c && c.panne && !down && !hb.classList.contains('hidden')) {
            const r = hb.getBoundingClientRect();
            pe(w, hb, 'pointerdown', 61, r.left + 30, r.top + 30);
            down = true;
            log('panne', { who: R.you, label: el(w, 'holdText').textContent });
          } else if (c && !c.panne && down) {
            pe(w, hb, 'pointerup', 61, 0, 0);
            down = false;
            log('repaired', { who: R.you, toasts: toasts(w) });
          }
        }, 200);
      });
      pedal(A, 0.05); pedal(B, 0.05);
      pilot(A, lane(-34)); pilot(B, lane(34));
      await sleep(2500);
      const predErr = Math.abs(A.__reserve.car.y - A.__reserve.last.cars[0].y);
      log('driving', { km: -A.__reserve.car.y / 2000, speed: el(A, 'speedText').textContent, ping: el(A, 'ping').textContent, predErr, fps: [A.__reserveFps, B.__reserveFps] });

      // Hose and horn reversal
      let ok = await alongside(A, B);
      const f0 = fuels(A);
      tap(A, 'btnHose');
      await sleep(1500);
      const f1 = fuels(A);
      const alarm = !el(B, 'alarm').classList.contains('hidden');
      for (let i = 0; i < 3; i++) { tap(B, 'btnHorn'); await sleep(180); }
      await sleep(500);
      const f2 = fuels(A);
      log('hose+reverse', { alongside: ok, f0, f1, alarm, f2, hose: A.__reserve.last.hose, toastsB: toasts(B), toastsA: toasts(A) });
      window.SHOT1 = true;
      await sleep(3500);

      // Hose and escape by gas burst plus swerving
      while (A.__reserve.last.cd[0] > 0 || A.__reserve.last.hose) await sleep(100);
      ok = await alongside(A, B);
      tap(A, 'btnHose');
      await sleep(900);
      pedal(A, 0.9);
      tap(B, 'btnBoost');
      pilot(B, lane(70));
      let n = 0;
      while (A.__reserve.last.hose && n++ < 60) await sleep(100);
      log('hose+escape', { alongside: ok, secs: n / 10, gap: gap(A), toastsB: toasts(B), toastsA: toasts(A), boostCd: A.__reserve.last.cars[1].boostCd });
      pedal(A, 0.05);
      pilot(B, lane(34));

      // Pull up at the next wreck and take it apart with the hold gesture.
      const Rw = A.__reserve;
      const w = Rw.world.wrecks.find((x) => x.y < Rw.car.y - 900);
      pilot(A, (r) => (r.car.y - w.y < 900 ? w.x - w.side * 70 : lane(-30)(r)));
      while (Rw.car.y - w.y > 125) await sleep(16);
      release(A); pedal(A, -1);
      while (Math.abs(Rw.car.vy) > 25) await sleep(30);
      release(A);
      await sleep(250);
      const holdVisible = !el(A, 'btnHold').classList.contains('hidden');
      const holdLabel = el(A, 'holdText').textContent;
      const dist = Math.hypot(Rw.car.x - w.x, Rw.car.y - w.y);
      const hb = el(A, 'btnHold'), hr = hb.getBoundingClientRect();
      const bars = [Rw.car.fuel, Rw.car.tire, Rw.car.oil, Rw.car.hp, Rw.last.items[0].length];
      pe(A, hb, 'pointerdown', 60, hr.left + 40, hr.top + 40);
      await sleep(1000);
      const ring = Rw.last.hold[0];
      window.SHOT2 = true;
      await sleep(2600);
      pe(A, hb, 'pointerup', 60, 0, 0);
      log('wreck', { kind: w.kind, dist, holdVisible, holdLabel, ring, bars, barsAfter: [Rw.car.fuel, Rw.car.tire, Rw.car.oil, Rw.car.hp, Rw.last.items[0].length], toasts: toasts(A) });
      pedal(A, 0.05);
      pilot(A, lane(-34));
      await sleep(1000);

      // Collect crates by driving over them, then send everything at the other car.
      const seen = [];
      for (let round = 0; opts.items !== false && round < 6; round++) {
        const R = A.__reserve;
        const crate = R.world.crates.find((c) => c.y < R.car.y - 150);
        pilot(A, () => crate.x);
        for (let i = 0; i < 400 && R.last.items[R.you].length === 0 && R.car.y > crate.y - 200; i++) await sleep(50);
        pilot(A, lane(-34));
        const items = R.last.items[R.you].slice();
        if (items.length) {
          const before = B.__reserve.last.ents.length;
          const gagBefore = B.__reserve.last.cars[1].gag;
          tap(A, 'btnItem');
          await sleep(300);
          seen.push({
            item: items[0], ents: B.__reserve.last.ents.map((e) => e[1]), entsBefore: before, gagBefore,
            gagAfter: B.__reserve.last.cars[1].gag, toastA: toasts(A).slice(-1)[0], toastB: toasts(B).slice(-1)[0],
          });
        }
        if (new Set(seen.map((s) => s.item)).size >= 3) break;
      }
      log('items', { seen });

      // Whatever the other car picked up on the way goes the opposite direction.
      const backfire = [];
      for (let i = 0; i < 2 && B.__reserve.last.items[1].length; i++) {
        const item = B.__reserve.last.items[1][0];
        tap(B, 'btnItem');
        await sleep(300);
        backfire.push({ item, gagOnA: A.__reserve.last.cars[0].gag, ents: A.__reserve.last.ents.map((e) => e[1]), toastA: toasts(A).slice(-1)[0], toastB: toasts(B).slice(-1)[0] });
      }
      log('itemsFromB', { backfire });

      // Connection loss: socket dies, client must return by itself.
      await sleep(800);
      const yBefore = A.__reserve.last.cars[0].y;
      A.__reserve.net.ws.close();
      await sleep(250);
      const overlay = !el(A, 'conn').classList.contains('hidden');
      const overlayText = el(A, 'connText').textContent;
      await sleep(700);
      const seenByB = toasts(B);
      await sleep(2600);
      log('dropout', {
        phaseAfter: A.__reserve.last.ph,
        overlay, overlayText, seenByB, backOverlayHidden: el(A, 'conn').classList.contains('hidden'),
        connected: A.__reserve.net.connected, yBefore, yAfter: A.__reserve.last.cars[0].y, predErr: Math.abs(A.__reserve.car.y - A.__reserve.last.cars[0].y),
      });

      stop(A); stop(B);
      log('errors', { errors });
    } catch (e) {
      log('FAILED', { error: String(e && e.stack || e) });
    }
    window.DONE = true;
  };
})();
