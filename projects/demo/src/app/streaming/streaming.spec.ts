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
