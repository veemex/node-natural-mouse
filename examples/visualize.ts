/**
 * Generates mouse trajectories and opens an HTML visualization.
 * No external dependencies needed — just run with tsx.
 *
 *   npx tsx examples/visualize.ts
 */
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generatePath,
  createGrannyNature,
  createFastGamerNature,
  createAverageUserNature,
  createRobotNature,
  MockSystemCalls,
} from '../src/index.js';

const mock = new MockSystemCalls(1920, 1080, 0, 0);

const presets = [
  { name: 'Granny', color: '#e74c3c', nature: createGrannyNature(mock) },
  { name: 'Fast Gamer', color: '#2ecc71', nature: createFastGamerNature(mock) },
  { name: 'Average User', color: '#3498db', nature: createAverageUserNature(mock) },
  { name: 'Robot', color: '#95a5a6', nature: createRobotNature(mock, 100) },
];

const from = { x: 200, y: 500 };
const to = { x: 1600, y: 400 };

const paths = presets.map(({ name, color, nature }) => {
  const path = generatePath(nature, from, to.x, to.y);
  return { name, color, path };
});

// Also generate same-distance vertical vs horizontal to show direction bias
const hPath = generatePath(createAverageUserNature(mock), { x: 200, y: 540 }, 1400, 540);
const vPath = generatePath(createAverageUserNature(mock), { x: 960, y: 100 }, 960, 940);

const html = `<!DOCTYPE html>
<html>
<head>
  <title>Natural Mouse Motion — Trajectory Visualization</title>
  <style>
    * { margin: 0; box-sizing: border-box; }
    body { background: #1a1a2e; color: #eee; font-family: system-ui; padding: 20px; }
    h1 { font-size: 1.4em; margin-bottom: 4px; }
    p.sub { color: #888; font-size: 0.85em; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    canvas { background: #16213e; border-radius: 8px; width: 100%; }
    .legend { display: flex; gap: 16px; margin: 12px 0; flex-wrap: wrap; }
    .legend span { display: flex; align-items: center; gap: 6px; font-size: 0.85em; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    h2 { font-size: 1.1em; margin: 8px 0; }
  </style>
</head>
<body>
  <h1>Natural Mouse Motion — Trajectory Visualization</h1>
  <p class="sub">From (${from.x}, ${from.y}) → (${to.x}, ${to.y}) · Each preset generates a unique human-like path</p>
  <div class="legend">
    ${paths.map(p => `<span><span class="dot" style="background:${p.color}"></span>${p.name} (${p.path.length} pts)</span>`).join('')}
  </div>
  <div class="grid">
    <div>
      <h2>All Presets Overlaid</h2>
      <canvas id="overlay" width="960" height="540"></canvas>
    </div>
    <div>
      <h2>Direction Bias: Horizontal vs Vertical</h2>
      <canvas id="direction" width="960" height="540"></canvas>
    </div>
    ${paths.map((p, i) => `<div><h2>${p.name}</h2><canvas id="c${i}" width="960" height="540"></canvas></div>`).join('')}
  </div>
  <script>
    const paths = ${JSON.stringify(paths.map(p => ({ name: p.name, color: p.color, path: p.path })))};
    const hPath = ${JSON.stringify(hPath)};
    const vPath = ${JSON.stringify(vPath)};

    function drawPath(ctx, path, color, w, h) {
      const sx = w / 1920, sy = h / 1080;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      path.forEach((p, i) => {
        const x = p.x * sx, y = p.y * sy;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      // Start dot
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(path[0].x * sx, path[0].y * sy, 4, 0, Math.PI * 2);
      ctx.fill();
      // End dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(path[path.length-1].x * sx, path[path.length-1].y * sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Overlay
    const oc = document.getElementById('overlay');
    const octx = oc.getContext('2d');
    paths.forEach(p => drawPath(octx, p.path, p.color, oc.width, oc.height));

    // Individual
    paths.forEach((p, i) => {
      const c = document.getElementById('c' + i);
      drawPath(c.getContext('2d'), p.path, p.color, c.width, c.height);
    });

    // Direction bias
    const dc = document.getElementById('direction');
    const dctx = dc.getContext('2d');
    drawPath(dctx, hPath, '#f39c12', dc.width, dc.height);
    drawPath(dctx, vPath, '#9b59b6', dc.width, dc.height);
    dctx.font = '13px system-ui';
    dctx.fillStyle = '#f39c12';
    dctx.fillText('Horizontal: ' + hPath.length + ' points (faster)', 20, 25);
    dctx.fillStyle = '#9b59b6';
    dctx.fillText('Vertical: ' + vPath.length + ' points (slower — direction bias)', 20, 45);
  </script>
</body>
</html>`;

const tmpPath = join(tmpdir(), 'mouse-motion-viz.html');
writeFileSync(tmpPath, html);
console.log(`Visualization written to: ${tmpPath}`);
console.log('Opening in browser...');

// Open in default browser
try {
  execSync(`open "${tmpPath}"`); // macOS
} catch {
  try {
    execSync(`xdg-open "${tmpPath}"`); // Linux
  } catch {
    execSync(`start "${tmpPath}"`); // Windows
  }
}

console.log('\nPath stats:');
for (const p of paths) {
  console.log(`  ${p.name.padEnd(14)} ${p.path.length} points`);
}
console.log(`  ${'Horizontal'.padEnd(14)} ${hPath.length} points`);
console.log(`  ${'Vertical'.padEnd(14)} ${vPath.length} points (direction bias)`);
