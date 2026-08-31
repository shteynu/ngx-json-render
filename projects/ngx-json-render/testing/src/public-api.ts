/*
 * Public API Surface of ngx-json-render/testing
 *
 * Test utilities, shipped as a separate entry point so nothing here can be
 * pulled into an application bundle by accident.
 */

export {
  recordedTransport,
  specStream,
  usageLine,
  type Recording,
  type Recordings,
  type RecordedFailure,
  type RecordedTransportOptions,
} from './recorded-transport';
export {
  renderSpec,
  type DispatchedAction,
  type RenderSpecOptions,
  type SpecHarness,
} from './render-spec';
