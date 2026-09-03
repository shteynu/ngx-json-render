/**
 * The cases here are not invented: each one is a release this repository has
 * actually performed, and two of them are the ones the old decision got wrong.
 *
 * Run with `npm run test:scripts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyPairResolution,
  repairsDowngrade,
} from './resolution-verdict.mjs';

const RENDERER = 'ngx-json-render';

/** The catalog as a sibling of the renderer. */
const catalog = ({ declared, onNpm, peerOnReleased }) => ({
  name: 'ngx-json-render-material',
  declared,
  onNpm,
  peerOnReleased,
});

describe('classifyPairResolution', () => {
  it('warns instead of failing when the sibling that repairs it is in this commit', () => {
    // The v0.4.0 release. The renderer published fine, but the catalog on npm
    // was still 0.3.0 with a `^0.3.0` peer, so npm satisfied that by choosing
    // the renderer 0.3.0. This was called fatal, and the release was correct:
    // the catalog carrying `^0.4.0` was in the very same commit, one tag away.
    const verdict = classifyPairResolution({
      target: '0.4.0',
      resolvedReleased: '0.3.0',
      dependent: false,
      siblings: [
        catalog({
          declared: '0.3.1',
          onNpm: '0.3.0',
          peerOnReleased: '^0.4.0',
        }),
      ],
    });

    assert.deepEqual(verdict, { level: 'warn', reason: 'lockstep-pending' });
  });

  it('fails when the downgrade is real and nothing pending repairs it', () => {
    // The protection that must survive: the catalog on disk carries the same
    // stale range as the one on npm, so releasing it would change nothing and
    // the pair stays broken however long you wait.
    const verdict = classifyPairResolution({
      target: '0.4.0',
      resolvedReleased: '0.3.0',
      dependent: false,
      siblings: [
        catalog({
          declared: '0.3.1',
          onNpm: '0.3.0',
          peerOnReleased: '^0.3.0',
        }),
      ],
    });

    assert.deepEqual(verdict, {
      level: 'fatal',
      reason: 'downgraded-unrepaired',
    });
  });

  it('fails a downgrade when the sibling is not moving at all', () => {
    const verdict = classifyPairResolution({
      target: '0.4.0',
      resolvedReleased: '0.3.0',
      dependent: false,
      siblings: [
        catalog({
          declared: '0.3.0',
          onNpm: '0.3.0',
          peerOnReleased: '^0.4.0',
        }),
      ],
    });

    assert.equal(verdict.level, 'fatal');
  });

  it('never excuses a downgrade for the package that ships second', () => {
    // Once the dependent half is out there is nothing left to wait for, so the
    // pending branch must not apply to it however repairable it looks.
    const verdict = classifyPairResolution({
      target: '0.3.1',
      resolvedReleased: '0.3.0',
      dependent: true,
      siblings: [
        {
          name: RENDERER,
          declared: '0.4.0',
          onNpm: '0.3.0',
          peerOnReleased: undefined,
        },
      ],
    });

    assert.equal(verdict.level, 'fatal');
  });

  it('passes the release that completes the lockstep', () => {
    // material-v0.3.1: the catalog shipped second, both halves current.
    const verdict = classifyPairResolution({
      target: '0.3.1',
      resolvedReleased: '0.3.1',
      dependent: true,
      siblings: [
        {
          name: RENDERER,
          declared: '0.4.0',
          onNpm: '0.4.0',
          peerOnReleased: undefined,
        },
      ],
    });

    assert.deepEqual(verdict, { level: 'ok', reason: 'coherent' });
  });

  it('fails when the dependent package shipped and the pair is still incoherent', () => {
    // material-v0.3.0: the catalog went out while the renderer on npm was
    // still 0.2.1. Correctly red — the half that fixes the pair had run.
    const verdict = classifyPairResolution({
      target: '0.3.0',
      resolvedReleased: '0.3.0',
      dependent: true,
      siblings: [
        {
          name: RENDERER,
          declared: '0.3.0',
          onNpm: '0.2.1',
          peerOnReleased: undefined,
        },
      ],
    });

    assert.deepEqual(verdict, {
      level: 'fatal',
      reason: 'dependent-incoherent',
    });
  });

  it('warns when the released package is fine but a sibling is behind', () => {
    const verdict = classifyPairResolution({
      target: '0.4.0',
      resolvedReleased: '0.4.0',
      dependent: false,
      siblings: [
        catalog({
          declared: '0.3.1',
          onNpm: '0.3.0',
          peerOnReleased: '^0.4.0',
        }),
      ],
    });

    assert.deepEqual(verdict, { level: 'warn', reason: 'siblings-behind' });
  });

  it('treats a sibling missing from the registry as behind', () => {
    const verdict = classifyPairResolution({
      target: '0.4.0',
      resolvedReleased: '0.4.0',
      dependent: false,
      siblings: [
        catalog({ declared: '0.3.1', onNpm: null, peerOnReleased: '^0.4.0' }),
      ],
    });

    assert.equal(verdict.level, 'warn');
  });
});

describe('repairsDowngrade', () => {
  it('accepts a sibling ahead of npm whose new range admits the release', () => {
    assert.equal(
      repairsDowngrade(
        catalog({
          declared: '0.3.1',
          onNpm: '0.3.0',
          peerOnReleased: '^0.4.0',
        }),
        '0.4.0',
      ),
      true,
    );
  });

  it('rejects a sibling that is not ahead of what npm already serves', () => {
    assert.equal(
      repairsDowngrade(
        catalog({
          declared: '0.3.0',
          onNpm: '0.3.0',
          peerOnReleased: '^0.4.0',
        }),
        '0.4.0',
      ),
      false,
    );
  });

  it('rejects a sibling whose range still excludes the release', () => {
    // A 0.x caret stops below the next minor, which is the whole reason the
    // lockstep exists.
    assert.equal(
      repairsDowngrade(
        catalog({
          declared: '0.3.1',
          onNpm: '0.3.0',
          peerOnReleased: '^0.3.0',
        }),
        '0.4.0',
      ),
      false,
    );
  });

  it('rejects a sibling that declares no peer on the released package', () => {
    // It cannot have caused the downgrade, so it cannot repair it either.
    assert.equal(
      repairsDowngrade(
        catalog({
          declared: '0.3.1',
          onNpm: '0.3.0',
          peerOnReleased: undefined,
        }),
        '0.4.0',
      ),
      false,
    );
  });

  it('accepts a sibling that is not on the registry at all yet', () => {
    assert.equal(
      repairsDowngrade(
        catalog({ declared: '0.1.0', onNpm: null, peerOnReleased: '^0.4.0' }),
        '0.4.0',
      ),
      true,
    );
  });
});
