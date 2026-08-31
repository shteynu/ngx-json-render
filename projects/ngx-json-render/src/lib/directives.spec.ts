import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { DirectiveDefinition, Spec } from '@json-render/core';
import {
  createI18nDirective,
  standardDirectives,
} from '@json-render/directives';
import { JsonRenderer } from './renderer.component';
import { injectRenderContext } from './tokens';
import type { ComponentRegistry } from './types';

/**
 * The ecosystem's pre-built directives, rendered by this renderer.
 *
 * `@json-render/directives` is written against `@json-render/core`, not
 * against any one renderer, so nothing here is Angular-specific — which is
 * exactly why it is worth a test. The claim "the ecosystem packages work with
 * this renderer" was, until this file, only ever asserted in prose.
 */

@Component({
  selector: 't-text',
  template: `<span class="text">{{ content() }}</span>`,
})
class TText {
  private readonly ctx = injectRenderContext<{ content?: unknown }>();
  readonly content = () => String(this.ctx.props().content ?? '');
}

const REGISTRY: ComponentRegistry = { Text: TText };

@Component({
  imports: [JsonRenderer],
  template: `<json-render
    [spec]="spec()"
    [registry]="registry"
    [directives]="directives()"
  />`,
})
class Host {
  readonly spec = signal<Spec | null>(null);
  readonly directives = signal<DirectiveDefinition[] | undefined>(undefined);
  readonly registry = REGISTRY;
}

async function settle(fixture: ComponentFixture<unknown>) {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

/** Render one element whose `content` prop is the directive under test. */
async function render(
  content: unknown,
  options: {
    state?: Record<string, unknown>;
    directives?: DirectiveDefinition[];
  } = {},
) {
  // Reset first: several of these tests render more than one spec, and a
  // second configureTestingModule on a live module throws.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.directives.set(
    options.directives ?? [...standardDirectives],
  );
  fixture.componentInstance.spec.set({
    root: 'root',
    elements: { root: { type: 'Text', props: { content } } },
    state: options.state,
  } as unknown as Spec);
  await settle(fixture);
  return fixture;
}

function text(fixture: ComponentFixture<unknown>): string {
  return (
    (fixture.nativeElement as HTMLElement)
      .querySelector('.text')
      ?.textContent?.trim() ?? ''
  );
}

describe('@json-render/directives', () => {
  it('formats numbers, currency and percentages', async () => {
    expect(
      text(
        await render(
          {
            $format: 'currency',
            value: { $state: '/price' },
            currency: 'USD',
            locale: 'en-US',
          },
          { state: { price: 1234.5 } },
        ),
      ),
    ).toBe('$1,234.50');

    expect(
      text(
        await render({
          $format: 'percent',
          value: 0.42,
          locale: 'en-US',
        }),
      ),
    ).toBe('42%');
  });

  it('does arithmetic on state values', async () => {
    const fixture = await render(
      { $math: 'multiply', a: { $state: '/qty' }, b: { $state: '/price' } },
      { state: { qty: 3, price: 4 } },
    );

    expect(text(fixture)).toBe('12');
  });

  it('concatenates, counts, joins, truncates and pluralizes', async () => {
    expect(
      text(
        await render(
          { $concat: ['Hello, ', { $state: '/name' }, '!'] },
          { state: { name: 'Ada' } },
        ),
      ),
    ).toBe('Hello, Ada!');

    expect(
      text(
        await render(
          { $count: { $state: '/items' } },
          { state: { items: [1, 2, 3] } },
        ),
      ),
    ).toBe('3');

    expect(
      text(
        await render(
          { $join: { $state: '/tags' }, separator: ' · ' },
          { state: { tags: ['a', 'b'] } },
        ),
      ),
    ).toBe('a · b');

    expect(
      text(await render({ $truncate: 'a very long sentence', length: 6 })),
    ).toBe('a very...');

    // `one` / `other` are the noun, not a template: the directive prefixes
    // the count itself and interpolates nothing.
    expect(
      text(
        await render(
          { $pluralize: { $state: '/n' }, one: 'file', other: 'files' },
          { state: { n: 2 } },
        ),
      ),
    ).toBe('2 files');

    expect(
      text(
        await render(
          {
            $pluralize: { $state: '/n' },
            zero: 'no files',
            one: 'file',
            other: 'files',
          },
          { state: { n: 0 } },
        ),
      ),
    ).toBe('no files');
  });

  it('translates through the $t factory directive', async () => {
    const t = createI18nDirective({
      locale: 'es',
      messages: {
        en: { greeting: 'Hello, {{name}}!' },
        es: { greeting: 'Hola, {{name}}!' },
      },
      fallbackLocale: 'en',
    });

    const fixture = await render(
      { $t: 'greeting', params: { name: { $state: '/name' } } },
      { state: { name: 'Ada' }, directives: [...standardDirectives, t] },
    );

    expect(text(fixture)).toBe('Hola, Ada!');
  });

  it('re-resolves when the state a directive reads changes', async () => {
    const fixture = await render(
      { $math: 'add', a: { $state: '/count' }, b: 1 },
      { state: { count: 1 } },
    );
    expect(text(fixture)).toBe('2');

    const renderer = fixture.debugElement.children[0]
      .componentInstance as JsonRenderer;
    renderer.stateStore.set('/count', 41);
    await settle(fixture);

    expect(text(fixture)).toBe('42');
  });
});
