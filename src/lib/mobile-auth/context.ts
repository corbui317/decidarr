import { NextRequest } from 'next/server';

export function extractBearerToken(request: NextRequest | Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}
