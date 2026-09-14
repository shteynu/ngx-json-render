import { type Provider, provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

/**
 * What `renderSpec` and `renderComponent` share: the TestBed setup, the settle
 * loop, and the handful of DOM queries a test runs against what rendered.
 *
 * @internal Not exported from the entry point.
 */

/**
 * Configure the TestBed, unless the test already did.
 *
 * A test that called `TestBed.runInInjectionContext` first — or that renders
 * a second time — has an instantiated module, and configuring it again
 * throws. Its own module stands; the only thing that cannot be salvaged is
 * this call's `providers`, so that is the one case worth failing over.
 */
export function configureTestBed(caller: string, providers: Provider[]): void {
  try {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), ...providers],
    });
  } catch {
    if (providers.length > 0) {
      throw new Error(
        `${caller}: the TestBed was already instantiated, so \`providers\` cannot be applied. Pass them to your own TestBed.configureTestingModule() call instead.`,
      );
    }
  }
}

/** Let effects, promises and change detection finish. */
export function settler(
  fixture: ComponentFixture<unknown>,
): () => Promise<void> {
  return async () => {
    // Twice: the first pass runs the effects that a render schedules, the
    // second renders what those effects changed. One pass leaves a test
    // asserting against a frame that no browser would ever show.
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  };
}

/** The DOM half of a harness. */
export interface DomQueries {
  /** Trimmed text of the first match, or of everything when given nothing. */
  text(selector?: string): string;
  /** Trimmed text of every match. */
  texts(selector: string): string[];
  /** The first match. Throws when there is none. */
  find<T extends HTMLElement>(selector: string): T;
  /** Every match, possibly none. */
  findAll<T extends HTMLElement>(selector: string): T[];
  /** Click an element (or the first match of a selector) and settle. */
  click(target: string | Element): Promise<void>;
  /** Set an input's value, fire `input`, and settle. */
  fill(target: string | Element, value: string): Promise<void>;
}

export function domQueries(
  caller: string,
  element: HTMLElement,
  settle: () => Promise<void>,
): DomQueries {
  const resolve = (target: string | Element): HTMLElement => {
    if (typeof target !== 'string') return target as HTMLElement;
    const found = element.querySelector<HTMLElement>(target);
    if (!found) {
      throw new Error(
        `${caller}: nothing matches ${JSON.stringify(target)}. Rendered HTML:\n${element.innerHTML}`,
      );
    }
    return found;
  };

  return {
    text: (selector) =>
      ((selector ? resolve(selector) : element).textContent ?? '').trim(),
    texts: (selector) =>
      Array.from(element.querySelectorAll(selector)).map((el) =>
        (el.textContent ?? '').trim(),
      ),
    find: <T extends HTMLElement>(selector: string) => resolve(selector) as T,
    findAll: <T extends HTMLElement>(selector: string) =>
      Array.from(element.querySelectorAll<T>(selector)),
    async click(target) {
      resolve(target).click();
      await settle();
    },
    async fill(target, value) {
      const input = resolve(target) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    },
  };
}
