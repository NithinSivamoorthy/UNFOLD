import { createElement, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { PhysicsLabProps } from '../../integrations/types';

/**
 * A small, embeddable rolling-ball experiment. The WebView keeps the animation
 * and its fixed-step physics loop together, which works in the Expo Go runtime
 * already used by the GLB viewer.
 */
export function PhysicsLab({ model, onExit }: PhysicsLabProps) {
  return createElement(PhysicsLabScene, { modelName: model.name, onExit });
}

/** Standalone ramp demo entry point for the Lab tab, which has no selected GLB. */
export function PhysicsLabDemo({ onExit }: { onExit: () => void }) {
  return createElement(PhysicsLabScene, { modelName: 'Ball and ramp demo', onExit });
}

function PhysicsLabScene({ modelName, onExit }: { modelName: string; onExit: () => void }) {
  const html = useMemo(() => buildPhysicsHtml(modelName), [modelName]);

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string };
      if (message.type === 'exit') onExit();
    } catch {
      // Ignore messages that are not part of this feature's small bridge.
    }
  }

  return createElement(
    View,
    { style: styles.container },
    createElement(WebView, {
      source: { html },
      onMessage: handleMessage,
      originWhitelist: ['*'],
      javaScriptEnabled: true,
      scrollEnabled: false,
      bounces: false,
      overScrollMode: 'never',
      setSupportMultipleWindows: false,
      style: styles.webView,
      containerStyle: styles.container,
      accessibilityLabel: 'Physics Lab rolling ball simulation',
    })
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function buildPhysicsHtml(modelName: string) {
  const safeModelName = escapeHtml(modelName);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <meta name="color-scheme" content="dark" />
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #f2f5f7; background: #07090b; }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #07090b; }
    body { padding: 18px; }
    .shell { max-width: 900px; margin: 0 auto; }
    .top { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:14px; }
    .eyebrow { color:#5eead4; font-size:11px; font-weight:700; letter-spacing:.15em; text-transform:uppercase; }
    h1 { margin:5px 0 0; font-size:clamp(20px, 4vw, 28px); letter-spacing:-.03em; }
    .exit { min-height:42px; padding:0 15px; border:1px solid rgba(255,255,255,.14); border-radius:22px; background:#11161a; color:#f2f5f7; font:inherit; font-size:14px; }
    .model { margin-top:5px; color:#97a1ad; font-size:13px; }
    .stage { position:relative; overflow:hidden; min-height:250px; height:min(44vh, 390px); border:1px solid rgba(255,255,255,.08); border-radius:22px; background:radial-gradient(90% 100% at 50% 0%, #17292c 0%, #0c1215 55%, #090b0d 100%); }
    canvas { display:block; width:100%; height:100%; }
    .readout { position:absolute; left:14px; top:12px; padding:8px 11px; border:1px solid rgba(255,255,255,.09); border-radius:12px; background:rgba(7,9,11,.65); color:#c8d1d8; font-size:12px; backdrop-filter:blur(8px); }
    .readout strong { color:#5eead4; font-variant-numeric:tabular-nums; }
    .controls { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:14px; }
    .control { padding:13px 14px 11px; border:1px solid rgba(255,255,255,.08); border-radius:16px; background:#0f1317; }
    .control-head { display:flex; justify-content:space-between; gap:8px; align-items:baseline; margin-bottom:8px; color:#c8d1d8; font-size:13px; }
    output { color:#5eead4; font-variant-numeric:tabular-nums; font-weight:700; }
    input[type=range] { width:100%; accent-color:#5eead4; }
    .actions { display:flex; gap:10px; margin-top:14px; }
    .action { flex:1; min-height:50px; border:1px solid rgba(255,255,255,.12); border-radius:16px; background:#171d22; color:#f2f5f7; font:inherit; font-weight:650; }
    .action.primary { border-color:#5eead4; background:#5eead4; color:#04201c; }
    .hint { margin:11px 2px 0; color:#74808c; font-size:12px; line-height:1.45; }
    @media(max-width:560px) { body { padding:12px; } .stage { height:35vh; min-height:220px; } .controls { gap:7px; } .control { padding:11px 9px; } .control-head { display:block; font-size:12px; } .control-head output { display:block; margin-top:4px; } }
  </style>
</head>
<body>
  <main class="shell">
    <header class="top">
      <div><div class="eyebrow">Physics Lab · Motion</div><h1>Roll down the ramp</h1><div class="model">Experiment for ${safeModelName}</div></div>
      <button class="exit" id="exit" type="button">Done</button>
    </header>
    <section class="stage" aria-label="Animated ramp and rolling ball">
      <canvas id="scene"></canvas>
      <div class="readout">Speed <strong id="speed">0.00 m/s</strong></div>
    </section>
    <section class="controls" aria-label="Physics settings">
      <label class="control"><span class="control-head">Ramp angle <output id="angleValue">28°</output></span><input id="angle" type="range" min="10" max="50" step="1" value="28" aria-label="Ramp angle in degrees" /></label>
      <label class="control"><span class="control-head">Gravity <output id="gravityValue">9.8 m/s²</output></span><input id="gravity" type="range" min="1" max="20" step="0.1" value="9.8" aria-label="Gravity in metres per second squared" /></label>
      <label class="control"><span class="control-head">Rolling resistance <output id="frictionValue">0.20</output></span><input id="friction" type="range" min="0" max="1" step="0.01" value="0.2" aria-label="Rolling resistance" /></label>
    </section>
    <div class="actions"><button class="action primary" id="play" type="button">Play</button><button class="action" id="pause" type="button">Pause</button><button class="action" id="reset" type="button">Reset</button></div>
    <p class="hint">The ball accelerates down the incline, rolls across the ground plane, and bounces from the block. Change an input to reset with the new conditions. Rolling resistance is a simplified energy-loss model.</p>
  </main>
<script>
(function(){
  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d');
  var angleInput = document.getElementById('angle');
  var gravityInput = document.getElementById('gravity');
  var frictionInput = document.getElementById('friction');
  var speedOutput = document.getElementById('speed');
  var running = false;
  var angle = Number(angleInput.value) * Math.PI / 180;
  var gravity = Number(gravityInput.value);
  var resistance = Number(frictionInput.value) * 0.035;
  var distance = 0;
  var groundDistance = 0;
  var speed = 0;
  var onGround = false;
  var lastFrame = 0;
  var accumulator = 0;
  var ballRadius = 0.22;
  var rampLength = 4.7;
  var obstacleDistance = 3.35;
  var restitution = 0.52;
  var fixedDt = 1 / 120;

  function reset(keepRunning) {
    distance = 0; groundDistance = 0; speed = 0; onGround = false;
    accumulator = 0; lastFrame = 0;
    if (!keepRunning) running = false;
    draw();
  }
  function updateLabels() {
    angle = Number(angleInput.value) * Math.PI / 180;
    gravity = Number(gravityInput.value);
    resistance = Number(frictionInput.value) * 0.035;
    document.getElementById('angleValue').textContent = angleInput.value + '°';
    document.getElementById('gravityValue').textContent = gravity.toFixed(1) + ' m/s²';
    document.getElementById('frictionValue').textContent = Number(frictionInput.value).toFixed(2);
    reset(running);
  }
  function step(dt) {
    var rollingAcceleration = (5 / 7) * gravity * Math.sin(angle);
    var resistanceAcceleration = resistance * gravity * Math.cos(angle);
    if (!onGround) {
      var acceleration = Math.max(0, rollingAcceleration - resistanceAcceleration);
      speed += acceleration * dt;
      distance += speed * dt;
      if (distance >= rampLength) {
        var spill = distance - rampLength;
        distance = rampLength;
        onGround = true;
        groundDistance = spill;
      }
    } else {
      speed = Math.max(0, speed - resistanceAcceleration * dt);
      groundDistance += speed * dt;
      if (groundDistance + ballRadius >= obstacleDistance && speed > 0) {
        groundDistance = obstacleDistance - ballRadius;
        speed = -speed * restitution;
      } else if (groundDistance < -2) {
        groundDistance = -2;
        speed = Math.abs(speed) * restitution;
      }
    }
  }
  function draw() {
    var box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pixelWidth = Math.round(box.width * dpr);
    var pixelHeight = Math.round(box.height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var width = box.width, height = box.height;
    ctx.clearRect(0, 0, width, height);
    var scale = Math.min((width - 84) / (rampLength + obstacleDistance + 0.8), (height - 58) / (rampLength * Math.sin(angle) + 1.3));
    scale = Math.max(22, scale);
    var originX = Math.max(35, (width - scale * (rampLength * Math.cos(angle) + obstacleDistance + 0.6)) / 2);
    var groundY = height - 34;
    var startX = originX;
    var startY = groundY - rampLength * Math.sin(angle) * scale;
    var endX = startX + rampLength * Math.cos(angle) * scale;
    var endY = groundY;
    var r = ballRadius * scale;
    var bx, by;
    if (!onGround) {
      var s = Math.min(distance, rampLength);
      bx = startX + s * Math.cos(angle) * scale - r * Math.sin(angle);
      by = startY + s * Math.sin(angle) * scale - r * Math.cos(angle);
    } else {
      bx = endX + groundDistance * scale;
      by = groundY - r;
    }
    ctx.fillStyle = 'rgba(94,234,212,.045)';
    ctx.beginPath(); ctx.ellipse(width / 2, groundY + 4, width * .43, 19, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#344148'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(18, groundY); ctx.lineTo(width - 18, groundY); ctx.stroke();
    ctx.fillStyle = '#29373c'; ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.lineTo(endX, endY + 9); ctx.lineTo(startX, startY + 9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5eead4'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke();
    ctx.fillStyle = '#63727a'; ctx.beginPath(); ctx.roundRect(endX + obstacleDistance * scale, groundY - scale * .58, scale * .36, scale * .58, 5); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(bx + 3, groundY - 3, r * 1.05, Math.max(3, r * .25), 0, 0, Math.PI * 2); ctx.fill();
    var ball = ctx.createRadialGradient(bx - r * .34, by - r * .4, r * .08, bx, by, r);
    ball.addColorStop(0, '#d8fffa'); ball.addColorStop(.3, '#5eead4'); ball.addColorStop(1, '#0f8f83');
    ctx.fillStyle = ball; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(4,32,28,.7)'; ctx.lineWidth = Math.max(1.5, r * .06);
    var spin = (distance + Math.abs(groundDistance)) / ballRadius;
    ctx.beginPath(); ctx.arc(bx, by, r * .64, spin, spin + Math.PI * 1.35); ctx.stroke();
    ctx.fillStyle = '#91a0a8'; ctx.font = '12px -apple-system, sans-serif'; ctx.fillText('ground plane', 22, groundY - 11);
    speedOutput.textContent = Math.abs(speed).toFixed(2) + ' m/s';
  }
  function frame(now) {
    if (!running) { draw(); return; }
    if (lastFrame) accumulator += Math.min((now - lastFrame) / 1000, .05);
    lastFrame = now;
    while (accumulator >= fixedDt) { step(fixedDt); accumulator -= fixedDt; }
    draw();
    requestAnimationFrame(frame);
  }
  document.getElementById('play').addEventListener('click', function(){ if (!running) { running = true; lastFrame = 0; requestAnimationFrame(frame); } });
  document.getElementById('pause').addEventListener('click', function(){ running = false; lastFrame = 0; });
  document.getElementById('reset').addEventListener('click', function(){ reset(false); });
  document.getElementById('exit').addEventListener('click', function(){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'exit'})); });
  [angleInput, gravityInput, frictionInput].forEach(function(input){ input.addEventListener('input', updateLabels); });
  window.addEventListener('resize', draw);
  if (window.ResizeObserver) new ResizeObserver(draw).observe(canvas.parentElement);
  draw();
})();
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07090B' },
  webView: { flex: 1, backgroundColor: 'transparent' },
});
