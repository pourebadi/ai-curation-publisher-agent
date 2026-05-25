# Telegram Topic Workflow

Phase 33 adds the backend foundation for a Telegram-only, topic-based, multilingual, review-first workflow.

This phase is safe by default. It does **not** enable real final public publishing. It does **not** make WordPress required. It does **not** enable real providers or scheduler publishing.

## Mental model

Use one central Telegram bot.

The bot is added to:

1. One internal forum supergroup with source topics and review topics.
2. One or more public channels where approved posts may be published in a later phase.

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

## What happens in Phase 33

When a Telegram message arrives in a configured source topic:

1. `/telegram/webhook` parses the update.
2. The Worker reads `chat.id` and `message_thread_id`.
3. The Worker looks up an enabled route in `telegram_routes`.
4. If no route exists, the update is safely ignored and no item is created.
5. If a route exists, the existing ingest gate creates the item.
6. Telegram media metadata is stored when present. Real media download is not required in this phase.
7. One generated output is created for each enabled route output/language.
8. One review draft is sent to each configured review topic.
9. The reviewer can choose `Send`, `Cancel`, or `Status` for each output.
10. `Send` queues that one language output only. Final publishing remains disabled.

## Review buttons

Phase 33 review drafts use output-level callback data:

```text
tgout:send:<generated_output_id>
tgout:cancel:<generated_output_id>
tgout:status:<generated_output_id>
```

`Send` affects only the selected generated output/language. It creates a `telegram_publish_queue` row and sets the output to `queued_for_publish`.

It does not send the post to the public channel in this phase.

The callback response says:

```text
Queued. Final Telegram publishing is disabled.
```

## Safe seed endpoint for development

Phase 33 adds this internal route:

```text
POST /internal/telegram/topic-routes/seed
```

It requires `x-internal-api-secret` when `INTERNAL_API_SECRET` is configured.

Example request body:

```json
{
  "routes": [
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
        }
      ]
    }
  ]
}
```

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

For public channels used in later phases:

- The bot must be an admin.
- The bot must have permission to post messages.

Phase 33 stores final channel IDs but does not publish to them.

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
telegram.topicWorkflow.warnings
```

`/ready` includes the same topic workflow summary under `summary.telegramTopicWorkflow`.

No secret values are returned.

## WordPress remains optional

Missing WordPress settings do not block the Telegram topic workflow.

WordPress draft and publishing behavior remain separate from this Telegram-only workflow.

## Intentionally not included in Phase 33

- Real final Telegram public publishing.
- Real media download/upload.
- Provider automation from Apify/X/Instagram into route IDs.
- Dashboard route editor.
- Scheduler publishing.
- Public WordPress publishing.

These are later phases.
