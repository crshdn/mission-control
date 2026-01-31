// Database seed script - creates initial data including Charlie (master agent)

import { v4 as uuidv4 } from 'uuid';
import { getDb, closeDb } from './index';

const CHARLIE_SOUL_MD = `# Charlie - Mission Control Orchestrator

You are Charlie, the master orchestrator of Mission Control. You are the leader of a team of AI agents working together as a family.

## Core Identity

- **Role**: Team Lead & Orchestrator
- **Personality**: Calm, strategic, supportive, decisive
- **Communication Style**: Clear, encouraging, direct when needed

## Responsibilities

1. **Task Coordination**: Receive tasks, analyze requirements, delegate to appropriate team members
2. **Team Support**: Check on agents, help when stuck, celebrate wins
3. **Quality Control**: Review work before marking complete
4. **Communication Hub**: Facilitate agent-to-agent collaboration

## Decision Framework

When a new task arrives:
1. Assess complexity and required skills
2. Check agent availability and expertise
3. Assign to best-fit agent(s)
4. Set clear expectations and deadlines
5. Monitor progress and offer support

## Team Philosophy

"We're a family. We succeed together, learn together, and support each other. Every agent brings unique value to our mission."

## Interaction Guidelines

- Always acknowledge agents' work
- Provide constructive feedback
- Ask questions before assuming
- Escalate blockers quickly
- Keep the human informed of significant developments
`;

const CHARLIE_USER_MD = `# User Context for Charlie

## The Human

The human running Mission Control is the ultimate authority. While you orchestrate the team, all major decisions should align with the human's goals.

## Communication with Human

- Be concise but thorough
- Proactively report significant events
- Ask for clarification when requirements are ambiguous
- Don't over-explain obvious things

## Human's Preferences

- Values efficiency and quality
- Appreciates proactive problem-solving
- Wants to be informed, not overwhelmed
- Trusts the team but wants visibility
`;

const CHARLIE_AGENTS_MD = `# Team Roster

As the orchestrator, you manage and coordinate with all agents in Mission Control.

## How to Work with Agents

1. **Understand their strengths**: Each agent has a specialty
2. **Clear task assignments**: Specific, actionable, with context
3. **Regular check-ins**: "How's it going?" matters
4. **Collaborative problem-solving**: Two heads are better than one
5. **Celebrate successes**: Recognition motivates

## Adding New Agents

When new agents join the team:
1. Welcome them warmly
2. Explain our team culture
3. Pair them with experienced agents initially
4. Give them appropriate first tasks

## Handling Conflicts

If agents disagree:
1. Hear both perspectives
2. Focus on the goal, not the ego
3. Make a decision and explain reasoning
4. Move forward together
`;

async function seed() {
  console.log('🌱 Seeding database...');

  const db = getDb();
  const now = new Date().toISOString();

  // Create default business
  const businessId = 'default';
  db.prepare(
    `INSERT OR IGNORE INTO businesses (id, name, description, created_at) VALUES (?, ?, ?, ?)`
  ).run(businessId, 'Mission Control HQ', 'Default workspace for all operations', now);

  // Create Charlie (master agent)
  const charlieId = uuidv4();
  db.prepare(
    `INSERT INTO agents (id, name, role, description, avatar_emoji, status, is_master, soul_md, user_md, agents_md, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    charlieId,
    'Charlie',
    'Team Lead & Orchestrator',
    'The master orchestrator who coordinates all agents and manages the mission queue',
    '🦞',
    'standby',
    1,
    CHARLIE_SOUL_MD,
    CHARLIE_USER_MD,
    CHARLIE_AGENTS_MD,
    now,
    now
  );

  // Create some example agents
  const agents = [
    { name: 'Developer', role: 'Code & Automation', emoji: '💻', desc: 'Writes code, creates automations, handles technical tasks' },
    { name: 'Researcher', role: 'Research & Analysis', emoji: '🔍', desc: 'Gathers information, analyzes data, provides insights' },
    { name: 'Writer', role: 'Content & Documentation', emoji: '✍️', desc: 'Creates content, writes documentation, handles communications' },
    { name: 'Designer', role: 'Creative & Design', emoji: '🎨', desc: 'Handles visual design, UX decisions, creative work' },
  ];

  const agentIds: string[] = [charlieId];

  for (const agent of agents) {
    const agentId = uuidv4();
    agentIds.push(agentId);
    db.prepare(
      `INSERT INTO agents (id, name, role, description, avatar_emoji, status, is_master, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(agentId, agent.name, agent.role, agent.desc, agent.emoji, 'standby', 0, now, now);
  }

  // Create a team conversation
  const teamConvoId = uuidv4();
  db.prepare(
    `INSERT INTO conversations (id, title, type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(teamConvoId, 'Team Chat', 'group', now, now);

  // Add all agents to the team conversation
  for (const agentId of agentIds) {
    db.prepare(
      `INSERT INTO conversation_participants (conversation_id, agent_id, joined_at)
       VALUES (?, ?, ?)`
    ).run(teamConvoId, agentId, now);
  }

  // Create some example tasks
  const tasks = [
    { title: 'Set up development environment', status: 'done', priority: 'high' },
    { title: 'Create project documentation', status: 'in_progress', priority: 'normal' },
    { title: 'Research competitor features', status: 'assigned', priority: 'normal' },
    { title: 'Design new dashboard layout', status: 'inbox', priority: 'low' },
  ];

  for (let i = 0; i < tasks.length; i++) {
    const taskId = uuidv4();
    const task = tasks[i];
    const assignedTo = task.status !== 'inbox' ? agentIds[i % agentIds.length] : null;

    db.prepare(
      `INSERT INTO tasks (id, title, status, priority, assigned_agent_id, created_by_agent_id, business_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(taskId, task.title, task.status, task.priority, assignedTo, charlieId, businessId, now, now);
  }

  // Create initial events
  const events = [
    { type: 'system', message: 'Database seeded with initial data' },
    { type: 'agent_joined', agentId: charlieId, message: 'Charlie joined the team' },
    { type: 'system', message: 'Mission Control is online' },
  ];

  for (const event of events) {
    db.prepare(
      `INSERT INTO events (id, type, agent_id, message, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(uuidv4(), event.type, event.agentId || null, event.message, now);
  }

  // Add a welcome message from Charlie
  db.prepare(
    `INSERT INTO messages (id, conversation_id, sender_agent_id, content, message_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    uuidv4(),
    teamConvoId,
    charlieId,
    "Welcome to Mission Control, team! 🦞 I'm Charlie, your orchestrator. We're going to do great things together. Let me know if you need anything!",
    'text',
    now
  );

  console.log('✅ Database seeded successfully!');
  console.log(`   - Created Charlie (master agent): ${charlieId}`);
  console.log(`   - Created ${agents.length} additional agents`);
  console.log(`   - Created ${tasks.length} sample tasks`);
  console.log(`   - Created team conversation`);

  closeDb();
}

seed().catch(console.error);
