import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { App } from './app';

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
  const fixture = TestBed.createComponent(App);
  await settle(fixture);
  return fixture;
}

describe('App', () => {
  it('opens on the playground', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.topbar h1')?.textContent).toContain(
      'ngx-json-render',
    );
    expect(fixture.componentInstance.tab()).toBe('playground');
    expect(host.querySelector('app-playground')).toBeTruthy();
    expect(host.textContent).toContain('Release dashboard');
  });

  it('renders the interactive demo from the dashboard spec', async () => {
    const fixture = await render();
    fixture.componentInstance.tab.set('interactive');
    await settle(fixture);

    const host = fixture.nativeElement as HTMLElement;
    // The spec-rendered UI is present: greeting card + todos from state.
    expect(host.textContent).toContain('Welcome back, Ada!');
    expect(host.textContent).toContain('Wire up ngx-json-render');
  });
});
