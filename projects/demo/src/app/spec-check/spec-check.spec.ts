import {
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { Spec } from 'ngx-json-render';
import { SpecCheck } from './spec-check';

@Component({
  imports: [SpecCheck],
  template: `<app-spec-check
    [spec]="spec()"
    [componentNames]="names"
    [unavailable]="unavailable()"
  />`,
})
class Host {
  readonly spec = signal<Spec | null>(null);
  readonly unavailable = signal<string | null>(null);
  readonly names = ['Stack', 'Text'];
}

afterEach(() => {
  TestBed.resetTestingModule();
});

async function render(spec: Spec | null) {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.spec.set(spec);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function text(fixture: ComponentFixture<Host>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('SpecCheck', () => {
  it('passes a sound spec', async () => {
    const fixture = await render({
      root: 'root',
      elements: {
        root: { type: 'Stack', props: {}, children: ['body'] },
        body: { type: 'Text', props: { content: 'hi' }, children: [] },
      },
    });

    expect(text(fixture)).toContain('No structural issues');
  });

  it('names a child no element defines', async () => {
    const fixture = await render({
      root: 'root',
      elements: { root: { type: 'Stack', props: {}, children: ['ghost'] } },
    });

    expect(text(fixture)).toContain('ghost');
  });

  it('names a component the catalog does not have', async () => {
    const fixture = await render({
      root: 'root',
      elements: { root: { type: 'Timeline', props: {}, children: [] } },
    });

    expect(text(fixture)).toContain('"Timeline" is not in this catalog');
  });

  it('does not call an absent spec sound', async () => {
    const fixture = await render(null);

    expect(text(fixture)).toContain('Nothing to check yet');
    expect(text(fixture)).not.toContain('No structural issues');
  });

  it('reports why the check could not run', async () => {
    const fixture = await render(null);
    fixture.componentInstance.unavailable.set('Fix the JSON first.');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(text(fixture)).toContain('Fix the JSON first.');
  });
});
