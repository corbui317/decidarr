import { NextResponse, type NextRequest } from 'next/server';
import { buildSecurityHeaders } from '@/lib/security/headers';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(buildSecurityHeaders(request))) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
