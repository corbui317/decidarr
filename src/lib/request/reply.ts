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

/** Schemas that declare any value at all, so a structured value is kept whole. */
const ANY_VALUE_TYPES = new Set(['unknown', 'any']);

/** Schemas of one plain value. A wrong-typed primitive is kept; a structured value is not. */
const LEAF_TYPES = new Set([
  'string', 'number', 'int', 'boolean', 'bigint', 'date', 'enum', 'literal', 'null', 'undefined',
  'nan', 'never', 'void', 'template_literal',
]);

const WRAPPER_TYPES = new Set(['optional', 'nullable', 'default', 'prefault', 'nonoptional', 'readonly', 'catch']);

/** Marks a value that must not be sent: its parent leaves it out. */
const DROP = Symbol('drop');

function isStructured(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/** The schema kind under any optional, nullable or default wrapper. */
function coreType(schema: z.ZodType): string {
  const def = defOf(schema);
  if (WRAPPER_TYPES.has(def.type)) return coreType(def.innerType!);
  if (def.type === 'pipe') return coreType(def.in!);
  if (def.type === 'lazy') return coreType(def.getter!());
  return def.type;
}

/** Whether a schema of this kind declares the shape of `value` (an object, an array, or a primitive). */
function declaresShapeOf(type: string, value: unknown): boolean {
  if (ANY_VALUE_TYPES.has(type) || type === 'union') return true;
  if (Array.isArray(value)) return type === 'array';
  if (isStructured(value)) return type === 'object' || type === 'record';
  return LEAF_TYPES.has(type);
}

/**
 * The union option a value belongs to: one it matches, else the one its discriminator
 * names, else the first that declares its shape. None when no option declares its shape.
 */
function unionOption(def: SchemaDef, value: unknown): z.ZodType | undefined {
  const options = def.options ?? [];
  const matching = options.find((option) => option.safeParse(value).success);
  if (matching) return matching;
  if (def.discriminator && isPlainObject(value)) {
    const key = def.discriminator;
    const named = options.find((option) => defOf(option).shape?.[key]?.safeParse(value[key]).success);
    if (named) return named;
  }
  return options.find((option) => declaresShapeOf(coreType(option), value));
}

/** A value whose shape its position does not declare: a primitive is kept, anything structured is not sent. */
function undeclaredShape(value: unknown, path: string, removed: string[]): unknown {
  if (!isStructured(value)) return value;
  removed.push(`${path || '(reply)'} (undeclared structure)`);
  return DROP;
}

/**
 * `value` with everything its schema does not declare removed, at any depth: a field the
 * schema does not name, and a structured value (an object, an array) where the schema
 * declares another shape. Each removed path goes into `removed`. A wrong-typed primitive
 * is kept, so a mismatch never costs the client what it can use. Returns DROP when
 * nothing of `value` may be sent.
 */
function stripUndeclared(schema: z.ZodType, value: unknown, path: string, removed: string[]): unknown {
  const def = defOf(schema);
  if (WRAPPER_TYPES.has(def.type)) {
    return value === null || value === undefined ? value : stripUndeclared(def.innerType!, value, path, removed);
  }
  switch (def.type) {
    case 'pipe':
      return stripUndeclared(def.in!, value, path, removed);
    case 'lazy':
      return stripUndeclared(def.getter!(), value, path, removed);
    case 'object': {
      if (!isPlainObject(value)) return undeclaredShape(value, path, removed);
      const kept: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(value)) {
        const declared = def.shape?.[key] ?? (def.catchall && defOf(def.catchall).type !== 'never' ? def.catchall : undefined);
        if (!declared) {
          removed.push(joinPath(path, key));
          continue;
        }
        const stripped = stripUndeclared(declared, field, joinPath(path, key), removed);
        if (stripped !== DROP) kept[key] = stripped;
      }
      return kept;
    }
    case 'array':
      if (!Array.isArray(value)) return undeclaredShape(value, path, removed);
      return value.map((item) => {
        const stripped = stripUndeclared(def.element!, item, `${path}[]`, removed);
        return stripped === DROP ? null : stripped;
      });
    case 'record': {
      if (!isPlainObject(value)) return undeclaredShape(value, path, removed);
      const kept: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(value)) {
        const stripped = stripUndeclared(def.valueType!, field, `${path}{}`, removed);
        if (stripped !== DROP) kept[key] = stripped;
      }
      return kept;
    }
    case 'union': {
      const option = unionOption(def, value);
      return option ? stripUndeclared(option, value, path, removed) : undeclaredShape(value, path, removed);
    }
    default:
      if (ANY_VALUE_TYPES.has(def.type)) return value;
      if (LEAF_TYPES.has(def.type)) return undeclaredShape(value, path, removed);
      // A schema kind this walk does not know could hide undeclared fields: send nothing for it.
      removed.push(`${path || '(reply)'} (unsupported contract type ${def.type})`);
      return DROP;
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
  const stripped = stripUndeclared(checked, wire, '', removed);
  const sent = stripped === DROP ? null : stripped;
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
