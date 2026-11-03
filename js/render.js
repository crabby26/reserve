// Canvas 2D renderer. All art is drawn in code and cached to offscreen canvases.
window.ReserveRender = (function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  let W = 0, H = 0, dpr = 1, maxDpr = Math.min(window.devicePixelRatio || 1, 2);
  let world = null;

  const sprites = {};
  let sandPattern = null;

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = maxDpr;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function lowerQuality() {
    if (maxDpr <= 1) return false;
    maxDpr = Math.max(1, maxDpr - 0.5);
    resize();
    return true;
  }

  // Deterministic hash for decor placement.
  function hash(a, b) {
    let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + (world ? world.seed : 0);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function sprite(w, h, draw, scale) {
    const s = scale || 2;
    const c = document.createElement('canvas');
    c.width = w * s; c.height = h * s;
    const g = c.getContext('2d');
    g.scale(s, s);
    draw(g, w, h);
    c.logicalW = w; c.logicalH = h;
    return c;
  }

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function carSprite(kind) {
    return sprite(40, 60, (g) => {
      g.translate(20, 30);
      // Wheels
      g.fillStyle = '#17110e';
      [[-13, -16], [13, -16], [-13, 16], [13, 16]].forEach(([x, y]) => g.fillRect(x - 3, y - 6, 6, 12));
      if (kind === 0) {
        // Kombi Wuestenfuchs: long estate with a roof rack.
        g.fillStyle = '#c9561f'; rr(g, -12, -25, 24, 50, 5); g.fill();
        g.fillStyle = '#7fb0ad'; g.fillRect(-12, -5, 5, 12); // door from another car
        g.fillStyle = '#2b3a40'; rr(g, -9, -13, 18, 8, 2); g.fill();
        g.fillStyle = '#e98a4d'; g.fillRect(-9, -5, 18, 21);
        g.strokeStyle = '#3b2415'; g.lineWidth = 1.4;
        for (let y = -2; y < 15; y += 5) { g.beginPath(); g.moveTo(-7, y); g.lineTo(7, y); g.stroke(); }
        g.fillStyle = '#2b3a40'; g.fillRect(-9, 16, 18, 4);
        g.fillStyle = '#6d3a1d'; g.beginPath(); g.arc(7, -19, 3, 0, 7); g.fill(); // rust
      } else {
        // Pritsche Trockenpflaume: pickup with an open bed.
        g.fillStyle = '#16817f'; rr(g, -12, -25, 24, 50, 4); g.fill();
        g.fillStyle = '#d9b545'; g.fillRect(7, -9, 5, 11); // door from another car
        g.fillStyle = '#26363a'; rr(g, -9, -14, 18, 7, 2); g.fill();
        g.fillStyle = '#2fa6a3'; g.fillRect(-9, -7, 18, 8);
        g.fillStyle = '#26363a'; g.fillRect(-9, 1, 18, 2);
        g.fillStyle = '#0d5453'; g.fillRect(-10, 5, 20, 18);
        g.fillStyle = '#7c6a45'; g.fillRect(-7, 8, 6, 6);   // junk in the bed
        g.fillStyle = '#17110e'; g.beginPath(); g.arc(4, 16, 4, 0, 7); g.fill();
        g.fillStyle = '#42665c'; g.beginPath(); g.arc(-6, -19, 2.6, 0, 7); g.fill();
      }
      g.fillStyle = '#fff3b0';
      g.fillRect(-10, -25.5, 5, 2); g.fillRect(5, -25.5, 5, 2);
      g.fillStyle = '#b3201a';
      g.fillRect(-10, 23.8, 5, 1.6); g.fillRect(5, 23.8, 5, 1.6);
    }, 3);
  }

  function buildSprites() {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 512;
    const t = tile.getContext('2d');
    t.fillStyle = '#d6a765'; t.fillRect(0, 0, 512, 512);
    let seed = 12345;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 1600; i++) {
      t.fillStyle = rnd() < 0.5 ? 'rgba(120,80,40,.10)' : 'rgba(255,230,180,.10)';
      const s = 1 + rnd() * 3;
      t.fillRect(rnd() * 512, rnd() * 512, s, s * (0.5 + rnd()));
    }
    for (let i = 0; i < 28; i++) {
      const x = rnd() * 512, y = rnd() * 512, w = 40 + rnd() * 80;
      t.strokeStyle = 'rgba(130,85,40,.13)'; t.lineWidth = 2;
      t.beginPath(); t.moveTo(x, y); t.quadraticCurveTo(x + w / 2, y - 9, x + w, y + rnd() * 6); t.stroke();
    }
    sandPattern = ctx.createPattern(tile, 'repeat');

    sprites.car = [carSprite(0), carSprite(1)];
    sprites.dune = sprite(420, 240, (g) => {
      const gr = g.createRadialGradient(210, 130, 10, 210, 120, 210);
      gr.addColorStop(0, 'rgba(240,200,140,.55)');
      gr.addColorStop(0.6, 'rgba(200,150,90,.28)');
      gr.addColorStop(1, 'rgba(180,130,80,0)');
      g.fillStyle = gr; g.scale(1, 0.57); g.beginPath(); g.arc(210, 210, 210, 0, 7); g.fill();
    }, 1);
    sprites.cactus = sprite(46, 46, (g) => {
      g.fillStyle = 'rgba(60,35,15,.25)'; g.beginPath(); g.ellipse(27, 27, 14, 8, 0.5, 0, 7); g.fill();
      g.fillStyle = '#4d7a3f';
      g.beginPath(); g.arc(22, 22, 10, 0, 7); g.fill();
      g.fillStyle = '#6a9a55'; g.beginPath(); g.arc(20, 20, 6, 0, 7); g.fill();
      g.fillStyle = '#4d7a3f'; g.beginPath(); g.arc(9, 18, 5, 0, 7); g.arc(35, 26, 5, 0, 7); g.fill();
    });
    sprites.rock = sprite(70, 56, (g) => {
      g.fillStyle = 'rgba(60,35,15,.3)'; g.beginPath(); g.ellipse(38, 34, 30, 18, 0, 0, 7); g.fill();
      g.fillStyle = '#8d6b4f'; g.beginPath();
      g.moveTo(8, 30); g.lineTo(20, 8); g.lineTo(46, 4); g.lineTo(62, 22); g.lineTo(52, 42); g.lineTo(18, 44); g.closePath(); g.fill();
      g.fillStyle = '#a98560'; g.beginPath(); g.moveTo(20, 8); g.lineTo(46, 4); g.lineTo(44, 22); g.lineTo(24, 24); g.closePath(); g.fill();
    });
    sprites.pole = sprite(50, 26, (g) => {
      g.fillStyle = 'rgba(60,35,15,.3)'; g.fillRect(25, 11, 25, 4);
      g.fillStyle = '#5a3d27'; g.fillRect(8, 12, 22, 3);
      g.fillStyle = '#3b2719'; g.beginPath(); g.arc(19, 13, 4, 0, 7); g.fill();
    });
    sprites.can = sprite(34, 38, (g) => {
      g.fillStyle = 'rgba(60,35,15,.3)'; g.fillRect(7, 8, 24, 28);
      g.fillStyle = '#c62c21'; rr(g, 4, 5, 24, 28, 3); g.fill();
      g.strokeStyle = '#7d130d'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(8, 11); g.lineTo(24, 27); g.moveTo(24, 11); g.lineTo(8, 27); g.stroke();
      g.fillStyle = '#f2d35e'; g.fillRect(19, 2, 7, 5);
    });
    sprites.station = sprite(280, 280, (g) => {
      g.fillStyle = '#6a6060'; rr(g, 0, 0, 280, 280, 14); g.fill();
      g.fillStyle = '#5c5353';
      for (let i = 0; i < 40; i++) { g.fillRect((i * 83) % 270, (i * 47) % 270, 12, 3); }
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(96, 90, 112, 112);
      g.fillStyle = '#d9622b'; g.fillRect(84, 78, 112, 112);
      g.fillStyle = '#fff3dc'; g.fillRect(84, 118, 112, 8); g.fillRect(84, 146, 112, 8);
      g.fillStyle = '#28211d'; g.fillRect(133, 96, 14, 14); g.fillRect(133, 162, 14, 14);
    }, 1);
    sprites.kiosk = sprite(110, 76, (g) => {
      g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(8, 8, 102, 68);
      g.fillStyle = '#b89a78'; g.fillRect(0, 0, 100, 66);
      g.fillStyle = '#987a5a';
      for (let x = 0; x < 100; x += 12) g.fillRect(x, 0, 2, 66);
      g.fillStyle = '#3f6f7a'; g.fillRect(36, 18, 28, 20);
    }, 1);
  }

  function roadPath(y0, y1, off) {
    const ROAD = world.ROAD_HALF + off;
    const stepY = 40;
    const ys = Math.floor(y0 / stepY) * stepY, ye = Math.ceil(y1 / stepY) * stepY;
    ctx.beginPath();
    for (let y = ys; y <= ye; y += stepY) {
      const x = world.roadX(y) - ROAD;
      if (y === ys) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let y = ye; y >= ys; y -= stepY) ctx.lineTo(world.roadX(y) + ROAD, y);
    ctx.closePath();
  }

  function drawRoad(y0, y1) {
    ctx.fillStyle = 'rgba(150,110,70,.55)'; roadPath(y0, y1, 14); ctx.fill();
    ctx.fillStyle = '#413d3e'; roadPath(y0, y1, 0); ctx.fill();

    // Edge lines
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(236,226,200,.75)';
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      const stepY = 40;
      const ys = Math.floor(y0 / stepY) * stepY, ye = Math.ceil(y1 / stepY) * stepY;
      for (let y = ys; y <= ye; y += stepY) {
        const x = world.roadX(y) + side * (world.ROAD_HALF - 7);
        if (y === ys) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // Centre dashes
    ctx.fillStyle = '#e5c24a';
    const dash = 110;
    for (let y = Math.floor(y0 / dash) * dash; y < y1; y += dash) {
      const x = world.roadX(y), x2 = world.roadX(y + 52);
      ctx.beginPath();
      ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.lineTo(x2 + 3, y + 52); ctx.lineTo(x2 - 3, y + 52);
      ctx.closePath(); ctx.fill();
    }

    // Blown sand patches and cracks on the tarmac
    const chunk = 300;
    for (let c = Math.floor(y0 / chunk); c * chunk < y1; c++) {
      const r = hash(c, 77);
      const y = c * chunk + r * chunk;
      const x = world.roadX(y) + (hash(c, 78) - 0.5) * 150;
      if (r < 0.55) {
        ctx.fillStyle = 'rgba(214,167,101,.34)';
        ctx.beginPath(); ctx.ellipse(x, y, 22 + r * 60, 10 + r * 14, r * 3, 0, 7); ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(20,18,18,.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18, y + 14); ctx.lineTo(x + 9, y + 34); ctx.stroke();
      }
    }

    // Finish line
    const gy = world.goalY;
    if (gy > y0 - 100 && gy < y1 + 100) {
      const gx = world.roadX(gy);
      for (let i = -5; i < 5; i++) {
        for (let j = 0; j < 3; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#fff' : '#111';
          ctx.fillRect(gx + i * 19, gy - j * 19, 19, 19);
        }
      }
    }
  }

  function blit(sp, x, y, rot, scale) {
    const w = sp.logicalW || sp.width, h = sp.logicalH || sp.height;
    if (rot || scale) {
      ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (scale) ctx.scale(scale, scale);
      ctx.drawImage(sp, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else ctx.drawImage(sp, x - w / 2, y - h / 2, w, h);
  }

  function drawDecor(x0, x1, y0, y1) {
    // Dunes
    const dc = 640;
    for (let cy = Math.floor(y0 / dc) - 1; cy * dc < y1 + dc; cy++) {
      for (let cx = Math.floor(x0 / dc) - 1; cx * dc < x1 + dc; cx++) {
        const r = hash(cx, cy);
        if (r < 0.5) continue;
        const px = (cx + hash(cx, cy + 5)) * dc, py = (cy + hash(cx + 5, cy)) * dc;
        blit(sprites.dune, px, py, 0, 0.8 + r);
      }
    }
    // Small stuff
    const sc = 230;
    for (let cy = Math.floor(y0 / sc) - 1; cy * sc < y1 + sc; cy++) {
      for (let cx = Math.floor(x0 / sc) - 1; cx * sc < x1 + sc; cx++) {
        const r = hash(cx * 3 + 1, cy * 7 + 2);
        if (r > 0.3) continue;
        const px = (cx + hash(cx, cy + 9)) * sc, py = (cy + hash(cx + 9, cy)) * sc;
        if (Math.abs(px - world.roadX(py)) < world.ROAD_HALF + 50) continue;
        blit(r < 0.12 ? sprites.cactus : sprites.rock, px, py, hash(cx, cy) * 6.28, r < 0.12 ? 1 : 0.5 + r);
      }
    }
    // Telegraph poles with wires: the steady rhythm that sells the speed.
    const spacing = 280;
    let prev = null;
    ctx.strokeStyle = 'rgba(40,25,15,.45)'; ctx.lineWidth = 1.5;
    for (let y = Math.floor(y0 / spacing) * spacing - spacing; y < y1 + spacing; y += spacing) {
      const x = world.roadX(y) + world.ROAD_HALF + 62;
      if (prev) { ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(x, y); ctx.stroke(); }
      prev = [x, y];
    }
    for (let y = Math.floor(y0 / spacing) * spacing - spacing; y < y1 + spacing; y += spacing) {
      blit(sprites.pole, world.roadX(y) + world.ROAD_HALF + 62, y);
    }
  }

  function drawStations(y0, y1, stock, T) {
    for (const s of world.stations) {
      if (s.y < y0 - 200 || s.y > y1 + 200) continue;
      blit(sprites.station, s.x, s.y);
      blit(sprites.kiosk, s.x + s.side * 80, s.y - 110);
      ctx.fillStyle = '#28211d'; ctx.fillRect(s.x - 118, s.y + 104, 236, 44);
      ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
      ctx.font = '600 21px ' + font();
      ctx.fillText(T.stations[s.nameIdx % T.stations.length], s.x, s.y + 124, 226);
      const l = stock ? stock[s.i] : s.stock;
      ctx.fillStyle = l > 0 ? '#9ed39a' : '#ff8d7d';
      ctx.fillText(l > 0 ? l + ' Liter in der Säule' : 'LEER', s.x, s.y + 143, 226);
      // Sign on the road side, so you can read it before you commit.
      const sx = world.roadX(s.y + 500) + s.side * (world.ROAD_HALF + 44);
      ctx.fillStyle = '#28211d'; ctx.fillRect(sx - 46, s.y + 480, 92, 36);
      ctx.fillStyle = '#ffe9b0'; ctx.font = '600 17px ' + font();
      ctx.fillText('TANKE', sx, s.y + 496); ctx.fillText(l + ' L', sx, s.y + 512);
    }
  }

  function font() { return getComputedStyle(document.body).fontFamily; }
  let fontCache = null;
  function cachedFont() { return fontCache || (fontCache = font()); }

  function drawCar(idx, x, y, a, st, opts) {
    const c = sprites.car[idx];
    ctx.save();
    ctx.translate(x, y);
    // Soft shadow to the side, like a low sun.
    ctx.save();
    ctx.translate(5, 5); ctx.rotate(a);
    ctx.fillStyle = 'rgba(30,18,10,.32)'; ctx.fillRect(-13, -25, 26, 50);
    ctx.restore();
    ctx.rotate(a);
    if (opts.flash) { ctx.globalAlpha = 0.6; }
    ctx.drawImage(c, -20, -30, 40, 60);
    ctx.globalAlpha = 1;
    if (opts.brake) {
      ctx.fillStyle = '#ff2a1c';
      ctx.fillRect(-10, 23, 6, 3); ctx.fillRect(4, 23, 6, 3);
    }
    if (opts.boost) {
      ctx.fillStyle = 'rgba(255,190,70,.9)';
      ctx.beginPath(); ctx.moveTo(-6, 26); ctx.lineTo(0, 44 + Math.random() * 12); ctx.lineTo(6, 26); ctx.closePath(); ctx.fill();
    }
    if (opts.panne) {
      // Hood up
      ctx.fillStyle = '#ddd'; ctx.fillRect(-11, -33, 22, 6);
    }
    ctx.restore();
  }

  // particles: simple pooled dust and smoke
  const parts = [];
  function puff(x, y, kind) {
    if (parts.length > 90) parts.shift();
    parts.push({ x, y, t: 0, life: kind === 'smoke' ? 1.1 : 0.55, kind, r: kind === 'smoke' ? 8 : 6, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30 });
  }
  function drawParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = p.t / p.life;
      const col = p.kind === 'smoke' ? '50,45,45' : p.kind === 'oil' ? '20,20,25' : '214,170,110';
      ctx.fillStyle = 'rgba(' + col + ',' + (0.5 * (1 - k)) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + k * 16, 0, 7); ctx.fill();
    }
  }

  // Day runs into dusk over the 100 km: the light tells you how far you are.
  function dayOverlay(km) {
    const k = Math.min(1, km / 100);
    if (k < 0.45) return null;
    const a = (k - 0.45) / 0.55;
    return 'rgba(' + Math.round(150 - 90 * a) + ',' + Math.round(70 - 40 * a) + ',' + Math.round(50 + 30 * a) + ',' + (a * 0.42) + ')';
  }

  // view: { x,y,zoom }, scene: { cars:[{idx,x,y,a,...}], ents, stock, km, T, dt, storm, extra }
  function frame(view, scene) {
    const dt = scene.dt;
    const z = view.zoom * dpr;
    const hw = W / 2 / view.zoom, hh = H / 2 / view.zoom;
    const x0 = view.x - hw, x1 = view.x + hw, y0 = view.y - hh, y1 = view.y + hh;

    ctx.setTransform(z, 0, 0, z, W / 2 * dpr - view.x * z, H / 2 * dpr - view.y * z);
    ctx.fillStyle = sandPattern;
    ctx.fillRect(x0 - 2, y0 - 2, hw * 2 + 4, hh * 2 + 4);

    drawDecor(x0, x1, y0, y1);
    drawRoad(y0 - 50, y1 + 50);
    ctx.font = '600 20px ' + cachedFont();
    drawStations(y0, y1, scene.stock, scene.T);
    if (scene.drawWorld) scene.drawWorld(ctx, { x0, x1, y0, y1, blit, sprites, font: cachedFont(), hash, rr });

    for (const c of scene.cars) {
      drawCar(c.idx, c.x, c.y, c.a, c.st, c);
      if (c.speed > 90 && c.offroad && Math.random() < 0.5) puff(c.x, c.y, 'dust');
      if (c.smoke && Math.random() < 0.25) puff(c.x, c.y, 'smoke');
    }
    drawParts(dt);
    if (scene.drawTop) scene.drawTop(ctx, { blit, sprites, font: cachedFont() });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const over = dayOverlay(scene.km);
    if (over) { ctx.fillStyle = over; ctx.fillRect(0, 0, W, H); }
    if (scene.drawScreen) scene.drawScreen(ctx, W, H, dpr);
  }

  function init(w) {
    world = w;
    if (!sandPattern) buildSprites();
  }

  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();

  return { init, frame, puff, lowerQuality, size: () => ({ W, H }), sprite, rr };
})();
