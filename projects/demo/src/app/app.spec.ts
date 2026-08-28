import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('renders the interactive demo from the dashboard spec', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.topbar h1')?.textContent).toContain(
      'ngx-json-render',
    );
    // The spec-rendered UI is present: greeting card + todos from state.
    expect(host.textContent).toContain('Welcome back, Ada!');
    expect(host.textContent).toContain('Wire up ngx-json-render');
  });
});
