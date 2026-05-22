# WordPress Dry-Run Guide

This guide covers the Phase 20 WordPress publishing dry run.

The dry run verifies WordPress configuration, payload construction, authentication readiness, and optional draft creation. It does not enable public WordPress publishing by default.

## Safety rules

- Keep mock WordPress behavior as the default.
- Enable real WordPress dry-run mode only for a controlled draft test.
- Real mode must create drafts only in this phase.
- Do not commit WordPress credentials, application passwords, usernames, private URLs, or screenshots that reveal them.
- Do not trigger Telegram, providers, media processing, scheduler behavior, or public publishing from this route.
- Disable real dry-run mode after verification.

## Runtime names

Use these names only through local `.dev.vars`, Cloudflare Worker secrets, or environment-specific deployment configuration. Do not commit values.

```text
WORDPRESS_BASE_URL
WORDPRESS_USERNAME
WORDPRESS_APPLICATION_PASSWORD
WORDPRESS_DEFAULT_STATUS
WORDPRESS_REAL_DRY_RUN_ENABLED
INTERNAL_API_SECRET
```

`WORDPRESS_REAL_DRY_RUN_ENABLED` must be set intentionally before the Worker attempts a real WordPress draft dry-run.

`WORDPRESS_DEFAULT_STATUS` defaults to `draft`. The Phase 20 real dry-run operation still forces draft creation even if another value is configured.

## Create a WordPress application password

1. Open the WordPress admin area.
2. Go to the profile for the user intended for API publishing dry runs.
3. Create an application password.
4. Store it only in Cloudflare Worker secrets or local `.dev.vars`.
5. Confirm the user can create draft posts.
6. Do not paste the application password into commits, docs, PR comments, logs, or screenshots.

## Configure runtime values

Set sensitive runtime values through Cloudflare secrets or the equivalent secure deployment mechanism.

```bash
pnpm exec wrangler secret put WORDPRESS_APPLICATION_PASSWORD
pnpm exec wrangler secret put INTERNAL_API_SECRET
```

Configure non-secret runtime flags and URLs according to the deployment environment process. Treat usernames and private base URLs as operational config and avoid exposing them in logs.

Required for the real dry run:

- `WORDPRESS_BASE_URL` configured
- `WORDPRESS_USERNAME` configured
- `WORDPRESS_APPLICATION_PASSWORD` configured
- `WORDPRESS_REAL_DRY_RUN_ENABLED` intentionally enabled
- `INTERNAL_API_SECRET` configured for deployed internal route protection

## Internal WordPress dry-run route

Route:

```text
POST /internal/wordpress/dry-run
```

Request body:

```json
{
  "title": "Dry-run post title",
  "content": "Dry-run post content",
  "sourceUrl": "https://example.com/source"
}
```

When `INTERNAL_API_SECRET` is configured, include the internal route header from your local shell or secret store.

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/wordpress/dry-run" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"title":"Dry-run post title","content":"Dry-run post content","sourceUrl":"https://example.com/source"}'
```

Expected response fields:

- `ok`
- `mode`: `mock` or `real`
- `inspectOnly`
- `draftRequested`
- `wordpressConfigured`
- `credentialsConfigured`
- `realDryRunEnabled`
- `statusRequested`
- `payloadPrepared`
- `postCreated`
- `wordpressPostId` when a post is created
- `wordpressUrl` when a post URL is returned
- `error` and `message` when a safe failure occurs

The response must not include the WordPress username, application password, internal API secret, or other raw credential values.

## Expected behavior

Mock/default mode:

- route prepares a WordPress payload
- route returns a mock post result
- no real WordPress REST API call occurs
- no credentials are required

Real dry-run mode:

- route requires explicit enablement
- route requires WordPress base URL, username, and application password configuration
- route creates a draft only
- route returns structured draft metadata
- route does not create a public post
- route does not enqueue publishing
- route does not call Telegram
- route does not call providers
- route does not process media
- route does not schedule anything

## Status and readiness checks

`GET /status` may report safe booleans:

- `wordpress.configured`
- `wordpress.baseUrlConfigured`
- `wordpress.credentialsConfigured`
- `wordpress.realDryRunEnabled`
- `wordpress.defaultStatus`

`GET /ready` may report safe summary booleans:

- `hasWordPressConfig`
- `hasWordPressBaseUrl`
- `hasWordPressCredentials`
- `wordpressRealDryRunEnabled`
- `wordpressDefaultStatus`

Neither route should expose raw WordPress values.

## Verify the draft in WordPress

After a successful real dry run:

1. Open WordPress admin.
2. Go to Posts.
3. Filter by drafts.
4. Find the dry-run title used in the request.
5. Confirm the post is not public.
6. Delete the draft if it is no longer needed.

## Disable and rollback

After the dry run:

1. Disable real WordPress dry-run mode.
2. Confirm `/status` reports real dry-run disabled.
3. Confirm mock smoke checks still pass.
4. Delete any dry-run drafts that should not remain in WordPress.
5. Rotate or remove temporary credentials if disposable credentials were used.

If the dry run fails:

1. Disable real WordPress dry-run mode.
2. Confirm `/health`, `/status`, and `/ready` still work.
3. Check Worker logs for typed errors without credential values.
4. Verify WordPress base URL, username, and application password by presence only, never by printing values.
5. Confirm the WordPress user can create drafts.

## Out of scope

Phase 20 does not implement:

- public WordPress publishing activation
- automatic WordPress publishing
- scheduler activation
- real provider activation
- real final Telegram publishing activation
- media upload to WordPress
- dashboard
- Phase 21 behavior
