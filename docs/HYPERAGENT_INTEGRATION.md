# Hyperagent Integration Runbook

## Endpoints

- `POST /api/integrations/hyperagent/webhook`
- `POST /api/integrations/hyperagent/sync`
- `GET /api/integrations/hyperagent/status`

## Environment Variables

Set these in `.env.local`:

- `HYPERAGENT_WEBHOOK_SECRET`
- `HYPERAGENT_REPLAY_WINDOW_MS`
- `HYPERAGENT_SYNC_ENDPOINT`
- `HYPERAGENT_SYNC_TOKEN`
- `HYPERAGENT_SYNC_TIMEOUT_MS`
- `HYPERAGENT_SYNC_MAX_RETRIES`

## Curl Tests

Assume deployment URL:

```bash
export MC_URL="https://gateway.nak3deye.com"
```

### 1) Check integration status

```bash
curl -sS "$MC_URL/api/integrations/hyperagent/status" | jq
```

### 2) Trigger outbound full sync

```bash
curl -sS -X POST "$MC_URL/api/integrations/hyperagent/sync" \
  -H "content-type: application/json" \
  -d '{"mode":"full"}' | jq
```

### 3) Trigger outbound single-task sync

```bash
curl -sS -X POST "$MC_URL/api/integrations/hyperagent/sync" \
  -H "content-type: application/json" \
  -d '{"mode":"task","task_id":"REPLACE_WITH_TASK_UUID"}' | jq
```

### 4) Send signed inbound Hyperagent webhook event

```bash
export HYPERAGENT_WEBHOOK_SECRET="replace-with-your-secret"
export EVENT_TS="$(date +%s)"
export EVENT_ID="evt-$(uuidgen)"
export BODY='{"event_id":"'"$EVENT_ID"'","event_type":"agent.run.completed","task_id":null,"thread_id":"thread_123","summary":"Hyperagent run completed","status":"completed"}'
export SIG="$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$HYPERAGENT_WEBHOOK_SECRET" -hex | sed 's/^.* //')"

curl -sS -X POST "$MC_URL/api/integrations/hyperagent/webhook" \
  -H "content-type: application/json" \
  -H "x-hyperagent-signature: $SIG" \
  -H "x-hyperagent-event-id: $EVENT_ID" \
  -H "x-hyperagent-timestamp: $EVENT_TS" \
  -d "$BODY" | jq
```
