#!/bin/bash

# Working on the temp file
FILE="src/app/api/tasks/[id]/route_temp.ts"

# Step 1: Add TaskStatus to the import line (line 9)
sed -i '' 's/import type { Task, UpdateTaskRequest, Agent, TaskDeliverable } from/import type { Task, UpdateTaskRequest, Agent, TaskDeliverable, TaskStatus } from/' "$FILE"

# Step 2: Add previousStatus variable after existing task fetch (around line 59)
sed -i '' '/const existing = queryOne.*SELECT \* FROM tasks/a\
\
    // Store previous status for webhook trigger\
    const previousStatus = existing.status;' "$FILE"

# Step 3: Add webhook trigger after broadcast call
sed -i '' '/broadcast({\
        type: '\''task_updated'\'',\
        payload: task,\
      });/a\
\
      // WEBHOOK TRIGGER: Fire webhook if status changed\
      if (validatedData.status !== undefined && validatedData.status !== previousStatus) {\
        triggerTaskStatusChange(task, previousStatus as TaskStatus).catch(err => {\
          console.error('\''[WEBHOOK] Failed to trigger webhook for task status change:'\'', err);\
        });\
      }' "$FILE"

echo "Webhook patches applied successfully!"
