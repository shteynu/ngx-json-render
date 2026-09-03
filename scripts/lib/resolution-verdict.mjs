/**
 * The severity decision behind `check-published-resolution.mjs`, separated
 * from the npm calls so it can be tested without a registry.
 *
 * It exists because the decision was wrong twice in a row, in opposite
 * directions, and each time the release it painted red was correct. Whichever
 * package publishes first necessarily sees an incoherent pair — its sibling on
 * npm still carries a peer range from before the release — so treating that as
 * fatal fails the lockstep by construction.
 *
 * What separates a lockstep mid-flight from a pair broken for good is not the
 * registry, it is this commit: if the sibling sitting here is ahead of npm and
 * its peer range admits the version just published, the repair exists and is
 * one tag away. If the sibling on disk is as stale as the one on npm, nothing
 * is pending and the release stays broken however long you wait.
 */
import semver from 'semver';

/**
 * @typedef {object} Sibling
 * @property {string} name
 * @property {string} declared - version this commit gives it
 * @property {string|null} onNpm - version the registry resolved it to
 * @property {string|undefined} peerOnReleased - its peer range on the released
 *   package, as this commit declares it
 */

/**
 * @typedef {object} Verdict
 * @property {'ok'|'warn'|'fatal'} level
 * @property {'coherent'|'lockstep-pending'|'downgraded-unrepaired'
 *   |'dependent-incoherent'|'siblings-behind'} reason
 */

/**
 * Whether this commit already carries the sibling that would repair a
 * downgrade: ahead of what npm serves, and admitting what was just published.
 *
 * A sibling that declares no peer on the released package cannot be what
 * dragged it down, so it cannot be what repairs it either.
 */
export function repairsDowngrade(sibling, target) {
  if (sibling.onNpm !== null && !semver.gt(sibling.declared, sibling.onNpm)) {
    return false;
  }
  return (
    sibling.peerOnReleased !== undefined &&
    semver.satisfies(target, sibling.peerOnReleased)
  );
}

/**
 * Decide how loud to be about what a together-install actually resolved.
 *
 * @param {object} input
 * @param {string} input.target - version just published
 * @param {string|null} input.resolvedReleased - what the install gave instead
 * @param {boolean} input.dependent - whether the released package is the one
 *   declaring a peer on a sibling, i.e. the half that ships second and is what
 *   makes the pair coherent again
 * @param {Sibling[]} input.siblings - every other workspace library
 * @returns {Verdict}
 */
export function classifyPairResolution({
  target,
  resolvedReleased,
  dependent,
  siblings,
}) {
  const stale = siblings.filter((s) => s.onNpm !== s.declared);

  if (resolvedReleased !== target) {
    // The dependent package ships second: by the time it is out there is
    // nothing left to wait for, so an incoherent pair here is the real thing.
    const pending =
      !dependent &&
      stale.length > 0 &&
      stale.every((s) => repairsDowngrade(s, target));
    return pending
      ? { level: 'warn', reason: 'lockstep-pending' }
      : { level: 'fatal', reason: 'downgraded-unrepaired' };
  }

  if (stale.length === 0) return { level: 'ok', reason: 'coherent' };

  return dependent
    ? { level: 'fatal', reason: 'dependent-incoherent' }
    : { level: 'warn', reason: 'siblings-behind' };
}
