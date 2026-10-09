import {
  Component,
  EnvironmentInjector,
  Injectable,
  type Provider,
  type Type,
  createEnvironmentInjector,
  inject,
  input,
  provideZonelessChangeDetection,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ActionHandler, Spec } from '@json-render/core';
import { JSON_RENDER_CONFIG, provideJsonRender } from './provide';
import { JsonRenderer } from './renderer.component';
import { injectRenderContext } from './tokens';
import type { ComponentRegistry } from './types';

@Component({
  selector: 'p-text',
  template: `<span class="p-text">{{ ctx.props().content }}</span>`,
})
class PText {
  readonly ctx = injectRenderContext<{ content?: string }>();
}

@Component({
  selector: 'p-loud',
  template: `<b class="p-loud">{{ ctx.props().content }}</b>`,
})
class PLoud {
  readonly ctx = injectRenderContext<{ content?: string }>();
}

@Component({
  selector: 'p-button',
  template: `<button class="p-button" (click)="ctx.emit('press')">go</button>`,
})
class PButton {
  readonly ctx = injectRenderContext();
}

@Component({
  selector: 'p-unknown',
  template: `<i class="p-unknown"></i>`,
})
class PUnknown {}

@Component({
  selector: 'p-other-unknown',
  template: `<i class="p-other-unknown"></i>`,
})
class POtherUnknown {}

const REGISTRY: ComponentRegistry = { Text: PText, Button: PButton };
const LOUD: ComponentRegistry = { Text: PLoud, Button: PButton };

const TEXT: Spec = {
  root: 't',
  elements: { t: { type: 'Text', props: { content: 'Hi' }, children: [] } },
} as unknown as Spec;

/** A button whose press runs `action`, then navigates on success. */
function button(action: string): Spec {
  return {
    root: 'b',
    elements: {
      b: {
        type: 'Button',
        props: {},
        on: { press: { action, onSuccess: { navigate: '/done' } } },
        children: [],
      },
    },
  } as unknown as Spec;
}

@Component({
  selector: 'p-bare',
  imports: [JsonRenderer],
  template: `<json-render [spec]="spec()" />`,
})
class Bare {
  readonly spec = input<Spec | null>(TEXT);
}

async function settle(fixture: ComponentFixture<unknown>) {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

async function mount<T>(
  host: Type<T>,
  providers: Provider[] = [],
  spec?: Spec,
): Promise<ComponentFixture<T>> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), ...providers],
  });
  const fixture = TestBed.createComponent(host);
  if (spec) fixture.componentRef.setInput('spec', spec);
  await settle(fixture);
  return fixture;
}

function find(fixture: ComponentFixture<unknown>, selector: string) {
  return (fixture.nativeElement as HTMLElement).querySelector(selector);
}

async function press(fixture: ComponentFixture<unknown>) {
  (find(fixture, '.p-button') as HTMLButtonElement).click();
  await settle(fixture);
  // The handler chain is async: let it run to the navigate.
  await new Promise((resolve) => setTimeout(resolve));
}

describe('provideJsonRender', () => {
  it('supplies the registry, so the element needs none', async () => {
    const fixture = await mount(Bare, [
      provideJsonRender({ registry: REGISTRY }),
    ]);

    expect(find(fixture, '.p-text')?.textContent).toBe('Hi');
  });

  it('lets a registry bound on the element win', async () => {
    @Component({
      imports: [JsonRenderer],
      template: `<json-render [spec]="spec" [registry]="loud" />`,
    })
    class Host {
      readonly spec = TEXT;
      readonly loud = LOUD;
    }

    const fixture = await mount(Host, [
      provideJsonRender({ registry: REGISTRY }),
    ]);

    expect(find(fixture, '.p-loud')).not.toBeNull();
    expect(find(fixture, '.p-text')).toBeNull();
  });

  it('builds the defaults with inject() when given a function', async () => {
    @Injectable({ providedIn: 'root' })
    class Registries {
      readonly registry = REGISTRY;
    }

    const fixture = await mount(Bare, [
      provideJsonRender(() => ({ registry: inject(Registries).registry })),
    ]);

    expect(find(fixture, '.p-text')).not.toBeNull();
  });

  it('throws a clear error when there is no registry anywhere', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(Bare);

    await expect(settle(fixture)).rejects.toThrow(
      /has no registry. Bind \[registry\], or supply one/,
    );
  });

  it('uses the provided fallback, unless the element binds its own', async () => {
    const unknown = {
      root: 'u',
      elements: { u: { type: 'Nope', props: {}, children: [] } },
    } as unknown as Spec;
    const config = provideJsonRender({
      registry: REGISTRY,
      fallback: PUnknown,
    });

    const provided = await mount(Bare, [config], unknown);
    expect(find(provided, '.p-unknown')).not.toBeNull();

    TestBed.resetTestingModule();

    @Component({
      imports: [JsonRenderer],
      template: `<json-render [spec]="spec" [fallback]="other" />`,
    })
    class Host {
      readonly spec = unknown;
      readonly other = POtherUnknown;
    }
    const own = await mount(Host, [config]);
    expect(find(own, '.p-other-unknown')).not.toBeNull();
    expect(find(own, '.p-unknown')).toBeNull();
  });

  it('merges handlers by name, the element winning a name both define', async () => {
    const calls: string[] = [];
    const provided: Record<string, ActionHandler> = {
      save: () => void calls.push('provided save'),
      share: () => void calls.push('provided share'),
    };

    @Component({
      imports: [JsonRenderer],
      template: `<json-render [spec]="spec" [handlers]="handlers" />`,
    })
    class Host {
      spec = button('save');
      readonly handlers: Record<string, ActionHandler> = {
        save: () => void calls.push('element save'),
      };
    }

    const fixture = await mount(Host, [
      provideJsonRender({ registry: REGISTRY, handlers: provided }),
    ]);
    await press(fixture);

    fixture.componentInstance.spec = button('share');
    fixture.changeDetectorRef.markForCheck();
    await settle(fixture);
    await press(fixture);

    expect(calls).toEqual(['element save', 'provided share']);
  });

  it('navigates through the provided navigate', async () => {
    const paths: string[] = [];

    const fixture = await mount(
      Bare,
      [
        provideJsonRender({
          registry: REGISTRY,
          handlers: { save: () => undefined },
          navigate: (path) => void paths.push(path),
        }),
      ],
      button('save'),
    );
    await press(fixture);

    expect(paths).toEqual(['/done']);
  });

  it('takes validate from the provider, and lets the element turn it off', async () => {
    // `strict` refuses a spec whose root names a child that is not there.
    const broken = {
      root: 't',
      elements: {
        t: { type: 'Text', props: { content: 'Hi' }, children: ['ghost'] },
      },
    } as unknown as Spec;
    const config = provideJsonRender({
      registry: REGISTRY,
      validate: 'strict',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const strict = await mount(Bare, [config], broken);
    expect(find(strict, '.p-text')).toBeNull();

    TestBed.resetTestingModule();

    @Component({
      imports: [JsonRenderer],
      template: `<json-render [spec]="spec" validate="off" />`,
    })
    class Host {
      readonly spec = broken;
    }
    const off = await mount(Host, [config]);
    expect(find(off, '.p-text')).not.toBeNull();

    warn.mockRestore();
    error.mockRestore();
  });

  describe('nested', () => {
    it('a component-level provider replaces values and merges vocabularies', async () => {
      const calls: string[] = [];

      @Component({
        selector: 'p-section',
        imports: [JsonRenderer],
        providers: [
          provideJsonRender({
            registry: LOUD,
            handlers: { save: () => void calls.push('section save') },
          }),
        ],
        template: `<json-render [spec]="spec()" />`,
      })
      class Section {
        readonly spec = input.required<Spec>();
      }

      @Component({
        imports: [Section],
        template: `<p-section [spec]="spec" />`,
      })
      class Host {
        spec: Spec = TEXT;
      }

      const fixture = await mount(Host, [
        provideJsonRender({
          registry: REGISTRY,
          handlers: { share: () => void calls.push('root share') },
        }),
      ]);
      expect(find(fixture, '.p-loud')).not.toBeNull();

      fixture.componentInstance.spec = button('share');
      fixture.changeDetectorRef.markForCheck();
      await settle(fixture);
      await press(fixture);

      fixture.componentInstance.spec = button('save');
      fixture.changeDetectorRef.markForCheck();
      await settle(fixture);
      await press(fixture);

      expect(calls).toEqual(['root share', 'section save']);
    });

    it('a route-level (environment) provider extends the root one', () => {
      TestBed.configureTestingModule({
        providers: [
          provideJsonRender({
            registry: REGISTRY,
            validate: 'warn',
            functions: { a: () => 1 },
          }),
        ],
      });
      const route = createEnvironmentInjector(
        [provideJsonRender({ registry: LOUD, functions: { b: () => 2 } })],
        TestBed.inject(EnvironmentInjector),
      );

      const config = route.get(JSON_RENDER_CONFIG);

      expect(config.registry).toBe(LOUD);
      expect(config.validate).toBe('warn');
      expect(Object.keys(config.functions ?? {})).toEqual(['a', 'b']);
      route.destroy();
    });
  });
});
