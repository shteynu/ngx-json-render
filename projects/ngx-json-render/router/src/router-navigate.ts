import { inject } from '@angular/core';
import { Router } from '@angular/router';

/** Which paths a spec may send the app to. */
export interface RouterNavigateOptions {
  /**
   * The paths a spec may navigate to. A string must equal the path exactly; a
   * `RegExp` is tested against it; a function decides on its own. The path is
   * what comes before any `?` or `#`, so a query string or fragment neither
   * helps nor hurts a match, and is passed on to the router as written.
   *
   * Required: a spec is model output, and the app is what knows which of its
   * routes a generated UI has any business opening.
   */
  readonly allow: readonly (string | RegExp)[] | ((path: string) => boolean);
}

/**
 * A `navigate` for `<json-render>` that hands a spec's
 * `onSuccess: { navigate }` path to the Angular `Router`, but only a path
 * inside the app that `allow` lets through. Anything else is refused with a
 * warning and goes nowhere.
 *
 * Call it in an injection context — in the function form of
 * `provideJsonRender`, or in a field initializer:
 *
 * ```ts
 * provideJsonRender(() => ({
 *   registry,
 *   navigate: injectRouterNavigate({ allow: ['/thanks', /^\/orders\/\d+$/] }),
 * }));
 * ```
 *
 * Whatever `allow` says, a path is refused unless it starts with a single
 * `/`: no other origin (`https://…`, `//host`), no scheme (`javascript:…`),
 * no path relative to wherever the user happens to be. A backslash or a
 * control character refuses it too, since browsers read `/\host` as
 * `//host`.
 */
export function injectRouterNavigate(
  options: RouterNavigateOptions,
): (path: string) => void {
  const router = inject(Router);
  const allowed = toPredicate(options.allow);
  return (path) => {
    if (!isAppPath(path)) {
      console.warn(
        `[ngx-json-render] Refused to navigate to ${JSON.stringify(path)}: a spec may only navigate to a path inside the app, starting with a single "/".`,
      );
      return;
    }
    const pathname = path.split(/[?#]/, 1)[0];
    if (!allowed(pathname)) {
      console.warn(
        `[ngx-json-render] Refused to navigate to "${path}": "${pathname}" is not in the allow list given to injectRouterNavigate.`,
      );
      return;
    }
    router.navigateByUrl(path).catch((error: unknown) => {
      console.warn(`[ngx-json-render] Navigation to "${path}" failed.`, error);
    });
  };
}

function isAppPath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    /^\/(?![/\\])/.test(path) &&
    !/[\\\u0000-\u001f\u007f]/.test(path)
  );
}

function toPredicate(
  allow: RouterNavigateOptions['allow'],
): (path: string) => boolean {
  if (typeof allow === 'function') return allow;
  return (path) =>
    allow.some((rule) => {
      if (typeof rule === 'string') return rule === path;
      // A global or sticky RegExp keeps `lastIndex` between calls; reset it so
      // one rule answers the same way for the same path every time.
      rule.lastIndex = 0;
      return rule.test(path);
    });
}
