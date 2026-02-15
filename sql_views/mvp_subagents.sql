-- View MVP: Subagentes
CREATE OR REPLACE VIEW mvp_subagents AS
SELECT
  name AS "Nome",
  role AS "Papel",
  status AS "Status",
  DATE_PART('day', NOW() - creation_timestamp) AS "Idade (dias)",
  skills AS "Skills",
  creation_timestamp AS "Criação"
FROM subagents_data
ORDER BY name;
