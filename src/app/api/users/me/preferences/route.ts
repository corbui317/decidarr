import {
  preferencesGetResponseSchema,
  preferencesPatchBodySchema,
  preferencesPatchResponseSchema,
  preferencesPutBodySchema,
  preferencesPutResponseSchema,
} from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { User } from '@/lib/models/User';
import { toPreferenceContract, updatePreferences } from '@/lib/user-data';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

export const GET = route({ access: 'user', response: preferencesGetResponseSchema }, async ({ session, reply }) => {
  const user = await User.findById(session.userId);
  if (!user) {
    throw new DomainError('UNAUTHENTICATED');
  }
  const preferences = toPreferenceContract(user);
  return reply({ preferences, spinHistory: preferences.spinHistory! });
});

export const PUT = route(
  { access: 'user', body: preferencesPutBodySchema, response: preferencesPutResponseSchema },
  async ({ session, body, reply }) => {
    const { user } = await updatePreferences(session, body);
    return reply({ success: true, preferences: toPreferenceContract(user) });
  }
);

export const PATCH = route(
  { access: 'user', body: preferencesPatchBodySchema, response: preferencesPatchResponseSchema },
  async ({ session, body, reply }) => {
    const { spinHistory } = await updatePreferences(session, { spinHistory: body.spinHistory });
    return reply({ spinHistory });
  }
);
