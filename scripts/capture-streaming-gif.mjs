#!/usr/bin/env node
/**
 * Reshoot docs/streaming.gif — the demo's Streaming tab assembling a dashboard.
 *
 * Both READMEs embed that GIF, and it went stale across several UI versions
 * before anyone noticed, because reshooting it was an undocumented pile of
 * one-off commands. This is that pile, written down.
 *
 * It drives a headless Chrome over the DevTools Protocol rather than any
 * interactive screenshot tool. The recorded transport emits a patch line every
 * 220ms and the whole stream lasts about 3.5s, so frames have to land at known
 * points on a fixed clock; a round trip through a screenshot tool blurs
 * several patches into one frame and the UI appears to jump.
 *
 * Prerequisites — this script does not start them, because both libraries have
 * to be built before the demo can serve the playground at all:
 *
 *     npm run build:lib && npm run build:material
 *     npx ng serve demo
 *
 * Then, in another shell:
 *
 *     node scripts/capture-streaming-gif.mjs            # writes docs/streaming.gif
 *     node scripts/capture-streaming-gif.mjs --out /tmp/try.gif --keep-frames
 *
 * Options: --out <path>, --url <origin>, --height <px>, --port <n>,
 * --keep-frames.
 *
 * Three environment traps cost most of a session on 2026-08-31 and are each
 * handled or reported here rather than left to be rediscovered:
 *
 *   - port 9222 is usually already held by a long-running Chrome, so the
 *     default here is 9333 and the port is checked before Chrome is spawned;
 *   - `ng serve` binds `[::1]` only, and Node's fetch does not fall back from
 *     `localhost` to IPv4 — hence the bracketed IPv6 default URL, and a
 *     preflight that says so instead of timing out inside the page;
 *   - a 128-colour palette drops the status dot's green and the negative
 *     delta's red, so the palette is built at 256 colours over every frame
 *     (`stats_mode=full`) rather than over the first one.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** Width of the README's image column at 2x — the GIF is shown scaled down. */
const WIDTH = 1568;
/**
 * Capture height. The page measures taller than this (its scrollHeight was
 * 1018 when this was written); the shipped GIF is 965 because the tail is
 * empty padding below the dashboard. The script reports both, so a page that
 * grows past the frame is visible rather than silently clipped.
 */
const HEIGHT = 965;

/** Frames taken while the stream runs, and the gap between them. */
const SHOTS = 13;
const EVERY_MS = 300;
/** How long the finished GIF rests on the idle frame and on the result. */
const IDLE_HOLD_S = 0.9;
const RESULT_HOLD_S = 2.2;

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const out = flag('out', 'docs/streaming.gif');
const origin = flag('url', 'http://[::1]:4200');
const height = Number(flag('height', HEIGHT));
const port = Number(flag('port', 9333));
const keepFrames = args.includes('--keep-frames');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (message) => {
  console.error(message);
  process.exit(1);
};

// --- Preflight -------------------------------------------------------------

if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).error) {
  die('ffmpeg is not on PATH. brew install ffmpeg');
}

if (spawnSync('test', ['-x', CHROME]).status !== 0) {
  die(
    `No Chrome at ${CHROME}. Edit CHROME in this script if it lives elsewhere.`,
  );
}

const portFree = await new Promise((resolve) => {
  const probe = createServer()
    .once('error', () => resolve(false))
    .once('listening', () => probe.close(() => resolve(true)))
    .listen(port, '127.0.0.1');
});
if (!portFree) {
  die(
    `Port ${port} is taken — probably another Chrome. Check with ` +
      `\`lsof -iTCP:${port}\`, or pass --port with a free one.`,
  );
}

try {
  await fetch(origin, { signal: AbortSignal.timeout(3000) });
} catch (error) {
  die(
    `Nothing served at ${origin} (${error.message}).\n` +
      'Start it with `npm run build:lib && npm run build:material` then ' +
      '`npx ng serve demo`.\nNote the bracketed IPv6 host: ng serve binds ' +
      '[::1] only and Node does not fall back from localhost to IPv4.',
  );
}

// --- Capture ---------------------------------------------------------------

const frames = keepFrames
  ? (mkdirSync('.gif-frames', { recursive: true }), '.gif-frames')
  : mkdtempSync(join(tmpdir(), 'ngx-gif-'));

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--force-color-profile=srgb',
    '--disable-gpu',
    `--window-size=${WIDTH},${height}`,
    `--user-data-dir=${join(tmpdir(), 'ngx-gif-profile')}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

/** The browser-level endpoint, once Chrome is listening. */
async function browserWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const info = await res.json();
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome never opened a debugging port');
}

const ws = new WebSocket(await browserWsUrl());
await new Promise((resolve) =>
  ws.addEventListener('open', resolve, { once: true }),
);

let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  const settle = pending.get(msg.id);
  if (settle) {
    pending.delete(msg.id);
    if (msg.error) settle.reject(new Error(JSON.stringify(msg.error)));
    else settle.resolve(msg.result);
  }
});

function send(method, params = {}, sessionId) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(
      JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }),
    );
  });
}

// One page target, attached flat so every later call rides the same socket.
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', {
  targetId,
  flatten: true,
});
const page = (method, params) => send(method, params, sessionId);

/** Run an expression in the page and return its (awaited) value. */
async function evaluate(expression) {
  const result = await page('Runtime.evaluate', {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result?.value;
}

/** Poll the page until an expression returns truthy, then return it. */
async function waitFor(expression, what) {
  for (let i = 0; i < 120; i++) {
    const value = await evaluate(`return ${expression};`);
    if (value) return value;
    await sleep(250);
  }
  const where = await evaluate(
    'return location.href + " | " + document.title;',
  );
  throw new Error(`Timed out waiting for ${what}. Page: ${where}`);
}

let frame = 0;
const shots = [];
async function shot(label) {
  const { data } = await page('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  const name = `${String(frame++).padStart(2, '0')}.png`;
  writeFileSync(join(frames, name), Buffer.from(data, 'base64'));
  shots.push(name);
  console.log(name, label ?? '');
}

let failure;
try {
  await page('Page.enable');
  await page('Runtime.enable');
  await page('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await page('Page.navigate', { url: origin });

  await waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Streaming')`,
    'the demo shell',
  );

  // Land on the Streaming tab and let it settle before the first frame.
  await evaluate(`
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Streaming').click();
  `);
  await waitFor(
    `!!document.querySelector('.switch button')`,
    'the prompt picker',
  );
  await sleep(1200);

  await shot('idle');

  // Start the generation, then sample it on a fixed clock.
  await evaluate(`
    [...document.querySelectorAll('.switch button')]
      .find((b) => /Weekly/.test(b.textContent)).click();
  `);

  for (let i = 0; i < SHOTS; i++) {
    await sleep(EVERY_MS);
    await shot(`streaming ${i}`);
  }

  // Hold until the stop button goes away — the stream has finished.
  for (let i = 0; i < 40; i++) {
    if (!(await evaluate('return !!document.querySelector(".stop");'))) break;
    await sleep(200);
  }
  await sleep(500);
  await shot('done');

  const scrollHeight = await evaluate(
    'return document.documentElement.scrollHeight;',
  );
  const status = await evaluate(
    `return document.querySelector('.status').textContent.replace(/\\s+/g, ' ').trim();`,
  );
  console.log(`page height: ${scrollHeight} (capturing ${height})`);
  console.log(`final status: ${status}`);
  if (scrollHeight > height) {
    console.warn(
      `Note: the page is ${scrollHeight - height}px taller than the frame. ` +
        'That tail was empty padding when this was written — check the last ' +
        'frame, and pass --height if the dashboard is now clipped.',
    );
  }
} catch (error) {
  failure = error;
} finally {
  ws.close();
  chrome.kill();
}

if (failure) {
  if (!keepFrames) rmSync(frames, { recursive: true, force: true });
  die(`Capture failed: ${failure.message}`);
}

// --- Assemble --------------------------------------------------------------

/**
 * The concat demuxer applies a duration to the file above it and ignores the
 * one on the last entry, so the final frame is listed twice to be held.
 */
const list = shots
  .map((name, i) => {
    const duration =
      i === 0
        ? IDLE_HOLD_S
        : i === shots.length - 1
          ? RESULT_HOLD_S
          : EVERY_MS / 1000;
    return `file '${name}'\nduration ${duration}`;
  })
  .concat(`file '${shots.at(-1)}'`)
  .join('\n');
writeFileSync(join(frames, 'list.txt'), `${list}\n`);

const ffmpeg = (args) => {
  const run = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (run.status !== 0) die(`ffmpeg failed: ffmpeg ${args.join(' ')}`);
};

const palette = join(frames, 'palette.png');
const concat = ['-f', 'concat', '-safe', '0', '-i', join(frames, 'list.txt')];

ffmpeg([
  ...concat,
  '-vf',
  'palettegen=max_colors=256:stats_mode=full',
  palette,
]);
ffmpeg([...concat, '-i', palette, '-lavfi', 'paletteuse', out]);

if (!keepFrames) rmSync(frames, { recursive: true, force: true });
else console.log(`frames kept in ${frames}`);

console.log(`wrote ${out}`);
