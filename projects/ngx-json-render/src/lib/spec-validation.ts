import type { Spec } from '@json-render/core';
import { autoFixSpec, validateSpec } from '@json-render/core';
import type {
  RenderLimits,
  SpecCatalog,
  SpecCheckIssue,
} from './render-limits';
import {
  analyseSpecGraph,
  catalogIssues,
  cycleIssue,
  depthIssue,
  elementCountIssue,
} from './render-limits';

/**
 * How much a spec has to be trusted.
 *
 * - `off` — render whatever arrives. The default, and what every version
 *   before this one did.
 * - `warn` — check the spec, apply the lossless fixes, report what is left,
 *   render it anyway.
 * - `strict` — the same check, but an error means the spec does not render.
 *
 * This governs *reporting* and strict refusal. {@link RenderLimits} are a
 * separate axis: a limit the app set is enforced in every mode, including
 * `off`.
 */
export type SpecValidationMode = 'off' | 'warn' | 'strict';

/** Everything {@link checkSpec} needs beyond the spec and the mode. */
export interface SpecCheckOptions {
  /** Caps on the spec's size, enforced whatever the mode. */
  readonly limits?: RenderLimits | null;
  /**
   * The catalog the spec was generated for. Given one, the check also reports
   * component types the catalog does not define and props its own schema
   * rejects — the half of "is this spec renderable" that structure alone
   * cannot answer.
   */
  readonly catalog?: SpecCatalog | null;
}

/** What {@link checkSpec} found, and the spec that should render. */
export interface SpecCheck {
  /**
   * The spec to render: the input with lossless fixes applied, or the input
   * untouched when validation is off.
   */
  readonly spec: Spec | null;
  /** Structural, limit and catalog issues left after the fixes. */
  readonly issues: readonly SpecCheckIssue[];
  /** Descriptions of the fixes that were applied. */
  readonly fixes: readonly string[];
  /** Whether an issue of `error` severity survived. */
  readonly hasErrors: boolean;
  /**
   * Whether the spec is refused outright, in every mode, for breaching an
   * enforced limit. Distinct from {@link hasErrors}, which only stops a spec
   * under `strict`.
   */
  readonly blocked: boolean;
}

const CLEAN: SpecCheck = {
  spec: null,
  issues: [],
  fixes: [],
  hasErrors: false,
  blocked: false,
};

/**
 * Check a spec the way `validate` and `renderLimits` ask for.
 *
 * Only lossless fixes are applied — `visible`, `on` and `repeat` that a model
 * put inside `props`, which the renderer would otherwise ignore, moved back
 * where they belong. The lossy ones prune content, and core's own guidance is
 * to re-prompt rather than accept that; a renderer that silently deleted
 * elements would be the worse failure.
 *
 * Note what is *not* here: cycles are broken as the tree renders, whatever
 * this returns, because a spec that never stops rendering is a crash rather
 * than an opinion about quality. This reports them so an app can see them.
 */
export function checkSpec(
  spec: Spec | null,
  mode: SpecValidationMode,
  options: SpecCheckOptions = {},
): SpecCheck {
  if (!spec) return CLEAN;

  const limits = options.limits ?? null;
  const wantsStructure = mode !== 'off';
  // `maxRepeatItems` caps a live state array, which no amount of reading the
  // spec can predict — it is enforced as the repeat expands, not here.
  const maxElements = limits?.maxElements;
  const maxDepth = limits?.maxDepth;
  if (!wantsStructure && maxElements === undefined && maxDepth === undefined) {
    return { spec, issues: [], fixes: [], hasErrors: false, blocked: false };
  }

  // The order below is the point of this function, not an accident of it.
  //
  // Core's `validateSpec` walks the element tree by recursion, so the specs
  // that most need a limit are the ones that would overflow the stack proving
  // they exceed it. Each cheap, non-recursive cap therefore runs first and can
  // stop the expensive check from being attempted at all: count, then depth —
  // measured by a walk of our own that uses an explicit stack — and only then
  // the structural pass.
  //
  // `autoFixSpec` only relocates fields inside `props` and never touches
  // `children` or `slots`, so measuring the graph before fixing it measures
  // the same graph.

  if (maxElements !== undefined) {
    const count = Object.keys(spec.elements ?? {}).length;
    if (count > maxElements) {
      const issue = elementCountIssue(count, maxElements);
      return {
        spec,
        issues: [issue],
        fixes: [],
        hasErrors: true,
        blocked: true,
      };
    }
  }

  const issues: SpecCheckIssue[] = [];
  let tooDeep = false;
  if (wantsStructure || maxDepth !== undefined) {
    const graph = analyseSpecGraph(spec);
    if (maxDepth !== undefined && graph.depth > maxDepth) {
      tooDeep = true;
      issues.push(depthIssue(graph.depth, maxDepth));
    }
    if (wantsStructure) {
      for (const key of graph.cycles) issues.push(cycleIssue(key));
    }
  }

  // A spec past its depth cap is not handed to the recursive checks. The cap
  // is the finding worth having, and it renders truncated either way.
  const fixed =
    wantsStructure && !tooDeep
      ? autoFixSpec(spec, { lossy: false })
      : { spec, fixes: [] as string[] };
  if (wantsStructure && !tooDeep) {
    issues.push(...validateSpec(fixed.spec).issues);
    if (options.catalog) {
      issues.push(...catalogIssues(fixed.spec, options.catalog));
    }
  }

  return {
    spec: fixed.spec,
    issues,
    fixes: fixed.fixes,
    hasErrors: issues.some((issue) => issue.severity === 'error'),
    blocked: false,
  };
}

/**
 * Render issues as one indented block, errors and warnings alike.
 *
 * Core's `formatSpecIssues` drops warnings and only accepts core's own issue
 * codes, so it cannot describe what this package reports. Use this instead
 * when showing `issues()` to a developer.
 */
export function formatSpecCheckIssues(
  issues: readonly SpecCheckIssue[],
): string {
  return issues
    .map(
      (issue) =>
        `  ${issue.severity === 'error' ? 'error  ' : 'warning'} ${
          issue.elementKey ? `[${issue.elementKey}] ` : ''
        }${issue.message}`,
    )
    .join('\n');
}

/**
 * Report a check to the console: fixes as information, issues at the severity
 * the outcome gives them. A spec that will not render — refused by a limit,
 * or by `strict` — is reported as an error, because something the developer
 * asked for is now missing from the screen; one that renders anyway is a
 * warning.
 */
export function reportSpecCheck(
  check: SpecCheck,
  mode: SpecValidationMode,
): void {
  if (check.fixes.length > 0) {
    console.info(
      `[ngx-json-render] Fixed ${check.fixes.length} spec issue(s) before rendering:\n` +
        check.fixes.map((fix) => `  - ${fix}`).join('\n'),
    );
  }

  if (check.issues.length === 0) return;

  const report = `[ngx-json-render] Spec validation:\n${formatSpecCheckIssues(check.issues)}`;
  if (check.blocked) {
    console.error(
      `${report}\nNothing is rendered: the spec is over a renderLimits cap.`,
    );
  } else if (mode === 'strict' && check.hasErrors) {
    console.error(`${report}\nNothing is rendered: validate="strict".`);
  } else {
    console.warn(report);
  }
}
