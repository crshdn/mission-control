# ============================================================
# Metabase MVP Bootstrap Script
# OpenClaw – Gestão de Agentes
# ============================================================
# Este script configura o ambiente Metabase para o MVP.
# Requisitos: PostgreSQL instalado e acessível, psql no PATH.
# ============================================================

param(
    [string]$DbHost     = "localhost",
    [string]$DbPort     = "5432",
    [string]$DbName     = "mission_control",
    [string]$DbUser     = "postgres",
    [string]$DbPassword = ""
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " OpenClaw MVP – Metabase Bootstrap" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ---------- 1. Verificar conexão com PostgreSQL ----------
Write-Host "[1/4] Verificando conexão com PostgreSQL..." -ForegroundColor Yellow

try {
    $env:PGPASSWORD = $DbPassword
    $result = & psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -c "SELECT 1;" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao conectar: $result"
    }
    Write-Host "  ✅ Conectado a $DbName@$DbHost:$DbPort" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Erro de conexão: $_" -ForegroundColor Red
    Write-Host "  Verifique as credenciais e se o PostgreSQL está rodando." -ForegroundColor Red
    exit 1
}

# ---------- 2. Executar SQL Views ----------
Write-Host ""
Write-Host "[2/4] Criando SQL Views MVP..." -ForegroundColor Yellow

$sqlDir = Join-Path $PSScriptRoot "..\sql_views"
$sqlFiles = @(
    "mvp_model_limits.sql",
    "mvp_memory_space.sql",
    "mvp_subagents.sql",
    "mvp_external_concessions.sql",
    "mvp_skills_usage.sql"
)

foreach ($file in $sqlFiles) {
    $filePath = Join-Path $sqlDir $file
    if (Test-Path $filePath) {
        Write-Host "  Executando $file..." -NoNewline
        & psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -f $filePath 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host " ✅" -ForegroundColor Green
        } else {
            Write-Host " ⚠️ (verifique tabelas base)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ⚠️ Arquivo não encontrado: $file" -ForegroundColor Yellow
    }
}

# ---------- 3. Verificar Views Criadas ----------
Write-Host ""
Write-Host "[3/4] Verificando views criadas..." -ForegroundColor Yellow

$views = @(
    "mvp_model_limits",
    "mvp_memory_space",
    "mvp_subagents",
    "mvp_external_concessions",
    "mvp_skills_usage"
)

foreach ($view in $views) {
    $check = & psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -t -c "SELECT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = '$view');" 2>&1
    $exists = $check.Trim()
    if ($exists -eq "t") {
        Write-Host "  ✅ $view" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $view (não encontrada)" -ForegroundColor Red
    }
}

# ---------- 4. Resumo ----------
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Bootstrap concluído!" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Próximos passos:" -ForegroundColor White
Write-Host "  1. Abra o Metabase e conecte ao banco '$DbName'" -ForegroundColor White
Write-Host "  2. Crie perguntas (Questions) baseadas nas views:" -ForegroundColor White
foreach ($view in $views) {
    Write-Host "     - $view" -ForegroundColor Gray
}
Write-Host "  3. Monte o dashboard conforme dashboards/mvp_openclaw_layout.md" -ForegroundColor White
Write-Host "  4. Configure alertas Telegram conforme alerts/telegram_mvp_alerts.md" -ForegroundColor White
Write-Host ""
Write-Host "Documentação completa: README_openclaw_mvp.md" -ForegroundColor Gray
