# Mobile and PWA Specifications

Future implementation specifications extending the shipped mobile web/PWA shell in [beta spec 08](../beta/08-mobile-pwa-later.md).

## Required sequence

1. [Production HTTPS and PWA verification](./01-production-https-pwa-verification.md)
   - Can begin once an operator selects a canonical HTTPS origin and reverse proxy.
   - Produces deployment guidance, an origin probe, current Lighthouse quality evidence, and browser/device install evidence.
2. [Native vs PWA architecture decision](./03-native-vs-pwa-adr.md) — **Complete** → [DECIDARR-08-ADR-01](../../adr/DECIDARR-08-ADR-01-native-vs-pwa.md)
3. [Offline sync and Expo client](./02-offline-sync-expo-client.md)
   - Starts only if the accepted ADR authorizes a native companion.
   - Sequences native auth, shared contracts, server sync, online Expo MVP, read-only offline, then bounded offline writes.

## Hard gates

- No production PWA completion claim without HTTPS-origin and physical-device evidence.
- No Expo production implementation without an accepted ADR.
- No native API access without approved token rotation, revocation, and threat model.
- No offline write claim without revisions, idempotency, conflict rules, tombstones, and full-resync behavior.
- No authenticated API response caching in the current web service worker.
