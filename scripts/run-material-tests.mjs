#!/usr/bin/env node
/**
 * Run the Material catalog test suite and report its real outcome.
 *
 * `ng test ngx-json-render-material` runs the suite correctly but its runner
 * process never exits, so it cannot be a plain CI step: the job would hang
 * long after the results were in. See the "Known issue" section of
 * projects/ngx-json-render-material/README.md for what is and is not the
 * cause.
 *
 * So this script does not wait for the process. It asks Vitest for a JSON
 * report, waits for that report to land, kills the runner, and exits on what
 * the report says. A run that produces no report — a build failure, a crash,
 * or a genuine hang before the suite finishes — fails. A build failure fails
 * immediately rather than sitting out the timeout, because the builder keeps
 * running after it reports one.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** How long to wait for the report before giving up. */
const TIMEOUT_MS = Number(process.env['MATERIAL_TEST_TIMEOUT_MS'] ?? 600_000);
/** How often to look for it. */
const POLL_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Read the report once it is present and completely written. */
async function readReport(path) {
  try {
    const raw = await readFile(path, 'utf8');
    if (!raw.trim()) return null;
    const report = JSON.parse(raw);
    // numTotalTests is written in the same pass as the rest of the summary,
    // so its presence means we are not looking at a half-flushed file.
    return typeof report.numTotalTests === 'number' ? report : null;
  } catch {
    // Missing, or mid-write and not yet valid JSON.
    return null;
  }
}

/** Terminate the runner and everything it spawned. */
function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    // Negative pid targets the whole process group, which is where the
    // esbuild and Vitest workers live.
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

/** Print the failures a report records, most useful line first. */
function reportFailures(report) {
  for (const suite of report.testResults ?? []) {
    for (const test of suite.assertionResults ?? []) {
      if (test.status === 'failed') {
        console.error(`  ✗ ${test.fullName}`);
        for (const message of test.failureMessages ?? []) {
          console.error(`    ${message.split('\n')[0]}`);
        }
      }
    }
  }
}

/** Run the suite. Returns the process exit code. */
async function run(child, reportPath, state) {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const report = await readReport(reportPath);
    if (report) return summarize(report);

    if (state.buildFailed) {
      console.error('\nThe test build failed; no tests ran.');
      return 1;
    }
    if (state.exited) {
      // The runner exited without leaving a report: a crash, or the upstream
      // defect is fixed and something else went wrong.
      const { code, signal } = state.exited;
      console.error(
        `\nThe test runner exited (code ${code}, signal ${signal}) without writing a report.`,
      );
      return code || 1;
    }
    await sleep(POLL_MS);
  }

  console.error(
    `\nNo test report after ${Math.round(TIMEOUT_MS / 1000)}s — the suite did not finish.`,
  );
  return 1;
}

/** Turn a report into a summary line and an exit code. */
function summarize(report) {
  const { numTotalTests, numPassedTests, numFailedTests, success } = report;
  console.log(
    `\nMaterial catalog: ${numPassedTests}/${numTotalTests} passed, ${numFailedTests} failed.`,
  );

  // An empty run is a failure: a broken include glob must not look green.
  if (numTotalTests === 0) {
    console.error('No tests ran.');
    return 1;
  }
  if (!success || numFailedTests > 0) {
    reportFailures(report);
    return 1;
  }
  return 0;
}

const dir = await mkdtemp(join(tmpdir(), 'ngx-json-render-material-'));
const reportPath = join(dir, 'report.json');

const child = spawn(
  'npx',
  [
    'ng',
    'test',
    'ngx-json-render-material',
    '--reporters=json',
    `--output-file=${reportPath}`,
    '--watch=false',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'], detached: true },
);

const state = { exited: null, buildFailed: false };
child.on('exit', (code, signal) => {
  state.exited = { code, signal };
});

// The builder prints this and then keeps running, so waiting for either the
// report or the process would sit out the whole timeout on a compile error.
const forward = (source, sink) => {
  source.on('data', (chunk) => {
    const text = String(chunk);
    if (text.includes('Application bundle generation failed')) {
      state.buildFailed = true;
    }
    sink.write(text);
  });
};
forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);

// Set exitCode rather than calling process.exit(): the runner is detached, so
// it has to be killed before this process goes away or it outlives the script.
try {
  process.exitCode = await run(child, reportPath, state);
} finally {
  terminate(child);
  await rm(dir, { recursive: true, force: true });
}
