import type { Spec, SpecIssue, UIElement } from '@json-render/core';

/**
 * Caps on what a spec is allowed to cost the browser.
 *
 * A spec is attacker-shaped input: whatever produced one chose its own size,
 * its own nesting and — through `repeat` — its own array lengths. These are
 * the three of those the renderer can enforce for you.
 *
 * Every field is opt-in and unset means unlimited. There are no defaults
 * because no single number is right for every catalog, and a default would
 * change what an existing app renders the moment it upgraded.
 *
 * Limits are enforced whenever they are set, whatever `validate` is: a number
 * the app chose is a control, not advice. What "enforced" means differs by
 * limit, because the limits differ in kind — see each field.
 *
 * @example
 * ```html
 * <json-render
 *   [spec]="spec()"
 *   [registry]="registry"
 *   [renderLimits]="{ maxElements: 500, maxDepth: 16, maxRepeatItems: 200 }"
 * />
 * ```
 */
export interface RenderLimits {
  /**
   * Most elements a spec may contain. A spec over the cap does not render at
   * all: element count is a property of the whole spec, and there is no
   * meaningful "first 500 elements" of a graph.
   */
  readonly maxElements?: number;
  /**
   * Deepest the render tree may nest, counting the root as 1. An element
   * below the cap does not render, and neither does anything under it; what
   * fits still renders. Reported as an error, so `validate="strict"` refuses
   * the spec outright rather than truncating it.
   */
  readonly maxDepth?: number;
  /**
   * Most items one `repeat` may expand. The surplus items do not render.
   *
   * Enforced at render time only: `repeat` iterates a live state array, so no
   * amount of inspecting the spec can predict how long it will be. Nested
   * repeats multiply, so this is a per-repeat cap, not a total.
   */
  readonly maxRepeatItems?: number;
}

/**
 * Issue codes this package reports, widening core's set with the ones only a
 * renderer can find.
 *
 * - `cycle` — an element renders itself against the same data, which cannot
 *   terminate. A tree that recurses into its items is not this.
 * - `too_deep` / `too_many_elements` — a {@link RenderLimits} cap was passed.
 * - `unknown_component` — a `type` the catalog does not define.
 * - `invalid_props` — the catalog's own schema rejected part of the spec.
 */
export type SpecCheckIssueCode =
  | SpecIssue['code']
  | 'cycle'
  | 'too_deep'
  | 'too_many_elements'
  | 'unknown_component'
  | 'invalid_props';

/**
 * A problem found in a spec. Core's {@link SpecIssue} widened with the codes
 * above, so a {@link SpecIssue} is always one of these.
 */
export interface SpecCheckIssue {
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly elementKey?: string;
  readonly code: SpecCheckIssueCode;
}

/**
 * The part of a json-render `Catalog` the check needs.
 *
 * Structural on purpose: a real catalog satisfies it, and the renderer stays
 * free of any dependency on the schema library behind `validate`.
 */
export interface SpecCatalog {
  /** Component type names the catalog defines. */
  readonly componentNames: readonly string[];
  /** Check a spec against the catalog's own schema. */
  validate(spec: unknown): {
    readonly success: boolean;
    readonly error?: unknown;
  };
}

/** What one walk of the element graph found. */
export interface SpecGraph {
  /** Nesting depth from `spec.root`, counting the root as 1. */
  readonly depth: number;
  /**
   * Keys that close a cycle which cannot terminate. A back edge that
   * descends into repeat items is not one of these.
   */
  readonly cycles: readonly string[];
}

/**
 * A hostile spec can fail the catalog's schema in as many places as it has
 * properties. Report enough to act on and stop; the spec is refused either
 * way, and a console full of them helps nobody.
 */
const MAX_REPORTED_PROP_ISSUES = 20;

/**
 * Whether this element's `repeat` descends into the item it is already inside,
 * rather than re-reading a fixed path in state.
 *
 * A relative statePath — `{"$item": "children"}` — resolves against the
 * enclosing item, so each pass reads one level further into the data and the
 * recursion ends where the data does. A plain string is absolute: every pass
 * reads the same array, and a spec that re-enters itself through one never
 * terminates.
 */
function descendsIntoItems(element: UIElement): boolean {
  const repeat = element.repeat;
  return repeat !== undefined && typeof repeat.statePath !== 'string';
}

/** Every key an element renders below itself: `children` plus every slot. */
function childKeysOf(element: UIElement): readonly string[] {
  const slots = element.slots;
  if (!slots) return element.children ?? [];
  const fromSlots = Object.values(slots).flat();
  return element.children ? [...element.children, ...fromSlots] : fromSlots;
}

interface Frame {
  readonly key: string;
  readonly kids: readonly string[];
  next: number;
  deepest: number;
}

/**
 * Walk the element graph once for depth and cycles.
 *
 * Iterative on purpose. A recursive walk would blow the stack on exactly the
 * specs this exists to catch, which would make the guard a second way to
 * crash rather than the fix for the first.
 *
 * Depth is measured from `spec.root`, because that is what renders. Cycles
 * are swept for across every element, including the ones no parent reaches:
 * an unreachable cycle is still a defect, and one edit away from a reachable
 * one.
 *
 * Not every element that reaches itself is a defect, though. Drawing a tree —
 * a comment thread, a file browser, a nested menu — means an element that
 * repeats over a relative path and renders itself for each item, and that ends
 * when the data does. A back edge is only reported when nothing along it
 * descends into the data, which is the case that cannot end.
 *
 * `depthBelow` is memoised per element, so a shared subtree costs one visit
 * instead of one per path into it — without that, a spec whose elements each
 * name the next two is exponential to check. The memo makes the reported
 * depth a lower bound once a cycle has been cut, since which edge closes the
 * cycle depends on the order the walk reached it. The cycle is reported as an
 * error of its own, which is the finding worth acting on.
 */
export function analyseSpecGraph(spec: Spec): SpecGraph {
  const elements = spec.elements ?? {};
  const cycles = new Set<string>();
  const depthBelow = new Map<string, number>();
  const onPath = new Set<string>();

  const walkFrom = (start: string): void => {
    const first = elements[start];
    if (!first || depthBelow.has(start)) return;

    const stack: Frame[] = [
      { key: start, kids: childKeysOf(first), next: 0, deepest: 0 },
    ];
    onPath.add(start);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;

      if (frame.next < frame.kids.length) {
        const childKey = frame.kids[frame.next++]!;
        const memo = depthBelow.get(childKey);
        if (memo !== undefined) {
          frame.deepest = Math.max(frame.deepest, memo);
          continue;
        }
        // A child that closes the cycle is not followed — that is what keeps
        // this walk finite — and not counted towards depth either.
        if (onPath.has(childKey)) {
          const from = stack.findIndex((frame) => frame.key === childKey);
          const descends = stack
            .slice(from)
            .some((frame) => descendsIntoItems(elements[frame.key]!));
          if (!descends) cycles.add(childKey);
          continue;
        }
        const child = elements[childKey];
        // A child the spec never defined is validateSpec's finding, not ours.
        if (!child) continue;
        onPath.add(childKey);
        stack.push({
          key: childKey,
          kids: childKeysOf(child),
          next: 0,
          deepest: 0,
        });
        continue;
      }

      stack.pop();
      onPath.delete(frame.key);
      const depth = frame.deepest + 1;
      depthBelow.set(frame.key, depth);
      const parent = stack[stack.length - 1];
      if (parent) parent.deepest = Math.max(parent.deepest, depth);
    }
  };

  if (spec.root) walkFrom(spec.root);
  const depth = (spec.root ? depthBelow.get(spec.root) : undefined) ?? 0;

  for (const key of Object.keys(elements)) walkFrom(key);

  return { depth, cycles: [...cycles] };
}

/** Report a cycle, naming the element that is its own descendant. */
export function cycleIssue(key: string): SpecCheckIssue {
  return {
    severity: 'error',
    code: 'cycle',
    elementKey: key,
    message: `Element "${key}" renders itself against the same data, which never terminates. The cycle is broken where it closes — the repeated element does not render a second time — but the spec cannot be drawn as written. A tree that recurses needs a repeat with a relative statePath, like {"$item": "children"}.`,
  };
}

/** Report a breached element-count cap. */
export function elementCountIssue(
  count: number,
  limit: number,
): SpecCheckIssue {
  return {
    severity: 'error',
    code: 'too_many_elements',
    message: `Spec has ${count} elements, over the limit of ${limit}. Nothing is rendered: renderLimits.maxElements is a cap on the whole spec.`,
  };
}

/** Report a breached depth cap. */
export function depthIssue(depth: number, limit: number): SpecCheckIssue {
  return {
    severity: 'error',
    code: 'too_deep',
    message: `Spec nests ${depth} levels deep, over the limit of ${limit}. Elements below level ${limit} do not render.`,
  };
}

/**
 * Check a spec against a catalog: the component types it names, and then the
 * catalog's own schema.
 *
 * The schema pass is skipped while a type is unknown. A catalog schema keys
 * its element shapes off `type`, so one name it does not recognise turns into
 * a pile of prop errors describing a component that was never the point.
 */
export function catalogIssues(
  spec: Spec,
  catalog: SpecCatalog,
): SpecCheckIssue[] {
  const issues: SpecCheckIssue[] = [];
  const known = new Set(catalog.componentNames);

  for (const [key, element] of Object.entries(spec.elements ?? {})) {
    if (known.has(element.type)) continue;
    issues.push({
      severity: 'error',
      code: 'unknown_component',
      elementKey: key,
      message: `Element "${key}" has type "${element.type}", which this catalog does not define. Nothing renders for it.`,
    });
  }
  if (issues.length > 0) return issues;

  const result = catalog.validate(spec);
  if (result.success) return issues;
  return propIssues(result.error);
}

/**
 * Turn whatever the catalog's schema reported into issues.
 *
 * Read defensively rather than typed against the schema library: the shape
 * below (`issues`, each with `path` and `message`) is what every version of
 * it has produced, and a renderer that threw while explaining a bad spec
 * would be the worse failure.
 */
function propIssues(error: unknown): SpecCheckIssue[] {
  const raw = (error as { issues?: unknown } | null | undefined)?.issues;
  if (!Array.isArray(raw)) return [];

  return raw.slice(0, MAX_REPORTED_PROP_ISSUES).map((entry): SpecCheckIssue => {
    const item = entry as { path?: unknown; message?: unknown };
    const path = Array.isArray(item.path) ? (item.path as unknown[]) : [];
    const message =
      typeof item.message === 'string' ? item.message : 'is not valid';
    // Paths are rooted at the spec, so `elements.<key>.props.<prop>` names the
    // element in its second segment.
    const elementKey =
      path[0] === 'elements' && typeof path[1] === 'string'
        ? path[1]
        : undefined;
    const where = path.length > 0 ? path.join('.') : 'spec';
    return {
      severity: 'error',
      code: 'invalid_props',
      ...(elementKey === undefined ? {} : { elementKey }),
      message: `${where}: ${message}`,
    };
  });
}
