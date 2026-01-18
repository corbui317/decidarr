import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('decidarr_token');

  return NextResponse.json({ message: 'Logged out successfully' });
}
