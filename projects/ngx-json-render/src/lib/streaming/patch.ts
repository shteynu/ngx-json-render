import type { JsonPatch, Spec, UIElement } from '@json-render/core';
import {
  addByPath,
  getByPath,
  removeByPath,
  setByPath,
} from '@json-render/core';

/**
 * Writes a value at a path inside an already-private object. `addByPath` and
 * `setByPath` differ only on arrays — RFC 6902 `add` splices, `replace`
 * overwrites — which is why the op picks the writer rather than the path
 * routing below.
 */
type PathWriter = (
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
) => void;

/**
 * Split a JSON Pointer into its segments, undoing RFC 6901's escapes.
 *
 * `@json-render/core` parses pointers the same way for `setByPath` and
 * friends but does not export the helper, so {@link copyAlongPath} carries
 * its own copy. The two must agree on where a path descends, or a write would
 * land on a node that was never copied.
 */
function parseJsonPointer(path: string): string[] {
  const raw = path.startsWith('/') ? path.slice(1).split('/') : path.split('/');
  return raw.map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/**
 * Replace every node `path` descends through with a shallow copy of itself.
 *
 * `root` must already be private to the caller. Afterwards a mutating write
 * along that same path — `setByPath`, `addByPath`, `removeByPath` — only ever
 * touches nodes nobody else is holding, while everything off the path stays
 * shared. That keeps a patch proportional to the depth of its path rather than
 * to the size of the spec, which matters when a stream applies hundreds of
 * them.
 *
 * Descent stops at anything that is not an object: the writers overwrite such
 * a node outright, and one that does not exist yet is created fresh, so in
 * neither case is there anything of the caller's left to protect.
 */
function copyAlongPath(root: Record<string, unknown>, path: string): void {
  const segments = parseJsonPointer(path);
  let current = root;

  // The final segment is written, not descended into, so it needs no copy.
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const child = current[segment];
    if (child === null || typeof child !== 'object') return;

    const copy = Array.isArray(child)
      ? [...child]
      : { ...(child as Record<string, unknown>) };
    current[segment] = copy;
    current = copy as unknown as Record<string, unknown>;
  }
}

/**
 * Write a value at a spec path, copying every node on the way so the caller's
 * previous spec keeps its own contents.
 */
function writeSpecValue(
  newSpec: Spec,
  path: string,
  value: unknown,
  write: PathWriter,
): void {
  if (path === '/root') {
    newSpec.root = value as string;
    return;
  }

  if (path === '/state') {
    newSpec.state = value as Record<string, unknown>;
    return;
  }

  if (path.startsWith('/state/')) {
    if (!newSpec.state) newSpec.state = {};
    const statePath = path.slice('/state'.length); // e.g. "/posts"
    const state = newSpec.state as Record<string, unknown>;
    copyAlongPath(state, statePath);
    write(state, statePath, value);
    return;
  }

  if (path.startsWith('/elements/')) {
    const pathParts = path.slice('/elements/'.length).split('/');
    const elementKey = pathParts[0];
    if (!elementKey) return;

    if (pathParts.length === 1) {
      newSpec.elements[elementKey] = value as UIElement;
      return;
    }

    // A prop path whose element is not there is dropped rather than
    // auto-created: the generic writers would happily conjure an element with
    // props and no `type`, which renders as nothing and warns about an unknown
    // component. A malformed patch should lose its own write, not add a broken
    // element to the tree.
    const element = newSpec.elements[elementKey];
    if (!element) return;

    const propPath = '/' + pathParts.slice(1).join('/');
    const newElement = { ...element } as unknown as Record<string, unknown>;
    copyAlongPath(newElement, propPath);
    write(newElement, propPath, value);
    newSpec.elements[elementKey] = newElement as unknown as UIElement;
    return;
  }

  // Any other top-level path is applied verbatim. The spec grammar is
  // upstream's and grows without this renderer: dropping what we do not
  // recognise would silently discard a field a newer `@json-render/core`
  // understands.
  const root = newSpec as unknown as Record<string, unknown>;
  copyAlongPath(root, path);
  write(root, path, value);
}

/** Remove the value at a spec path, with the same copy-on-write discipline. */
function removeSpecValue(newSpec: Spec, path: string): void {
  if (path === '/state') {
    delete newSpec.state;
    return;
  }

  if (path.startsWith('/state/') && newSpec.state) {
    const statePath = path.slice('/state'.length);
    const state = newSpec.state as Record<string, unknown>;
    copyAlongPath(state, statePath);
    removeByPath(state, statePath);
    return;
  }

  if (path.startsWith('/elements/')) {
    const pathParts = path.slice('/elements/'.length).split('/');
    const elementKey = pathParts[0];
    if (!elementKey) return;

    if (pathParts.length === 1) {
      const { [elementKey]: _removed, ...rest } = newSpec.elements;
      newSpec.elements = rest;
      return;
    }

    const element = newSpec.elements[elementKey];
    if (!element) return;

    const propPath = '/' + pathParts.slice(1).join('/');
    const newElement = { ...element } as unknown as Record<string, unknown>;
    copyAlongPath(newElement, propPath);
    removeByPath(newElement, propPath);
    newSpec.elements[elementKey] = newElement as unknown as UIElement;
    return;
  }

  const root = newSpec as unknown as Record<string, unknown>;
  copyAlongPath(root, path);
  removeByPath(root, path);
}

/**
 * Apply an RFC 6902 JSON patch to a spec, returning a new spec object and
 * sharing every subtree the patch did not touch.
 *
 * This is the only patch engine in the package: `injectUIStream`,
 * `injectChatUI` and `buildSpecFromParts` all route through it, so the same
 * stream produces the same spec whichever one an app reached for. The write
 * primitives come from `@json-render/core`, so `add` splices into an array
 * where `replace` overwrites, exactly as the other renderers do.
 *
 * One deliberate deviation from RFC 6902: a failing `test` op is a no-op
 * rather than an abort. These patches come off a model's output, where the
 * established behaviour — see the line parser — is to drop what does not make
 * sense and keep rendering rather than kill a generation mid-flight.
 */
export function applyPatch(spec: Spec, patch: JsonPatch): Spec {
  const newSpec = {
    ...spec,
    elements: { ...spec.elements },
    ...(spec.state ? { state: { ...spec.state } } : {}),
  };

  switch (patch.op) {
    case 'add': {
      writeSpecValue(newSpec, patch.path, patch.value, addByPath);
      break;
    }
    case 'replace': {
      writeSpecValue(newSpec, patch.path, patch.value, setByPath);
      break;
    }
    case 'remove': {
      removeSpecValue(newSpec, patch.path);
      break;
    }
    case 'move': {
      if (!patch.from) break;
      const moveValue = getByPath(newSpec, patch.from);
      removeSpecValue(newSpec, patch.from);
      writeSpecValue(newSpec, patch.path, moveValue, addByPath);
      break;
    }
    case 'copy': {
      if (!patch.from) break;
      // RFC 6902 copies the *value*. Handing over the live reference instead
      // aliases source and target, and a `path` that descends into its own
      // `from` then makes the spec self-referential — which the next request
      // discovers when it tries to serialise it into the body.
      const copyValue = structuredClone(getByPath(newSpec, patch.from));
      writeSpecValue(newSpec, patch.path, copyValue, addByPath);
      break;
    }
    case 'test': {
      break;
    }
  }

  return newSpec;
}
