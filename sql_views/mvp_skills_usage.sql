-- View MVP: Uso de Skills (opcional)
CREATE OR REPLACE VIEW mvp_skills_usage AS
SELECT
  u.skill_name AS "Skill",
  a.agent_name AS "Agente",
  COUNT(*) AS "Usos"
FROM skill_usage_logs u
JOIN agent_logs a ON u.agent_log_id = a.id
GROUP BY u.skill_name, a.agent_name
ORDER BY "Usos" DESC;
