# Alertas Telegram – MVP OpenClaw

Template de alertas para integração via webhook do Telegram.

---

## Configuração do Webhook

```
TELEGRAM_BOT_TOKEN=<SEU_BOT_TOKEN>
TELEGRAM_CHAT_ID=<SEU_CHAT_ID>
TELEGRAM_API=https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage
```

---

## Gatilhos de Alerta

### 1. 🔴 Limite de Modelo ≥ 80%

**Query de detecção:**

```sql
SELECT * FROM mvp_model_limits WHERE "Risco" = 'ALERTA';
```

**Payload Telegram:**

```json
{
  "chat_id": "<CHAT_ID>",
  "parse_mode": "Markdown",
  "text": "🔴 *ALERTA: Limite de Modelo Crítico*\n\n📊 Modelo: `{{modelo}}`\n📈 Utilização: `{{utilizacao_pct}}%`\n🔢 Uso: `{{uso_atual}}` / `{{limite_total}}` tokens\n⏰ Horário: `{{timestamp}}`\n🔗 [Ver Dashboard]({{METABASE_LINK}})"
}
```

---

### 2. 🟡 Espaço Livre Baixo

**Query de detecção:**

```sql
SELECT * FROM mvp_memory_space WHERE "Espaço Livre (MB)" < 500;
```

**Payload Telegram:**

```json
{
  "chat_id": "<CHAT_ID>",
  "parse_mode": "Markdown",
  "text": "🟡 *AVISO: Espaço Livre Baixo*\n\n💾 Serviço: `{{servico}}`\n📉 Espaço livre: `{{espaco_livre}}` MB\n📊 Memória usada: `{{uso_atual}}` MB\n⏰ Horário: `{{timestamp}}`\n🔗 [Ver Dashboard]({{METABASE_LINK}})"
}
```

---

### 3. 🟠 Nova Concessão Pendente

**Query de detecção:**

```sql
SELECT * FROM mvp_external_concessions LIMIT 1;
```

**Payload Telegram:**

```json
{
  "chat_id": "<CHAT_ID>",
  "parse_mode": "Markdown",
  "text": "🟠 *Nova Concessão Pendente*\n\n📋 ID: `{{id}}`\n🔧 Recurso: `{{recurso}}`\n👤 Solicitante: `{{solicitante}}`\n⏳ Tempo na fila: `{{tempo_fila}}` min\n⏰ Horário: `{{timestamp}}`\n🔗 [Ver Dashboard]({{METABASE_LINK}})"
}
```

---

## Exemplo de Envio via cURL

```bash
curl -s -X POST "$TELEGRAM_API" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": "'$TELEGRAM_CHAT_ID'",
    "parse_mode": "Markdown",
    "text": "🔴 *ALERTA: Limite de Modelo Crítico*\nModelo: `gpt-4o`\nUtilização: `85%`"
  }'
```

## Exemplo de Envio via PowerShell

```powershell
$body = @{
    chat_id    = $env:TELEGRAM_CHAT_ID
    parse_mode = "Markdown"
    text       = "🔴 *ALERTA: Limite de Modelo Crítico*`nModelo: ``gpt-4o```nUtilização: ``85%``"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://api.telegram.org/bot$($env:TELEGRAM_BOT_TOKEN)/sendMessage" `
    -Method Post -ContentType "application/json" -Body $body
```

---

## Frequência Recomendada

| Gatilho | Intervalo de Verificação |
|---------|--------------------------|
| Limite de modelo ≥ 80% | A cada 5 minutos |
| Espaço livre baixo | A cada 15 minutos |
| Nova concessão pendente | A cada 1 minuto |

---

## Canal de Destino

- **Canal:** ZMedina (chat atual)
- **Bot:** Configurado via `TELEGRAM_BOT_TOKEN`
