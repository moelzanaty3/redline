import { RedlineError } from '../core/errors.ts';

// Host response bodies are untrusted external input: the transport
// (http.ts) only guarantees valid JSON, never a particular shape. Every
// body is typed `unknown` and narrowed by an explicit parse function, in
// the house style of cli/render/manifest.ts — never a bare `as` onto a
// concrete host type. A host error body is a truthy object (e.g.
// `{ message: "Forbidden" }`), not an array, so `isNonNullObject` rejects
// arrays too — a host-supplied array must never be mistaken for the keyed
// object callers go on to index.
export function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

export function createHostShapeError(host: string): (what: string) => RedlineError {
  return (what: string) => new RedlineError('host', `${host} returned an unexpected shape for ${what}`);
}
