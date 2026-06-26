# Claude Session Transcript: OAuth Bug

User: Fix Google OAuth redirect bug in production. Local login works, but production Google login returns 400.

Assistant explored `app/api/auth/callback/route.ts`, `lib/auth/google.ts`, and `tests/auth/session.test.ts`.

Decision: Do not rewrite the auth provider.
Decision: Do not change session cookie format.
Constraint: Preserve existing email login behavior.

Failed attempt: Changing callback path alone did not fix the production redirect.
Current failure: Production OAuth callback returns 400.
Test failure: session.test.ts fails because session token is undefined.

Commands:
- pnpm test auth
- pnpm lint

Next step: Check redirect URI construction.

Raw terminal noise:

The agent read the same auth files several times while comparing local and production redirect behavior. It pasted full callback route output, repeated the same Google OAuth stack trace, and copied Vercel environment notes into the session. The only durable facts are the task, touched files, constraints, failures, commands, and next step above.

Repeated stack trace:
Google OAuth error 400 invalid_request redirect_uri_mismatch at OAuthClient.exchangeCode
Google OAuth error 400 invalid_request redirect_uri_mismatch at OAuthClient.exchangeCode
Google OAuth error 400 invalid_request redirect_uri_mismatch at OAuthClient.exchangeCode
Google OAuth error 400 invalid_request redirect_uri_mismatch at OAuthClient.exchangeCode
Google OAuth error 400 invalid_request redirect_uri_mismatch at OAuthClient.exchangeCode
Google OAuth error 400 invalid_request redirect_uri_mismatch at OAuthClient.exchangeCode
Google OAuth error 400 invalid_request redirect_uri_mismatch at OAuthClient.exchangeCode
Google OAuth error 400 invalid_request redirect_uri_mismatch at OAuthClient.exchangeCode
Google OAuth error 400 invalid_request redirect_uri_mismatch at OAuthClient.exchangeCode
Google OAuth error 400 invalid_request redirect_uri_mismatch at OAuthClient.exchangeCode

Large copied diff excerpt:
The redirect helper was inspected with surrounding imports, test setup, callback handler, provider initialization, cookie serialization, and repeated unchanged code blocks. Those details are intentionally omitted from the expected ctxcarry unless they identify a touched file or continuity-critical decision.
