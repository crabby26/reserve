// Everything roadside and mischievous: drawing wrecks, crates, cows and the hose,
// reacting to game events, and the contextual buttons.
window.ReserveFx = (function () {
  'use strict';

  const R = ReserveRender, A = ReserveAudio, S = ReserveSim;
  const { T, say, pick, fill } = ReserveTexts;
  const $ = (id) => document.getElementById(id);

  const looted = new Set(), taken = new Set();
  const hornBubbles = [];
  let flash = 0, toast = () => {}, world = null;
  let gurgleT = 0, wrenchT = 0, alarmShown = false, stormLevel = 0;
  const streaks = [];
  let spr = null;
  const mirageWords = new Map();

  function buildSprites() {
    const sprite = R.sprite, rr = R.rr;
    spr = {};
    const carWreck = (g) => {
      g.fillStyle = 'rgba(40,25,15,.3)'; g.fillRect(14, 14, 44, 72);
      g.fillStyle = '#7a4a2a'; rr(g, 10, 10, 40, 70, 7); g.fill();
      g.fillStyle = '#54301a'; g.fillRect(16, 26, 28, 12);
      g.fillStyle = '#3d2413'; g.beginPath(); g.arc(30, 54, 11, 0, 7); g.fill();
      g.fillStyle = '#9c6a3f'; g.fillRect(10, 40, 7, 24);
      g.fillStyle = '#a38a55'; g.beginPath(); g.arc(44, 16, 5, 0, 7); g.fill();
    };
    spr.car = sprite(60, 90, carWreck);
    spr.bus = sprite(70, 150, (g) => {
      g.fillStyle = 'rgba(40,25,15,.3)'; g.fillRect(14, 14, 54, 132);
      g.fillStyle = '#b48c3c'; rr(g, 8, 8, 52, 130, 8); g.fill();
      g.fillStyle = '#7d5f26';
      for (let y = 22; y < 124; y += 22) g.fillRect(14, y, 40, 14);
      g.fillStyle = '#5c3a1c'; g.beginPath(); g.arc(40, 92, 15, 0, 7); g.fill();
    });
    spr.hut = sprite(120, 110, (g) => {
      g.fillStyle = 'rgba(40,25,15,.3)'; g.fillRect(16, 16, 100, 90);
      g.fillStyle = '#7c5b3c'; g.fillRect(8, 8, 100, 90);
      g.fillStyle = '#654729';
      for (let x = 8; x < 108; x += 14) g.fillRect(x, 8, 3, 90);
      g.fillStyle = '#3a2614'; g.fillRect(46, 34, 26, 22);
      g.fillStyle = '#a57e52'; g.fillRect(8, 48, 100, 4);
    });
    spr.lootedCar = sprite(60, 90, (g) => {
      g.strokeStyle = '#5a3c26'; g.lineWidth = 4;
      g.strokeRect(14, 14, 32, 62);
      g.beginPath(); g.moveTo(14, 44); g.lineTo(46, 44); g.stroke();
      g.fillStyle = '#6d4e36'; g.fillRect(24, 26, 10, 8);
    });
    spr.crate = sprite(40, 40, (g) => {
      g.fillStyle = 'rgba(40,25,15,.35)'; g.fillRect(7, 7, 31, 31);
      g.fillStyle = '#c39451'; g.fillRect(4, 4, 30, 30);
      g.strokeStyle = '#7f5c29'; g.lineWidth = 3; g.strokeRect(4, 4, 30, 30);
      g.beginPath(); g.moveTo(4, 4); g.lineTo(34, 34); g.moveTo(34, 4); g.lineTo(4, 34); g.stroke();
      g.fillStyle = '#d9622b'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.fillText('?', 19, 26);
    });
    spr.oil = sprite(150, 110, (g) => {
      g.fillStyle = 'rgba(16,16,22,.82)';
      g.beginPath(); g.ellipse(75, 55, 66, 42, 0.2, 0, 7); g.fill();
      g.beginPath(); g.ellipse(32, 30, 22, 14, 0.5, 0, 7); g.fill();
      g.beginPath(); g.ellipse(120, 84, 24, 16, 0.1, 0, 7); g.fill();
      g.fillStyle = 'rgba(120,90,190,.28)'; g.beginPath(); g.ellipse(60, 44, 26, 12, 0.3, 0, 7); g.fill();
      g.fillStyle = 'rgba(70,170,160,.25)'; g.beginPath(); g.ellipse(88, 62, 20, 9, 0.1, 0, 7); g.fill();
    });
    spr.cow = sprite(84, 44, (g) => {
      // Faces right. Rotated and flipped when drawn.
      g.fillStyle = 'rgba(40,25,15,.3)'; g.beginPath(); g.ellipse(40, 28, 32, 15, 0, 0, 7); g.fill();
      g.fillStyle = '#f4efe6'; g.beginPath(); g.ellipse(38, 22, 28, 14, 0, 0, 7); g.fill();
      g.fillStyle = '#2a2320';
      g.beginPath(); g.ellipse(26, 18, 8, 6, 0.4, 0, 7); g.fill();
      g.beginPath(); g.ellipse(46, 26, 9, 6, -0.3, 0, 7); g.fill();
      g.beginPath(); g.arc(38, 11, 3.5, 0, 7); g.fill();
      g.fillStyle = '#f4efe6'; g.beginPath(); g.ellipse(68, 22, 10, 9, 0, 0, 7); g.fill();
      g.fillStyle = '#e8a7a0'; g.beginPath(); g.ellipse(76, 22, 5, 6, 0, 0, 7); g.fill();
      g.fillStyle = '#c9bda8'; g.fillRect(64, 8, 2.5, 6); g.fillRect(64, 30, 2.5, 6);
      g.strokeStyle = '#2a2320'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 22); g.lineTo(3, 18); g.stroke();
    });
    spr.radar = sprite(40, 40, (g) => {
      g.fillStyle = '#d83a2c'; g.beginPath(); g.arc(20, 20, 18, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(20, 20, 13, 0, 7); g.fill();
      g.fillStyle = '#111'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText('110', 20, 25);
    });
    spr.camera = sprite(34, 34, (g) => {
      g.fillStyle = 'rgba(40,25,15,.3)'; g.fillRect(9, 9, 22, 22);
      g.fillStyle = '#55606a'; g.fillRect(6, 6, 22, 22);
      g.fillStyle = '#b0c4d6'; g.beginPath(); g.arc(17, 17, 6, 0, 7); g.fill();
      g.fillStyle = '#20262b'; g.beginPath(); g.arc(17, 17, 3, 0, 7); g.fill();
    });
  }

  function reset(w, l, toastFn) {
    world = w;
    toast = toastFn;
    if (!spr) buildSprites();
    looted.clear(); taken.clear();
    ((l && l.w) || []).forEach((i) => looted.add(i));
    ((l && l.c) || []).forEach((i) => taken.add(i));
    hornBubbles.length = 0;
    flash = 0;
    stormLevel = 0;
    hideAlarm();
  }

  function hideAlarm() { if (alarmShown) { $('alarm').classList.add('hidden'); alarmShown = false; } }

  // Returns the opponent's display name through opts.o.
  function event(e, mine, o) {
    const lit = { o: o.o, l: Math.abs(e.litres || 0) };
    switch (e.k) {
      case 'horn':
        hornBubbles.push({ p: e.p, t: 0, word: pick(T.horn) });
        if (hornBubbles.length > 6) hornBubbles.shift();
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
        taken.add(e.c);
        if (mine) { A.sfx.pickup(); toast(e.item ? T.crate[e.item] : T.crateFull); }
        break;
      case 'loot':
        looted.add(e.w);
        if (mine) {
          A.sfx.loot();
          e.found.forEach((f) => toast(pick(T.loot[f])));
        } else toast(fill(T.otherLoot, o));
        break;
      case 'radar':
        if (mine) { flash = 1; A.sfx.flash(); toast(say('radar', { v: e.kmh }), true); } else toast(say('otherRadar', o));
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

  function drawRoadside(ctx, h, stock, you, ents, now) {
    const { y0, y1, blit, font } = h;
    const inView = (y, m) => y > y0 - m && y < y1 + m;

    for (const w of world.wrecks) {
      if (!inView(w.y, 120)) continue;
      if (looted.has(w.i)) { blit(spr.lootedCar, w.x, w.y, w.rot); continue; }
      blit(spr[w.kind], w.x, w.y, w.kind === 'hut' ? w.rot * 0.1 : w.rot);
    }
    for (const c of world.crates) {
      if (!inView(c.y, 50) || taken.has(c.i)) continue;
      blit(spr.crate, c.x, c.y, Math.sin(now / 500 + c.i) * 0.12);
    }

    ctx.textAlign = 'center';
    for (const b of world.billboards) {
      if (!inView(b.y, 60)) continue;
      const text = T.billboards[b.idx % T.billboards.length];
      ctx.font = '600 19px ' + font;
      const tw = Math.min(250, ctx.measureText(text).width) + 22;
      ctx.fillStyle = 'rgba(40,25,15,.3)'; ctx.fillRect(b.x - tw / 2 + 6, b.y - 12, tw, 34);
      ctx.fillStyle = '#efe0c0'; ctx.fillRect(b.x - tw / 2, b.y - 18, tw, 34);
      ctx.strokeStyle = '#6b4a2c'; ctx.lineWidth = 3; ctx.strokeRect(b.x - tw / 2, b.y - 18, tw, 34);
      ctx.fillStyle = '#2a1a12'; ctx.fillText(text, b.x, b.y + 5, 250);
    }

    for (const r of world.radars) {
      if (inView(r.y, 60)) blit(spr.camera, r.x, r.y);
      const sy = r.y + 950;
      if (inView(sy, 60)) blit(spr.radar, world.roadX(sy) + r.side * (world.ROAD_HALF + 28), sy);
    }

    // Live entities below the cars.
    for (const e of ents) {
      if (e.type === 'can') blit(h.sprites.can, e.x, e.y);
      else if (e.type === 'oil') blit(spr.oil, e.x, e.y);
      else if (e.type === 'mirage' && e.owner === you) {
        ctx.save();
        ctx.globalAlpha = 0.72 + Math.sin(now / 240) * 0.2;
        ctx.translate(e.x + Math.sin(now / 170) * 4, e.y);
        blit(h.sprites.station, 0, 0);
        ctx.fillStyle = '#28211d'; ctx.fillRect(-118, 104, 236, 44);
        ctx.fillStyle = '#ffe9b0'; ctx.font = '600 21px ' + font;
        if (!mirageWords.has(e.id)) mirageWords.set(e.id, pick(T.mirageSign));
        ctx.fillText(mirageWords.get(e.id), 0, 124, 226);
        ctx.fillStyle = '#9ed39a'; ctx.fillText('9999 Liter', 0, 143, 226);
        ctx.restore();
      }
    }
  }

  function drawTop(ctx, h, cars, ents, hose, now, dt) {
    // Cow over the cars, she is rather tall.
    for (const e of ents) {
      if (e.type !== 'cow') continue;
      ctx.save();
      ctx.translate(e.x, e.y + Math.sin(now / 90) * 2);
      if (e.dir < 0) ctx.scale(-1, 1);
      ctx.drawImage(spr.cow, -42, -22 + Math.sin(now / 110) * 1.5, 84, 44);
      ctx.restore();
    }

    // Hose: a sagging line with fuel bubbles travelling along it.
    if (hose) {
      const a = cars.find((c) => c.idx === hose.f), b = cars.find((c) => c.idx === hose.to);
      if (a && b) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const stretch = S.clamp(d / 130, 0, 1);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + (1 - stretch) * 34 + Math.sin(now / 90) * 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#141014'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
        ctx.strokeStyle = stretch > 0.8 ? '#e0342a' : '#52c96b'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
        if (hose.flow) {
          ctx.fillStyle = '#ffd34d';
          for (let i = 0; i < 4; i++) {
            let k = ((now / 420) + i / 4) % 1;
            if (!hose.rev) k = 1 - k;       // towards the attacker
            const u = 1 - k;
            const x = u * u * a.x + 2 * u * k * mx + k * k * b.x;
            const y = u * u * a.y + 2 * u * k * my + k * k * b.y;
            ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
          }
        }
      }
    }

    // Horn: expanding rings and a word above the car.
    ctx.textAlign = 'center';
    for (let i = hornBubbles.length - 1; i >= 0; i--) {
      const b = hornBubbles[i];
      b.t += dt;
      if (b.t > 0.7) { hornBubbles.splice(i, 1); continue; }
      const c = cars.find((x) => x.idx === b.p);
      if (!c) continue;
      const k = b.t / 0.7;
      ctx.strokeStyle = 'rgba(255,243,220,' + (0.8 * (1 - k)) + ')';
      ctx.lineWidth = 3;
      for (let j = 0; j < 2; j++) {
        ctx.beginPath(); ctx.arc(c.x, c.y, 26 + (k * 60) + j * 18, 0, 7); ctx.stroke();
      }
      ctx.font = '800 ' + (24 + k * 8) + 'px ' + h.font;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(42,26,18,' + (1 - k) + ')';
      ctx.strokeText(b.word, c.x, c.y - 44 - k * 22);
      ctx.fillStyle = 'rgba(255,243,220,' + (1 - k) + ')';
      ctx.fillText(b.word, c.x, c.y - 44 - k * 22);
    }
  }

  function drawScreen(ctx, W, H, env, dt) {
    // Sandstorm: a wall of haze with a small clear patch around the car.
    const target = env ? env.storm : 0;
    stormLevel += (target - stormLevel) * Math.min(1, dt * 2);
    A.setWind(stormLevel);
    if (stormLevel > 0.01) {
      const cx = W / 2, cy = H * 0.68;
      const g = ctx.createRadialGradient(cx, cy, H * 0.14, cx, cy, H * 0.72);
      g.addColorStop(0, 'rgba(190,140,80,' + (0.1 * stormLevel) + ')');
      g.addColorStop(1, 'rgba(196,146,86,' + (0.97 * stormLevel) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const dir = env.wind < 0 ? -1 : 1;
      while (streaks.length < 70) streaks.push({ x: Math.random() * W, y: Math.random() * H, l: 30 + Math.random() * 90, v: 500 + Math.random() * 700 });
      ctx.strokeStyle = 'rgba(240,210,160,' + (0.5 * stormLevel) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const s of streaks) {
        s.x += dir * s.v * dt;
        if (s.x > W + 100) s.x = -100; else if (s.x < -100) s.x = W + 100;
        ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - dir * s.l, s.y + 4);
      }
      ctx.stroke();
    }
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + flash + ')';
      ctx.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - dt * 3.2);
    }
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

  return { reset, event, entsAt, drawRoadside, drawTop, drawScreen, hud, hideAlarm };
})();
