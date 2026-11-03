// Reacts to game events with sound and text, and runs the contextual buttons.
// Everything visible in the world lives in render3d.js.
window.ReserveFx = (function () {
  'use strict';

  const R = ReserveRender, A = ReserveAudio, S = ReserveSim;
  const { T, say, pick, fill } = ReserveTexts;
  const $ = (id) => document.getElementById(id);

  const looted = new Set();
  let toast = () => {}, world = null;
  let gurgleT = 0, wrenchT = 0, alarmShown = false;

  function reset(w, l, toastFn) {
    world = w;
    toast = toastFn;
    looted.clear();
    ((l && l.w) || []).forEach((i) => { looted.add(i); R.setLooted(i); });
    ((l && l.c) || []).forEach((i) => R.setTaken(i));
    hideAlarm();
  }

  function hideAlarm() { if (alarmShown) { $('alarm').classList.add('hidden'); alarmShown = false; } }

  function flash() {
    const f = $('flash');
    f.classList.remove('on');
    void f.offsetWidth;   // restart the CSS animation
    f.classList.add('on');
  }

  function event(e, mine, o) {
    const lit = { o: o.o, l: Math.abs(e.litres || 0) };
    switch (e.k) {
      case 'horn':
        R.horn(e.p, pick(T.horn));
        if (!mine) A.sfx.horn(e.p);
        break;
      case 'hoseStart':
        if (mine) { toast(say('hoseStart')); A.sfx.gurgle(); } else A.sfx.alarm();
        break;
      case 'hoseSnap':
        A.sfx.snap();
        toast(mine ? say('hoseSnapMine', lit) : say('hoseSnapVictim', lit));
        hideAlarm();
        break;
      case 'hoseEnd':
        toast(mine ? say('hoseEndMine', lit) : say('hoseEndVictim', lit), !mine);
        hideAlarm();
        break;
      case 'hoseRev':
        A.sfx.gurgle();
        toast(mine ? say('hoseRevVictim', lit) : say('hoseRevMine', lit), !mine);
        break;
      case 'crate':
        R.setTaken(e.c);
        if (mine) { A.sfx.pickup(); toast(e.item ? T.crate[e.item] : T.crateFull); }
        break;
      case 'loot':
        looted.add(e.w);
        R.setLooted(e.w);
        if (mine) {
          A.sfx.loot();
          e.found.forEach((f) => toast(pick(T.loot[f])));
        } else toast(fill(T.otherLoot, o));
        break;
      case 'radar':
        if (mine) { flash(); A.sfx.flash(); toast(say('radar', { v: e.kmh }), true); } else toast(say('otherRadar', o));
        break;
      case 'radarOk':
        if (mine) toast(say('radarOk'));
        break;
      case 'storm': A.sfx.alarm(); toast(say('storm'), true); break;
      case 'stormEnd': toast(say('stormEnd')); break;
      case 'panne':
        if (mine) { A.sfx.bad(); toast(say('panne'), true); } else toast(say('otherPanne', o));
        break;
      case 'repaired':
        if (mine) { A.sfx.pickup(); toast(say('repaired')); }
        break;
      case 'oilDrop':
        if (mine) { A.sfx.click(); toast(say('oilDrop')); }
        break;
      case 'slip':
        if (mine) { A.sfx.bad(); toast(say(e.own ? 'slipOwn' : 'slip'), true); }
        break;
      case 'cowSent':
        A.sfx.moo();
        toast(mine ? say('cowSent') : say('cowWarn'), !mine);
        break;
      case 'cowHit':
        A.sfx.crash(); A.sfx.moo();
        toast(mine ? say('cowHit') : say('otherCowHit'), mine);
        break;
      case 'gag':
        A.sfx.squeak();
        toast(mine ? say('gagSent', o) : say('gagHit'), !mine);
        break;
      case 'mirageSent':
        if (mine) { A.sfx.mirage(); toast(say('mirageSent', o)); }
        break;
      case 'mirageGone':
        if (mine) { A.sfx.bad(); toast(say('mirageGone')); }
        break;
      case 'bump':
        A.sfx.crash(); toast(pick(T.bump));
        break;
      default:
    }
  }

  // Lerp entities by id between two snapshots.
  function entsAt(q) {
    const out = [];
    const prev = new Map(q.a.ents.map((e) => [e[0], e]));
    for (const e of q.b.ents) {
      const p = prev.get(e[0]);
      out.push({ id: e[0], type: e[1], x: p ? p[2] + (e[2] - p[2]) * q.k : e[2], y: p ? p[3] + (e[3] - p[3]) * q.k : e[3], owner: e[4], dir: e[5] });
    }
    return out;
  }

  // Contextual controls, called each frame while driving.
  function hud(car, last, you, dt, oName) {
    const hose = last.hose;
    if (hose && hose.to === you) {
      if (!alarmShown) { $('alarm').classList.remove('hidden'); alarmShown = true; }
      const html = fill(T.hoseWarn, { o: oName }) + '<small>' + T.hoseHelp + '</small>';
      if ($('alarm').dataset.h !== html) { $('alarm').innerHTML = html; $('alarm').dataset.h = html; }
    } else hideAlarm();

    if (hose && hose.flow) {
      gurgleT -= dt;
      if (gurgleT <= 0) { gurgleT = 0.8; A.sfx.gurgle(); }
    }
    A.setWind(last.env ? last.env.storm : 0);

    const items = last.items[you];
    const btn = $('btnItem');
    const first = items[0];
    btn.disabled = !first;
    const icon = first ? T.itemIcons[first] : '–';
    if ($('itemIcon').textContent !== icon) {
      $('itemIcon').textContent = icon;
      $('itemName').textContent = first ? T.itemNames[first] + (items[1] ? ' +1' : '') : 'Kein Item';
    }

    // Same-instant positions from the server, because that is what it will check.
    const d = Math.hypot(last.cars[0].x - last.cars[1].x, last.cars[0].y - last.cars[1].y);
    const ready = !hose && last.cd[you] <= 0 && d < ReserveGame.HOSE_RANGE;
    const hb = $('btnHose');
    hb.disabled = !ready;
    hb.classList.toggle('ready', ready);

    const speed = Math.abs(S.speedOf(car));
    let label = null;
    if (car.panne) label = T.holdPanne;
    else {
      for (const w of world.wrecks) {
        if (Math.abs(w.y - car.y) > ReserveGame.HOLD_RADIUS || looted.has(w.i)) continue;
        if (Math.hypot(w.x - car.x, w.y - car.y) < ReserveGame.HOLD_RADIUS) {
          label = speed < ReserveGame.HOLD_MAX_SPEED ? T.holdWreck[w.kind] : speed < 200 ? T.holdBrake : null;
          break;
        }
      }
    }
    const hold = $('btnHold');
    hold.classList.toggle('hidden', !label);
    if (label && $('holdText').textContent !== label) $('holdText').textContent = label;
    const frac = last.hold[you];
    $('holdRing').style.strokeDashoffset = String(100 - frac * 100);
    if (frac > 0) {
      wrenchT -= dt;
      if (wrenchT <= 0) { wrenchT = 0.32; A.sfx.wrench(); }
    }
    hold.classList.toggle('on', frac > 0);
  }

  return { reset, event, entsAt, hud, hideAlarm };
})();
