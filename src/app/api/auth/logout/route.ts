import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth-login';

export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ message: 'Logged out successfully' });
}
