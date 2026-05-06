// main.js - Growth Dashboard Entry Point
const Database = require('better-sqlite3');
const path = require('path');
const http = require('http');
const config = require('./config');

// Initialize database connection
function getDb() {
  const dbPath = config.db.path;
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return db;
}

// Query pipeline metrics from database
function getPipelineMetrics(db) {
  // Tasks by status
  const statusCounts = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM tasks
    GROUP BY status
  `).all();

  // Tasks by priority
  const priorityCounts = db.prepare(`
    SELECT priority, COUNT(*) as count
    FROM tasks
    GROUP BY priority
  `).all();

  // Recent tasks (last 10)
  const recentTasks = db.prepare(`
    SELECT id, title, status, priority, created_at, updated_at
    FROM tasks
    ORDER BY updated_at DESC
    LIMIT 10
  `).all();

  // Recent events (last 10)
  const recentEvents = db.prepare(`
    SELECT id, type, message, created_at
    FROM events
    ORDER BY created_at DESC
    LIMIT 10
  `).all();

  // Agent status
  const agentStatus = db.prepare(`
    SELECT name, role, status, avatar_emoji
    FROM agents
    ORDER BY status, name
  `).all();

  // Task activities (last 10)
  const recentActivities = db.prepare(`
    SELECT ta.activity_type, ta.message, ta.created_at, a.name as agent_name
    FROM task_activities ta
    LEFT JOIN agents a ON ta.agent_id = a.id
    ORDER BY ta.created_at DESC
    LIMIT 10
  `).all();

  // Summary totals
  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_tasks,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed_tasks,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_tasks,
      SUM(CASE WHEN status = 'inbox' THEN 1 ELSE 0 END) as inbox_tasks
    FROM tasks
  `).get();

  return {
    statusCounts,
    priorityCounts,
    recentTasks,
    recentEvents,
    agentStatus,
    recentActivities,
    totals
  };
}

// Format status for display
function formatStatus(status) {
  const map = {
    inbox: 'Inbox',
    pending_dispatch: 'Pending Dispatch',
    planning: 'Planning',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    testing: 'Testing',
    review: 'Review',
    done: 'Done'
  };
  return map[status] || status;
}

// Format priority for display
function formatPriority(priority) {
  return priority ? priority.charAt(0).toUpperCase() + priority.slice(1) : 'Normal';
}

// Get status color class
function getStatusColor(status) {
  const colors = {
    inbox: 'bg-gray-500',
    pending_dispatch: 'bg-yellow-500',
    planning: 'bg-blue-500',
    assigned: 'bg-purple-500',
    in_progress: 'bg-orange-500',
    testing: 'bg-cyan-500',
    review: 'bg-indigo-500',
    done: 'bg-green-500'
  };
  return colors[status] || 'bg-gray-400';
}

// Get priority color
function getPriorityColor(priority) {
  const colors = {
    urgent: 'text-red-400',
    high: 'text-orange-400',
    normal: 'text-gray-300',
    low: 'text-gray-500'
  };
  return colors[priority] || 'text-gray-300';
}

// Generate HTML dashboard
function generateDashboard(metrics) {
  const { statusCounts, priorityCounts, recentTasks, recentEvents, agentStatus, recentActivities, totals } = metrics;

  // Build status counts object
  const statusMap = {};
  statusCounts.forEach(s => { statusMap[s.status] = s.count; });

  // Build priority counts object
  const priorityMap = {};
  priorityCounts.forEach(p => { priorityMap[p.priority] = p.count; });

  const lastUpdated = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Growth Pipeline Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f;
      color: #e5e5e5;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 0.875rem; margin-bottom: 24px; }
    .grid { display: grid; gap: 20px; }
    .grid-4 { grid-template-columns: repeat(4, 1fr); }
    .grid-3 { grid-template-columns: repeat(3, 1fr); }
    .grid-2 { grid-template-columns: repeat(2, 1fr); }
    .card {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      padding: 16px;
    }
    .card h2 {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 12px;
      letter-spacing: 0.05em;
    }
    .stat { font-size: 2rem; font-weight: 600; }
    .stat-label { font-size: 0.75rem; color: #666; margin-top: 4px; }
    .status-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .status-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: #252525;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .status-count { font-weight: 600; }
    .task-list { display: flex; flex-direction: column; gap: 8px; }
    .task-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px;
      background: #252525;
      border-radius: 4px;
      font-size: 0.85rem;
    }
    .task-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .task-status { padding: 2px 8px; border-radius: 3px; font-size: 0.7rem; text-transform: uppercase; }
    .task-priority { font-size: 0.7rem; margin-left: 8px; }
    .activity-item {
      padding: 8px 0;
      border-bottom: 1px solid #2a2a2a;
      font-size: 0.8rem;
    }
    .activity-item:last-child { border-bottom: none; }
    .activity-time { color: #666; font-size: 0.7rem; }
    .agent-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: #252525;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .agent-emoji { font-size: 1.2rem; }
    .agent-name { flex: 1; }
    .agent-status { font-size: 0.7rem; padding: 2px 6px; border-radius: 3px; }
    .agent-status.working { background: #22c55e20; color: #22c55e; }
    .agent-status.standby { background: #3b82f620; color: #3b82f6; }
    .agent-status.offline { background: #6b728020; color: #6b7280; }
    .priority-bar { display: flex; gap: 12px; margin-top: 8px; }
    .priority-item { font-size: 0.8rem; }
    .refresh-btn {
      background: #2563eb;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85rem;
    }
    .refresh-btn:hover { background: #1d4ed8; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>Growth Pipeline Dashboard</h1>
        <p class="subtitle">Mission Control - Pipeline Metrics & Status</p>
      </div>
      <button class="refresh-btn" onclick="location.reload()">Refresh</button>
    </div>

    <div class="grid grid-4" style="margin-bottom: 20px;">
      <div class="card">
        <h2>Total Tasks</h2>
        <div class="stat">${totals.total_tasks}</div>
        <div class="stat-label">All time</div>
      </div>
      <div class="card">
        <h2>Completed</h2>
        <div class="stat" style="color: #22c55e;">${totals.completed_tasks}</div>
        <div class="stat-label">Done status</div>
      </div>
      <div class="card">
        <h2>In Progress</h2>
        <div class="stat" style="color: #f97316;">${totals.in_progress_tasks}</div>
        <div class="stat-label">Active work</div>
      </div>
      <div class="card">
        <h2>Inbox</h2>
        <div class="stat" style="color: #6b7280;">${totals.inbox_tasks}</div>
        <div class="stat-label">Pending</div>
      </div>
    </div>

    <div class="grid grid-3" style="margin-bottom: 20px;">
      <div class="card">
        <h2>Tasks by Status</h2>
        <div class="status-bar">
          ${config.metrics.statuses.map(status => {
            const count = statusMap[status] || 0;
            return `<div class="status-item">
              <span class="status-dot" style="background: ${getStatusColor(status).replace('bg-', '').replace('-500', '')}"></span>
              <span>${formatStatus(status)}</span>
              <span class="status-count">${count}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="card">
        <h2>Tasks by Priority</h2>
        <div class="priority-bar">
          ${config.metrics.priorities.map(priority => {
            const count = priorityMap[priority] || 0;
            return `<div class="priority-item">
              <span class="${getPriorityColor(priority)}">${formatPriority(priority)}: ${count}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="card">
        <h2>Agent Status</h2>
        <div>
          ${agentStatus.length > 0 ? agentStatus.map(agent => `
            <div class="agent-item">
              <span class="agent-emoji">${agent.avatar_emoji}</span>
              <span class="agent-name">${agent.name}</span>
              <span class="agent-status ${agent.status}">${agent.status}</span>
            </div>
          `).join('') : '<div style="color: #666; font-size: 0.85rem;">No agents configured</div>'}
        </div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h2>Recent Tasks</h2>
        <div class="task-list">
          ${recentTasks.length > 0 ? recentTasks.map(task => `
            <div class="task-item">
              <span class="task-title">${task.title}</span>
              <span class="task-status" style="background: ${getStatusColor(task.status)}20; color: ${getStatusColor(task.status).replace('bg-', '').replace('-500', '')}">${formatStatus(task.status)}</span>
              <span class="task-priority ${getPriorityColor(task.priority)}">${formatPriority(task.priority)}</span>
            </div>
          `).join('') : '<div style="color: #666;">No tasks found</div>'}
        </div>
      </div>

      <div class="card">
        <h2>Recent Activity</h2>
        <div>
          ${recentActivities.length > 0 ? recentActivities.map(act => `
            <div class="activity-item">
              <div>${act.message}</div>
              <div class="activity-time">${act.agent_name || 'System'} - ${new Date(act.created_at).toLocaleString()}</div>
            </div>
          `).join('') : '<div style="color: #666;">No recent activity</div>'}
        </div>
      </div>
    </div>

    <p style="margin-top: 20px; color: #444; font-size: 0.75rem;">Last updated: ${lastUpdated}</p>
  </div>
</body>
</html>`;
}

// Main function
function main() {
  try {
    const db = getDb();
    const metrics = getPipelineMetrics(db);
    const html = generateDashboard(metrics);

    // Output to file
    const fs = require('fs');
    const outputPath = path.join(__dirname, 'dashboard.html');
    fs.writeFileSync(outputPath, html);
    console.log('Dashboard generated:', outputPath);

    // If run with --serve flag, start HTTP server
    if (process.argv.includes('--serve')) {
      const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      });

      server.listen(config.dashboard.port, () => {
        console.log(`Dashboard running at http://localhost:${config.dashboard.port}`);
      });
    }

    db.close();
  } catch (error) {
    console.error('Error generating dashboard:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { getPipelineMetrics, generateDashboard };