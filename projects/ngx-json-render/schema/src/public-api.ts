/*
 * Public API Surface of ngx-json-render/schema
 *
 * The spec grammar alone, with nothing but `@json-render/core` behind it, so
 * a server can define a catalog without loading Angular. The primary entry
 * point re-exports it.
 */

export { schema, type AngularSchema, type AngularSpec } from './schema';
