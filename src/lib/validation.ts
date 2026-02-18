import { z } from 'zod';

// Task status and priority enums from types
const TaskStatus = z.enum([
  'planning',
  'inbox',
  'assigned',
  'in_progress',
  'testing',
  'review',
  'done'
]);

const TaskPriority = z.enum(['low', 'normal', 'high', 'urgent']);

const ActivityType = z.enum([
  'spawned',
  'updated',
  'completed',
  'file_created',
  'status_changed'
]);

const DeliverableType = z.enum(['file', 'url', 'artifact']);

// Task validation schemas
export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or less'),
  description: z.string().max(10000, 'Description must be 10000 characters or less').optional(),
  status: TaskStatus.optional(),
  priority: TaskPriority.optional(),
  assigned_agent_id: z.string().uuid().optional(),
  created_by_agent_id: z.string().uuid().optional(),
  business_id: z.string().optional(),
  workspace_id: z.string().optional(),
  due_date: z.string().optional().nullable(),
});

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  status: TaskStatus.optional(),
  priority: TaskPriority.optional(),
  assigned_agent_id: z.string().uuid().optional().nullable(),
  due_date: z.string().optional().nullable(),
  updated_by_agent_id: z.string().uuid().optional(),
});

// Activity validation schema
export const CreateActivitySchema = z.object({
  activity_type: ActivityType,
  message: z.string().min(1, 'Message is required').max(5000, 'Message must be 5000 characters or less'),
  agent_id: z.string().uuid().optional(),
  metadata: z.string().optional(),
});

// Deliverable validation schema
export const CreateDeliverableSchema = z.object({
  deliverable_type: DeliverableType,
  title: z.string().min(1, 'Title is required'),
  path: z.string().optional(),
  description: z.string().optional(),
});

// Type exports for use in routes
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type CreateActivityInput = z.infer<typeof CreateActivitySchema>;
export type CreateDeliverableInput = z.infer<typeof CreateDeliverableSchema>;
