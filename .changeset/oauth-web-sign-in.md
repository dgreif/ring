---
"ring-client-api": patch
---

Sign in with email and password through Ring's OAuth authorization code flow with PKCE (the web sign-in the Ring app uses) instead of the `password` grant on `/oauth/token`, which Ring now rejects with `406 Not Acceptable`. 2fa prompts and codes work as before, and refreshing an existing token is unchanged.
