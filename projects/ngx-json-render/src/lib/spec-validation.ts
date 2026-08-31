import type { Spec, SpecIssue } from '@json-render/core';
import { autoFixSpec, formatSpecIssues, validateSpec } from '@json-render/core';

/**
 * How much a spec has to be trusted.
 *
 * - `off` — render whatever arrives. The default, and what every version
 *   before this one did.
 * - `warn` — check the spec, apply the lossless fixes, report what is left,
 *   render it anyway.
 * - `strict` — the same check, but an error means the spec does not render.
 */
export type SpecValidationMode = 'off' | 'warn' | 'strict';

/** What {@link checkSpec} found, and the spec that should render. */
export interface SpecCheck {
  /**
   * The spec to render: the input with lossless fixes applied, or the input
   * untouched when validation is off.
   */
  readonly spec: Spec | null;
  /** Structural issues left after the fixes. */
  readonly issues: readonly SpecIssue[];
  /** Descriptions of the fixes that were applied. */
  readonly fixes: readonly string[];
  /** Whether an issue of `error` severity survived. */
  readonly hasErrors: boolean;
}

const CLEAN: SpecCheck = {
  spec: null,
  issues: [],
  fixes: [],
  hasErrors: false,
};

/**
 * Check a spec the way `validate` asks for.
 *
 * Only lossless fixes are applied — `visible`, `on` and `repeat` that a model
 * put inside `props`, which the renderer would otherwise ignore, moved back
 * where they belong. The lossy ones prune content, and core's own guidance is
 * to re-prompt rather than accept that; a renderer that silently deleted
 * elements would be the worse failure.
 */
export function checkSpec(
  spec: Spec | null,
  mode: SpecValidationMode,
): SpecCheck {
  if (!spec) return CLEAN;
  if (mode === 'off') {
    return { spec, issues: [], fixes: [], hasErrors: false };
  }

  const fixed = autoFixSpec(spec, { lossy: false });
  const { issues } = validateSpec(fixed.spec);
  return {
    spec: fixed.spec,
    issues,
    fixes: fixed.fixes,
    hasErrors: issues.some((issue) => issue.severity === 'error'),
  };
}

/**
 * Report a check to the console: fixes as information, issues at the severity
 * the mode gives them. `strict` refuses to render, so its errors are reported
 * as errors; under `warn` the spec still renders and the same finding is a
 * warning.
 */
export function reportSpecCheck(
  check: SpecCheck,
  mode: SpecValidationMode,
): void {
  if (mode === 'off') return;

  if (check.fixes.length > 0) {
    console.info(
      `[ngx-json-render] Fixed ${check.fixes.length} spec issue(s) before rendering:\n` +
        check.fixes.map((fix) => `  - ${fix}`).join('\n'),
    );
  }

  if (check.issues.length === 0) return;

  const report = `[ngx-json-render] Spec validation:\n${formatSpecIssues([...check.issues])}`;
  if (mode === 'strict' && check.hasErrors) {
    console.error(`${report}\nNothing is rendered: validate="strict".`);
  } else {
    console.warn(report);
  }
}
