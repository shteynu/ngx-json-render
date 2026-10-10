import type { JsonPatch, Spec } from '@json-render/core';
import { applyPatch } from 'ngx-json-render';

/**
 * The `activityType` a json-render spec travels under.
 *
 * An agent sends the spec as an AG-UI activity: `ACTIVITY_SNAPSHOT` carries a
 * whole spec in `content`, and `ACTIVITY_DELTA` carries RFC 6902 patches
 * against it in `patch` — the same patches a json-render JSONL stream is made
 * of. CopilotKit carries A2UI the same way, under `"a2ui-surface"`.
 *
 * The name says both the format and what `content` holds — a `Spec`, the
 * object upstream calls a spec in its AI SDK part type `data-spec` — so a
 * renderer for another framework can match it without reading these docs.
 */
export const JSON_RENDER_ACTIVITY_TYPE = 'json-render-spec';

/**
 * The part of an AG-UI event this entry point reads.
 *
 * Structural on purpose: `@ag-ui/core`'s `EventType` is a string enum, so its
 * events fit a `string` here, and nothing below needs the package at runtime
 * or pins its version.
 */
export interface AgUiEvent {
  readonly type: string;
}

/** The part of an AG-UI message this entry point reads. */
export interface AgUiMessage {
  readonly id: string;
  readonly role: string;
}

/** One spec an agent is building, keyed by its activity message. */
export interface AgUiSurface {
  /** The activity's `messageId`; one run can build several surfaces. */
  readonly messageId: string;
  readonly spec: Spec;
}

const EMPTY_SPEC: Spec = { root: '', elements: {} };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether activity content has the shape of a spec. Only the shape: what the
 * elements say is the renderer's and the finished-spec check's business.
 */
export function isJsonRenderSpec(content: unknown): content is Spec {
  return (
    isRecord(content) &&
    typeof content['root'] === 'string' &&
    isRecord(content['elements'])
  );
}

function isPatch(value: unknown): value is JsonPatch {
  return (
    isRecord(value) &&
    typeof value['op'] === 'string' &&
    typeof value['path'] === 'string'
  );
}

function upsert(
  surfaces: readonly AgUiSurface[],
  messageId: string,
  spec: Spec,
): readonly AgUiSurface[] {
  const index = surfaces.findIndex((s) => s.messageId === messageId);
  if (index === -1) return [...surfaces, { messageId, spec }];
  const next = [...surfaces];
  next[index] = { messageId, spec };
  return next;
}

/**
 * The surfaces an AG-UI message list holds, in message order.
 *
 * Used for `MESSAGES_SNAPSHOT` and to pick up the history an agent already
 * has when a hook attaches to it.
 */
export function surfacesFromMessages(
  messages: readonly AgUiMessage[],
  activityType: string = JSON_RENDER_ACTIVITY_TYPE,
): readonly AgUiSurface[] {
  const surfaces: AgUiSurface[] = [];
  for (const message of messages) {
    const m = message as AgUiMessage & Record<string, unknown>;
    if (
      m.role === 'activity' &&
      m['activityType'] === activityType &&
      isJsonRenderSpec(m['content'])
    ) {
      surfaces.push({ messageId: m.id, spec: m['content'] });
    }
  }
  return surfaces;
}

/**
 * Fold one AG-UI event into the surfaces built so far.
 *
 * Returns the same array when the event does not concern json-render, so a
 * signal holding the result only notifies on a real change. A delta applies
 * through the same immutable patch engine as a JSONL stream: elements it does
 * not touch keep their identity, and the renderer skips them.
 *
 * Two leniencies, both in the direction of rendering what arrived:
 * - a delta for a surface no snapshot has opened starts from an empty spec,
 *   so an agent can stream patches the way a JSONL endpoint does;
 * - a malformed patch op is dropped rather than failing the surface.
 */
export function applyAgUiEvent(
  surfaces: readonly AgUiSurface[],
  event: AgUiEvent,
  activityType: string = JSON_RENDER_ACTIVITY_TYPE,
): readonly AgUiSurface[] {
  const e = event as AgUiEvent & Record<string, unknown>;
  switch (e.type) {
    case 'ACTIVITY_SNAPSHOT': {
      const messageId = e['messageId'];
      if (typeof messageId !== 'string' || e['activityType'] !== activityType) {
        return surfaces;
      }
      const content = e['content'];
      if (!isJsonRenderSpec(content)) return surfaces;
      // `replace: false` means "only if new": the client already has a
      // version of this surface it should keep.
      if (
        e['replace'] === false &&
        surfaces.some((s) => s.messageId === messageId)
      ) {
        return surfaces;
      }
      return upsert(surfaces, messageId, content);
    }
    case 'ACTIVITY_DELTA': {
      const messageId = e['messageId'];
      const patch = e['patch'];
      if (
        typeof messageId !== 'string' ||
        e['activityType'] !== activityType ||
        !Array.isArray(patch)
      ) {
        return surfaces;
      }
      const current =
        surfaces.find((s) => s.messageId === messageId)?.spec ?? EMPTY_SPEC;
      let spec = current;
      for (const op of patch) {
        if (isPatch(op)) spec = applyPatch(spec, op);
      }
      return spec === current ? surfaces : upsert(surfaces, messageId, spec);
    }
    case 'MESSAGES_SNAPSHOT': {
      const messages = e['messages'];
      if (!Array.isArray(messages)) return surfaces;
      // AG-UI's rule: a snapshot that carries any activity message carries
      // all of them, and one that carries none leaves the client's alone.
      const carriesActivities = messages.some(
        (m) => isRecord(m) && m['role'] === 'activity',
      );
      if (!carriesActivities) return surfaces;
      return surfacesFromMessages(messages as AgUiMessage[], activityType);
    }
    default:
      return surfaces;
  }
}
