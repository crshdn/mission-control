-- View MVP: Memória e Espaço
CREATE OR REPLACE VIEW mvp_memory_space AS
SELECT
  'Total' AS "Serviço",
  SUM(allocated_memory_mb) AS "Memória Total (MB)",
  SUM(CASE WHEN status = 'running' THEN memory_used_mb ELSE 0 END) AS "Uso Atual (MB)",
  (SUM(allocated_memory_mb) - SUM(CASE WHEN status = 'running' THEN memory_used_mb ELSE 0 END)) AS "Espaço Livre (MB)",
  (SELECT available_disk_gb FROM system_storage_metrics WHERE partition = '/') AS "Espaço Disco Livre (GB)"
FROM
  agent_process_metrics
UNION ALL
SELECT
  'Host Storage' AS "Serviço",
  NULL AS "Memória Total (MB)",
  NULL AS "Uso Atual (MB)",
  available_disk_gb AS "Espaço Livre (MB)",
  NULL AS "Espaço Disco Livre (GB)"
FROM system_storage_metrics
WHERE partition = '/'
ORDER BY "Serviço";
