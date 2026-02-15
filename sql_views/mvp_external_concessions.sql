-- View MVP: Concessões Externas
CREATE OR REPLACE VIEW mvp_external_concessions AS
SELECT
  id AS "ID",
  resource AS "Recurso",
  status AS "Status",
  requester AS "Solicitante",
  ROUND(EXTRACT(EPOCH FROM (NOW() - request_timestamp)) / 60, 2) AS "Tempo na Fila (min)",
  response_time_avg_min AS "Tempo Médio Resposta (min)"
FROM external_requests
WHERE status = 'PENDING'
ORDER BY request_timestamp DESC;
