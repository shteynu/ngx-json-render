import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Playground } from './playground';

// Material and CDK components hold live handles; without an explicit teardown
// the vitest process can stay alive after the suite passes.
afterEach(() => {
  TestBed.resetTestingModule();
});

async function settle(fixture: ComponentFixture<unknown>) {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

async function render() {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(Playground);
  await settle(fixture);
  return fixture;
}

/** Text of the spec-check panel. */
function checkText(fixture: ComponentFixture<Playground>): string {
  const el = (fixture.nativeElement as HTMLElement).querySelector(
    'app-spec-check',
  );
  return el?.textContent ?? '';
}

function editor(fixture: ComponentFixture<Playground>): HTMLTextAreaElement {
  const el = (fixture.nativeElement as HTMLElement).querySelector('textarea');
  if (!el) throw new Error('the spec editor is not rendered');
  return el as HTMLTextAreaElement;
}

async function type(fixture: ComponentFixture<Playground>, source: string) {
  const textarea = editor(fixture);
  textarea.value = source;
  textarea.dispatchEvent(new Event('input'));
  await settle(fixture);
}

describe('Playground', () => {
  it('renders the Material starter spec by default', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance.catalogId()).toBe('material');
    expect(host.textContent).toContain('Release dashboard');
    // Material components, not the demo catalog's plain ones.
    expect(host.querySelector('mat-card')).toBeTruthy();
    // The state-bound template resolved.
    expect(host.textContent).toContain('Hello, Ada!');
  });

  it('re-renders as the spec is edited', async () => {
    const fixture = await render();
    await type(
      fixture,
      JSON.stringify({
        root: 'title',
        elements: {
          title: {
            type: 'Heading',
            props: { content: 'Edited' },
            children: [],
          },
        },
      }),
    );

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Edited');
    expect(host.textContent).not.toContain('Release dashboard');
    expect(fixture.componentInstance.parseError()).toBeNull();
  });

  it('keeps the last valid render when the JSON does not parse', async () => {
    const fixture = await render();
    await type(fixture, '{ "root": "title", ');

    const host = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.parseError()).toBeTruthy();
    expect(host.textContent).toContain('showing the last spec that parsed');
    expect(host.textContent).toContain('Release dashboard');
  });

  it('reports a child that no element defines', async () => {
    const fixture = await render();
    await type(
      fixture,
      JSON.stringify({
        root: 'root',
        elements: {
          root: { type: 'Stack', props: {}, children: ['ghost'] },
        },
      }),
    );

    expect(checkText(fixture)).toContain('ghost');
  });

  it('reports component types the selected catalog does not have', async () => {
    const fixture = await render();
    fixture.componentInstance.selectCatalog('demo');
    await settle(fixture);
    await type(
      fixture,
      JSON.stringify({
        root: 'root',
        elements: {
          root: { type: 'Grid', props: {}, children: [] },
        },
      }),
    );

    expect(checkText(fixture)).toContain('"Grid" is not in this catalog');
  });

  it('switches catalog, starter spec and prompt together', async () => {
    const fixture = await render();
    const materialPrompt = fixture.componentInstance.prompt();

    fixture.componentInstance.selectCatalog('demo');
    await settle(fixture);

    const host = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.prompt()).not.toBe(materialPrompt);
    expect(fixture.componentInstance.componentNames()).toContain('Badge');
    expect(host.querySelector('mat-card')).toBeNull();
    expect(host.textContent).toContain('Release dashboard');
  });

  it('shows the generated system prompt for the selected catalog', async () => {
    const fixture = await render();
    fixture.componentInstance.panel.set('prompt');
    await settle(fixture);

    const prompt = (fixture.nativeElement as HTMLElement).querySelector(
      '.prompt',
    )?.textContent;
    expect(prompt).toContain('Stack');
    expect(prompt).toContain('Metric');
  });
});
