/**
 * Demo: actually move the mouse cursor on macOS/Windows/Linux.
 *
 * Requires robotjs:
 *   pnpm add -D robotjs
 *
 * Then run:
 *   npx tsx examples/demo-real-mouse.ts
 *
 * NOTE: On macOS, grant Accessibility permissions to your terminal
 * (System Settings → Privacy & Security → Accessibility).
 */
import robot from 'robotjs';
import {
  move,
  createGrannyNature,
  createFastGamerNature,
  createAverageUserNature,
  createRobotNature,
} from '../src/index.js';
import type { SystemCalls } from '../src/index.js';

// ─── Robotjs Backend Adapter ─────────────────────────────────────────────────

const robotjsBackend: SystemCalls = {
  currentTimeMillis: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  getScreenSize: () => {
    const size = robot.getScreenSize();
    return { width: size.width, height: size.height };
  },
  setMousePosition: (x, y) => {
    robot.moveMouse(x, y);
  },
  getMousePosition: () => {
    const pos = robot.getMousePos();
    return { x: pos.x, y: pos.y };
  },
};

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const screenSize = robotjsBackend.getScreenSize();
  const startPos = robotjsBackend.getMousePosition();

  console.log(`Screen: ${screenSize.width}x${screenSize.height}`);
  console.log(`Mouse at: (${startPos.x}, ${startPos.y})\n`);

  // Demo each preset
  const demos = [
    { name: 'Average User', nature: createAverageUserNature(robotjsBackend) },
    { name: 'Fast Gamer', nature: createFastGamerNature(robotjsBackend) },
    { name: 'Granny', nature: createGrannyNature(robotjsBackend) },
    { name: 'Robot (300ms/100px)', nature: createRobotNature(robotjsBackend, 300) },
  ];

  // Move in a square pattern for each preset
  const margin = 200;
  const targets = [
    { x: screenSize.width - margin, y: margin },           // top-right
    { x: screenSize.width - margin, y: screenSize.height - margin }, // bottom-right
    { x: margin, y: screenSize.height - margin },           // bottom-left
    { x: margin, y: margin },                               // top-left (back to start area)
  ];

  for (const demo of demos) {
    const target = targets.shift()!;
    targets.push(target); // rotate

    demo.nature.observer = (x, y) => {
      process.stdout.write(`\r  → (${String(x).padStart(4)}, ${String(y).padStart(4)})  `);
    };

    console.log(`\n▸ ${demo.name} → (${target.x}, ${target.y})`);
    const start = Date.now();
    await move(demo.nature, target.x, target.y);
    const elapsed = Date.now() - start;
    console.log(`\n  Done in ${elapsed}ms`);

    // Pause between demos
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('\n✓ All demos complete!');
}

main().catch(console.error);
