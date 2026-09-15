import {
  type DirectiveRegistry,
  type UIElement,
  resolveRepeatStatePath,
} from '@json-render/core';

/**
 * The state paths an element's expressions can read, or `null` when that
 * can't be known from the spec.
 *
 * Worked out from the spec alone, before anything resolves, so that an element
 * can depend on those paths rather than on the whole state. The answer may
 * name more paths than a given resolution reads — both branches of a `$cond`,
 * say — but never fewer: a path left out would be a write the element misses,
 * and it would keep showing the old value with nothing in the console.
 *
 * `null` is the safe answer, and it is given whenever the spec holds something
 * this reader does not model:
 *
 * - a registered directive, whose `resolve` receives the whole context and may
 *   read any path at all;
 * - a `$bindState` or `$bindItem` prop — the renderer keeps two-way bound
 *   elements resolving on every write, see `JrElement.resolvedElement`;
 * - a `$`-prefixed key it doesn't recognise, which is what an expression added
 *   to core after this was written would look like;
 * - a read of the whole state (`''` or `'/'`), and a condition it can't parse.
 *
 * The walk mirrors core's `resolvePropValue` and `evaluateVisibility`, in the
 * same order, because the order decides which expression an object is.
 */
export function collectStateReads(
  element: UIElement,
  directives: DirectiveRegistry | undefined,
  repeatBasePath: string | undefined,
): ReadonlySet<string> | null {
  const reader = new StateReader(directives, repeatBasePath);
  const understood =
    reader.condition(element.visible) &&
    Object.values(element.props ?? {}).every((value) => reader.value(value));
  return understood ? reader.paths : null;
}

type Expression = Record<string, unknown>;

function isObject(value: unknown): value is Expression {
  return typeof value === 'object' && value !== null;
}

/** Comparison operators a single condition may carry, as core reads them. */
const COMPARISONS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;

class StateReader {
  readonly paths = new Set<string>();

  constructor(
    private readonly directives: DirectiveRegistry | undefined,
    private readonly repeatBasePath: string | undefined,
  ) {}

  /** A prop value. Returns false when it can read state this can't name. */
  value(value: unknown): boolean {
    if (!isObject(value)) return true;

    if (typeof value['$state'] === 'string') return this.state(value['$state']);
    if (typeof value['$item'] === 'string') return this.item(value['$item']);
    if ('$index' in value && value['$index'] === true) return true;
    if (typeof value['$bindState'] === 'string') return false;
    if (typeof value['$bindItem'] === 'string') return false;
    if ('$cond' in value && '$then' in value && '$else' in value) {
      return (
        this.condition(value['$cond']) &&
        this.value(value['$then']) &&
        this.value(value['$else'])
      );
    }
    if (typeof value['$computed'] === 'string') {
      // The function is handed its resolved arguments and nothing else.
      const args = value['args'];
      return (
        !args || Object.values(Object(args)).every((arg) => this.value(arg))
      );
    }
    if (typeof value['$template'] === 'string') {
      return this.template(value['$template']);
    }

    if (Array.isArray(value)) return value.every((item) => this.value(item));

    if (this.directives) {
      for (const name of this.directives.keys()) {
        if (name in value) return false;
      }
    }
    for (const [key, entry] of Object.entries(value)) {
      if (key.startsWith('$') || !this.value(entry)) return false;
    }
    return true;
  }

  /** A `visible` condition, or the condition of a `$cond`. */
  condition(condition: unknown): boolean {
    if (condition === undefined || typeof condition === 'boolean') return true;
    if (Array.isArray(condition)) {
      return condition.every((single) => this.singleCondition(single));
    }
    if (!isObject(condition)) return false;
    for (const group of ['$and', '$or'] as const) {
      if (group in condition) {
        const children = condition[group];
        return (
          Array.isArray(children) &&
          children.every((child) => this.condition(child))
        );
      }
    }
    return this.singleCondition(condition);
  }

  private singleCondition(condition: unknown): boolean {
    if (!isObject(condition)) return false;
    let understood: boolean;
    if ('$index' in condition) {
      understood = true;
    } else if ('$item' in condition) {
      const item = condition['$item'];
      understood = typeof item === 'string' && this.item(item);
    } else {
      // Core reads `$state` here without checking it: anything but a string
      // path reads the whole state.
      const path = condition['$state'];
      understood = typeof path === 'string' && this.state(path);
    }
    // Core looks only at the first operator present. Reading all of them is
    // a superset of that.
    for (const operator of COMPARISONS) {
      const operand = condition[operator];
      if (isObject(operand) && typeof operand['$state'] === 'string') {
        understood = this.state(operand['$state']) && understood;
      }
    }
    return understood;
  }

  private template(template: string): boolean {
    for (const [, placeholder] of template.matchAll(/\$\{([^}]+)\}/g)) {
      if (placeholder.startsWith('/')) {
        if (!this.state(placeholder)) return false;
        continue;
      }
      // Core tries the repeat item first and falls back to a state path of
      // the same name when the item has nothing there.
      if (!this.item(placeholder) || !this.state(`/${placeholder}`)) {
        return false;
      }
    }
    return true;
  }

  private state(path: string): boolean {
    if (path === '' || path === '/') return false;
    this.paths.add(path);
    return true;
  }

  /**
   * A read of the repeat item, as the state path it sits at. The item value
   * reaches the element on its own, but only as the same object when an
   * external store edits it in place, so the path is what notices the edit.
   */
  private item(itemPath: string): boolean {
    if (this.repeatBasePath === undefined) return true;
    const path = resolveRepeatStatePath(
      { $item: itemPath },
      this.repeatBasePath,
    );
    return path !== undefined && this.state(path);
  }
}
