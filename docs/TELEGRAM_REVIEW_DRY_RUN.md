# Telegram Review Dry-Run Guide

This guide covers the Phase 19 real Telegram bot review-channel dry run.

The dry run verifies that the Worker can send a review draft to a configured Telegram review chat or channel using a real bot token when explicitly enabled. It does not enable real final Telegram publishing, WordPress publishing, provider polling, scheduler production behavior, media download, or dashboard behavior.

## Safety rules

- Keep mock behavior as the default.
- Enable real Telegram review sending only for a controlled dry run.
- Do not commit bot tokens, webhook secrets, chat IDs, reviewer IDs, or screenshots that reveal them.
- Do not enable real final Telegram channel publishing as part of this phase.
- Do not run real providers as part of this phase.
- Disable real review mode immediately after the dry run.

## Runtime names

Use these names only through local `.dev.vars`, Cloudflare Worker secrets, or environment-specific deployment configuration. Do not commit values.

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_REVIEW_CHAT_ID
TELEGRAM_FINAL_CHAT_ID
TELEGRAM_ALLOWED_REVIEWER_IDS
TELEGRAM_REAL_REVIEW_ENABLED
INTERNAL_API_SECRET
```

`TELEGRAM_REAL_REVIEW_ENABLED` must be set intentionally before the Worker attempts a real review-channel dry-run send.

## Create a Telegram bot

1. Open BotFather in Telegram.
2. Create a bot or reuse a controlled sandbox bot.
3. Store the bot token only in Cloudflare Worker secrets or local `.dev.vars`.
4. Add the bot to the review chat or channel.
5. Ensure the bot has permission to send messages in that review destination.
6. Capture the review chat or channel id using an operator-approved method.

Do not paste the token or chat id into commits, docs, PR comments, logs, or screenshots.

## Configure Cloudflare secrets

Set runtime values through Cloudflare secrets or environment configuration. Use secret names only in documentation and scripts.

```bash
pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN
pnpm exec wrangler secret put TELEGRAM_WEBHOOK_SECRET
pnpm exec wrangler secret put INTERNAL_API_SECRET
```

Configure non-secret runtime flags and ids through the deployment environment according to the project deployment process. Treat chat IDs as sensitive operational config and avoid exposing them in logs.

Required for the real review dry run:

- `TELEGRAM_BOT_TOKEN` configured
- `TELEGRAM_REVIEW_CHAT_ID` configured
- `TELEGRAM_REAL_REVIEW_ENABLED` intentionally enabled
- `INTERNAL_API_SECRET` configured for deployed internal route protection

`TELEGRAM_FINAL_CHAT_ID` may remain configured for readiness, but this phase does not use it for real final publishing.

## Internal review dry-run route

Route:

```text
POST /internal/telegram/review-dry-run
```

Request body:

```json
{
  "text": "Review dry-run content",
  "sourceUrl": "https://example.com/post"
}
```

When `INTERNAL_API_SECRET` is configured, include the internal route header from your local shell or secret store.

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/telegram/review-dry-run" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"text":"Review dry-run content","sourceUrl":"https://example.com/post"}'
```

Expected response fields:

- `ok`
- `mode`: `mock` or `real`
- `reviewMessageSent`
- `chatConfigured`
- `tokenConfigured`
- `realReviewEnabled`
- `telegramMessageId` when a message is sent
- `error` and `message` when a safe failure occurs

The response must not include the bot token, raw chat id, webhook secret, or internal API secret.

## Expected behavior

Mock/default mode:

- route returns a mock send result
- no real Telegram Bot API call occurs
- no token is required
- no final Telegram publish occurs

Real review dry-run mode:

- route sends one review draft to the review chat using the real Telegram Bot API client
- route requires bot token and review chat configuration
- route returns a structured result
- route does not publish to the final Telegram channel
- route does not enqueue publishing
- route does not call WordPress
- route does not call providers
- route does not process media

## Webhook dry-run notes

Telegram webhook handling already exists at:

```text
POST /telegram/webhook
```

For a controlled webhook dry run:

1. Configure the webhook URL to the deployed Worker route.
2. Use the webhook secret name from runtime configuration.
3. Send a callback from the review message buttons.
4. Confirm callback handling returns a structured acknowledgement.
5. Do not use the callback dry run to enable real final Telegram publishing.

Exact Telegram webhook setup commands depend on the target environment and should be run from a secure operator shell. Do not paste bot tokens into documentation or shared logs.

## Status and readiness checks

`GET /status` may report safe booleans:

- `telegram.reviewChatConfigured`
- `telegram.finalChatConfigured`
- `telegram.botTokenConfigured`
- `telegram.realReviewEnabled`

`GET /ready` may report safe summary booleans:

- `hasTelegramConfig`
- `hasTelegramBotToken`
- `telegramRealReviewEnabled`

Neither route should expose raw Telegram values.

## Disable and rollback

After the dry run:

1. Disable real review mode.
2. Confirm `/status` reports real review disabled.
3. Confirm mock smoke checks still pass.
4. Leave final Telegram publishing disabled unless a later phase explicitly enables it.
5. Rotate or remove temporary Telegram credentials if the dry run used a disposable bot.

If the dry run fails:

1. Disable real review mode.
2. Confirm the Worker still passes `/health`, `/status`, and `/ready`.
3. Check Worker logs for typed errors without secret values.
4. Verify the bot is allowed to send to the review chat.
5. Verify token and chat configuration by presence only, never by printing values.

## Out of scope

Phase 19 does not implement:

- real final Telegram publishing activation
- real WordPress publishing activation
- real provider polling activation
- real scheduler activation
- media download
- dashboard
- production monitoring or alerting
- Phase 20 behavior
