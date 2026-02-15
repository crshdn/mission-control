-- View MVP: Limites de Modelos
CREATE OR REPLACE VIEW mvp_model_limits AS
SELECT
  mc.model_name AS "Modelo",
  mc.limit_tokens AS "Limite Total",
  COALESCE(mu.current_usage, 0) AS "Uso Atual",
  (mc.limit_tokens - COALESCE(mu.current_usage, 0)) AS "Restante",
  ROUND((COALESCE(mu.current_usage, 0) * 100.0 / mc.limit_tokens), 2) AS "Utilização %",
  CASE
    WHEN (COALESCE(mu.current_usage, 0) * 100.0 / mc.limit_tokens) >= 0.8 THEN 'ALERTA'
    WHEN (COALESCE(mu.current_usage, 0) * 100.0 / mc.limit_tokens) >= 0.5 THEN 'AVISO'
    ELSE 'OK'
  END AS "Risco"
FROM model_configurations mc
LEFT JOIN model_usage mu ON mc.model_name = mu.model_name
ORDER BY mc.model_name;
