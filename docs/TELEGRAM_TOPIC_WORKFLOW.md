# Telegram Topic Workflow

Phase 34 completes the safe operating path for the Telegram topic workflow foundation introduced in Phase 33.

The system still stays safe by default:

- One central Telegram bot is used.
- Routing is based on `chat.id` plus `message_thread_id`, not topic names or AI guesses.
- Review remains human-controlled.
- Final Telegram publishing is disabled unless `TELEGRAM_FINAL_PUBLISH_ENABLED=true` is explicitly configured server-side.
- WordPress remains optional.
- Scheduler publishing remains disabled.

## Mental model

Use one central Telegram bot.

The bot is added to:

1. One internal forum supergroup with source topics and review topics.
2. One or more public channels where approved posts may be published when final publishing is explicitly enabled.

The bot is only the messenger. The system does not guess a category from message text or topic title. Routing is deterministic:

```text
source_chat_id + source_thread_id
  -> telegram_routes row
  -> category
  -> prompt_profile
  -> telegram_route_outputs rows
  -> review topic(s)
  -> final channel(s)
```

Topic names such as `Crypto Source` or `Design FA Review` are for humans. The backend uses Telegram IDs.

## Getting chat IDs and topic IDs

The Worker sees these values in Telegram webhook updates:

- `message.chat.id` becomes `sourceChatId` or `reviewChatId`.
- `message.message_thread_id` becomes `sourceThreadId` or `reviewThreadId`.

For setup, send a test message in the source topic and inspect the webhook/debug payload in the Worker logs or safe internal tooling. Do not rely on the visible topic name.

## Example structure

Internal Telegram forum supergroup:

```text
Content Ops
  - Crypto Source
  - Crypto FA Review
  - Crypto EN Review
  - Design Source
  - Design FA Review
```

Public channels:

```text
@crypto_fa
@crypto_en
@design_fa
```

Example route:

```json
{
  "id": "crypto",
  "category": "crypto",
  "sourceChatId": "-1001111111111",
  "sourceThreadId": 101,
  "promptProfile": "crypto_editorial",
  "outputs": [
    {
      "id": "crypto_fa",
      "language": "fa",
      "reviewChatId": "-1001111111111",
      "reviewThreadId": 201,
      "finalChatId": "@crypto_fa"
    },
    {
      "id": "crypto_en",
      "language": "en",
      "reviewChatId": "-1001111111111",
      "reviewThreadId": 202,
      "finalChatId": "@crypto_en"
    }
  ]
}
```

## Workflow

When a Telegram message arrives in a configured source topic:

1. `/telegram/webhook` parses the update.
2. The Worker reads `chat.id` and `message_thread_id`.
3. The Worker looks up an enabled route in `telegram_routes`.
4. If no route exists, the update is safely ignored and no item is created.
5. If a route exists, the existing ingest gate creates the item.
6. Telegram media metadata is stored when present.
7. One generated output is created for each enabled route output/language.
8. One review draft is sent to each configured review topic.
9. The reviewer can choose `Send`, `Cancel`, or `Status` for each output.
10. `Send` affects only that one language/output.

## Review buttons

Review drafts use output-level callback data:

```text
tgout:send:<generated_output_id>
tgout:cancel:<generated_output_id>
tgout:status:<generated_output_id>
```

`Send` creates or reuses a `telegram_publish_queue` row.

If final publishing is disabled, the callback response says:

```text
Queued. Final Telegram publishing is disabled.
```

If final publishing is enabled server-side, the Worker attempts final Telegram publishing and updates the generated output and queue statuses.

## Final publishing flag

Final publishing is controlled by:

```text
TELEGRAM_FINAL_PUBLISH_ENABLED=false
```

Default is false in local and production Wrangler config.

To enable final publishing, set this intentionally in Worker environment/admin-protected runtime configuration. Do not expose casual one-click public publishing to normal operators.

Required for real final publishing:

- `TELEGRAM_FINAL_PUBLISH_ENABLED=true`
- `TELEGRAM_BOT_TOKEN` configured as a Worker Secret or encrypted admin secret
- Bot admin/posting permission in the final channel
- A configured `finalChatId` for the route output

## Media behavior

Phase 34 supports metadata-first media publishing.

Incoming Telegram source messages store:

- `file_id`
- `file_unique_id`
- media type
- MIME type when present
- size when present
- width/height/duration when present
- `media_group_id` when present

Final publish can reuse Telegram `file_id` for:

- photo -> `sendPhoto`
- video or animation -> `sendVideo`
- document -> `sendDocument`

If no media is available, the Worker uses `sendMessage`.

Real download/upload to R2 remains a later step. If storage is not configured, the workflow does not crash; it remains metadata/file-id based.

## Safe seed endpoint for development

This internal route seeds route config:

```text
POST /internal/telegram/topic-routes/seed
```

It requires `x-internal-api-secret` when `INTERNAL_API_SECRET` is configured.

Example local call:

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/telegram/topic-routes/seed" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  --data @telegram-routes.local.json
```

Do not paste real secrets into route config files.

## Required bot permissions

For the internal forum supergroup:

- The bot must be present in the group.
- The bot must be able to receive messages in source topics.
- The bot must be able to send messages in review topics.

For public channels:

- The bot must be an admin.
- The bot must have permission to post messages.

## Status and readiness

`/status` includes:

```text
telegram.topicWorkflow.topicWorkflowConfigured
telegram.topicWorkflow.routeCount
telegram.topicWorkflow.enabledRouteCount
telegram.topicWorkflow.outputCount
telegram.topicWorkflow.enabledOutputCount
telegram.topicWorkflow.botTokenConfigured
telegram.topicWorkflow.reviewRoutingConfigured
telegram.topicWorkflow.finalPublishingEnabled
telegram.topicWorkflow.wordpressOptional
telegram.topicWorkflow.mediaMode
telegram.topicWorkflow.warnings
```

`/ready` includes the same topic workflow summary under `summary.telegramTopicWorkflow`.

No secret values are returned.

## WordPress remains optional

Missing WordPress settings do not block the Telegram topic workflow.

WordPress draft and publishing behavior remain separate from this Telegram-first workflow.

## Troubleshooting

If a source message is ignored, check:

- The source topic has a `telegram_routes` row.
- `sourceChatId` matches `message.chat.id`.
- `sourceThreadId` matches `message.message_thread_id`.
- The route is enabled.
- The route has at least one enabled output.

If review messages are not sent, check:

- `TELEGRAM_BOT_TOKEN` is configured.
- `TELEGRAM_REAL_REVIEW_ENABLED=true` if you expect real Telegram delivery.
- The bot can post in the review topic.

If Send only queues, that is expected while `TELEGRAM_FINAL_PUBLISH_ENABLED=false`.

## Intentionally not included yet

- R2 media download/upload.
- Provider automation from Apify/X/Instagram into route IDs.
- Full dashboard route editor.
- Scheduler publishing.
- Public WordPress publishing.
