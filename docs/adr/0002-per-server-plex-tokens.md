# Plex calls use per-server access tokens; Friends' account tokens are not stored

A plex.tv account token unlocks a user's whole Plex account, and Decidarr used to store every Friend's and send it to whatever Plex URL the Admin configured.
We now use the account token once at sign-in to fetch the user's resources, keep only the access token for this install's Plex server, and discard a Friend's account token; the Admin's account token is kept because listing Friends needs it.
The trust model is that the Admin is trusted with the server but not with Friends' Plex accounts, so a compromised install must not yield them.

## Consequences

When a Friend's server access token stops working (for example the Admin stops sharing), Decidarr cannot silently recover it; the Friend has to sign in again.
