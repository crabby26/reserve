// Client core: fixed-step prediction of the own car, reconciliation against the
// server, interpolation of everything else, HUD and screens.
(function () {
  'use strict';

  const S = ReserveSim, W = ReserveWorld, R = ReserveRender, A = ReserveAudio, I = ReserveInput, F = ReserveFx;
  const { T, say } = ReserveTexts;
  const $ = (id) => document.getElementById(id);

  const INTERP_DELAY = 110;     // ms behind the newest snapshot for remote objects
  // The dev duo page runs two clients in one tab, and those share sessionStorage.
  const SESSION_KEY = 'reserve.session' + (new URLSearchParams(location.search).get('p') || '');

  let net = null, world = null, you = 0, solo = false;
  let phase = 'menu';           // menu | lobby | play | end
  let car = null;               // predicted own car
  let seq = 0;
  let pending = [];             // inputs the server has not confirmed yet
  let sendBuf = [];
  let snaps = [];               // recent snapshots for interpolation
  let last = null;              // newest snapshot
  let errX = 0, errY = 0, errA = 0;   // visual smoothing of corrections
  let prevX = 0, prevY = 0, prevA = 0;
  let acc = 0, lastT = 0, boostReq = 0, sendAcc = 0;
  let hudT = 0, slowFrames = 0, fpsT = 0, fpsN = 0;
  let toastN = 0, connTimer = null;

  function makeWorld(seed) {
    world = W.createWorld(seed);
    R.init(world, T);
    const tr = $('trackStations');
    tr.innerHTML = '';
    world.stations.forEach((s) => {
      const d = document.createElement('div');
      d.className = 'track-st';
      d.style.left = trackPos(s.km) + '%';
      d.id = 'trackSt' + s.i;
      tr.appendChild(d);
    });
  }

  function trackPos(km) { return S.clamp(km, 0, 100) * 0.94; }

  function showScreen(name) {
    ['menu', 'lobby', 'end'].forEach((n) => $(n).classList.toggle('hidden', n !== name));
    $('hud').classList.toggle('hidden', name !== 'hud');
  }

  function toast(text, bad) {
    if (!text) return;
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (bad ? ' bad' : '');
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => el.remove(), 3800);
    toastN++;
  }

  function otherName() { return solo ? T.bot : (you === 0 ? T.cars[1] : T.cars[0]); }

  // Messages from either transport.
  function onMessage(m) {
    switch (m.t) {
      case 'start': return onStart(m);
      case 's': return onSnapshot(m);
      case 'e': return onEvent(m);
      case 'room': return onRoom(m);
      case 'peer': return onPeer(m);
      case 'err': return onError(m);
      default: return undefined;
    }
  }

  function onRoom(m) {
    you = m.you;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: m.code, token: m.token })); } catch (e) { /* ignore */ }
    if (m.resumed || m.you === 1) return;
    const link = location.origin + location.pathname + '?room=' + m.code;
    $('roomCode').textContent = m.code;
    $('roomLink').textContent = link;
    $('lobbyMsg').textContent = 'Warte auf den zweiten Wagen. Gib den Code weiter und bleib hier.';
    phase = 'lobby';
    showScreen('lobby');
  }

  function onPeer(m) {
    if (m.again) { toast('Der andere will nochmal.'); $('endStats').textContent = 'Der andere will nochmal. Du auch?'; return; }
    if (phase === 'play') toast(m.on ? 'Dein Gegner ist wieder da.' : 'Dein Gegner hat ein Funkloch. Sein Wagen steht.', !m.on);
    else if (phase === 'end' && !m.on) $('endStats').textContent = 'Der andere ist weg. Das war es wohl mit der Revanche.';
  }

  const ERRORS = {
    unknown: 'Diesen Raum gibt es nicht. Code vertippt?',
    taken: 'Der Raum ist schon voll.',
    gone: 'Der Raum existiert nicht mehr.',
    full: 'Der Server ist gerade voll. Später nochmal.',
  };

  function onError(m) {
    clearSession();
    if (net) { net.close(); net = null; }
    $('conn').classList.add('hidden');
    phase = 'menu';
    world = null;
    showScreen('menu');
    $('menuMsg').textContent = ERRORS[m.m] || 'Das hat nicht geklappt.';
  }

  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    const params = new URLSearchParams(location.search);
    if (params.has('room')) {
      params.delete('room');
      const rest = params.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : ''));
    }
  }

  function onStart(m) {
    you = m.you; solo = !!m.solo;
    makeWorld(m.seed);
    F.reset(world, m.looted, toast);
    if (m.resume && car && phase === 'play') {
      // Back after a dropout: keep counting from what the server has seen.
      seq = Math.max(seq, m.ack);
      pending = []; sendBuf = [];
    } else {
      car = S.createCar(0, 0);
      seq = m.ack || 0; pending = []; sendBuf = []; snaps = []; last = null;
      errX = errY = errA = 0;
      if (!m.resume) toast('Du fährst den ' + T.cars[you] + '.');
    }
    phase = 'play';
    showScreen('hud');
    $('endTitle').textContent = '';
  }

  function onConnState(state, deadline) {
    clearInterval(connTimer);
    if (state === 'open') {
      $('conn').classList.add('hidden');
      $('menuMsg').textContent = '';
      return;
    }
    if (state === 'waking') {
      $('menuMsg').textContent = 'Server wird geweckt. Das kann bis zu einer Minute dauern …';
      return;
    }
    if (state === 'lost') {
      $('conn').classList.remove('hidden');
      $('btnConnGiveUp').classList.add('hidden');
      const show = () => {
        const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        $('connText').textContent = 'Neuer Versuch … noch ' + left + ' Sekunden';
      };
      show();
      connTimer = setInterval(show, 500);
      return;
    }
    if (state === 'failed') {
      if (phase === 'menu') {
        $('menuMsg').textContent = 'Server nicht erreichbar. Später nochmal versuchen.';
        if (net) { net.close(); net = null; }
        return;
      }
      $('conn').classList.remove('hidden');
      $('connText').textContent = 'Das wird nichts mehr. Die Verbindung bleibt weg.';
      $('btnConnGiveUp').classList.remove('hidden');
    }
  }

  function connect(hello) {
    if (net) net.close();
    net = new ReserveNet.WsTransport(onMessage, onConnState);
    net.begin(hello);
  }

  function copyCar(from, to) {
    for (const k in from) if (k !== 'ack') to[k] = from[k];
  }

  function onSnapshot(m) {
    const now = performance.now();
    m.at = now;
    snaps.push(m);
    while (snaps.length > 30) snaps.shift();
    const server = m.cars[you];

    if (!last || last.ph !== 'race') {
      copyCar(server, car);
      prevX = car.x; prevY = car.y; prevA = car.a;
      pending = pending.filter((i) => i.q > server.ack);
    } else {
      // Rewind to the server state, then replay what it has not seen yet.
      const ox = car.x, oy = car.y, oa = car.a;
      copyCar(server, car);
      pending = pending.filter((i) => i.q > server.ack);
      if (m.ph === 'race') for (const i of pending) S.step(car, i, world, m.env);
      const dx = ox - car.x, dy = oy - car.y;
      if (dx * dx + dy * dy > 150 * 150) { errX = errY = errA = 0; prevX = car.x; prevY = car.y; prevA = car.a; }
      else { errX += dx; errY += dy; errA += S.angleDiff(oa, car.a); }
    }
    if (m.ph === 'over' && phase === 'play' && m.w >= 0) showEnd(m);
    last = m;
  }

  function onEvent(e) {
    const mine = e.p === you;
    const o = { o: otherName() };
    switch (e.k) {
      case 'go': A.sfx.go(); toast(say('go')); break;
      case 'pump':
        if (mine) { A.sfx.pump(); toast(say('pump')); }
        break;
      case 'dry':
        if (mine) { A.sfx.bad(); toast(say('dry'), true); } else toast(say('otherDrained', o));
        break;
      case 'empty':
        if (mine) { A.sfx.bad(); toast(say('empty'), true); } else toast(say('otherEmpty', o));
        break;
      case 'can':
        if (mine) { A.sfx.pickup(); toast(e.stolen ? say('canStolen', o) : say('can')); }
        else if (e.stolen) { A.sfx.bad(); toast(say('canLost', o), true); }
        break;
      case 'win': {
        if (last) last.w = e.p;
        A.sfx[mine ? 'win' : 'lose']();
        break;
      }
      default: F.event(e, mine, o); break;
    }
  }

  function showEnd(m) {
    phase = 'end';
    A.setEngine(0, 0, false);
    A.setWind(0);
    F.hideAlarm();
    const won = m.w === you;
    $('endTitle').textContent = m.ff ? (won ? T.forfeitTitle : T.forfeitLostTitle) : won ? T.winTitle : T.loseTitle;
    $('endText').textContent = m.ff ? (won ? T.forfeit : T.forfeitLost) : won ? say('win') : say('lose', { o: otherName() });
    const time = fmtTime(m.rt);
    let stats = 'Zeit: ' + time;
    try {
      const k = solo ? 'reserve.best.solo' : 'reserve.best.duel';
      const best = Number(localStorage.getItem(k)) || 0;
      if (won && !m.ff && (!best || m.rt < best)) {
        localStorage.setItem(k, String(m.rt));
        stats += ' · neue Bestzeit';
      } else if (best) stats += ' · Bestzeit: ' + fmtTime(best);
      const wk = won ? 'reserve.wins' : 'reserve.losses';
      localStorage.setItem(wk, String((Number(localStorage.getItem(wk)) || 0) + 1));
    } catch (e) { /* storage unavailable */ }
    $('endStats').textContent = stats;
    $('btnAgain').disabled = false;
    $('btnAgain').textContent = 'Nochmal';
    showScreen('end');
    showScores();
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + String(r).padStart(2, '0');
  }

  function showScores() {
    let txt = '';
    try {
      const wins = Number(localStorage.getItem('reserve.wins')) || 0;
      const losses = Number(localStorage.getItem('reserve.losses')) || 0;
      const duel = Number(localStorage.getItem('reserve.best.duel')) || 0;
      const sol = Number(localStorage.getItem('reserve.best.solo')) || 0;
      const parts = [];
      if (wins + losses) parts.push(wins + ' Siege, ' + losses + ' Niederlagen');
      if (duel) parts.push('Bestzeit Duell ' + fmtTime(duel));
      if (sol) parts.push('Bestzeit Solo ' + fmtTime(sol));
      txt = parts.join(' · ');
    } catch (e) { /* storage unavailable */ }
    $('scores').textContent = txt;
  }

  // Fixed step: sample input, predict, queue for the server.
  function simStep(env) {
    const inp = I.sample();
    const x = boostReq ? 1 : 0;
    boostReq = 0;
    seq++;
    const rec = { q: seq, s: inp.s, g: inp.g, b: inp.b, x };
    if (last && last.ph === 'race') {
      prevX = car.x; prevY = car.y; prevA = car.a;
      S.step(car, rec, world, env);
      pending.push(rec);
      if (pending.length > 600) pending.shift();
    }
    sendBuf.push([seq, round3(inp.s), round3(inp.g), inp.b ? 1 : 0, x]);
    return inp;
  }

  function round3(v) { return Math.round(v * 1000) / 1000; }

  function flush(hold) {
    if (!sendBuf.length) return;
    if (net) net.send({ t: 'i', l: sendBuf, h: hold ? 1 : 0 });
    sendBuf = [];
  }

  // Interpolated remote state at (now - delay).
  function remoteAt(now) {
    const t = now - INTERP_DELAY;
    let a = null, b = null;
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].at <= t) { a = snaps[i]; b = snaps[i + 1] || a; break; }
    }
    if (!a) { a = b = snaps[0]; }
    const k = b === a ? 0 : S.clamp((t - a.at) / (b.at - a.at), 0, 1);
    return { a, b, k };
  }

  function lerp(a, b, k) { return a + (b - a) * k; }

  function drawGameFrame(now, dt) {
    const hasCar = car && world;
    if (!hasCar) return;
    const alpha = acc / S.DT;
    const decay = Math.exp(-dt * 12);
    errX *= decay; errY *= decay; errA *= decay;

    const rx = lerp(prevX, car.x, alpha) + errX;
    const ry = lerp(prevY, car.y, alpha) + errY;
    const ra = prevA + S.angleDiff(car.a, prevA) * alpha + errA;
    const speed = S.speedOf(car);

    const cars = [];
    const inp = I.sample();
    cars.push({
      idx: you, x: rx, y: ry, a: ra, st: car.st, speed, brake: inp.b > 0,
      boost: car.boost > 0, panne: car.panne, offroad: !world.paved(car.x, car.y),
      smoke: car.oil < 15 || car.panne || car.hp < 25,
    });

    let oState = null;
    if (snaps.length) {
      const q = remoteAt(now);
      const ca = q.a.cars[1 - you], cb = q.b.cars[1 - you];
      oState = {
        idx: 1 - you,
        x: lerp(ca.x, cb.x, q.k), y: lerp(ca.y, cb.y, q.k),
        a: ca.a + S.angleDiff(cb.a, ca.a) * q.k, st: cb.st,
        speed: Math.hypot(cb.vx, cb.vy), boost: cb.boost > 0, panne: cb.panne,
        offroad: !world.paved(cb.x, cb.y), smoke: cb.oil < 15 || cb.panne || cb.hp < 25, brake: false,
      };
      cars.unshift(oState);
    }

    R.frame({
      dt, now, you, cars,
      ents: snaps.length ? F.entsAt(remoteAt(now)) : [],
      hose: last ? last.hose : null,
      stock: last ? last.stock : null,
      env: last ? last.env : null,
      km: -car.y / W.KM,
    });
  }

  function updateHud(dt) {
    hudT += dt;
    if (hudT < 0.1 || !car || !last) return;
    hudT = 0;
    const km = S.clamp(-car.y / W.KM, 0, 100);
    $('fuelText').textContent = Math.ceil(car.fuel) + ' L';
    $('fuelBar').style.width = car.fuel + '%';
    $('fuelGauge').classList.toggle('low', car.fuel < 15);
    const sf = Math.min(1, Math.abs(S.speedOf(car)) / S.V_MAX);
    const kmPerS = Math.abs(S.speedOf(car)) / W.KM;
    const burn = 0.1 + 0.95 * sf * sf;
    const range = sf > 0.15 ? car.fuel / burn * kmPerS : 0;
    $('rangeText').textContent = car.fuel <= 0 ? 'Schieben!' : range > 0 ? 'reicht für ca. ' + Math.round(range) + ' km' : '';
    setBar('hpBar', car.hp); setBar('tireBar', car.tire); setBar('oilBar', car.oil);
    $('kmText').textContent = km.toFixed(1).replace('.', ',') + ' km';
    $('speedText').textContent = Math.round(Math.abs(S.speedOf(car)) / S.V_MAX * 140) + ' km/h';
    const ns = world.nextStation(car.y);
    if (ns) {
      const d = (car.y - ns.y) / W.KM;
      const l = last.stock[ns.i];
      $('nextText').textContent = 'Tanke in ' + d.toFixed(1).replace('.', ',') + ' km · ' + l + ' L';
    } else $('nextText').textContent = 'Keine Tanke mehr. Viel Glück.';
    world.stations.forEach((s) => {
      const el = $('trackSt' + s.i);
      if (el) el.classList.toggle('dry', last.stock[s.i] <= 0);
    });
    $('trackMe').style.left = trackPos(km) + '%';
    const other = last.cars[1 - you];
    $('trackOther').style.left = trackPos(-other.y / W.KM) + '%';
    $('ping').textContent = solo ? 'Solo' : (net && net.connected ? net.ping + ' ms' : '– ms');

    const big = $('bigText');
    if (last.ph === 'countdown') {
      big.classList.remove('hidden');
      const n = Math.ceil(last.si);
      if (big.textContent !== String(n)) { big.textContent = String(n); A.sfx.count(); }
    } else big.classList.add('hidden');
  }

  function setBar(id, v) {
    const el = $(id);
    el.style.width = v + '%';
    el.classList.toggle('bad', v < 20);
  }

  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (t - lastT) / 1000 || 0);
    lastT = t;
    if (phase === 'play' && car) {
      const live = solo || (net && net.connected);
      let inp = I.sample();
      // While offline the server cannot follow, so the car simply waits with it.
      if (live) {
        acc += dt;
        const env = last ? last.env : null;
        while (acc >= S.DT) {
          inp = simStep(env);
          acc -= S.DT;
        }
        sendAcc += dt;
        if (sendAcc >= 1 / 30) { sendAcc = 0; flush(inp.h); }
      }
      const running = car.fuel > 0 && !car.panne && car.stall <= 0;
      A.setEngine(Math.min(1.2, Math.abs(S.speedOf(car)) / S.V_MAX), inp.g, running);
      updateHud(dt);
      if (last) F.hud(car, last, you, dt, otherName());
    }
    if (phase === 'play' || phase === 'end') drawGameFrame(t, dt);
    else drawAttract(t, dt);

    // Fall back to a lower resolution if the device cannot hold the frame rate.
    fpsT += dt; fpsN++;
    if (fpsT > 3) {
      if (fpsN / fpsT < 45 && phase === 'play') { slowFrames++; if (slowFrames >= 2) { R.lowerQuality(); slowFrames = 0; } } else slowFrames = 0;
      window.__reserveFps = Math.round(fpsN / fpsT);
      fpsT = 0; fpsN = 0;
    }
  }

  // Menu backdrop: the empty road drifting past.
  let attractY = 0, attractWorld = null;
  function drawAttract(t, dt) {
    if (!attractWorld) { attractWorld = W.createWorld(4242); }
    if (world !== attractWorld) { world = attractWorld; R.init(world, T); }
    attractY -= dt * 70;
    R.attract(attractY, dt);
  }

  function startSolo() {
    if (net) net.close();
    net = new ReserveNet.LocalTransport(onMessage);
  }

  function backToMenu() {
    clearSession();
    clearInterval(connTimer);
    $('menuMsg').textContent = '';
    if (net) { net.close(); net = null; }
    phase = 'menu';
    world = null;
    A.setEngine(0, 0, false);
    A.setWind(0);
    $('conn').classList.add('hidden');
    showScreen('menu');
    showScores();
  }

  function wireUi() {
    I.init();
    I.on('horn', () => { A.sfx.horn(you); if (net) net.send({ t: 'a', a: 'horn' }); $('btnHorn').classList.add('on'); setTimeout(() => $('btnHorn').classList.remove('on'), 150); });
    I.on('boost', () => { boostReq = 1; if (car && car.boostCd <= 0 && car.fuel > 3) A.sfx.boost(); });
    I.on('hose', () => { if (net) net.send({ t: 'a', a: 'hose' }); });
    I.on('item', () => { if (net) net.send({ t: 'a', a: 'item' }); });

    // Sound can only start from a real touch on iOS.
    const unlock = () => A.unlock();
    addEventListener('pointerdown', unlock, { capture: true });
    addEventListener('keydown', unlock, { capture: true });

    const soundLabel = () => { $('btnSound').textContent = A.isEnabled() ? 'Ton an' : 'Ton aus'; };
    soundLabel();
    $('btnSound').addEventListener('pointerdown', (e) => { e.preventDefault(); A.setEnabled(!A.isEnabled()); soundLabel(); });
    $('btnTilt').addEventListener('click', async () => {
      const onNow = await I.setTilt(!I.tiltOn());
      $('btnTilt').textContent = onNow ? 'Neigen an' : 'Neigen aus';
      if (!onNow && !I.tiltOn()) { /* either turned off or permission refused */ }
    });

    $('btnSolo').addEventListener('click', startSolo);
    $('btnMenu').addEventListener('click', backToMenu);
    $('btnAgain').addEventListener('click', () => {
      if (net) net.send({ t: 'again' });
      if (!solo) { $('btnAgain').disabled = true; $('btnAgain').textContent = 'Warte auf den anderen …'; }
    });
    $('joinForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = $('codeInput').value.trim().toUpperCase();
      if (!/^[A-Z]{4}$/.test(code)) { $('menuMsg').textContent = 'Der Code hat vier Buchstaben.'; return; }
      $('codeInput').blur();
      connect({ t: 'join', code });
    });
    $('btnCreate').addEventListener('click', () => connect({ t: 'create' }));
    $('btnLeave').addEventListener('click', backToMenu);
    $('btnConnGiveUp').addEventListener('click', backToMenu);
    $('btnCopy').addEventListener('click', async () => {
      const link = $('roomLink').textContent;
      try { await navigator.clipboard.writeText(link); $('btnCopy').textContent = 'Kopiert'; } catch (e) {
        $('btnCopy').textContent = 'Bitte von Hand kopieren';
      }
      setTimeout(() => { $('btnCopy').textContent = 'Link kopieren'; }, 2000);
    });
  }

  function startFromUrl() {
    const params = new URLSearchParams(location.search);
    const code = (params.get('room') || '').toUpperCase();
    let session = null;
    try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { /* ignore */ }
    if (session && (!code || session.code === code)) {
      // Page was reloaded in the middle of a game.
      net = new ReserveNet.WsTransport(onMessage, onConnState);
      net.resume(session);
    } else if (/^[A-Z]{4}$/.test(code)) {
      $('codeInput').value = code;
      connect({ t: 'join', code });
    }
  }

  if (!R.ok) {
    $('menu').querySelector('.panel').innerHTML = '<h1 class="logo">RESERVE</h1><p class="tagline">Dieses Gerät zeigt leider kein WebGL an. Ohne das bleibt die Wüste dunkel.</p>';
    return;
  }

  wireUi();
  showScreen('menu');
  showScores();
  ReserveNet.wake();
  startFromUrl();
  requestAnimationFrame(loop);

  // Debug handle for tests and the console. Read-only use.
  window.__reserve = {
    get car() { return car; }, get last() { return last; }, get you() { return you; },
    get phase() { return phase; }, get toasts() { return toastN; }, get net() { return net; },
    get world() { return world; },
    get gfx() { return R.info(); },
  };
})();
