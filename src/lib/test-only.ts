/**
 * Guard for helpers that reset process state for tests (connection cache,
 * migration flag, rate-limit store). They are exported from production modules
 * because they reach module-private state; this keeps them inert in production.
 */
export function assertTestOnly(name: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is test-only and cannot run in production`);
  }
}
