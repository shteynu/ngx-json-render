import {
  Component,
  EnvironmentInjector,
  provideZonelessChangeDetection,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { injectRouterNavigate } from './router-navigate';
import type { RouterNavigateOptions } from './router-navigate';

@Component({ template: '' })
class Page {}

function setup(allow: RouterNavigateOptions['allow']) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([
        { path: 'thanks', component: Page },
        { path: 'orders/:id', component: Page },
        { path: 'admin', component: Page },
      ]),
    ],
  });
  const router = TestBed.inject(Router);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const navigate = runInInjectionContext(
    TestBed.inject(EnvironmentInjector),
    () => injectRouterNavigate({ allow }),
  );
  return { router, navigate, navigateByUrl, warn };
}

afterEach(() => vi.restoreAllMocks());

describe('injectRouterNavigate', () => {
  it('hands an allowed path to the router', async () => {
    const { router, navigate, navigateByUrl } = setup(['/thanks']);

    navigate('/thanks');
    await new Promise((resolve) => setTimeout(resolve));

    expect(navigateByUrl).toHaveBeenCalledWith('/thanks');
    expect(router.url).toBe('/thanks');
  });

  it('matches the path before the query and fragment, and keeps them', () => {
    const { navigate, navigateByUrl } = setup(['/thanks']);

    navigate('/thanks?from=spec#top');

    expect(navigateByUrl).toHaveBeenCalledWith('/thanks?from=spec#top');
  });

  it('tests a RegExp rule, the same way every time', () => {
    const { navigate, navigateByUrl } = setup([/^\/orders\/\d+$/g]);

    navigate('/orders/42');
    navigate('/orders/42');
    navigate('/orders/abc');

    expect(navigateByUrl).toHaveBeenCalledTimes(2);
  });

  it('asks a predicate', () => {
    const { navigate, navigateByUrl } = setup((path) =>
      path.startsWith('/orders/'),
    );

    navigate('/orders/7');
    navigate('/admin');

    expect(navigateByUrl).toHaveBeenCalledOnce();
    expect(navigateByUrl).toHaveBeenCalledWith('/orders/7');
  });

  it('refuses a route the app has but the allow list does not', () => {
    const { navigate, navigateByUrl, warn } = setup(['/thanks']);

    navigate('/admin');

    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"/admin" is not in the allow list'),
    );
  });

  it.each([
    ['an absolute URL', 'https://evil.example/thanks'],
    ['a protocol-relative URL', '//evil.example/thanks'],
    ['a backslash host', '/\\evil.example'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a relative path', 'thanks'],
    ['a control character', '/thanks\n'],
  ])('refuses %s whatever the allow list says', (_, path) => {
    const { navigate, navigateByUrl, warn } = setup(() => true);

    navigate(path);

    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('only navigate to a path inside the app'),
    );
  });

  it('reports a navigation the router rejects instead of leaving it unhandled', async () => {
    const { navigate, navigateByUrl, warn } = setup(['/nowhere']);

    navigate('/nowhere');
    await new Promise((resolve) => setTimeout(resolve));

    expect(navigateByUrl).toHaveBeenCalledWith('/nowhere');
    expect(warn).toHaveBeenCalledWith(
      '[ngx-json-render] Navigation to "/nowhere" failed.',
      expect.anything(),
    );
  });
});
