import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { RECORDINGS } from '../specs/stream';
import { StreamTab } from './streaming';

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
  const fixture = TestBed.createComponent(StreamTab);
  await settle(fixture);
  return fixture;
}

/**
 * Text of the rendered UI only. The prompt buttons carry the recording labels,
 * so asserting against the whole host would match the picker, not the render.
 */
function rendered(fixture: ComponentFixture<StreamTab>): string {
  const pane = (fixture.nativeElement as HTMLElement).querySelector(
    '.layout .pane',
  );
  return pane?.textContent ?? '';
}

/** Text of the spec-check panel. */
function checkText(fixture: ComponentFixture<StreamTab>): string {
  const el = (fixture.nativeElement as HTMLElement).querySelector(
    'app-spec-check',
  );
  return el?.textContent ?? '';
}

/** Wait until the stream settles, with a bound so a hang fails the test. */
async function drain(fixture: ComponentFixture<StreamTab>) {
  const ui = fixture.componentInstance.ui;
  for (let i = 0; i < 400 && ui.isStreaming(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await settle(fixture);
}

describe('StreamTab', () => {
  it('renders a recorded generation through injectUIStream', async () => {
    const fixture = await render();
    const globalFetch = vi.spyOn(globalThis, 'fetch');

    fixture.componentInstance.generate(RECORDINGS[0].prompt);
    await drain(fixture);

    const ui = fixture.componentInstance.ui;
    // The patch lines, minus the usage line, which is not a patch.
    expect(ui.rawLines().length).toBe(RECORDINGS[0].lines.length - 1);
    expect(ui.error()).toBeNull();
    expect(ui.spec()?.root).toBe('root');
    expect(rendered(fixture)).toContain('Weekly report');
    // The last patch in the recording made it through.
    expect(rendered(fixture)).toContain('streamed line by line');
    // No global fetch anywhere: the demo does not patch the environment.
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('reports the usage line as token usage', async () => {
    const fixture = await render();
    fixture.componentInstance.generate(RECORDINGS[0].prompt);
    await drain(fixture);

    expect(fixture.componentInstance.ui.usage()).toEqual({
      promptTokens: 1284,
      completionTokens: 612,
      totalTokens: 1896,
    });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      '1896 tokens',
    );
  });

  it('surfaces a failed request and keeps the tab usable', async () => {
    const fixture = await render();
    fixture.componentInstance.failNext.set(true);
    fixture.componentInstance.generate(RECORDINGS[0].prompt);
    await drain(fixture);

    const host = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.ui.error()?.message).toBe(
      'The model provider returned 503.',
    );
    expect(host.textContent).toContain('Generation failed');
    expect(fixture.componentInstance.ui.isStreaming()).toBe(false);

    // The next generation recovers.
    fixture.componentInstance.failNext.set(false);
    fixture.componentInstance.generate(RECORDINGS[1].prompt);
    await drain(fixture);

    expect(fixture.componentInstance.ui.error()).toBeNull();
    expect(rendered(fixture)).toContain('Getting started');
  });

  it('renders around a bad generation instead of blanking', async () => {
    const fixture = await render();
    const broken = RECORDINGS[2];

    fixture.componentInstance.generate(broken.prompt);
    await drain(fixture);

    const ui = fixture.componentInstance.ui;
    const shown = rendered(fixture);

    expect(ui.error()).toBeNull();
    // The truncated line is skipped, not fatal: every other patch applied.
    expect(ui.rawLines().length).toBe(broken.lines.length - 2);

    // The sound parts of the page are on screen.
    expect(shown).toContain('Pricing');
    expect(shown).toContain('$0');
    expect(shown).toContain('$19');
    expect(shown).toContain('Choose Pro');
    // And so is the card whose child went missing — minus that child.
    expect(shown).toContain('$49');
    // The component this catalog does not have renders nothing.
    expect(shown).not.toContain('PricingTable');
  });

  it('holds the check until the stream finishes', async () => {
    const fixture = await render();
    fixture.componentInstance.generate(RECORDINGS[2].prompt);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await settle(fixture);

    expect(fixture.componentInstance.ui.isStreaming()).toBe(true);
    const check = checkText(fixture);
    // Children that simply have not streamed in yet are not defects.
    expect(check).toContain('Checking when the stream finishes');
    expect(check).not.toContain('does not exist in the elements map');

    await drain(fixture);
  });

  it('names what is wrong with a bad generation', async () => {
    const fixture = await render();
    fixture.componentInstance.generate(RECORDINGS[2].prompt);
    await drain(fixture);

    const check = checkText(fixture);
    // The child that was promised and never emitted.
    expect(check).toContain('team-note');
    // The component the catalog does not define.
    expect(check).toContain('"PricingTable" is not in this catalog');
    // `visible` written inside props, where the renderer never looks.
    expect(check).toContain('pro-badge');
  });

  it('supersedes a generation that is still streaming', async () => {
    const fixture = await render();
    const ui = fixture.componentInstance.ui;

    fixture.componentInstance.generate(RECORDINGS[0].prompt);
    // Let a few lines land, then switch prompts mid-stream.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(ui.isStreaming()).toBe(true);

    fixture.componentInstance.generate(RECORDINGS[1].prompt);
    await settle(fixture);
    // The replacement is still running: the aborted request must not have
    // cleared the flag on its way out.
    expect(ui.isStreaming()).toBe(true);

    await drain(fixture);

    expect(ui.error()).toBeNull();
    expect(ui.rawLines().length).toBe(RECORDINGS[1].lines.length - 1);
    expect(rendered(fixture)).toContain('Getting started');
    // The superseded generation left nothing behind.
    expect(rendered(fixture)).not.toContain('Weekly report');
  });
});
