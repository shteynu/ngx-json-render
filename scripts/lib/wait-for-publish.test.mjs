/**
 * The timings are the ones this repository's releases actually hit.
 *
 * Run with `npm run test:scripts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PUBLISH_POLL_MS,
  PUBLISH_TIMEOUT_MS,
  waitForPublish,
} from './wait-for-publish.mjs';

const MINUTE = 60_000;

/**
 * A fake registry whose packument lists the version after `listedAt` ms and
 * serves its tarball after `servedAt` ms, on a fake clock that only sleeping
 * advances.
 */
function registry({ listedAt = Infinity, servedAt = Infinity }) {
  let clock = 0;
  let probes = 0;
  const stages = [];
  return {
    probes: () => probes,
    stages,
    options: {
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      probe: async () => {
        probes++;
        if (clock < listedAt) return 'missing';
        return clock < servedAt ? 'listed' : 'ready';
      },
      onStage: (stage) => stages.push(stage),
    },
  };
}

describe('waitForPublish', () => {
  it('returns at once when the version is already installable', async () => {
    const npm = registry({ listedAt: 0, servedAt: 0 });

    const result = await waitForPublish(npm.options);

    assert.deepEqual(result, { stage: 'ready', waitedMs: 0 });
    assert.equal(npm.probes(), 1);
  });

  it('outlasts the 0.9.1 release: listed after ~7 min, tarball after ~11', async () => {
    // `npm publish` finished at 21:11:25Z; npm recorded the version at
    // 21:18:20Z and served its tarball from about 21:22. The old check gave
    // up at 300 s.
    const npm = registry({ listedAt: 7 * MINUTE, servedAt: 11 * MINUTE });

    const result = await waitForPublish(npm.options);

    assert.equal(result.stage, 'ready');
    assert.ok(result.waitedMs >= 11 * MINUTE);
    assert.ok(result.waitedMs < 11 * MINUTE + PUBLISH_POLL_MS);
    assert.deepEqual(npm.stages, ['missing', 'listed', 'ready']);
  });

  it('waits for the tarball, not just the packument (the 0.8.2 release)', async () => {
    const npm = registry({ listedAt: 0, servedAt: 4 * MINUTE });

    const result = await waitForPublish(npm.options);

    assert.equal(result.stage, 'ready');
    assert.deepEqual(npm.stages, ['listed', 'ready']);
  });

  it('says the version was never listed when the publish did not take', async () => {
    const npm = registry({});

    const result = await waitForPublish(npm.options);

    assert.deepEqual(result, {
      stage: 'missing',
      waitedMs: PUBLISH_TIMEOUT_MS,
    });
    assert.deepEqual(npm.stages, ['missing']);
  });

  it('says the tarball never arrived when only the packument did', async () => {
    const npm = registry({ listedAt: MINUTE });

    const result = await waitForPublish(npm.options);

    assert.equal(result.stage, 'listed');
    assert.equal(result.waitedMs, PUBLISH_TIMEOUT_MS);
  });

  it('never sleeps past the deadline', async () => {
    const npm = registry({});

    const result = await waitForPublish({
      ...npm.options,
      timeoutMs: 20_000,
      intervalMs: 15_000,
    });

    assert.equal(result.waitedMs, 20_000);
    assert.equal(npm.probes(), 3);
  });
});
