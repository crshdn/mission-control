import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(os.tmpdir(), `bootstrap-agents-${process.pid}-${Date.now()}.db`);

const { closeDb, getDb, queryAll, queryOne, run } = require('./db');
const {
  bootstrapCoreAgentsRaw,
  alignDefaultWorkspaceBaselineRaw,
  DEFAULT_LEGACY_ARCHIVE_WORKSPACE_ID,
} = require('./bootstrap-agents');

test.after(() => {
  closeDb();
  fs.rmSync(process.env.DATABASE_PATH!, { force: true });
});

function seedWorkspace(id: string, name = `Workspace ${id}`) {
  run(
    `INSERT OR IGNORE INTO workspaces (id, name, slug, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, name, `workspace-${id}`, `${name} description`],
  );
}

function seedAgent(input: {
  id: string;
  workspaceId: string;
  name: string;
  role: string;
  source?: 'local' | 'gateway';
  isMaster?: number;
  sessionKeyPrefix?: string | null;
  soulMd?: string | null;
  userMd?: string | null;
  agentsMd?: string | null;
}) {
  run(
    `INSERT INTO agents (
      id, name, role, description, avatar_emoji, status, is_master, workspace_id,
      soul_md, user_md, agents_md, source, session_key_prefix, created_at, updated_at
    ) VALUES (?, ?, ?, ?, '🤖', 'standby', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      input.id,
      input.name,
      input.role,
      `${input.name} description`,
      input.isMaster || 0,
      input.workspaceId,
      input.soulMd ?? null,
      input.userMd ?? null,
      input.agentsMd ?? null,
      input.source || 'local',
      input.sessionKeyPrefix ?? null,
    ],
  );
}

function seedProduct(name: string, status = 'active') {
  run(
    `INSERT INTO products (
      id, workspace_id, name, description, repo_url, product_program, status, build_mode, created_at, updated_at
    ) VALUES (?, 'default', ?, ?, '', ?, ?, 'plan_first', datetime('now'), datetime('now'))`,
    [crypto.randomUUID(), name, `${name} description`, `${name} program`, status],
  );
}

test('bootstrapCoreAgentsRaw seeds the governed baseline with explicit routing and communication rules', () => {
  const workspaceId = `ws-${crypto.randomUUID()}`;
  seedWorkspace(workspaceId);

  bootstrapCoreAgentsRaw(getDb(), workspaceId, 'http://localhost:4000');

  const agents = queryAll<{
    name: string;
    role: string;
    is_master: number;
    session_key_prefix: string | null;
    soul_md: string | null;
    user_md: string | null;
    agents_md: string | null;
  }>(
    `SELECT name, role, is_master, session_key_prefix, soul_md, user_md, agents_md
     FROM agents
     WHERE workspace_id = ?
     ORDER BY is_master DESC, name ASC`,
    [workspaceId],
  );

  assert.deepEqual(
    agents.map(agent => agent.name),
    ['Coordinator', 'Builder', 'Learner', 'Reviewer', 'Tester'],
  );
  assert.equal(agents.filter(agent => agent.is_master === 1).length, 1);
  assert.equal(agents.find(agent => agent.name === 'Coordinator')?.role, 'orchestrator');

  for (const agent of agents) {
    assert.ok(agent.session_key_prefix);
    assert.ok((agent.soul_md || '').length > 0);
    assert.ok((agent.user_md || '').length > 0);
    assert.ok((agent.agents_md || '').length > 0);
  }

  const coordinator = agents.find(agent => agent.name === 'Coordinator');
  assert.match(coordinator?.agents_md || '', /queued notes/i);
  assert.match(coordinator?.agents_md || '', /direct messages/i);
  assert.match(coordinator?.agents_md || '', /convoy mail/i);
});

test('alignDefaultWorkspaceBaselineRaw repurposes legacy core agents, moves drift out, and archives validation products', () => {
  run(`DELETE FROM products WHERE workspace_id = 'default'`);
  run(`DELETE FROM agents WHERE workspace_id = 'default'`);

  const legacyBuilderId = crypto.randomUUID();
  const duplicateBuilderId = crypto.randomUUID();
  const legacyTesterId = crypto.randomUUID();
  const legacyReviewerId = crypto.randomUUID();
  const legacyLearnerId = crypto.randomUUID();
  const driftGatewayId = crypto.randomUUID();
  const driftLocalId = crypto.randomUUID();

  seedAgent({
    id: legacyBuilderId,
    workspaceId: 'default',
    name: 'Builder Agent',
    role: 'builder',
    sessionKeyPrefix: 'agent:coder:',
    soulMd: 'legacy builder soul',
    userMd: '',
    agentsMd: '',
  });
  seedAgent({
    id: duplicateBuilderId,
    workspaceId: 'default',
    name: 'Builder',
    role: 'builder',
    sessionKeyPrefix: 'agent:coder:',
    soulMd: 'duplicate builder soul',
    userMd: '',
    agentsMd: '',
  });
  seedAgent({
    id: legacyTesterId,
    workspaceId: 'default',
    name: 'Tester Agent',
    role: 'tester',
    sessionKeyPrefix: 'agent:worker:',
    soulMd: 'legacy tester soul',
    userMd: '',
    agentsMd: '',
  });
  seedAgent({
    id: legacyReviewerId,
    workspaceId: 'default',
    name: 'Reviewer Agent',
    role: 'reviewer',
    sessionKeyPrefix: 'agent:coder:',
    soulMd: 'legacy reviewer soul',
    userMd: '',
    agentsMd: '',
  });
  seedAgent({
    id: legacyLearnerId,
    workspaceId: 'default',
    name: 'Learner Agent',
    role: 'learner',
    sessionKeyPrefix: 'agent:worker:',
    soulMd: 'legacy learner soul',
    userMd: '',
    agentsMd: '',
  });
  seedAgent({
    id: driftGatewayId,
    workspaceId: 'default',
    name: 'Crusty',
    role: 'builder',
    source: 'gateway',
    sessionKeyPrefix: null,
    soulMd: null,
    userMd: null,
    agentsMd: null,
  });
  seedAgent({
    id: driftLocalId,
    workspaceId: 'default',
    name: 'FrontendBuilder',
    role: 'builder',
    source: 'local',
    sessionKeyPrefix: 'agent:main:',
    soulMd: 'tiny',
    userMd: '',
    agentsMd: '',
  });

  seedProduct('Smoke Product 2026-03-24T04:30:24.121Z');
  seedProduct('Self Improvement Validation 2026-03-24T05:35:01.285Z');
  seedProduct('Disposable PR Validation 2026-03-24T04:48:56.038Z');

  alignDefaultWorkspaceBaselineRaw(getDb(), 'http://localhost:4000');

  const defaultAgents = queryAll<{
    id: string;
    name: string;
    workspace_id: string;
    is_master: number;
    session_key_prefix: string | null;
    user_md: string | null;
    agents_md: string | null;
  }>(
    `SELECT id, name, workspace_id, is_master, session_key_prefix, user_md, agents_md
     FROM agents
     WHERE workspace_id = 'default'
     ORDER BY is_master DESC, name ASC`
  );

  assert.deepEqual(
    defaultAgents.map(agent => agent.name),
    ['Coordinator', 'Builder', 'Learner', 'Reviewer', 'Tester'],
  );
  assert.equal(defaultAgents.filter(agent => agent.name === 'Builder').length, 1);
  assert.equal(defaultAgents.some(agent => agent.id === duplicateBuilderId), true);
  assert.equal(defaultAgents.some(agent => agent.id === legacyBuilderId), false);

  for (const agent of defaultAgents) {
    assert.ok(agent.session_key_prefix);
    assert.ok((agent.user_md || '').length > 0);
    assert.ok((agent.agents_md || '').length > 0);
  }

  const archiveWorkspace = queryOne<{ id: string }>(
    `SELECT id FROM workspaces WHERE id = ?`,
    [DEFAULT_LEGACY_ARCHIVE_WORKSPACE_ID],
  );
  assert.equal(archiveWorkspace?.id, DEFAULT_LEGACY_ARCHIVE_WORKSPACE_ID);

  const archivedDrift = queryAll<{ id: string; workspace_id: string; status: string }>(
    `SELECT id, workspace_id, status
     FROM agents
     WHERE id IN (?, ?, ?)
     ORDER BY id ASC`,
    [legacyBuilderId, driftGatewayId, driftLocalId],
  );
  assert.deepEqual(
    archivedDrift.map(agent => agent.workspace_id),
    [DEFAULT_LEGACY_ARCHIVE_WORKSPACE_ID, DEFAULT_LEGACY_ARCHIVE_WORKSPACE_ID, DEFAULT_LEGACY_ARCHIVE_WORKSPACE_ID],
  );
  assert.ok(archivedDrift.every(agent => agent.status === 'offline'));

  const activeDefaultProducts = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM products WHERE workspace_id = 'default' AND status = 'active'`
  );
  assert.equal(activeDefaultProducts?.count, 0);

  const archivedProducts = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM products WHERE workspace_id = 'default' AND status = 'archived'`
  );
  assert.equal(archivedProducts?.count, 3);
});
