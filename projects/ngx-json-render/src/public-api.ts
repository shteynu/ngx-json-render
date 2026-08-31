/*
 * Public API Surface of ngx-json-render
 */

// Renderer components
export { JsonRenderer } from './lib/renderer.component';
export { JrChildren } from './lib/children.component';
export { JrElement } from './lib/element.component';
export { JrRepeatScope } from './lib/repeat-scope.component';
export { JrConfirmDialog } from './lib/confirm-dialog.component';

// Render context / DI
export {
  ELEMENT_KEY,
  RENDER_CONTEXT,
  REPEAT_SCOPE,
  injectElementKey,
  injectRenderContext,
  injectRepeatScope,
} from './lib/tokens';
export { JsonRenderRootContext } from './lib/root-context';

// State
export {
  JsonRenderStateService,
  injectStateStore,
  injectStateValue,
  injectStateBinding,
  injectBoundProp,
} from './lib/state.service';

// Actions
export {
  JsonRenderActionsService,
  injectActions,
  injectAction,
  isActionCancelled,
  type PendingConfirmation,
} from './lib/actions.service';

// Validation
export {
  JsonRenderValidationService,
  injectValidation,
  injectFieldValidation,
  type FieldValidationState,
} from './lib/validation.service';

// Spec validation
export {
  checkSpec,
  type SpecCheck,
  type SpecValidationMode,
} from './lib/spec-validation';

// Registry
export {
  defineRegistry,
  createStoreSetState,
  type DefineRegistryResult,
} from './lib/registry';

// Types
export type {
  Actions,
  ActionFn,
  CatalogHasActions,
  ComponentRegistry,
  Components,
  EventHandle,
  RegistryEntry,
  RenderContext,
  RepeatScope,
  SetState,
  StateChange,
  StateModel,
} from './lib/types';

// Streaming / AI helpers
export {
  applyPatch,
  buildSpecFromParts,
  flatToTree,
  getTextFromParts,
  injectChatUI,
  injectUIStream,
  jsonRenderMessage,
  type ChatMessage,
  type ChatUIOptions,
  type ChatUIReturn,
  type DataPart,
  type TokenUsage,
  type UIStreamOptions,
  type UIStreamReturn,
  type UIStreamSendOptions,
} from './lib/streaming';

// Schema (spec format + prompt rules)
export { schema, type AngularSchema, type AngularSpec } from './lib/schema';

// Devtools
export { injectDevtoolsActive } from './lib/devtools';

// Core re-exports (for convenience)
export type {
  ActionBinding,
  ActionHandler,
  JsonPatch,
  Spec,
  SpecIssue,
  StateStore,
  UIElement,
  VisibilityCondition,
} from '@json-render/core';
export {
  autoFixSpec,
  createStateStore,
  formatSpecIssues,
  nestedToFlat,
  validateSpec,
} from '@json-render/core';
