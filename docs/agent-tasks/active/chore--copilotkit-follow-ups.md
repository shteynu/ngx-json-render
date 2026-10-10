# CopilotKit follow-ups

## Metadata

- Branch: `main` (this repo commits straight to main)
- Done and pushed: `22a2216` fix, `1289484` release 0.9.10 (npm `latest`,
  tag `v0.9.10` created by the release workflow), `6b65510`
  `examples/copilotkit-angular` (CI green)
- Status: open — owner steps
- Last updated: 2026-10-10
- Last agent/tool: Claude Code (Opus 5.5)

## Objective

Make ngx-json-render findable from CopilotKit's Angular docs, now that the
CopilotKit path is fixed (0.9.10) and has an example to point at.

## Remaining

- [ ] Delete the merged remote branch `fix/activity-loading`
      (github.com/shteynu/ngx-json-render/branches). A cloud session cannot:
      its git access refuses ref deletion and tag pushes.
- [ ] File the docs issue below on CopilotKit/CopilotKit from the owner's
      account, through the "📚 Documentation Issue" form (blank issues are
      off).
- [ ] If they want an Angular counterpart of their React json-render BYOC
      page, write it as a PR modelled on that page, using
      `examples/copilotkit-angular`.
- [ ] Upstream json-render: #331 (README row) and #332 (first-party Angular)
      stay open with no maintainer reply. No more pings or new threads.

## Context

- docs.copilotkit.ai/angular/guides/a2ui#angular-support-boundaries says
  "JSON Renderer is not applicable … does not provide an Angular renderer;
  use A2UI". True of upstream (no `@json-render/angular`), but reads as "no
  json-render in Angular".
- CopilotKit supports json-render in React only as BYOC
  (docs.copilotkit.ai/deepagents/generative-ui/json-render); A2UI is their
  first-class path (co-authored with Google, rides on AG-UI).
- Their community-frameworks page lists CopilotKit frontends, not renderers:
  not the place for ngx-json-render.

## Issue draft

Title:

```text
📚 Documentation: Angular A2UI guide says json-render has no Angular renderer, but a community one exists
```

Description:

````markdown
**Page:** https://docs.copilotkit.ai/angular/guides/a2ui#angular-support-boundaries

The "Angular support boundaries" section says:

> **JSON Renderer is not applicable.** JSON Renderer does not provide an Angular renderer; use A2UI for declarative Angular interfaces.

The first half is accurate about upstream: vercel-labs/json-render ships no `@json-render/angular`. But Angular developers read the line as "json-render can't be used from Angular", and that is no longer the case. [ngx-json-render](https://github.com/shteynu/ngx-json-render) (Apache-2.0) is a community Angular renderer built on `@json-render/core` as a peer dependency. Its `ngx-json-render/ag-ui` entry point ships an activity renderer in the shape `renderActivityMessages` takes:

```ts
providers: [
  provideJsonRender({ registry }),
  provideCopilotKit({
    runtimeUrl: '/api/copilotkit',
    renderActivityMessages: [jsonRenderActivityRenderer()],
  }),
];
```

The spec travels as an AG-UI activity (`activityType: "json-render-spec"`). `ACTIVITY_SNAPSHOT` carries the spec and `ACTIVITY_DELTA` carries RFC 6902 patches against it, the same way CopilotKit carries A2UI as `a2ui-surface`.

I checked it end to end with `@copilotkit/angular` 0.5.3 and `@copilotkit/runtime` 1.78.0 (Angular 22.2, ngx-json-render 0.9.10): the spec streams into `CopilotChat` as an activity and renders progressively, and `validate: 'strict'` checks it once, when the run ends. [`examples/copilotkit-angular`](https://github.com/shteynu/ngx-json-render/tree/main/examples/copilotkit-angular) is the whole path and runs without a model key.

Either of these would fix it:

1. Keep the boundary and name the alternative, for example:
   > **JSON Renderer has no official Angular renderer.** Use A2UI for declarative Angular interfaces. A community renderer, [ngx-json-render](https://github.com/shteynu/ngx-json-render), exists but is not tested or supported by CopilotKit.
2. If you'd rather not link community packages, just change "is not applicable" to "has no official Angular renderer". That stays accurate either way.

React already has a [BYOC page for json-render](https://docs.copilotkit.ai/deepagents/generative-ui/json-render). If an Angular counterpart would be welcome, I'm happy to write it as a PR that follows the React page's structure. I won't open one unless you want it.

Disclosure: I maintain ngx-json-render.

- Repo: https://github.com/shteynu/ngx-json-render
- npm: `ngx-json-render`
- Live demo: https://shteynu.github.io/ngx-json-render/
````

## Next concrete step

Owner: delete `fix/activity-loading` on GitHub, then file the issue above.
