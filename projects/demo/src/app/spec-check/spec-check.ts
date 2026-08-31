import { Component, computed, input } from '@angular/core';
import { validateSpec } from '@json-render/core';
import type { Spec } from 'ngx-json-render';

/** One problem with a spec, ready to display. */
export interface Issue {
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly elementKey?: string;
}

/**
 * What is wrong with a spec: the structural checks `@json-render/core` ships,
 * plus component types the chosen catalog does not have.
 *
 * Both the playground and the streaming tab need this. The playground checks
 * what you typed; the streaming tab checks what the model produced — the same
 * question asked of two sources.
 */
@Component({
  selector: 'app-spec-check',
  template: `
    <h2>Spec check</h2>
    @if (preamble(); as note) {
      <p class="hint">{{ note }}</p>
    }
    @if (unavailable(); as reason) {
      <p class="hint">{{ reason }}</p>
    } @else if (!spec()) {
      <p class="hint">Nothing to check yet.</p>
    } @else if (issues().length === 0) {
      <p class="hint ok">
        No structural issues, and every component type exists in this catalog.
      </p>
    } @else {
      <ul class="issues">
        @for (issue of issues(); track $index) {
          <li [class.warn]="issue.severity === 'warning'">
            @if (issue.elementKey) {
              <code>{{ issue.elementKey }}</code>
            }
            {{ issue.message }}
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './spec-check.css',
})
export class SpecCheck {
  /** The spec to check; null while nothing has been generated. */
  readonly spec = input.required<Spec | null>();
  /** Component types the catalog in use defines. */
  readonly componentNames = input.required<readonly string[]>();
  /** Why the check cannot run — shown instead of a result when set. */
  readonly unavailable = input<string | null>(null);
  /**
   * Context for a result that is about to look worse than it is — shown above
   * it rather than in place of it, so the findings still stand.
   */
  readonly preamble = input<string | null>(null);

  readonly issues = computed<Issue[]>(() => {
    const spec = this.spec();
    if (this.unavailable() || !spec) return [];

    const known = new Set(this.componentNames());
    const unknown: Issue[] = Object.entries(spec.elements ?? {})
      .filter(([, el]) => !known.has(el.type))
      .map(([key, el]) => ({
        severity: 'error',
        elementKey: key,
        message: `Component "${el.type}" is not in this catalog — nothing renders for it.`,
      }));
    const structural: Issue[] = validateSpec(spec).issues.map((issue) => ({
      severity: issue.severity,
      message: issue.message,
      elementKey: issue.elementKey,
    }));
    return [...structural, ...unknown];
  });
}
