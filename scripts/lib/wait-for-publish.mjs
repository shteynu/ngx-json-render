/**
 * Waiting for a version just published to npm to become installable.
 *
 * Two things lag a publish, one after the other, and both have outlasted the
 * five minutes this check used to allow:
 *
 *   - the packument (`npm view <pkg>@<version>`), which listed
 *     `ngx-json-render-material@0.3.10` only minutes after `npm publish` had
 *     succeeded, and `ngx-json-render@0.9.1` about seven minutes after;
 *   - the tarball behind it, which answered 404 for about four more minutes
 *     after the packument listed `ngx-json-render@0.8.2` and `0.9.1` alike,
 *     and an install in that window fails.
 *
 * Each time the release run went red with the package already on npm, where
 * re-running it can only fail with E403. So this waits for both, against one
 * deadline, and says which of the two never arrived.
 *
 * Kept free of npm and the network so the timing can be tested: the caller
 * passes the probe, the clock and the sleep.
 */

/**
 * The worst seen so far is 0.9.1, installable about eleven minutes after its
 * publish. Waiting long costs nothing when the publish is fine, since the
 * wait ends as soon as it is; it only delays the report of a publish that
 * really did not take.
 */
export const PUBLISH_TIMEOUT_MS = 30 * 60_000;
export const PUBLISH_POLL_MS = 15_000;

/**
 * @typedef {'missing' | 'listed' | 'ready'} PublishStage
 *   `missing`: the packument does not list the version. `listed`: it does,
 *   but its tarball is not served yet. `ready`: both.
 */

/**
 * Poll `probe` until it reports `ready` or `timeoutMs` has passed.
 *
 * @param {object} options
 * @param {() => Promise<PublishStage>} options.probe
 * @param {(ms: number) => Promise<void>} options.sleep
 * @param {() => number} options.now
 * @param {number} [options.timeoutMs]
 * @param {number} [options.intervalMs]
 * @param {(stage: PublishStage) => void} [options.onStage] called whenever
 *   the stage changes, the first probe included, so a log shows progress
 *   without a line per poll.
 * @returns {Promise<{ stage: PublishStage, waitedMs: number }>} the last
 *   stage seen; anything but `ready` means the deadline passed.
 */
export async function waitForPublish({
  probe,
  sleep,
  now,
  timeoutMs = PUBLISH_TIMEOUT_MS,
  intervalMs = PUBLISH_POLL_MS,
  onStage = () => {},
}) {
  const start = now();
  let last;
  for (;;) {
    const stage = await probe();
    if (stage !== last) onStage(stage);
    last = stage;
    const waitedMs = now() - start;
    if (stage === 'ready' || waitedMs >= timeoutMs) {
      return { stage, waitedMs };
    }
    await sleep(Math.min(intervalMs, timeoutMs - waitedMs));
  }
}
