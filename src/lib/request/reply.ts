import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { apiErrorBodySchema, type ApiErrorBody } from '@decidarr/api-contracts';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:Reply');

/**
 * What `JSON.stringify` sends for a value of type T: where T has a plain string, a value
 * with `toJSON()` (a Date, an ObjectId) may stand in for it, since it serializes to one.
 */
export type Json<T> = T extends string
  ? T | (string extends T ? { toJSON(): string } : never)
  : T extends readonly (infer U)[]
    ? readonly Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;

/** A response contract whose replies have type T, for code that takes any of several contracts. */
export type ReplyContract<T> = z.ZodType<T, T>;

/**
 * A JSON reply and its status. 2xx bodies follow the route's contract; 4xx and 5xx bodies
 * the shared error contract. Handlers build one with their input's `reply` or `errorReply`.
 */
export class Reply<T> {
  constructor(
    readonly status: number,
    readonly body: T
  ) {}
}

/** A 4xx or 5xx reply a handler builds itself; anything it throws goes through the error table instead. */
export function errorReply(status: number, body: ApiErrorBody): Reply<ApiErrorBody> {
  return new Reply(status, body);
}

/** Where a reply came from, for the mismatch log; never any part of the reply itself. */
export interface ReplySource {
  method: string;
  path: string;
}

const MAX_LOGGED_PATHS = 20;

function joinPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type SchemaDef = {
  type: string;
  innerType?: z.ZodType;
  in?: z.ZodType;
  getter?: () => z.ZodType;
  shape?: Record<string, z.ZodType>;
  catchall?: z.ZodType;
  element?: z.ZodType;
  valueType?: z.ZodType;
  options?: z.ZodType[];
  discriminator?: string;
};

function defOf(schema: z.ZodType): SchemaDef {
  return schema._zod.def as unknown as SchemaDef;
}

/** Schemas whose value is kept whole: a field declared as a string, a number, `unknown` and so on. */
const LEAF_TYPES = new Set([
  'string', 'number', 'int', 'boolean', 'bigint', 'date', 'enum', 'literal', 'null', 'undefined',
  'unknown', 'any', 'nan', 'never', 'void', 'template_literal',
]);

/** The union option a value belongs to: one it matches, else the one its discriminator names, else the first. */
function unionOption(def: SchemaDef, value: unknown): z.ZodType | undefined {
  const options = def.options ?? [];
  const matching = options.find((option) => option.safeParse(value).success);
  if (matching) return matching;
  if (def.discriminator && isPlainObject(value)) {
    const key = def.discriminator;
    const named = options.find((option) => defOf(option).shape?.[key]?.safeParse(value[key]).success);
    if (named) return named;
  }
  return options[0];
}

/**
 * `value` with every field its schema does not declare removed, at any depth. Each removed
 * field's path goes into `removed`. Values are otherwise kept as they are, even when a
 * declared field has the wrong type, so a mismatch never costs the client what it can use.
 */
function stripUndeclared(schema: z.ZodType, value: unknown, path: string, removed: string[]): unknown {
  const def = defOf(schema);
  switch (def.type) {
    case 'optional':
    case 'nullable':
    case 'default':
    case 'prefault':
    case 'nonoptional':
    case 'readonly':
    case 'catch':
      return value === null || value === undefined ? value : stripUndeclared(def.innerType!, value, path, removed);
    case 'pipe':
      return stripUndeclared(def.in!, value, path, removed);
    case 'lazy':
      return stripUndeclared(def.getter!(), value, path, removed);
    case 'object': {
      if (!isPlainObject(value)) return value;
      const kept: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(value)) {
        const declared = def.shape?.[key];
        if (declared) {
          kept[key] = stripUndeclared(declared, field, joinPath(path, key), removed);
        } else if (def.catchall && defOf(def.catchall).type !== 'never') {
          kept[key] = stripUndeclared(def.catchall, field, joinPath(path, key), removed);
        } else {
          removed.push(joinPath(path, key));
        }
      }
      return kept;
    }
    case 'array':
      return Array.isArray(value)
        ? value.map((item) => stripUndeclared(def.element!, item, `${path}[]`, removed))
        : value;
    case 'record':
      if (!isPlainObject(value)) return value;
      return Object.fromEntries(
        Object.entries(value).map(([key, field]) => [key, stripUndeclared(def.valueType!, field, `${path}{}`, removed)])
      );
    case 'union': {
      const option = unionOption(def, value);
      return option ? stripUndeclared(option, value, path, removed) : value;
    }
    default:
      if (LEAF_TYPES.has(def.type)) return value;
      // A schema kind this walk does not know could hide undeclared fields: send nothing for it.
      removed.push(`${path || '(reply)'} (unsupported contract type ${def.type})`);
      return undefined;
  }
}

/** Distinct paths, capped, so one bad list cannot flood the log. */
function summarize(paths: string[]): string[] {
  return Array.from(new Set(paths)).slice(0, MAX_LOGGED_PATHS);
}

/**
 * Sends `body` as the JSON reply checked against `contract` (2xx) or the shared error
 * contract (4xx, 5xx). The body is checked as the client will see it, after JSON
 * serialization. Fields the contract does not declare are never sent. A reply that breaks
 * its contract is logged by field path only, never its values, and still sent; under
 * test (NODE_ENV=test) it throws instead, so a test that reaches it fails.
 */
export function sendReply(contract: z.ZodType, body: unknown, status: number, source: ReplySource): NextResponse {
  const checked = status >= 200 && status < 300 ? contract : apiErrorBodySchema;
  const serialized = JSON.stringify(body);
  const wire: unknown = serialized === undefined ? null : JSON.parse(serialized);

  const removed: string[] = [];
  const sent = stripUndeclared(checked, wire, '', removed);
  const result = checked.safeParse(wire);
  const invalid = result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.map(String).join('.') || '(reply)'} (${issue.code})`);

  if (invalid.length > 0 || removed.length > 0) {
    const mismatch = { ...source, status, invalid: summarize(invalid), undeclared: summarize(removed) };
    if (process.env.NODE_ENV === 'test') {
      throw new Error(`Reply does not match its contract: ${JSON.stringify(mismatch)}`);
    }
    logger.warn('Reply does not match its contract', mismatch);
  }

  return NextResponse.json(sent, { status });
}
