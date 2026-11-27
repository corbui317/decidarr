import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

const ROOT = join(__dirname, '../../../src/app/api');
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const ALLOWED_BUILDER_MODULES = ['@/lib/request/route', '@/lib/routes/connection-test'];

function listRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listRouteFiles(full));
    } else if (entry === 'route.ts') {
      files.push(full);
    }
  }
  return files;
}

/**
 * Criterion: "A lint rule or test fails if a route handler is exported without
 * going through the module." Every exported HTTP method handler must be a
 * direct call to route() (src/lib/request/route.ts) or an approved builder on
 * top of it (e.g. connectionTestRoute), not a hand-written function, an
 * arrow function, or a re-export of one declared elsewhere.
 */
export function findRouteViolations(fileName: string, content: string): string[] {
  const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const violations: string[] = [];

  const allowedIdentifiers = new Set<string>();
  for (const stmt of sourceFile.statements) {
    if (
      ts.isImportDeclaration(stmt) &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      ALLOWED_BUILDER_MODULES.includes(stmt.moduleSpecifier.text) &&
      stmt.importClause?.namedBindings &&
      ts.isNamedImports(stmt.importClause.namedBindings)
    ) {
      for (const element of stmt.importClause.namedBindings.elements) {
        allowedIdentifiers.add(element.name.text);
      }
    }
  }

  const isExported = (stmt: ts.Statement) =>
    !!ts.canHaveModifiers(stmt) &&
    !!ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !HTTP_METHODS.has(decl.name.text)) continue;
        const method = decl.name.text;
        const init = decl.initializer;
        const isAllowedCall =
          init && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && allowedIdentifiers.has(init.expression.text);
        if (!isAllowedCall) {
          violations.push(`${method} is not a direct call to route() or an approved builder`);
        }
      }
    } else if (ts.isFunctionDeclaration(stmt) && isExported(stmt) && stmt.name && HTTP_METHODS.has(stmt.name.text)) {
      violations.push(`${stmt.name.text} is a hand-written function export, not route() or an approved builder`);
    } else if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const element of stmt.exportClause.elements) {
        if (HTTP_METHODS.has(element.name.text)) {
          violations.push(`${element.name.text} is re-exported rather than declared via route() or an approved builder`);
        }
      }
    }
  }

  return violations;
}

describe('findRouteViolations', () => {
  it('rejects a hand-written function export', () => {
    const content = `
      import { NextResponse } from 'next/server';
      export async function GET() {
        return NextResponse.json({ ok: true });
      }
    `;
    expect(findRouteViolations('bad.ts', content)).toEqual(['GET is a hand-written function export, not route() or an approved builder']);
  });

  it('rejects a plain function declaration without async', () => {
    const content = `
      export function GET() {
        return new Response('ok');
      }
    `;
    expect(findRouteViolations('bad.ts', content)).toEqual(['GET is a hand-written function export, not route() or an approved builder']);
  });

  it('rejects a re-exported handler alias', () => {
    const content = `
      async function handler() {
        return new Response('ok');
      }
      export { handler as GET };
    `;
    expect(findRouteViolations('bad.ts', content)).toEqual(['GET is re-exported rather than declared via route() or an approved builder']);
  });

  it('rejects HEAD and OPTIONS hand-written exports', () => {
    const content = `
      export async function HEAD() {
        return new Response(null);
      }
      export async function OPTIONS() {
        return new Response(null);
      }
    `;
    expect(findRouteViolations('bad.ts', content)).toEqual([
      'HEAD is a hand-written function export, not route() or an approved builder',
      'OPTIONS is a hand-written function export, not route() or an approved builder',
    ]);
  });

  it('rejects an exported const assigned to a bare arrow function', () => {
    const content = `
      export const GET = async (request: Request) => {
        return new Response('ok');
      };
    `;
    expect(findRouteViolations('bad.ts', content)).toEqual(['GET is not a direct call to route() or an approved builder']);
  });

  it('rejects an exported const that imports route but is not assigned from it', () => {
    const content = `
      import { route, requireAdminSession } from '@/lib/request/route';
      async function legacyHandler(request: Request) {
        await requireAdminSession(request);
        return new Response('ok');
      }
      export const GET = legacyHandler;
    `;
    expect(findRouteViolations('bad.ts', content)).toEqual(['GET is not a direct call to route() or an approved builder']);
  });

  it('rejects a call to an identifier not imported from an allowed module', () => {
    const content = `
      import { route } from '@/lib/some-other-module';
      export const GET = route({ access: 'public' }, async () => new Response('ok'));
    `;
    expect(findRouteViolations('bad.ts', content)).toEqual(['GET is not a direct call to route() or an approved builder']);
  });

  it('accepts a direct route() call', () => {
    const content = `
      import { route } from '@/lib/request/route';
      export const POST = route({ access: 'public' }, async () => new Response('ok'));
    `;
    expect(findRouteViolations('good.ts', content)).toEqual([]);
  });

  it('accepts a direct connectionTestRoute() call', () => {
    const content = `
      import { connectionTestRoute } from '@/lib/routes/connection-test';
      export const POST = connectionTestRoute(testConnection, 'Overseerr', logger);
    `;
    expect(findRouteViolations('good.ts', content)).toEqual([]);
  });

  it('accepts a file with no exported handler', () => {
    const content = `
      export function helper() {
        return 1;
      }
    `;
    expect(findRouteViolations('good.ts', content)).toEqual([]);
  });
});

describe('route handlers go through the request-handling module', () => {
  it('declares every exported HTTP handler via route() or a builder on top of it', () => {
    const offenders: string[] = [];

    for (const file of listRouteFiles(ROOT)) {
      const content = readFileSync(file, 'utf8');
      for (const violation of findRouteViolations(file, content)) {
        offenders.push(`${file}: ${violation}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
