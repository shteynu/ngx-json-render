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
   *
   * A capped element does not act either — its `watch` stays unwired, so it
   * cannot dispatch actions from behind the cap.
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
 * - `invalid_props` — an element's props fail its component's schema, or the
 *   element fails the catalog's spec schema: a missing `children`, say.
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
  /**
   * The definitions the catalog was created from. Where
   * `data.components[type].props` is a schema — anything with a `safeParse`,
   * as a Zod schema has — each element's props are checked against its own
   * component's. Without it, props are checked only as far as `validate`
   * checks them, which for a catalog of more than one component is not at
   * all.
   *
   * `unknown` rather than that shape, so that a `Catalog` whose generic
   * arguments were left off — and whose `data` is therefore `unknown` — still
   * fits.
   */
  readonly data?: unknown;
}

/** The part of a props schema the check calls: what a Zod schema has. */
interface PropsSchema {
  safeParse(value: unknown): {
    readonly success: boolean;
    readonly error?: unknown;
  };
}

/** One complaint from a schema, at a path into the value it was given. */
interface SchemaIssue {
  readonly path: readonly unknown[];
  readonly message: string;
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
 * Check a spec against a catalog: the component types it names, then the
 * catalog's spec schema, then each element's props against its own
 * component's schema.
 *
 * The props need that pass of their own. Core builds one schema for the whole
 * spec, and it gives an element's props a component's schema only when the
 * catalog has exactly one component; with more, every element's props are an
 * open record, whatever its `type`. So `catalog.validate` holds an element to
 * its shape — `children`, a `type` from the catalog — and not to its props.
 *
 * Whatever that schema did say about the props of an element checked here is
 * dropped: with a one-component catalog it would be reported twice, and it
 * judges expressions this pass knows to leave alone.
 *
 * The schema passes are skipped while a type is unknown. That is an error on
 * its own, and the spec schema would only restate it as a `type` outside the
 * ones it accepts.
 */
export function catalogIssues(
  spec: Spec,
  catalog: SpecCatalog,
): SpecCheckIssue[] {
  const elements = Object.entries(spec.elements ?? {});
  const known = new Set(catalog.componentNames);

  const unknown: SpecCheckIssue[] = [];
  for (const [key, element] of elements) {
    if (known.has(element.type)) continue;
    unknown.push({
      severity: 'error',
      code: 'unknown_component',
      elementKey: key,
      message: `Element "${key}" has type "${element.type}", which this catalog does not define. Nothing renders for it.`,
    });
  }
  if (unknown.length > 0) return unknown;

  const schemas = new Map<string, PropsSchema>();
  for (const [key, element] of elements) {
    const schema = propsSchemaOf(catalog.data, element.type);
    if (schema) schemas.set(key, schema);
  }

  const found = specSchemaIssues(spec, catalog).filter(
    ({ path }) =>
      !(
        path[0] === 'elements' &&
        typeof path[1] === 'string' &&
        schemas.has(path[1]) &&
        path[2] === 'props'
      ),
  );
  for (const [key, element] of elements) {
    const room = MAX_REPORTED_PROP_ISSUES - found.length;
    if (room <= 0) break;
    const schema = schemas.get(key);
    if (schema) found.push(...propsIssues(key, element, schema, room));
  }

  return found.slice(0, MAX_REPORTED_PROP_ISSUES).map(toSpecCheckIssue);
}

/**
 * The props schema a catalog declares for a component type, if it declares
 * one that can be called.
 */
function propsSchemaOf(data: unknown, type: string): PropsSchema | undefined {
  const components = (data as { components?: unknown } | null | undefined)
    ?.components;
  if (
    typeof components !== 'object' ||
    components === null ||
    !Object.hasOwn(components, type)
  ) {
    return undefined;
  }
  const props = (
    components as Record<string, { props?: unknown } | null | undefined>
  )[type]?.props;
  return typeof (props as Partial<PropsSchema> | null | undefined)
    ?.safeParse === 'function'
    ? (props as PropsSchema)
    : undefined;
}

/** What the catalog's spec schema reported, with paths rooted at the spec. */
function specSchemaIssues(spec: Spec, catalog: SpecCatalog): SchemaIssue[] {
  try {
    const result = catalog.validate(spec);
    return result.success ? [] : readIssues(result.error);
  } catch (error) {
    return [{ path: [], message: threwMessage('the catalog schema', error) }];
  }
}

/**
 * What an element's component schema says about its props, leaving out what
 * it says about expressions, with paths rooted at the spec.
 *
 * A schema that throws counts as a rejection, not a crash. Real ones do:
 * `ValidationConfigSchema`, which every Material input's `validation` prop
 * uses, recurses through `enabled` and overflows the stack a thousand
 * `$and`s deep.
 */
function propsIssues(
  key: string,
  element: UIElement,
  schema: PropsSchema,
  room: number,
): SchemaIssue[] {
  const at = ['elements', key, 'props'];
  let result: ReturnType<PropsSchema['safeParse']>;
  try {
    result = schema.safeParse(element.props);
  } catch (error) {
    return [
      {
        path: at,
        message: threwMessage(`the "${element.type}" schema`, error),
      },
    ];
  }
  if (result.success) return [];

  const issues: SchemaIssue[] = [];
  for (const { path, message } of readIssues(result.error)) {
    if (issues.length >= room) break;
    if (reachesExpression(element.props, path)) continue;
    issues.push({ path: [...at, ...path], message });
  }
  return issues;
}

/**
 * Whether a props issue is about an expression: it sits on one, inside one,
 * or on a value holding one.
 *
 * `{"$state": "/title"}` where the schema wants a string is not a defect.
 * Core resolves every such value before the component sees it, so the schema
 * would be judging something that never renders. Any `$`-prefixed key counts
 * — directive names must start with `$`, and so would an expression added to
 * core later. A value merely holding one is left alone too, since a union or
 * a refinement over it ran on the unresolved value.
 *
 * The props object itself is not an expression: core resolves the values
 * inside it, never the object.
 */
function reachesExpression(props: unknown, path: readonly unknown[]): boolean {
  let value = props;
  for (const segment of path) {
    if (typeof value !== 'object' || value === null) return false;
    value = (value as Record<PropertyKey, unknown>)[segment as PropertyKey];
    if (isExpression(value)) return true;
  }
  return holdsExpression(value);
}

/** A value core resolves at render time — or will, once it knows the key. */
function isExpression(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).some((key) => key.startsWith('$'))
  );
}

/**
 * Whether anything nested inside `value` is an expression.
 *
 * Iterative, and it remembers what it has seen, for the same reason as
 * {@link analyseSpecGraph}: props are as attacker-shaped as the rest of the
 * spec, and a check that overflowed or looped on them would be a second way
 * to crash.
 */
function holdsExpression(value: unknown): boolean {
  const pending: unknown[] = [value];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current !== 'object' || current === null) continue;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const child of Object.values(current)) {
      if (isExpression(child)) return true;
      pending.push(child);
    }
  }
  return false;
}

/**
 * Read what a schema reported.
 *
 * Read defensively rather than typed against the schema library: the shape
 * below (`issues`, each with `path` and `message`) is what every version of
 * it has produced, and a renderer that threw while explaining a bad spec
 * would be the worse failure.
 */
function readIssues(error: unknown): SchemaIssue[] {
  const raw = (error as { issues?: unknown } | null | undefined)?.issues;
  if (!Array.isArray(raw)) return [];

  return raw.map((entry): SchemaIssue => {
    const item = entry as { path?: unknown; message?: unknown } | null;
    const path = item?.path;
    const message = item?.message;
    return {
      path: Array.isArray(path) ? path : [],
      message: typeof message === 'string' ? message : 'is not valid',
    };
  });
}

function threwMessage(schema: string, error: unknown): string {
  const reason =
    error instanceof Error ? ` (${error.name}: ${error.message})` : '';
  return `${schema} threw instead of answering${reason}, so this counts as rejected`;
}

function toSpecCheckIssue({ path, message }: SchemaIssue): SpecCheckIssue {
  // Paths are rooted at the spec, so `elements.<key>.props.<prop>` names the
  // element in its second segment.
  const elementKey =
    path[0] === 'elements' && typeof path[1] === 'string' ? path[1] : undefined;
  const where = path.length > 0 ? path.map(String).join('.') : 'spec';
  return {
    severity: 'error',
    code: 'invalid_props',
    ...(elementKey === undefined ? {} : { elementKey }),
    message: `${where}: ${message}`,
  };
}
