# OpenClaw MVP – Monitor de Agentes

> Dashboard de gestão unificada para agentes autônomos, com views SQL, layout Metabase e alertas Telegram.

---

## 📁 Estrutura do Repositório

```
mission-control/
├── sql_views/
│   ├── mvp_model_limits.sql        # Limites de modelos e risco
│   ├── mvp_memory_space.sql        # Memória e espaço em disco
│   ├── mvp_subagents.sql           # Listagem de subagentes
│   ├── mvp_external_concessions.sql# Concessões externas pendentes
│   └── mvp_skills_usage.sql        # Uso de skills (opcional)
├── dashboards/
│   └── mvp_openclaw_layout.md      # Layout completo do dashboard
├── bootstrap/
│   └── metabase_mvp_setup.ps1      # Script de setup do Metabase
├── alerts/
│   └── telegram_mvp_alerts.md      # Templates de alertas Telegram
└── README_openclaw_mvp.md          # Este arquivo
```

---

## 🚀 Quick Start

### 1. Pré-requisitos

- **PostgreSQL** instalado e acessível (`psql` no PATH)
- **Metabase** instalado (local ou Docker)
- **Telegram Bot** criado via [@BotFather](https://t.me/BotFather)

### 2. Bootstrap do Banco de Dados

```powershell
cd mission-control/bootstrap
.\metabase_mvp_setup.ps1 -DbHost localhost -DbPort 5432 -DbName mission_control -DbUser postgres
```

O script irá:

1. Verificar a conexão com o PostgreSQL
2. Executar todas as 5 views SQL
3. Validar que as views foram criadas com sucesso

### 3. Configurar o Metabase

1. Abra o Metabase e conecte ao banco `mission_control`
2. Crie **Questions** baseadas nas views:
   - `mvp_model_limits` → Gráfico de Barras
   - `mvp_memory_space` → Gráfico de Área
   - `mvp_subagents` → Tabela
   - `mvp_external_concessions` → Tabela com filtro
   - `mvp_skills_usage` → Gráfico (opcional)
3. Monte o dashboard conforme `dashboards/mvp_openclaw_layout.md`

### 4. Configurar Alertas Telegram

1. Defina as variáveis de ambiente:

   ```powershell
   $env:TELEGRAM_BOT_TOKEN = "<SEU_BOT_TOKEN>"
   $env:TELEGRAM_CHAT_ID   = "<SEU_CHAT_ID>"
   ```

2. Siga os templates em `alerts/telegram_mvp_alerts.md`
3. Configure os intervalos de verificação conforme recomendado

---

## 📊 Views SQL

| View | Descrição | Tabelas Base |
|------|-----------|-------------|
| `mvp_model_limits` | Limites de tokens por modelo, uso atual e nível de risco | `model_configurations`, `model_usage` |
| `mvp_memory_space` | Memória alocada/usada e espaço em disco | `agent_process_metrics`, `system_storage_metrics` |
| `mvp_subagents` | Lista de subagentes com papel, status e skills | `subagents_data` |
| `mvp_external_concessions` | Solicitações externas pendentes | `external_requests` |
| `mvp_skills_usage` | Frequência de uso de skills por agente | `skill_usage_logs`, `agent_logs` |

---

## 🔔 Alertas

| Gatilho | Severidade | Intervalo |
|---------|------------|-----------|
| Limite de modelo ≥ 80% | 🔴 Crítico | 5 min |
| Espaço livre baixo | 🟡 Aviso | 15 min |
| Nova concessão pendente | 🟠 Moderado | 1 min |

**Canal:** ZMedina

---

## 📱 Mobile-Friendly

O layout foi projetado para ser responsivo:

- Cards empilhados em telas pequenas
- Navegação por abas: Geral | Limites | Memória | Subagentes | Concessões | Skills
- Drill-down via modal/slide-in

---

## 📋 Fontes de Dados MVP

- `MEMORY.md`
- `memory/openclaw-*.md`
- `memory/openclaw-agents.md`
- `openclaw.json`
- `memory/cleaning-audit.md`

---

## 📝 Observações

- Este é o **MVP (Versão 1)**. Refine com dados reais conforme necessidade.
- Substitua todos os placeholders `[...]` nos templates pelos valores do seu ambiente.
- Para dúvidas ou sugestões, abra uma issue no repositório.
