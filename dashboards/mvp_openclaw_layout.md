# OpenClaw – MVP Dashboard de Gestão de Agentes (Versão 1)

Este layout descreve o MVP do dashboard para Metabase, com visão unificada e design mobile-friendly.

---

## 1) Visão Geral (Home)

### Limites de Modelos

- **Modelo atual:** `[nome_modelo_atual]`
- **Uso atual:** `[uso_atual]` / `[limite_total]` tokens
- **Restante:** `[restante]` tokens
- **Utilização:** `[utilizacao_pct]` %
- **Risco:** `[OK|AVISO|ALERTA]`

### Memória Local

- **Memória total:** `[X]` GB
- **Espaço livre:** `[Y]` GB
- **Espaço utilizado:** `[Z]` GB
- **Memória por serviço:**

  | Serviço        | Uso (MB) |
  |----------------|----------|
  | FX Master      | `[uso_fx_master]` |
  | FlowMaster     | `[uso_flowmaster]` |
  | Agent DevOps   | `[uso_devops]` |
  | Agent Voice    | `[uso_voice]` |
  | Agent Scout    | `[uso_scout]` |
  | Subagentes     | `[uso_subagents]` |

### Subagentes ativos

- **Contagem:** `[n_subagents]`
- **Status agregado:** `[OK|AVISO|ERRO]`

### Alertas pendentes

- **Concessões externas pendentes:** `[n_concessions]`

### Acesso rápido

- Metabase: `[METABASE_LINK]`

---

## 2) Painel Limites de Modelos

- **Gráfico de Barras:** Modelo | Limite | Uso Atual | Restante | Utilização % | Risco
- **Filtros:** Período (Dia/Semana) | Modelo (Dropdown)
- **Histórico:** Tabela de alterações (Quem / Quando)

---

## 3) Painel Memória e Espaço

- **Gráfico de Área:** Memória por Serviço ao longo do tempo
- **KPIs:** Espaço livre (GB), Memória total (GB), Tamanho `memory/*.md`
- **Lista:** Arquivos grandes com tamanho
- **Alerta:** Indicador de baixo espaço

---

## 4) Painel Subagentes

### Tabela: Subagentes

| Nome | Papel | Status | Idade | Skills |
|------|-------|--------|-------|--------|
| ...  | ...   | ...    | ...   | ...    |

**Ações por linha:** Criar Subagente | Duplicar | Apagar (confirmação)

### Formulário rápido: Criar Subagente

- **Campos:** Nome, Papel, Skills, TTL

### Auditoria rápida

- Últimas Criações/Alterações/Deleções (user | timestamp)

---

## 5) Painel Concessões Externas

- **Fila de Solicitações:** ID | Recurso | Status | Solicitante | Tempo na Fila
- **Ações:** Aprovar / Rejeitar (confirmação)
- **Histórico:** Tempo médio de resposta

---

## 6) Dados de Uso de Skills (opcional)

- **Gráfico:** Frequência de uso por Skill e por Agente
- **Insight:** gaps de automação

---

## 7) Diretrizes Mobile-Friendly

- Cards empilhados, abas/menus, drill-down via modal/slide-in
- Navegação com abas: **Geral** | **Limites** | **Memória** | **Subagentes** | **Concessões** | **Logs/Auditoria** | **Skills**

---

## 8) Alertas Telegram (gatilhos)

| Gatilho | Severidade |
|---------|------------|
| Limite de modelo ≥ 80% | 🔴 Crítico |
| Espaço livre baixo | 🟡 Aviso |
| Nova concessão pendente | 🟠 Moderado |

**Conteúdo da mensagem:**

- Título
- Descrição
- Link
- Horário
- Severidade

**Canal:** chat atual

---

## 9) Dados MVP

### Fontes

- `MEMORY.md`
- `memory/openclaw-*.md`
- `memory/openclaw-agents.md`
- `openclaw.json`
- `memory/cleaning-audit.md`

### Alertas

- Canal: **ZMedina**

---

## Entregáveis MVP

- ✅ Views SQL MVP: `mvp_model_limits`, `mvp_memory_space`, `mvp_subagents`, `mvp_external_concessions`, `mvp_skills_usage`
- ✅ Layout MVP em Markdown com placeholders
- ✅ Bootstrap template para Metabase
- ✅ Alerts template para Telegram (pronto para webhook)
- ✅ Mock visual (SVG/PNG) para referência

> **Nota:** Este layout é o ponto único de referência para a versão 1. Posteriormente você pode refinar com dados reais.
