#!/bin/bash
# Sequential Atelier Tool Builder
# Processes one task at a time, waits for completion

DB="/Users/lilly/clawd/projects/mission-control/mission-control.db"
API="http://localhost:4000/api"

TOOLS=(
  "Word Counter Tool|Count words, characters, sentences, and paragraphs in text"
  "Lorem Ipsum Generator|Generate placeholder text with customizable length"
  "Case Converter|Convert text between uppercase, lowercase, title case, sentence case"
  "Text Reverser|Reverse text, words, or lines"
  "Duplicate Line Remover|Remove duplicate lines from text"
  "Line Sorter|Sort lines alphabetically, numerically, or by length"
  "JSON Formatter|Format and validate JSON with syntax highlighting"
  "JSON to CSV Converter|Convert JSON arrays to CSV format"
  "CSV to JSON Converter|Convert CSV data to JSON format"
  "Base64 Encoder/Decoder|Encode and decode Base64 strings"
  "URL Encoder/Decoder|Encode and decode URL components"
  "HTML Entity Encoder|Convert special characters to HTML entities"
  "Markdown Preview|Live preview of Markdown with export options"
  "Hash Generator|Generate MD5, SHA-1, SHA-256 hashes"
  "UUID Generator|Generate UUIDs v1 and v4"
  "Password Generator|Generate secure passwords with options"
  "Color Picker|Pick colors and convert between formats"
  "Gradient Generator|Create CSS gradients visually"
  "Box Shadow Generator|Create CSS box shadows visually"
  "Timestamp Converter|Convert between Unix timestamps and dates"
)

echo "=== Atelier Tools Sequential Builder ==="
echo "Starting $(date)"
echo ""

for tool_entry in "${TOOLS[@]}"; do
  IFS='|' read -r name desc <<< "$tool_entry"
  
  echo "----------------------------------------"
  echo "Creating: $name"
  
  # Create task
  task_id=$(uuidgen | tr '[:upper:]' '[:lower:]')
  
  sqlite3 "$DB" "INSERT INTO tasks (id, title, description, status, priority) VALUES (
    '$task_id',
    'Build Atelier Tool: $name',
    'Build a browser-based tool for ateliertools.com.

## Tool: $name
$desc

## Requirements:
- Single-page React component
- Works entirely in browser (no backend)
- Clean, minimal UI matching Atelier aesthetic
- Mobile responsive
- Include clear input/output areas
- Add copy-to-clipboard for results

## Deliverable:
Create the tool at: /Users/lilly/clawd/projects/atelier-tools/src/tools/[tool-slug]/

TASK_COMPLETE when the tool is built and working.',
    'inbox',
    'normal'
  )"
  
  echo "Task created: $task_id"
  
  # Trigger planning via API
  echo "Dispatching to planning..."
  curl -s -X POST "$API/tasks/$task_id/dispatch" > /dev/null
  
  # Wait for task to complete (poll every 30s, timeout 15min)
  timeout=900
  elapsed=0
  while [ $elapsed -lt $timeout ]; do
    status=$(sqlite3 "$DB" "SELECT status FROM tasks WHERE id = '$task_id'")
    
    if [ "$status" = "done" ]; then
      echo "✅ DONE: $name"
      break
    fi
    
    echo "  Status: $status (${elapsed}s elapsed)"
    sleep 30
    elapsed=$((elapsed + 30))
  done
  
  if [ "$status" != "done" ]; then
    echo "⏰ TIMEOUT: $name - moving on"
    sqlite3 "$DB" "UPDATE tasks SET status = 'done', result = 'Timeout after 15min' WHERE id = '$task_id'"
  fi
  
  echo ""
done

echo "=== Batch Complete ==="
echo "Finished $(date)"
