// Touch, keyboard and tilt input. Every control tracks its own pointer so the
// two thumbs never interfere with each other.
window.ReserveInput = (function () {
  'use strict';

  const STEER_RANGE = 72;   // pixels of thumb travel for full lock

  const state = { steer: 0, gas: 0, brake: 0, hold: false, boostQueued: false };
  const handlers = {};
  let tilt = false, tiltSteer = 0;
  const keys = {};

  function $(id) { return document.getElementById(id); }
  function on(name, fn) { handlers[name] = fn; }
  function fire(name) { if (handlers[name]) handlers[name](); }

  // Slightly softer around centre for fine corrections, still reaches full lock.
  function steerCurve(x) { return 0.62 * x + 0.38 * x * x * x; }

  function setupSteer() {
    const zone = $('steerZone'), knob = $('steerKnob');
    let id = null, origin = 0;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId; origin = e.clientX;
      try { zone.setPointerCapture(id); } catch (err) { /* synthetic pointer */ }
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - origin;
      // Origin follows past full lock, so reversing direction reacts immediately.
      if (dx > STEER_RANGE) { origin = e.clientX - STEER_RANGE; dx = STEER_RANGE; }
      if (dx < -STEER_RANGE) { origin = e.clientX + STEER_RANGE; dx = -STEER_RANGE; }
      const n = dx / STEER_RANGE;
      state.touchSteer = Math.abs(n) < 0.04 ? 0 : steerCurve(n);
      knob.style.transform = 'translateX(' + (n * 86) + 'px)';
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; state.touchSteer = 0;
      knob.style.transform = '';
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  function setupPedals() {
    const box = $('pedals'), gas = $('pedalGas'), brake = $('pedalBrake'), level = $('gasLevel');
    let id = null;
    function apply(y) {
      const r = gas.getBoundingClientRect();
      const b = brake.getBoundingClientRect();
      if (y >= b.top - 3) {
        state.touchGas = 0; state.touchBrake = 1;
      } else {
        // Lower part of the gas pedal is a gentle eco throttle, top half is flat out.
        const f = Math.min(1, Math.max(0, (r.bottom - y) / (r.height * 0.5)));
        state.touchGas = 0.55 + 0.45 * f; state.touchBrake = 0;
      }
      gas.classList.toggle('on', state.touchGas > 0);
      brake.classList.toggle('on', state.touchBrake > 0);
      level.style.height = (state.touchGas > 0 ? (state.touchGas - 0.55) / 0.45 * 100 : 0) + '%';
    }
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId;
      try { box.setPointerCapture(id); } catch (err) { /* synthetic pointer */ }
      apply(e.clientY);
    });
    box.addEventListener('pointermove', (e) => { if (e.pointerId === id) apply(e.clientY); });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; state.touchGas = 0; state.touchBrake = 0;
      gas.classList.remove('on'); brake.classList.remove('on'); level.style.height = '0';
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    box.addEventListener('lostpointercapture', end);
  }

  function setupButton(id, name) {
    $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); if (!$(id).disabled) fire(name); });
  }

  function setupHold() {
    const b = $('btnHold');
    let pid = null;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pid = e.pointerId; state.touchHold = true;
      try { b.setPointerCapture(pid); } catch (err) { /* synthetic pointer */ }
    });
    const end = (e) => { if (e.pointerId === pid) { pid = null; state.touchHold = false; } };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
    b.addEventListener('lostpointercapture', end);
  }

  function setupKeys() {
    addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      keys[e.code] = true;
      if (e.repeat) return;
      if (e.code === 'KeyH') fire('horn');
      if (e.code === 'KeyB') fire('boost');
      if (e.code === 'KeyE') fire('hose');
      if (e.code === 'KeyQ') fire('item');
    });
    addEventListener('keyup', (e) => { keys[e.code] = false; });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  }

  function onOrientation(e) {
    if (e.beta === null) return;
    const angle = (screen.orientation && typeof screen.orientation.angle === 'number')
      ? screen.orientation.angle : (window.orientation || 0);
    // sin(beta) is gravity along the device y axis. It stays stable while the iPad
    // is held upright, where the raw Euler angle would jump.
    const g = Math.sin(e.beta * Math.PI / 180);
    let v = 0;
    if (angle === 90) v = g;
    else if (angle === 270 || angle === -90) v = -g;
    else return; // portrait: gameplay is paused by the rotate hint anyway
    const full = 0.37; // about 22 degrees
    const dead = 0.03;
    const mag = Math.max(0, Math.abs(v) - dead) / (full - dead);
    tiltSteer = Math.sign(v) * Math.min(1, mag);
  }

  // Must run inside a user gesture for the iOS permission prompt.
  async function setTilt(enable) {
    if (!enable) {
      tilt = false; tiltSteer = 0;
      removeEventListener('deviceorientation', onOrientation);
      return false;
    }
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) return false;
    if (typeof DOE.requestPermission === 'function') {
      let res = 'denied';
      try { res = await DOE.requestPermission(); } catch (err) { return false; }
      if (res !== 'granted') return false;
    }
    addEventListener('deviceorientation', onOrientation);
    tilt = true;
    return true;
  }

  function init() {
    setupSteer(); setupPedals(); setupKeys(); setupHold();
    setupButton('btnHorn', 'horn');
    setupButton('btnBoost', 'boost');
    setupButton('btnHose', 'hose');
    setupButton('btnItem', 'item');
    // Stop page gestures that iOS Safari does not fully drop for touch-action.
    ['gesturestart', 'gesturechange', 'dblclick'].forEach((n) =>
      document.addEventListener(n, (e) => e.preventDefault(), { passive: false }));
    document.addEventListener('touchmove', (e) => {
      if (e.target && e.target.tagName !== 'INPUT') e.preventDefault();
    }, { passive: false });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function sample() {
    let s = state.touchSteer || 0;
    if (tilt) s = tiltSteer;
    if (keys.ArrowLeft || keys.KeyA) s = -1;
    if (keys.ArrowRight || keys.KeyD) s = 1;
    const g = (keys.ArrowUp || keys.KeyW) ? 1 : (state.touchGas || 0);
    const b = (keys.ArrowDown || keys.KeyS || keys.Space) ? 1 : (state.touchBrake || 0);
    const h = !!(keys.KeyF || state.touchHold);
    return { s, g, b, h };
  }

  return { init, on, sample, setTilt, tiltOn: () => tilt, _orient: onOrientation };
})();
