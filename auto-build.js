#!/usr/bin/env node
/**
 * Atelier Tools Auto-Builder
 * Processes tasks sequentially with auto-answered planning questions
 */

const API = 'http://localhost:4000/api';
const DB_PATH = '/Users/lilly/clawd/projects/mission-control/mission-control.db';

const TOOLS = [
  { name: 'Word Counter', desc: 'Count words, characters, sentences, and paragraphs in text' },
  { name: 'Lorem Ipsum', desc: 'Generate placeholder text with customizable length' },
  { name: 'Case Converter', desc: 'Convert text between uppercase, lowercase, title case, sentence case' },
  { name: 'Text Reverser', desc: 'Reverse text, words, or lines' },
  { name: 'Duplicate Remover', desc: 'Remove duplicate lines from text' },
  { name: 'Line Sorter', desc: 'Sort lines alphabetically, numerically, or by length' },
  { name: 'JSON Formatter', desc: 'Format and validate JSON with syntax highlighting' },
  { name: 'JSON to CSV', desc: 'Convert JSON arrays to CSV format' },
  { name: 'CSV to JSON', desc: 'Convert CSV data to JSON format' },
  { name: 'Base64 Encoder', desc: 'Encode and decode Base64 strings' },
  { name: 'URL Encoder', desc: 'Encode and decode URL components' },
  { name: 'HTML Entity Encoder', desc: 'Convert special characters to HTML entities' },
  { name: 'Markdown Preview', desc: 'Live preview of Markdown with export options' },
  { name: 'Hash Generator', desc: 'Generate MD5, SHA-1, SHA-256 hashes' },
  { name: 'UUID Generator', desc: 'Generate UUIDs v1 and v4' },
  { name: 'Password Generator', desc: 'Generate secure passwords with options' },
  { name: 'Color Picker', desc: 'Pick colors and convert between formats' },
  { name: 'Gradient Generator', desc: 'Create CSS gradients visually' },
  { name: 'Box Shadow Generator', desc: 'Create CSS box shadows visually' },
  { name: 'Timestamp Converter', desc: 'Convert between Unix timestamps and dates' },
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function createTask(tool) {
  const slug = tool.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const res = await api('/tasks', 'POST', {
    title: `Build Atelier Tool: ${tool.name}`,
    description: `Build a browser-based tool for ateliertools.com.

## Tool: ${tool.name}
${tool.desc}

## Requirements:
- Standalone HTML/JS/CSS tool (NOT React) in /Users/lilly/clawd/projects/ateliertools-com/builds/${slug}/
- Look at existing tools in /Users/lilly/clawd/projects/ateliertools-com/builds/ for the pattern
- Must include: index.html, app.js, style.css
- Works entirely in browser (no backend)
- Match the Atelier design system (see existing tools for nav, hero, styling)
- Mobile responsive

## Deliverable:
Create index.html, app.js, style.css in the build directory. Test it works. Say TASK_COMPLETE when done.`,
    priority: 'normal',
  });
  return res.id;
}

async function startPlanning(taskId) {
  try {
    await api(`/tasks/${taskId}/planning`, 'POST');
    return true;
  } catch (e) {
    if (e.message.includes('already started')) return true;
    throw e;
  }
}

async function getPlanningState(taskId) {
  // Use poll endpoint (GET) which fetches from OpenClaw and returns current state
  return api(`/tasks/${taskId}/planning/poll`);
}

async function answerQuestion(taskId, answer) {
  return api(`/tasks/${taskId}/planning/answer`, 'POST', { answer });
}

// Auto-answer planning questions with sensible defaults
function chooseAnswer(question, options) {
  const q = question.toLowerCase();
  const opts = options.map(o => ({ ...o, label: o.label.toLowerCase() }));
  
  // Common patterns - pick first reasonable option or 'A'
  // For Atelier tools, we usually want: standard/default options, Mason as builder
  
  // Agent selection - always Mason for building
  if (q.includes('agent') || q.includes('who should')) {
    const mason = opts.find(o => o.label.includes('mason') || o.label.includes('builder'));
    if (mason) return mason.id;
  }
  
  // Complexity - standard/normal
  if (q.includes('complex') || q.includes('scope')) {
    const standard = opts.find(o => o.label.includes('standard') || o.label.includes('normal') || o.label.includes('medium'));
    if (standard) return standard.id;
  }
  
  // Priority - normal
  if (q.includes('priority') || q.includes('urgent')) {
    const normal = opts.find(o => o.label.includes('normal') || o.label.includes('standard'));
    if (normal) return normal.id;
  }
  
  // Style/design - minimal/clean
  if (q.includes('style') || q.includes('design')) {
    const minimal = opts.find(o => o.label.includes('minimal') || o.label.includes('clean') || o.label.includes('simple'));
    if (minimal) return minimal.id;
  }
  
  // Default: pick first option (usually A)
  return options[0]?.id || 'A';
}

async function runPlanning(taskId, toolName) {
  console.log(`  Starting planning for ${toolName}...`);
  await startPlanning(taskId);
  
  let attempts = 0;
  const maxAttempts = 20; // Max 20 Q&A cycles
  
  while (attempts < maxAttempts) {
    await sleep(3000); // Wait for Polly to respond
    
    const state = await getPlanningState(taskId);
    
    if (state.isComplete) {
      console.log(`  ✓ Planning complete`);
      return true;
    }
    
    if (state.currentQuestion) {
      const { question, options } = state.currentQuestion;
      const answer = chooseAnswer(question, options || []);
      console.log(`  Q: ${question.slice(0, 60)}... → ${answer}`);
      await answerQuestion(taskId, answer);
      attempts++;
    } else {
      // No question yet, wait more
      await sleep(2000);
    }
  }
  
  console.log(`  ⚠ Planning timeout after ${maxAttempts} questions`);
  return false;
}

async function waitForCompletion(taskId, toolName, timeoutMs = 900000) { // 15 min timeout
  const start = Date.now();
  let lastStatus = '';
  
  while (Date.now() - start < timeoutMs) {
    const task = await api(`/tasks/${taskId}`);
    
    if (task.status !== lastStatus) {
      console.log(`  Status: ${task.status}`);
      lastStatus = task.status;
    }
    
    if (task.status === 'done') {
      console.log(`  ✅ DONE: ${toolName}`);
      return true;
    }
    
    if (task.status === 'blocked' || task.status === 'failed') {
      console.log(`  ❌ ${task.status.toUpperCase()}: ${toolName}`);
      return false;
    }
    
    await sleep(15000); // Check every 15s
  }
  
  console.log(`  ⏰ TIMEOUT: ${toolName}`);
  return false;
}

const fs = require('fs');

// Check if a tool directory already exists
function toolExists(toolName) {
  const slug = toolName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const toolDir = `/Users/lilly/clawd/projects/ateliertools-com/builds/${slug}`;
  try {
    // Check if index.html exists (the key deliverable)
    fs.statSync(`${toolDir}/index.html`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('=== Atelier Tools Auto-Builder ===');
  console.log(`Starting ${new Date().toISOString()}`);
  console.log(`${TOOLS.length} tools to build\n`);
  
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const tool of TOOLS) {
    // Skip if tool already built
    const exists = toolExists(tool.name);
    if (exists) {
      console.log(`\n[SKIP] ${tool.name} - already built`);
      skipped++;
      continue;
    }
    console.log(`\n[${ completed + failed + 1}/${TOOLS.length}] ${tool.name}`);
    console.log('─'.repeat(50));
    
    try {
      // Create task
      const taskId = await createTask(tool);
      console.log(`  Task: ${taskId}`);
      
      // Run planning
      const planned = await runPlanning(taskId, tool.name);
      if (!planned) {
        failed++;
        continue;
      }
      
      // Wait for completion
      const done = await waitForCompletion(taskId, tool.name);
      if (done) {
        completed++;
      } else {
        failed++;
      }
      
    } catch (e) {
      console.log(`  ❌ ERROR: ${e.message}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`Finished ${new Date().toISOString()}`);
  console.log(`Completed: ${completed}`);
  console.log(`Skipped (already built): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${completed + skipped + failed}/${TOOLS.length}`);
}

main().catch(console.error);
