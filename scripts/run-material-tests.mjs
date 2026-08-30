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
 *
 * Coverage thresholds are checked here for the same reason. The builder
 * enforces its own `coverageThresholds`, but only at the end of a run this
 * script never lets finish, so the check would be killed before it happened.
 * The thresholds are still read from angular.json rather than restated here,
 * so all three projects declare them in one place.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** How long to wait for the report before giving up. */
const TIMEOUT_MS = Number(process.env['MATERIAL_TEST_TIMEOUT_MS'] ?? 600_000);
/** How often to look for it. */
const POLL_MS = 500;
/** How long to wait for coverage once the tests themselves have reported. */
const COVERAGE_TIMEOUT_MS = 60_000;

/** Where the builder puts a project's coverage, by convention. */
const COVERAGE_SUMMARY =
  'coverage/ngx-json-render-material/coverage-summary.json';

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

/** The thresholds this project declares in angular.json. */
async function readThresholds() {
  const workspace = JSON.parse(await readFile('angular.json', 'utf8'));
  return (
    workspace.projects['ngx-json-render-material'].architect.test.options
      ?.coverageThresholds ?? {}
  );
}

/** Read the coverage summary once it is present and completely written. */
async function readCoverage() {
  try {
    const raw = await readFile(COVERAGE_SUMMARY, 'utf8');
    if (!raw.trim()) return null;
    const summary = JSON.parse(raw);
    return summary.total?.statements ? summary.total : null;
  } catch {
    return null;
  }
}

/** Compare the run's coverage against the thresholds. Returns an exit code. */
async function checkCoverage() {
  const deadline = Date.now() + COVERAGE_TIMEOUT_MS;
  let total = null;
  while (!total && Date.now() < deadline) {
    total = await readCoverage();
    if (!total) await sleep(POLL_MS);
  }

  if (!total) {
    console.error(`\nNo coverage summary at ${COVERAGE_SUMMARY}.`);
    return 1;
  }

  const thresholds = await readThresholds();
  const failures = [];
  for (const [metric, min] of Object.entries(thresholds)) {
    const pct = total[metric]?.pct;
    // `perFile` is a flag rather than a percentage; skip anything unmeasured.
    if (typeof pct !== 'number' || typeof min !== 'number') continue;
    if (pct < min) failures.push(`${metric} ${pct}% < ${min}%`);
  }

  if (failures.length > 0) {
    console.error('\nCoverage below threshold:');
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    return 1;
  }

  console.log(
    `Coverage: ${total.statements.pct}% statements, ${total.branches.pct}% branches.`,
  );
  return 0;
}

// A stale summary from an earlier run would be read as this run's result.
await rm('coverage/ngx-json-render-material', {
  recursive: true,
  force: true,
});

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
    '--coverage',
    '--coverage-reporters=json-summary',
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
  const testCode = await run(child, reportPath, state);
  // Only judge coverage on a green suite: a failing run's numbers say more
  // about which tests died than about what the catalog covers.
  process.exitCode = testCode === 0 ? await checkCoverage() : testCode;
} finally {
  terminate(child);
  await rm(dir, { recursive: true, force: true });
}
