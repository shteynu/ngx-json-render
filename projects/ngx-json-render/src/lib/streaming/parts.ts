import { type Signal, computed } from '@angular/core';
import type {
  FlatElement,
  Spec,
  SpecDataPart,
  UIElement,
} from '@json-render/core';
import { SPEC_DATA_PART_TYPE, nestedToFlat } from '@json-render/core';
import { applyPatch } from './patch';

/**
 * Convert a flat element list to a Spec.
 * Input elements use key/parentKey to establish identity and relationships.
 * Output spec uses the map-based format where key is the map entry key
 * and parent-child relationships are expressed through children arrays.
 */
export function flatToTree(elements: FlatElement[]): Spec {
  // The map is what gives every element its children array, so the second
  // pass can push into one without checking for it.
  const elementMap: Record<string, UIElement & { children: string[] }> = {};
  let root = '';

  // First pass: add all elements to map
  for (const element of elements) {
    elementMap[element.key] = {
      type: element.type,
      props: element.props,
      children: [],
      visible: element.visible,
    };
  }

  // Second pass: build parent-child relationships
  for (const element of elements) {
    if (element.parentKey) {
      const parent = elementMap[element.parentKey];
      if (parent) {
        parent.children.push(element.key);
      }
    } else {
      root = element.key;
    }
  }

  return { root, elements: elementMap };
}

/**
 * A single part from the AI SDK's `message.parts` array. This is a minimal
 * structural type so that library helpers do not depend on the AI SDK.
 */
export interface DataPart {
  type: string;
  text?: string;
  data?: unknown;
}

/**
 * Type guard that validates a data part payload looks like a valid
 * {@link SpecDataPart} before we cast it.
 */
function isSpecDataPart(data: unknown): data is SpecDataPart {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  switch (obj['type']) {
    case 'patch':
      return typeof obj['patch'] === 'object' && obj['patch'] !== null;
    case 'flat':
    case 'nested':
      return typeof obj['spec'] === 'object' && obj['spec'] !== null;
    default:
      return false;
  }
}

/**
 * Build a `Spec` by replaying all spec data parts from a message's
 * parts array (AI SDK `UIMessage.parts`). Returns `null` if no spec data
 * parts are present.
 */
export function buildSpecFromParts(parts: DataPart[]): Spec | null {
  let spec: Spec = { root: '', elements: {} };
  let hasSpec = false;

  for (const part of parts) {
    if (part.type === SPEC_DATA_PART_TYPE) {
      if (!isSpecDataPart(part.data)) continue;
      const payload = part.data;
      if (payload.type === 'patch') {
        hasSpec = true;
        spec = applyPatch(spec, payload.patch);
      } else if (payload.type === 'flat') {
        hasSpec = true;
        spec = { ...spec, ...payload.spec };
      } else if (payload.type === 'nested') {
        hasSpec = true;
        spec = { ...spec, ...nestedToFlat(payload.spec) };
      }
    }
  }

  return hasSpec ? spec : null;
}

/**
 * Extract and join all text content from a message's parts array.
 */
export function getTextFromParts(parts: DataPart[]): string {
  return parts
    .filter(
      (p): p is DataPart & { text: string } =>
        p.type === 'text' && typeof p.text === 'string',
    )
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Extract both the json-render spec and the text content from a message's
 * parts array, as memoized signals. Angular counterpart of
 * `useJsonRenderMessage` from the other renderers.
 *
 * @example
 * ```ts
 * readonly msg = jsonRenderMessage(() => this.message().parts);
 * // template: @if (msg.hasSpec()) { <json-render [spec]="msg.spec()" ... /> }
 * ```
 */
export function jsonRenderMessage(
  parts: Signal<DataPart[]> | (() => DataPart[]),
): {
  spec: Signal<Spec | null>;
  text: Signal<string>;
  hasSpec: Signal<boolean>;
} {
  const result = computed(() => {
    const p = parts();
    return {
      spec: buildSpecFromParts(p),
      text: getTextFromParts(p),
    };
  });

  return {
    spec: computed(() => result().spec),
    text: computed(() => result().text),
    hasSpec: computed(() => {
      const s = result().spec;
      return s !== null && Object.keys(s.elements || {}).length > 0;
    }),
  };
}
