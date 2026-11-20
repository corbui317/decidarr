/** Shared building blocks for the request-body validators. */

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseStringArray(value: unknown, field: string): ParseResult<string[]> {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return { ok: false, error: `${field} must be an array of strings` };
  }
  return { ok: true, data: value };
}
