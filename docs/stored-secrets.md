# Stored secrets

Decidarr keeps integration keys and Plex tokens in MongoDB, encrypted.
`src/lib/secrets.ts` owns the keys and the format; nothing else encrypts or decrypts.

## Keys

`DECIDARR_SECRET` is the only key material.
Every key is derived from it with HKDF-SHA256 (salt `decidarr`, info `decidarr:<purpose>`, 32 bytes), one per purpose:

| Purpose | Used for |
|---------|----------|
| `stored-secrets` | Encrypting the values listed below |
| `web-session` | Signing the web session cookie (HS256) |
| `mobile-access-token` | Signing mobile access tokens (HS256) |

A new purpose gets a new name, so it never shares a key with an existing one.
Development and tests may run without `DECIDARR_SECRET`; the keys then come from a value derived from `MONGODB_URI`.
Production refuses to start without a secret of at least 32 characters.

## Format (v3)

```
v3:<iv>:<tag>:<ciphertext>
```

- AES-256-GCM with the `stored-secrets` key.
- `iv` is 12 random bytes, `tag` is the 16-byte authentication tag, and every part is base64url without padding.
- The AAD is the UTF-8 string `decidarr:v3:<recordType>:<recordId>:<field>`.
  It binds the value to the record and field it was written for, so a value copied onto another record or field fails to decrypt.

| Record type | Record id | Fields |
|-------------|-----------|--------|
| `settings` | `app-settings` | `plexToken`, `tmdbApiKey`, `tautulliApiKey`, `overseerrApiKey` |
| `user` | the user's `_id` as hex | `plexToken` |
| `mobileAuthCode` | the code's `_id` as hex | `plexAuthToken` |

To add an encrypted field, call `encryptSecret(plaintext, { recordType, recordId, field })` and `decryptSecret(stored, sameLocation)`, and add the field to this table.
Settings fields listed in `SETTINGS_SECRET_FIELDS` are encrypted on save when plaintext is assigned to them.

## Older formats

Before v3, `settings.encryptionKey` held a random data key, wrapped with a master key derived from `MONGODB_URI` (CryptoJS) or from `DECIDARR_SECRET` (`v2:`).
Values were encrypted with that data key as CryptoJS passphrase ciphertext or as `v2:<iv>:<tag>:<ciphertext>` (base64, no AAD).
At startup the migration reads every such value and re-encrypts it as v3.
The old `encryptionKey` and `jwtSecret` fields are left in the settings document, untouched.

## When a value cannot be decrypted

Nothing is ever cleared or replaced automatically.
A value that fails to decrypt, for example after `DECIDARR_SECRET` or `MONGODB_URI` changed, is kept exactly as stored.
The startup log names the affected credentials (never their values), and the Admin sees the same list in Settings > Integrations.
Restarting with the previous `DECIDARR_SECRET` and `MONGODB_URI` makes them readable again.
Otherwise the Admin re-enters each integration key, and each listed user signs in again, which replaces their stored token.

The migration runs once per process, as a single in-process promise shared by every concurrent caller ([ADR 0001](adr/0001-single-process.md)).
