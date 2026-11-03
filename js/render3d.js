// 3D renderer on three.js. Purely visual: simulation coordinates map directly to
// the scene (sim x = x, sim y = z), and height exists only on screen.
// All models and textures are built in code.
window.ReserveRender = (function () {
  'use strict';

  const T3 = THREE;
  const CHUNK = 800;
  const AHEAD = 4, BEHIND = 1;
  const ROAD_Y = 1.2;

  const canvas = document.getElementById('game');
  let renderer = null, scene = null, camera = null;
  let sun = null, hemi = null, sky = null, sunSprite = null;
  let world = null, texts = null;
  let maxDpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let index = null;
  const chunks = new Map();
  const looted = new Set(), taken = new Set();
  const wreckMeshes = new Map(), crateMeshes = new Map();
  const stationLabels = new Map();
  const carModels = [];
  const entObjs = new Map();
  const M = {}, G = {}, TX = {};
  const textCache = new Map();
  let camYaw = 0, camReady = false, camX = 0, camZ = 0;
  let hoseMesh = null, hoseBubbles = [];
  let stormLevel = 0, skyKm = -1;
  const fogColor = new T3.Color(), skyTop = new T3.Color(), skyHor = new T3.Color();
  let streaks = null;
  const particles = [];
  let partNext = 0;
  const horns = [];

  // Light through the day: the 100 km run from morning into dusk.
  const DAY = [
    { km: 0, top: 0x5fa8dc, hor: 0xf3dcb4, sun: 0xfff2d8, si: 1.0, sky: 0xcfe4f2, gnd: 0xb08a5c, hi: 0.72 },
    { km: 45, top: 0x4f9bd8, hor: 0xf6e0b8, sun: 0xfff6e6, si: 1.08, sky: 0xdce9f2, gnd: 0xb8915f, hi: 0.76 },
    { km: 75, top: 0x6a86b8, hor: 0xf7bd82, sun: 0xffc98a, si: 0.95, sky: 0xe3c4ae, gnd: 0xa87448, hi: 0.66 },
    { km: 100, top: 0x38305f, hor: 0xe8704a, sun: 0xff8a5a, si: 0.72, sky: 0xa98aa8, gnd: 0x704632, hi: 0.56 },
  ];

  function hash(a, b) {
    let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + (world ? world.seed : 0);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function smooth(a, b, v) {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  // Dunes grow only well away from the road, so everything near it stays level.
  function terrainH(x, z) {
    const d = Math.abs(x - world.roadX(z));
    const m = smooth(390, 1000, d);
    if (m <= 0) return 0;
    const h = 34 * Math.sin(x / 310 + Math.sin(z / 470) * 1.4) +
      20 * Math.sin(x / 135 + z / 210) +
      52 * Math.sin(x / 860 - z / 1270) + 58;
    return h * m;
  }

  function heightAt(x, z) { return world.paved(x, z) ? ROAD_Y : terrainH(x, z); }

  function makeCanvas(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
  }

  function tex(c, repeat) {
    const t = new T3.CanvasTexture(c);
    if (repeat) { t.wrapS = t.wrapT = T3.RepeatWrapping; }
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return t;
  }

  function fontName() { return getComputedStyle(document.body).fontFamily; }

  function labelTex(lines, opts) {
    const o = opts || {};
    const w = o.w || 512, h = o.h || 128;
    const c = makeCanvas(w, h, (g) => {
      g.fillStyle = o.bg || '#efe0c0'; g.fillRect(0, 0, w, h);
      if (o.border) { g.strokeStyle = o.border; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach((l, i) => {
        g.fillStyle = l.color || o.fg || '#2a1a12';
        let size = l.size || o.size || 52;
        g.font = '700 ' + size + 'px ' + fontName();
        while (g.measureText(l.text).width > w - 36 && size > 16) { size -= 2; g.font = '700 ' + size + 'px ' + fontName(); }
        g.fillText(l.text, w / 2, h * (i + 0.5) / lines.length);
      });
    });
    return tex(c);
  }

  function lam(color, extra) {
    return new T3.MeshLambertMaterial(Object.assign({ color, flatShading: true }, extra || {}));
  }

  function buildShared() {
    TX.road = tex(makeCanvas(256, 512, (g, w, h) => {
      g.fillStyle = '#413d3e'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1800; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.07)';
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      g.fillStyle = '#ece2c8'; g.fillRect(8, 0, 6, h); g.fillRect(w - 14, 0, 6, h);
      g.fillStyle = '#e5c24a'; g.fillRect(w / 2 - 4, 0, 8, h / 2);
    }), true);
    TX.sand = tex(makeCanvas(256, 256, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = Math.random() < 0.55 ? 'rgba(90,60,30,.10)' : 'rgba(255,255,255,.5)';
        g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2);
      }
      g.strokeStyle = 'rgba(110,70,35,.13)'; g.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 30, y - 7, x + 70, y + 2); g.stroke();
      }
    }), true);
    TX.puff = tex(makeCanvas(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    }));
    TX.crate = tex(makeCanvas(128, 128, (g) => {
      g.fillStyle = '#c39451'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#7f5c29'; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
      g.beginPath(); g.moveTo(5, 5); g.lineTo(123, 123); g.moveTo(123, 5); g.lineTo(5, 123); g.stroke();
      g.fillStyle = '#d9622b'; g.font = 'bold 74px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', 64, 68);
    }));
    TX.oil = tex(makeCanvas(256, 256, (g) => {
      const blob = (x, y, rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0.3, 0, 7); g.fill(); };
      blob(128, 128, 110, 84, 'rgba(14,14,20,.92)');
      blob(46, 66, 36, 24, 'rgba(14,14,20,.92)');
      blob(210, 196, 38, 26, 'rgba(14,14,20,.92)');
      blob(104, 108, 44, 22, 'rgba(120,90,190,.32)');
      blob(150, 146, 34, 16, 'rgba(70,170,160,.28)');
    }));
    TX.cow = tex(makeCanvas(128, 64, (g) => {
      g.fillStyle = '#f4efe6'; g.fillRect(0, 0, 128, 64);
      g.fillStyle = '#2a2320';
      [[30, 22, 16, 11], [78, 40, 18, 12], [104, 14, 10, 8], [12, 48, 9, 7]].forEach((b) => {
        g.beginPath(); g.ellipse(b[0], b[1], b[2], b[3], 0.3, 0, 7); g.fill();
      });
    }));
    TX.radar = tex(makeCanvas(128, 128, (g) => {
      g.fillStyle = '#d83a2c'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 45, 0, 7); g.fill();
      g.fillStyle = '#111'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('110', 64, 67);
    }));

    M.road = new T3.MeshLambertMaterial({ map: TX.road });
    M.shoulder = lam(0xa98660);
    M.ground = new T3.MeshLambertMaterial({ map: TX.sand, vertexColors: true, flatShading: true });
    M.pole = lam(0x5a3d27);
    M.wire = new T3.LineBasicMaterial({ color: 0x33241a });
    M.cactus = lam(0x4d7a3f);
    M.rock = lam(0x8d6b4f);
    M.mesaA = lam(0xb5693f); M.mesaB = lam(0x9b5230); M.mesaC = lam(0xc98050);
    M.rust = lam(0x7a4a2a); M.rustDark = lam(0x4a2d1a); M.bus = lam(0xb48c3c);
    M.window = lam(0x2b3a40); M.tire = lam(0x17110e);
    M.plank = lam(0x7c5b3c); M.roof = lam(0x5d4530); M.door = lam(0x3a2614);
    M.concrete = lam(0x6a6060); M.canopy = lam(0xd9622b); M.white = lam(0xfff3dc); M.pump = lam(0x28211d);
    M.kiosk = lam(0xb89a78);
    M.crate = new T3.MeshLambertMaterial({ map: TX.crate });
    M.oil = new T3.MeshBasicMaterial({ map: TX.oil, transparent: true, depthWrite: false });
    M.can = lam(0xc62c21); M.canCap = lam(0xf2d35e);
    M.cowBody = new T3.MeshLambertMaterial({ map: TX.cow });
    M.cowSkin = lam(0xf4efe6); M.cowNose = lam(0xe8a7a0); M.cowDark = lam(0x2a2320);
    M.camera = lam(0x55606a); M.lens = lam(0xb0c4d6);
    M.radarSign = new T3.MeshBasicMaterial({ map: TX.radar, transparent: true, alphaTest: 0.4 });
    M.flame = new T3.MeshBasicMaterial({ color: 0xffbe46 });
    M.brake = new T3.MeshBasicMaterial({ color: 0x5a1712 });
    M.brakeOn = new T3.MeshBasicMaterial({ color: 0xff2a1c });
    M.head = new T3.MeshBasicMaterial({ color: 0xfff3b0 });
    M.hoseOuter = new T3.MeshLambertMaterial({ color: 0x52c96b });
    M.hoseTense = new T3.MeshLambertMaterial({ color: 0xe0342a });
    M.bubble = new T3.MeshBasicMaterial({ color: 0xffd34d });
    M.shadow = new T3.MeshBasicMaterial({ color: 0x1e120a, map: TX.puff, transparent: true, opacity: 0.6, depthWrite: false });
    M.check = new T3.MeshLambertMaterial({ map: tex(makeCanvas(128, 64, (g) => {
      for (let x = 0; x < 8; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#fff' : '#111'; g.fillRect(x * 16, y * 16, 16, 16); }
    })) });

    G.box = new T3.BoxGeometry(1, 1, 1);
    G.cyl = new T3.CylinderGeometry(1, 1, 1, 8);
    G.wheel = new T3.CylinderGeometry(6, 6, 5, 10); G.wheel.rotateZ(Math.PI / 2);
    G.rock = new T3.DodecahedronGeometry(1, 0);
    G.bubble = new T3.SphereGeometry(4, 6, 5);
    G.disc = new T3.PlaneGeometry(1, 1); G.disc.rotateX(-Math.PI / 2);
    G.plane = new T3.PlaneGeometry(1, 1);
    G.ring = new T3.RingGeometry(0.92, 1, 28); G.ring.rotateX(-Math.PI / 2);
    G.flame = new T3.ConeGeometry(5, 16, 7); G.flame.rotateX(-Math.PI / 2);
  }

  function box(mat, sx, sy, sz, x, y, z, parent) {
    const m = new T3.Mesh(G.box, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (parent) parent.add(m);
    return m;
  }

  // Cars: model nose points to -z. Every door comes from a different car on purpose.
  function buildCar(kind) {
    const root = new T3.Group();
    const body = new T3.Group();
    root.add(body);
    const shadow = new T3.Mesh(G.disc, M.shadow);
    shadow.scale.set(46, 1, 78); shadow.position.y = 0.5;
    root.add(shadow);

    const wheels = [];
    [[-12, -16], [12, -16], [-12, 16], [12, 16]].forEach(([x, z], i) => {
      const pivot = new T3.Group();
      pivot.position.set(x, 6, z);
      const w = new T3.Mesh(G.wheel, M.tire);
      pivot.add(w);
      root.add(pivot);
      wheels.push({ pivot, w, front: i < 2 });
    });

    if (kind === 0) {
      const paint = lam(0xc9561f), light = lam(0xe98a4d);
      box(paint, 24, 9, 50, 0, 12, 0, body);
      box(paint, 21, 9, 30, 0, 21, 6, body);
      box(M.window, 21.6, 6, 24, 0, 21.5, 6, body);
      box(M.window, 19, 6, 1, 0, 21.5, -9.4, body);
      box(light, 21, 1.2, 30, 0, 26, 6, body);
      box(lam(0x7fb0ad), 0.8, 8, 13, -12.3, 12, 0, body);      // door from another car
      box(M.pole, 15, 1.2, 1.4, 0, 27.6, -2, body);            // roof rack
      box(M.pole, 15, 1.2, 1.4, 0, 27.6, 14, body);
      box(lam(0x8a6a3c), 11, 5, 11, 0, 30.5, 6, body);         // luggage
    } else {
      const paint = lam(0x16817f), dark = lam(0x0d5453);
      box(paint, 24, 9, 50, 0, 12, 0, body);
      box(lam(0x2fa6a3), 21, 10, 17, 0, 21.5, -4, body);
      box(M.window, 21.6, 6, 12, 0, 22, -4, body);
      box(M.window, 19, 6, 1, 0, 22, -12.7, body);
      box(dark, 21, 3, 20, 0, 18, 14, body);
      box(lam(0xd9b545), 0.8, 8, 12, 12.3, 12, -4, body);      // door from another car
      box(lam(0x7c6a45), 7, 6, 7, -4, 21, 12, body);           // junk in the bed
      box(M.tire, 8, 8, 8, 5, 21, 18, body);
    }
    box(M.head, 5, 3, 0.6, -8, 13, -25.2, body);
    box(M.head, 5, 3, 0.6, 8, 13, -25.2, body);
    const bl = box(M.brake, 5, 2.4, 0.6, -8, 14, 25.2, body);
    const br = box(M.brake, 5, 2.4, 0.6, 8, 14, 25.2, body);

    const hood = box(lam(0xdddddd), 21, 1, 13, 0, 21, -21, body);
    hood.rotation.x = 0.9;
    hood.visible = false;
    const flame = new T3.Mesh(G.flame, M.flame);
    flame.position.set(0, 10, 32);
    flame.visible = false;
    root.add(flame);

    scene.add(root);
    return { root, body, wheels, spin: 0, lights: [bl, br], hood, flame, roll: 0, pitch: 0, y: ROAD_Y };
  }

  function updateCar(idx, c, dt, now) {
    const m = carModels[idx];
    const speedFrac = Math.min(1.3, Math.abs(c.speed) / 350);
    m.root.position.x = c.x; m.root.position.z = c.y;
    const groundY = heightAt(c.x, c.y);
    m.y += (groundY - m.y) * Math.min(1, dt * 10);
    m.root.position.y = m.y;
    m.root.rotation.y = -c.a;

    // Weight transfer sells the steering without touching the physics.
    const tRoll = -(c.st || 0) * speedFrac * 0.09;
    const tPitch = c.brake && c.speed > 30 ? -0.05 : (c.boost ? 0.04 : 0);
    m.roll += (tRoll - m.roll) * Math.min(1, dt * 8);
    m.pitch += (tPitch - m.pitch) * Math.min(1, dt * 8);
    m.body.rotation.z = m.roll;
    m.body.rotation.x = m.pitch + (c.offroad ? Math.sin(now / 55) * 0.012 * speedFrac : 0);
    m.body.position.y = c.offroad ? Math.sin(now / 70) * 0.8 * speedFrac : 0;

    m.spin -= (c.speed / 6) * dt;
    m.wheels.forEach((w) => {
      w.w.rotation.x = m.spin;
      if (w.front) w.pivot.rotation.y = -(c.st || 0) * 0.45;
    });
    const mat = c.brake ? M.brakeOn : M.brake;
    m.lights[0].material = mat; m.lights[1].material = mat;
    m.flame.visible = !!c.boost;
    if (c.boost) m.flame.scale.z = 0.8 + Math.random() * 0.8;
    m.hood.visible = !!c.panne;

    if (c.speed > 90 && c.offroad && Math.random() < 0.6) puff(c.x, m.y + 5, c.y, 0xd6aa6e, 16, 0.6);
    if (c.smoke && Math.random() < 0.3) puff(c.x, m.y + 20, c.y, 0x322d2d, 14, 1.1);
  }

  function puff(x, y, z, color, size, life) {
    const p = particles[partNext];
    partNext = (partNext + 1) % particles.length;
    p.sprite.visible = true;
    p.sprite.position.set(x + (Math.random() - 0.5) * 12, y, z + (Math.random() - 0.5) * 12);
    p.sprite.material.color.setHex(color);
    p.t = 0; p.life = life; p.size = size;
    p.vy = 8 + Math.random() * 14;
  }

  function tickParticles(dt) {
    for (const p of particles) {
      if (!p.sprite.visible) continue;
      p.t += dt;
      if (p.t >= p.life) { p.sprite.visible = false; continue; }
      const k = p.t / p.life;
      p.sprite.position.y += p.vy * dt;
      const s = p.size * (1 + k * 3);
      p.sprite.scale.set(s, s, 1);
      p.sprite.material.opacity = 0.55 * (1 - k);
    }
  }

  // --- World chunks ---

  function buildIndex() {
    index = new Map();
    const add = (y, kind, o) => {
      const c = Math.floor(-y / CHUNK);
      if (!index.has(c)) index.set(c, []);
      index.get(c).push({ kind, o });
    };
    world.stations.forEach((s) => {
      add(s.y, 'station', s);
      add(s.y + 500, 'stationSign', s);
    });
    world.wrecks.forEach((w) => add(w.y, 'wreck', w));
    world.crates.forEach((c) => add(c.y, 'crate', c));
    world.billboards.forEach((b) => add(b.y, 'billboard', b));
    world.radars.forEach((r) => {
      add(r.y, 'radar', r);
      add(r.y + 950, 'radarSign', r);
    });
    add(world.goalY, 'goal', null);
  }

  function roadStrip(z0, z1, half, y, mat, uvRepeat) {
    const step = 40;
    const rows = Math.round((z1 - z0) / step);
    const pos = [], uv = [], nor = [], idx = [];
    for (let i = 0; i <= rows; i++) {
      const z = z0 + i * step;
      const cx = world.roadX(z);
      pos.push(cx - half, y, z, cx + half, y, z);
      nor.push(0, 1, 0, 0, 1, 0);
      const v = z / (uvRepeat || 220);
      uv.push(0, v, 1, v);
      if (i < rows) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new T3.BufferGeometry();
    g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T3.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T3.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return new T3.Mesh(g, mat);
  }

  const OFFS = [0, 130, 260, 390, 520, 680, 860, 1100, 1450, 1950, 2700, 3800];
  function groundMesh(z0, z1) {
    const step = 100;
    const rows = Math.round((z1 - z0) / step);
    const xs = [];
    for (let i = OFFS.length - 1; i > 0; i--) xs.push(-OFFS[i]);
    OFFS.forEach((o) => xs.push(o));
    const cols = xs.length;
    const pos = [], col = [], uv = [], idx = [];
    const c = new T3.Color();
    const low = new T3.Color(0xd9ab68), high = new T3.Color(0xf0c98a), shade = new T3.Color(0xc4935a);
    for (let r = 0; r <= rows; r++) {
      const z = z0 + r * step;
      const cx = world.roadX(z);
      for (let k = 0; k < cols; k++) {
        const x = cx + xs[k];
        const h = terrainH(x, z);
        pos.push(x, h, z);
        uv.push(x / 260, z / 260);
        const n = 0.5 + 0.5 * Math.sin(x / 90 + z / 130);
        c.copy(low).lerp(high, Math.min(1, h / 130)).lerp(shade, n * 0.28);
        col.push(c.r, c.g, c.b);
        if (r < rows && k < cols - 1) {
          const a = r * cols + k;
          idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
        }
      }
    }
    const g = new T3.BufferGeometry();
    g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T3.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new T3.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return new T3.Mesh(g, M.ground);
  }

  // Collects repeated decor per chunk and draws each kind in a single call.
  class Batch {
    constructor() { this.kinds = new Map(); this.dummy = new T3.Object3D(); }

    add(geo, mat, sx, sy, sz, x, y, z, ry) {
      const key = geo.uuid + mat.uuid;
      if (!this.kinds.has(key)) this.kinds.set(key, { geo, mat, list: [] });
      const d = this.dummy;
      d.scale.set(sx, sy, sz); d.position.set(x, y, z); d.rotation.set(0, ry || 0, 0);
      d.updateMatrix();
      this.kinds.get(key).list.push(d.matrix.clone());
    }

    flush(group, disposables) {
      for (const k of this.kinds.values()) {
        const m = new T3.InstancedMesh(k.geo, k.mat, k.list.length);
        k.list.forEach((mx, i) => m.setMatrixAt(i, mx));
        m.frustumCulled = false;
        group.add(m);
        disposables.push(m);
      }
    }
  }

  function addCactus(batch, x, z, s) {
    const y = terrainH(x, z);
    batch.add(G.cyl, M.cactus, 5 * s, 46 * s, 5 * s, x, y + 23 * s, z);
    batch.add(G.cyl, M.cactus, 3.4 * s, 18 * s, 3.4 * s, x + 10 * s, y + 30 * s, z);
    batch.add(G.box, M.cactus, 10 * s, 5 * s, 5 * s, x + 5 * s, y + 23 * s, z);
  }

  function buildMesa(group, x, z, r) {
    const y = terrainH(x, z) - 4;
    const w = 180 + r * 340, d = 160 + r * 300, h = 120 + r * 280;
    const mats = [M.mesaB, M.mesaA, M.mesaC];
    let top = y;
    for (let i = 0; i < 3; i++) {
      const hh = h / 3;
      const k = 1 - i * 0.16;
      const geo = new T3.CylinderGeometry(0.46 * k, 0.5 * k, 1, 7);
      const m = new T3.Mesh(geo, mats[i]);
      m.scale.set(w, hh, d);
      m.position.set(x, top + hh / 2, z);
      m.rotation.y = r * 6;
      group.add(m);
      m.userData.ownGeo = true;
      top += hh;
    }
  }

  function buildStationModel(s, group, x, z, material) {
    const mat = (m) => (material ? material(m) : m);
    const pad = box(mat(M.concrete), 300, 1, 300, x, 0.6, z, group);
    pad.renderOrder = 0;
    [[-44, -44], [44, -44], [-44, 44], [44, 44]].forEach(([dx, dz]) => box(mat(M.white), 5, 46, 5, x + dx, 24, z + dz, group));
    box(mat(M.canopy), 118, 8, 118, x, 50, z, group);
    box(mat(M.white), 120, 2.4, 120, x, 45, z, group);
    [-16, 16].forEach((dz) => {
      box(mat(M.pump), 10, 20, 7, x, 11, z + dz, group);
      box(mat(M.head), 7, 5, 7.4, x, 16, z + dz, group);
    });
  }

  function stationText(s) {
    const name = texts.stations[s.nameIdx % texts.stations.length];
    return { name };
  }

  function stationLabel(s, stock) {
    const l = stock > 0 ? stock + ' Liter' : 'LEER';
    return labelTex([{ text: stationText(s).name, size: 50, color: '#ffe9b0' }, { text: l, size: 58, color: stock > 0 ? '#9ed39a' : '#ff8d7d' }], { bg: '#28211d', w: 512, h: 170 });
  }

  function buildChunk(c) {
    const group = new T3.Group();
    const ownGeos = [], ownTex = [];
    const z1 = -c * CHUNK, z0 = -(c + 1) * CHUNK;
    const ground = groundMesh(z0, z1);
    const shoulder = roadStrip(z0, z1, world.ROAD_HALF + 14, 0.6, M.shoulder);
    const road = roadStrip(z0, z1, world.ROAD_HALF, ROAD_Y, M.road);
    group.add(ground, shoulder, road);
    ownGeos.push(ground.geometry, shoulder.geometry, road.geometry);

    const batch = new Batch();

    // Telegraph poles and sagging wires give the speed a rhythm.
    const spacing = 280;
    const pts = [];
    const first = Math.ceil(z0 / spacing) * spacing;
    for (let z = first; z <= z1 + spacing; z += spacing) {
      const x = world.roadX(z) + world.ROAD_HALF + 62;
      if (z <= z1) {
        batch.add(G.cyl, M.pole, 2.2, 62, 2.2, x, 31, z);
        batch.add(G.box, M.pole, 26, 2, 2, x, 58, z);
      }
      pts.push(new T3.Vector3(x, 57, z));
      if (z + spacing <= z1 + spacing) {
        const nx = world.roadX(z + spacing) + world.ROAD_HALF + 62;
        pts.push(new T3.Vector3((x + nx) / 2, 50, z + spacing / 2));
      }
    }
    const wireGeo = new T3.BufferGeometry().setFromPoints(pts);
    group.add(new T3.Line(wireGeo, M.wire));
    ownGeos.push(wireGeo);

    // Scattered rocks and cacti.
    const n = 26;
    for (let i = 0; i < n; i++) {
      const r = hash(c * 31 + 7, i);
      const side = hash(c * 17 + 3, i) < 0.5 ? -1 : 1;
      const z = z0 + hash(c + 1, i * 3 + 2) * CHUNK;
      const off = world.ROAD_HALF + 130 + Math.pow(hash(c + 2, i * 5 + 1), 1.6) * 1500;
      const x = world.roadX(z) + side * off;
      if (world.stations.some((s) => Math.abs(s.y - z) < 260 && s.side === side)) continue;
      if (r < 0.35) addCactus(batch, x, z, 0.8 + r * 1.4);
      else {
        const s = 7 + r * 26;
        batch.add(G.rock, M.rock, s, s * 0.7, s * 0.9, x, terrainH(x, z) + s * 0.25, z, r * 9);
      }
    }
    batch.flush(group, ownGeos);

    // Now and then a mesa on the far horizon.
    for (let i = 0; i < 2; i++) {
      const r = hash(c * 5 + 11, i * 9 + 1);
      if (r > 0.65) continue;
      const side = hash(c * 3 + 1, i + 40) < 0.5 ? -1 : 1;
      const z = z0 + hash(c + 8, i + 2) * CHUNK;
      const x = world.roadX(z) + side * (1500 + hash(c + 5, i + 7) * 1500);
      buildMesa(group, x, z, r / 0.65);
    }

    (index.get(c) || []).forEach((e) => buildItem(e, group, ownTex, c));
    scene.add(group);
    group.traverse((o) => { if (o.userData.ownGeo) ownGeos.push(o.geometry); });
    return { group, ownGeos, ownTex, c };
  }

  function buildItem(e, group, ownTex, c) {
    const o = e.o;
    switch (e.kind) {
      case 'station': {
        buildStationModel(o, group, o.x, o.y);
        box(M.kiosk, 96, 42, 66, o.x + o.side * 90, 22, o.y - 104, group);
        box(M.roof, 102, 4, 72, o.x + o.side * 90, 45, o.y - 104, group);
        const tx = stationLabel(o, o.stock);
        ownTex.push(tx);
        const mat = new T3.MeshBasicMaterial({ map: tx });
        const label = new T3.Mesh(G.plane, mat);
        label.scale.set(110, 36, 1);
        label.position.set(o.x, 72, o.y + 8);
        label.rotation.y = -o.side * 0.45;
        group.add(label);
        box(M.pump, 4, 22, 4, o.x, 56, o.y + 8, group);
        stationLabels.set(o.i, { mat, stock: o.stock, s: o, c });
        break;
      }
      case 'stationSign': {
        const z = o.y + 500;
        const x = world.roadX(z) + o.side * (world.ROAD_HALF + 46);
        const tx = labelTex([{ text: 'TANKE', size: 60, color: '#ffe9b0' }, { text: 'in 500 m', size: 44, color: '#ffe9b0' }], { bg: '#28211d', w: 256, h: 128 });
        ownTex.push(tx);
        box(M.pole, 3, 40, 3, x, 20, z, group);
        const p = new T3.Mesh(G.plane, new T3.MeshBasicMaterial({ map: tx }));
        p.scale.set(72, 36, 1); p.position.set(x, 50, z); p.rotation.y = -o.side * 0.35;
        group.add(p);
        break;
      }
      case 'wreck': {
        const full = new T3.Group(), stripped = new T3.Group();
        if (o.kind === 'hut') {
          box(M.plank, 90, 40, 76, 0, 20, 0, full);
          const roof = box(M.roof, 100, 4, 86, 0, 44, 0, full);
          roof.rotation.z = 0.12;
          box(M.door, 22, 30, 2, 0, 16, 38.5, full);
          box(M.door, 18, 14, 2, -28, 24, 38.5, full);
          box(M.plank, 70, 8, 60, 0, 4, 0, stripped);
          box(M.rustDark, 8, 20, 8, -28, 10, -24, stripped);
        } else if (o.kind === 'bus') {
          box(M.bus, 30, 28, 92, 0, 16, 0, full);
          box(M.window, 30.6, 9, 78, 0, 22, 0, full);
          box(M.rustDark, 16, 2, 26, 0, 30.6, 16, full);
          box(M.rustDark, 30, 6, 90, 0, 4, 0, stripped);
          box(M.bus, 3, 18, 80, -14, 14, 0, stripped);
        } else {
          box(M.rust, 25, 10, 50, 0, 8, 0, full);
          box(M.rustDark, 21, 9, 24, 0, 18, 4, full);
          box(M.window, 21.6, 5, 16, 0, 18.5, 4, full);
          box(lam(0x9c6a3f), 1, 8, 16, -12.8, 8, 2, full);
          box(M.rustDark, 25, 3, 48, 0, 3, 0, stripped);
          box(M.rust, 2, 8, 44, -11, 7, 0, stripped);
        }
        [full, stripped].forEach((g) => {
          g.position.set(o.x, ROAD_Y * 0.4, o.y);
          g.rotation.y = o.rot;
          if (o.kind !== 'hut') g.rotation.z = (o.rot - 3) * 0.02;
          group.add(g);
        });
        const isLooted = looted.has(o.i);
        full.visible = !isLooted; stripped.visible = isLooted;
        wreckMeshes.set(o.i, { full, stripped, c });
        break;
      }
      case 'crate': {
        const m = new T3.Mesh(G.box, M.crate);
        m.scale.set(26, 26, 26);
        m.position.set(o.x, 16, o.y);
        m.visible = !taken.has(o.i);
        group.add(m);
        crateMeshes.set(o.i, { m, c, phase: o.i });
        break;
      }
      case 'billboard': {
        const text = texts.billboards[o.idx % texts.billboards.length];
        let tx = textCache.get(text);
        if (!tx) { tx = labelTex([{ text, size: 50 }], { w: 640, h: 128, border: '#6b4a2c' }); textCache.set(text, tx); }
        const mat = new T3.MeshBasicMaterial({ map: tx });
        const p = new T3.Mesh(G.plane, mat);
        p.scale.set(170, 34, 1);
        p.position.set(o.x, 56, o.y);
        p.rotation.y = -o.side * 0.42;
        group.add(p);
        const dx = Math.cos(p.rotation.y) * 60, dz = -Math.sin(p.rotation.y) * 60;
        box(M.pole, 4, 42, 4, o.x - dx, 21, o.y - dz, group);
        box(M.pole, 4, 42, 4, o.x + dx, 21, o.y + dz, group);
        break;
      }
      case 'radar': {
        box(M.camera, 3, 34, 3, o.x, 17, o.y, group);
        box(M.camera, 12, 12, 16, o.x, 36, o.y, group);
        const lens = new T3.Mesh(G.cyl, M.lens);
        lens.scale.set(4, 2, 4); lens.rotation.x = Math.PI / 2; lens.position.set(o.x, 36, o.y + 9);
        group.add(lens);
        break;
      }
      case 'radarSign': {
        const z = o.y + 950;
        const x = world.roadX(z) + o.side * (world.ROAD_HALF + 30);
        box(M.pole, 3, 36, 3, x, 18, z, group);
        const p = new T3.Mesh(G.plane, M.radarSign);
        p.scale.set(34, 34, 1); p.position.set(x, 50, z); p.rotation.y = -o.side * 0.3;
        group.add(p);
        break;
      }
      case 'goal': {
        const z = world.goalY, cx = world.roadX(z);
        const line = new T3.Mesh(G.disc, M.check);
        line.scale.set(world.ROAD_HALF * 2, 1, 46); line.position.set(cx, ROAD_Y + 0.4, z);
        group.add(line);
        box(M.pole, 6, 90, 6, cx - world.ROAD_HALF - 16, 45, z, group);
        box(M.pole, 6, 90, 6, cx + world.ROAD_HALF + 16, 45, z, group);
        const tx = labelTex([{ text: 'KILOMETER 100. HIER IST NICHTS.', size: 54, color: '#fff3dc' }], { bg: '#d9622b', w: 1024, h: 128 });
        ownTex.push(tx);
        const p = new T3.Mesh(G.plane, new T3.MeshBasicMaterial({ map: tx, side: T3.DoubleSide }));
        p.scale.set(world.ROAD_HALF * 2 + 40, 34, 1); p.position.set(cx, 76, z);
        group.add(p);
        break;
      }
      default:
    }
  }

  function disposeChunk(ch) {
    scene.remove(ch.group);
    ch.ownGeos.forEach((g) => g.dispose());
    ch.ownTex.forEach((t) => t.dispose());
    for (const [k, v] of wreckMeshes) if (v.c === ch.c) wreckMeshes.delete(k);
    for (const [k, v] of crateMeshes) if (v.c === ch.c) crateMeshes.delete(k);
    for (const [k, v] of stationLabels) if (v.c === ch.c) { v.mat.dispose(); stationLabels.delete(k); }
  }

  function updateChunks(z, force) {
    const cur = Math.floor(-z / CHUNK);
    let built = 0;
    for (let c = cur - BEHIND; c <= cur + AHEAD; c++) {
      if (chunks.has(c)) continue;
      // Building is the costly part, so a running game gets at most one per frame.
      if (!force && built >= 1) break;
      chunks.set(c, buildChunk(c));
      built++;
    }
    for (const [c, ch] of chunks) {
      if (c < cur - BEHIND - 1 || c > cur + AHEAD + 1) { disposeChunk(ch); chunks.delete(c); }
    }
  }

  function updateLabels(stock) {
    if (!stock) return;
    for (const v of stationLabels.values()) {
      const st = stock[v.s.i];
      if (st === v.stock) continue;
      // The figure ticks fast while someone pumps, so redraw in 5 litre steps.
      if (st !== 0 && Math.abs(st - v.stock) < 5) continue;
      v.stock = st;
      const old = v.mat.map;
      v.mat.map = stationLabel(v.s, st);
      v.mat.needsUpdate = true;
      old.dispose();
    }
  }

  // --- Live entities ---

  function makeCow() {
    const g = new T3.Group();
    box(M.cowBody, 46, 22, 22, 0, 26, 0, g);
    box(M.cowSkin, 16, 14, 14, 29, 33, 0, g);
    box(M.cowNose, 5, 8, 11, 38.5, 30, 0, g);
    box(M.cowDark, 3, 7, 3, 25, 42, -6, g);
    box(M.cowDark, 3, 7, 3, 25, 42, 6, g);
    box(M.cowDark, 3, 14, 2, -24, 24, 0, g);
    const legs = [];
    [[-16, -8], [16, -8], [-16, 8], [16, 8]].forEach(([x, z]) => {
      const pivot = new T3.Group();
      pivot.position.set(x, 16, z);
      box(M.cowSkin, 6, 16, 6, 0, -8, 0, pivot);
      g.add(pivot);
      legs.push(pivot);
    });
    g.userData.legs = legs;
    return g;
  }

  function makeEnt(e, you) {
    if (e.type === 'can') {
      const g = new T3.Group();
      box(M.can, 16, 22, 10, 0, 13, 0, g);
      box(M.canCap, 5, 5, 5, 4, 26, 0, g);
      return g;
    }
    if (e.type === 'oil') {
      const m = new T3.Mesh(G.disc, M.oil);
      m.scale.set(130, 1, 100);
      m.position.y = ROAD_Y + 0.5;
      m.renderOrder = 1;
      return m;
    }
    if (e.type === 'cow') return makeCow();
    if (e.type === 'mirage') {
      if (e.owner !== you) return new T3.Group();
      const mats = [];
      const ghost = (src) => {
        const c = src.clone();
        c.transparent = true; c.opacity = 0.7;
        mats.push(c);
        return c;
      };
      const g = new T3.Group();
      buildStationModel(null, g, 0, 0, ghost);
      const word = ReserveTexts.pick(texts.mirageSign);
      const tx = labelTex([{ text: word, size: 56, color: '#ffe9b0' }, { text: '9999 Liter', size: 58, color: '#9ed39a' }], { bg: '#28211d', w: 512, h: 170 });
      const lm = new T3.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.8 });
      mats.push(lm);
      const label = new T3.Mesh(G.plane, lm);
      label.scale.set(110, 36, 1); label.position.set(0, 72, 8);
      g.add(label);
      g.userData.mats = mats;
      g.userData.tex = tx;
      return g;
    }
    return new T3.Group();
  }

  function syncEnts(ents, you, now, dt) {
    const seen = new Set();
    for (const e of ents) {
      seen.add(e.id);
      let o = entObjs.get(e.id);
      if (!o) {
        o = makeEnt(e, you);
        o.userData.type = e.type;
        entObjs.set(e.id, o);
        scene.add(o);
      }
      o.position.x = e.x; o.position.z = e.y;
      if (e.type === 'cow') {
        o.rotation.y = e.dir < 0 ? Math.PI : 0;
        o.position.y = ROAD_Y;
        o.userData.legs.forEach((l, i) => { l.rotation.z = Math.sin(now / 95 + (i % 3) * 2.4) * 0.5; });
      } else if (e.type === 'can') {
        o.position.y = ROAD_Y + Math.sin(now / 300) * 1.5;
        o.rotation.y += dt;
      } else if (e.type === 'mirage' && o.userData.mats) {
        o.position.x = e.x + Math.sin(now / 170) * 6;
        const a = 0.5 + Math.sin(now / 240) * 0.22;
        o.userData.mats.forEach((m) => { m.opacity = a; });
      }
    }
    for (const [id, o] of entObjs) {
      if (seen.has(id)) continue;
      scene.remove(o);
      if (o.userData.mats) {
        o.userData.mats.forEach((m) => m.dispose());
        o.userData.tex.dispose();
      }
      entObjs.delete(id);
    }
  }

  function updateHose(hose, cars, now) {
    if (hoseMesh) { scene.remove(hoseMesh); hoseMesh.geometry.dispose(); hoseMesh = null; }
    hoseBubbles.forEach((b) => { b.visible = false; });
    if (!hose) return;
    const a = cars.find((c) => c.idx === hose.f), b = cars.find((c) => c.idx === hose.to);
    if (!a || !b) return;
    const ma = carModels[a.idx], mb = carModels[b.idx];
    const pa = new T3.Vector3(a.x, ma.y + 14, a.y), pb = new T3.Vector3(b.x, mb.y + 14, b.y);
    const d = pa.distanceTo(pb);
    const stretch = Math.min(1, d / 130);
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    mid.y -= (1 - stretch) * 12 - Math.sin(now / 90) * 2;
    const curve = new T3.QuadraticBezierCurve3(pa, mid, pb);
    const geo = new T3.TubeGeometry(curve, 10, 2.4, 6, false);
    hoseMesh = new T3.Mesh(geo, stretch > 0.8 ? M.hoseTense : M.hoseOuter);
    scene.add(hoseMesh);
    if (hose.flow) {
      for (let i = 0; i < 4; i++) {
        let k = ((now / 420) + i / 4) % 1;
        if (!hose.rev) k = 1 - k;       // towards the attacker
        const bubble = hoseBubbles[i];
        curve.getPoint(k, bubble.position);
        bubble.visible = true;
      }
    }
  }

  // --- Horn rings and words ---

  function wordSprite(word) {
    let tx = textCache.get('h:' + word);
    if (!tx) {
      const c = makeCanvas(256, 96, (g) => {
        g.font = '800 62px ' + fontName();
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 10; g.strokeStyle = '#2a1a12'; g.strokeText(word, 128, 48);
        g.fillStyle = '#fff3dc'; g.fillText(word, 128, 48);
      });
      tx = tex(c);
      textCache.set('h:' + word, tx);
    }
    const s = new T3.Sprite(new T3.SpriteMaterial({ map: tx, transparent: true, depthTest: false }));
    s.scale.set(84, 32, 1);
    return s;
  }

  function horn(idx, word) {
    const ringMat = new T3.MeshBasicMaterial({ color: 0xfff3dc, transparent: true, side: T3.DoubleSide, depthWrite: false });
    const ring = new T3.Mesh(G.ring, ringMat);
    const sprite = wordSprite(word);
    scene.add(ring, sprite);
    horns.push({ idx, ring, sprite, t: 0 });
    if (horns.length > 5) disposeHorn(horns.shift());
  }

  function disposeHorn(h) {
    scene.remove(h.ring, h.sprite);
    h.ring.material.dispose();
    h.sprite.material.dispose();
  }

  function tickHorns(cars, dt) {
    for (let i = horns.length - 1; i >= 0; i--) {
      const h = horns[i];
      h.t += dt;
      const c = cars.find((x) => x.idx === h.idx);
      if (h.t > 0.7 || !c) { disposeHorn(h); horns.splice(i, 1); continue; }
      const k = h.t / 0.7;
      const y = carModels[c.idx].y;
      const r = 30 + k * 70;
      h.ring.position.set(c.x, y + 3, c.y);
      h.ring.scale.set(r, 1, r);
      h.ring.material.opacity = 0.85 * (1 - k);
      h.sprite.position.set(c.x, y + 48 + k * 18, c.y);
      h.sprite.material.opacity = 1 - k;
    }
  }

  // --- Sky, light and weather ---

  function buildSky() {
    const geo = new T3.SphereGeometry(4600, 16, 10);
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new T3.BufferAttribute(new Float32Array(n * 3), 3));
    sky = new T3.Mesh(geo, new T3.MeshBasicMaterial({ vertexColors: true, side: T3.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10;
    scene.add(sky);

    const c = makeCanvas(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 6, 64, 64, 62);
      r.addColorStop(0, 'rgba(255,255,240,1)'); r.addColorStop(0.28, 'rgba(255,240,200,.9)'); r.addColorStop(1, 'rgba(255,220,160,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    });
    sunSprite = new T3.Sprite(new T3.SpriteMaterial({ map: tex(c), transparent: true, fog: false, depthWrite: false }));
    sunSprite.scale.set(620, 620, 1);
    scene.add(sunSprite);
  }

  function dayAt(km) {
    const k = Math.min(100, Math.max(0, km));
    let i = 0;
    while (i < DAY.length - 2 && DAY[i + 1].km < k) i++;
    const a = DAY[i], b = DAY[i + 1];
    return { a, b, t: (k - a.km) / (b.km - a.km) };
  }

  const tmpA = new T3.Color(), tmpB = new T3.Color();
  function mix(hexA, hexB, t, out) {
    tmpA.setHex(hexA); tmpB.setHex(hexB);
    return out.copy(tmpA).lerp(tmpB, t);
  }

  const STORM_COLOR = new T3.Color(0xc99a5e);
  const colorTmp = new T3.Color(), sunColorTmp = new T3.Color();

  function applyDay(km, storm) {
    const bucket = Math.round(km * 2) + Math.round(storm * 20) * 1000;
    if (bucket === skyKm) return;
    skyKm = bucket;
    const d = dayAt(km);
    mix(d.a.top, d.b.top, d.t, skyTop).lerp(STORM_COLOR, storm);
    mix(d.a.hor, d.b.hor, d.t, skyHor).lerp(STORM_COLOR, storm);
    fogColor.copy(skyHor);
    scene.fog.color.copy(fogColor);

    const pos = sky.geometry.attributes.position, col = sky.geometry.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const h = Math.max(0, pos.getY(i) / 4600);
      colorTmp.copy(skyHor).lerp(skyTop, Math.pow(h, 0.55));
      col.setXYZ(i, colorTmp.r, colorTmp.g, colorTmp.b);
    }
    col.needsUpdate = true;

    sun.color.copy(mix(d.a.sun, d.b.sun, d.t, sunColorTmp));
    const si = d.a.si + (d.b.si - d.a.si) * d.t;
    sun.intensity = si * (1 - storm * 0.45);
    hemi.color.copy(mix(d.a.sky, d.b.sky, d.t, sunColorTmp));
    hemi.groundColor.copy(mix(d.a.gnd, d.b.gnd, d.t, sunColorTmp));
    hemi.intensity = d.a.hi + (d.b.hi - d.a.hi) * d.t;

    // The sun sinks towards the road ahead as the kilometres pass.
    const low = Math.min(1, km / 100);
    const elev = 0.95 - low * 0.8;
    sun.position.set(0.4 - low * 0.2, elev, -0.6).normalize();
    sunSprite.material.opacity = 1 - storm * 0.95;
  }

  function buildStreaks() {
    const n = 70;
    const geo = new T3.BufferGeometry();
    geo.setAttribute('position', new T3.BufferAttribute(new Float32Array(n * 6), 3));
    streaks = new T3.LineSegments(geo, new T3.LineBasicMaterial({ color: 0xf0d2a0, transparent: true, opacity: 0, fog: false }));
    streaks.frustumCulled = false;
    streaks.userData.p = [];
    for (let i = 0; i < n; i++) {
      streaks.userData.p.push({ x: (Math.random() - 0.5) * 700, y: Math.random() * 120, z: -Math.random() * 500, v: 500 + Math.random() * 700, l: 30 + Math.random() * 70 });
    }
    scene.add(streaks);
  }

  function updateStorm(env, dt) {
    const target = env ? env.storm : 0;
    stormLevel += (target - stormLevel) * Math.min(1, dt * 2);
    if (stormLevel < 0.003) stormLevel = 0;
    scene.fog.near = 900 - 840 * stormLevel;
    scene.fog.far = 3100 - 2720 * stormLevel;
    streaks.visible = stormLevel > 0.02;
    if (!streaks.visible) return;
    streaks.material.opacity = 0.55 * stormLevel;
    streaks.position.set(camera.position.x, camera.position.y - 40, camera.position.z);
    streaks.rotation.y = camera.rotation.y;
    const dir = env && env.wind < 0 ? -1 : 1;
    const arr = streaks.geometry.attributes.position.array;
    streaks.userData.p.forEach((s, i) => {
      s.x += dir * s.v * dt;
      if (s.x > 360) s.x = -360; else if (s.x < -360) s.x = 360;
      const a = i * 6;
      arr[a] = s.x; arr[a + 1] = s.y; arr[a + 2] = s.z;
      arr[a + 3] = s.x - dir * s.l; arr[a + 4] = s.y + 2; arr[a + 5] = s.z;
    });
    streaks.geometry.attributes.position.needsUpdate = true;
  }

  // --- Frame ---

  function placeCamera(c, dt) {
    const speed = Math.abs(c.speed);
    const frac = Math.min(1.3, speed / 350);
    let d = camYaw - c.a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (!camReady) { camYaw = c.a; d = 0; camX = c.x; camZ = c.y; camReady = true; }
    // A little lag on the yaw lets you see the car turn, without feeling loose.
    camYaw -= d * Math.min(1, dt * (3.5 + frac * 2));

    const back = 118 + frac * 34;
    const up = 58 + frac * 8;
    const fx = Math.sin(camYaw), fz = -Math.cos(camYaw);
    const tx = c.x - fx * back, tz = c.y - fz * back;
    const follow = Math.min(1, dt * 14);
    camX += (tx - camX) * follow;
    camZ += (tz - camZ) * follow;
    const carY = carModels[c.idx].y;
    const gy = Math.max(heightAt(camX, camZ) + 16, carY + up);
    camera.position.set(camX, gy, camZ);
    camera.lookAt(c.x + fx * 170, carY + 14, c.y + fz * 170);
    const fov = 58 + frac * 11 + (c.boost ? 5 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
  }

  function finishFrame() {
    const p = camera.position;
    sky.position.set(p.x, 0, p.z);
    sunSprite.position.set(p.x + sun.position.x * 4200, Math.max(120, sun.position.y * 4200), p.z + sun.position.z * 4200);
    renderer.render(scene, camera);
  }

  // scene: { cars:[{idx,x,y,a,st,speed,brake,boost,panne,offroad,smoke}], ents, hose, stock, km, env, dt, now, you }
  function frame(s) {
    const me = s.cars.find((c) => c.idx === s.you);
    if (!me) return;
    carModels.forEach((m) => { m.root.visible = false; });
    updateChunks(me.y, !camReady);
    for (const c of s.cars) {
      carModels[c.idx].root.visible = true;
      updateCar(c.idx, c, s.dt, s.now);
    }
    placeCamera(me, s.dt);
    syncEnts(s.ents, s.you, s.now, s.dt);
    updateHose(s.hose, s.cars, s.now);
    tickHorns(s.cars, s.dt);
    tickParticles(s.dt);
    updateLabels(s.stock);
    for (const v of crateMeshes.values()) {
      if (!v.m.visible) continue;
      v.m.rotation.y = s.now / 700 + v.phase;
      v.m.position.y = 18 + Math.sin(s.now / 320 + v.phase) * 3;
    }
    updateStorm(s.env, s.dt);
    applyDay(s.km, stormLevel);
    finishFrame();
  }

  // Menu backdrop: a slow drive-by along the empty road.
  function attract(z, dt) {
    carModels.forEach((m) => { m.root.visible = false; });
    updateChunks(z, chunks.size === 0);
    const y = z - 200;
    camera.position.set(world.roadX(z) + 30, 52, z);
    camera.lookAt(world.roadX(y), 22, y);
    syncEnts([], 0, 0, dt);
    updateHose(null);
    tickParticles(dt);
    updateStorm(null, dt);
    applyDay(55, stormLevel);
    finishFrame();
  }

  function clearWorld() {
    for (const ch of chunks.values()) disposeChunk(ch);
    chunks.clear();
    syncEnts([], 0, 0, 0);
    horns.splice(0).forEach(disposeHorn);
    camReady = false;
    skyKm = -1;
    stormLevel = 0;
  }

  function resize() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(maxDpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function setup() {
    try {
      renderer = new T3.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      return false;
    }
    scene = new T3.Scene();
    scene.fog = new T3.Fog(0xf3dcb4, 900, 3100);
    camera = new T3.PerspectiveCamera(58, 1, 3, 6500);
    hemi = new T3.HemisphereLight(0xcfe4f2, 0xb08a5c, 0.72);
    sun = new T3.DirectionalLight(0xfff2d8, 1);
    scene.add(hemi, sun);
    buildShared();
    buildSky();
    buildStreaks();
    carModels.push(buildCar(0), buildCar(1));
    for (let i = 0; i < 40; i++) {
      const sp = new T3.Sprite(new T3.SpriteMaterial({ map: TX.puff, transparent: true, depthWrite: false }));
      sp.visible = false;
      scene.add(sp);
      particles.push({ sprite: sp, t: 0, life: 1, size: 10, vy: 0 });
    }
    for (let i = 0; i < 4; i++) {
      const b = new T3.Mesh(G.bubble, M.bubble);
      b.visible = false;
      scene.add(b);
      hoseBubbles.push(b);
    }
    addEventListener('resize', resize);
    addEventListener('orientationchange', () => setTimeout(resize, 200));
    resize();
    return true;
  }

  const ok = setup();

  function init(w, t) {
    if (world === w) return;
    clearWorld();
    world = w;
    texts = t || texts;
    looted.clear(); taken.clear();
    buildIndex();
  }

  function setLooted(i) {
    looted.add(i);
    const v = wreckMeshes.get(i);
    if (v) { v.full.visible = false; v.stripped.visible = true; }
  }

  function setTaken(i) {
    taken.add(i);
    const v = crateMeshes.get(i);
    if (v) v.m.visible = false;
  }

  function lowerQuality() {
    if (maxDpr <= 1) return false;
    maxDpr = Math.max(1, maxDpr - 0.25);
    resize();
    return true;
  }

  return {
    ok, init, frame, attract, horn, setLooted, setTaken, lowerQuality,
    info: () => (renderer ? { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, chunks: chunks.size, dpr: maxDpr } : null),
  };
})();
