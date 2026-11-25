import { beforeEach } from 'vitest';
import { setIntegrationTransportForTests } from '@/lib/integrations/client';
import { publicLookup, refuseUnfakedRequests } from './helpers/fake-integrations';

// No test reaches a real integration or real DNS; tests that need one call fakeIntegrations().
beforeEach(() => {
  setIntegrationTransportForTests({ fetch: refuseUnfakedRequests, lookup: publicLookup });
});
