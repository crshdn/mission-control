import { z } from 'zod';

// Task status and priority enums from types
const TaskStatus = z.enum([
  'pending_dispatch',
  'planning',
  'inbox',
  'assigned',
  'in_progress',
  'convoy_active',
  'testing',
  'review',
  'verification',
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

// Agent IDs are not always UUIDs.
// Local agents typically use UUIDs, while gateway-synced agents may use
// 32-char hex ids generated via lower(hex(randomblob(16))).
const AgentId = z.string().min(1).max(128);

// Task validation schemas
export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or less'),
  description: z.string().max(10000, 'Description must be 10000 characters or less').optional(),
  status: TaskStatus.optional(),
  priority: TaskPriority.optional(),
  assigned_agent_id: AgentId.optional().nullable(),
  created_by_agent_id: AgentId.optional().nullable(),
  business_id: z.string().optional(),
  workspace_id: z.string().optional(),
  due_date: z.string().optional().nullable(),
});

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  status: TaskStatus.optional(),
  priority: TaskPriority.optional(),
  assigned_agent_id: AgentId.optional().nullable(),
  workflow_template_id: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  updated_by_agent_id: AgentId.optional(),
  status_reason: z.string().max(2000).optional(),
  board_override: z.boolean().optional(),
  override_reason: z.string().max(2000).optional(),
  pr_url: z.string().url().optional().nullable(),
  pr_status: z.enum(['pending', 'open', 'merged', 'closed']).optional(),
});

// Activity validation schema
export const CreateActivitySchema = z.object({
  activity_type: ActivityType,
  message: z.string().min(1, 'Message is required').max(5000, 'Message must be 5000 characters or less'),
  agent_id: AgentId.optional(),
  metadata: z.string().optional(),
});

// Deliverable validation schema
export const CreateDeliverableSchema = z.object({
  deliverable_type: DeliverableType,
  title: z.string().min(1, 'Title is required'),
  path: z.string().optional(),
  description: z.string().optional(),
});

// Product Autopilot validation schemas

const IdeaCategory = z.enum([
  'feature', 'improvement', 'ux', 'performance', 'integration',
  'infrastructure', 'content', 'growth', 'monetization', 'operations', 'security'
]);

const IdeaComplexity = z.enum(['S', 'M', 'L', 'XL']);

const SwipeAction = z.enum(['approve', 'reject', 'maybe', 'fire']);

const CostCapType = z.enum(['per_cycle', 'per_task', 'daily', 'monthly', 'per_product_monthly']);

const CostEventType = z.enum([
  'agent_dispatch', 'research_cycle', 'ideation_cycle', 'build_task',
  'content_generation', 'seo_analysis', 'web_search', 'external_api'
]);

const ProductStatus = z.enum(['active', 'paused', 'archived']);

export const CreateProductSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(5000).optional(),
  repo_url: z.string().url().optional().or(z.literal('')),
  live_url: z.string().url().optional().or(z.literal('')),
  product_program: z.string().max(50000).optional(),
  icon: z.string().max(10).optional(),
  workspace_id: z.string().optional(),
  settings: z.string().optional(),
  build_mode: z.enum(['auto_build', 'plan_first']).optional(),
  default_branch: z.string().max(200).optional(),
});

export const UpdateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  repo_url: z.string().url().optional().nullable().or(z.literal('')),
  live_url: z.string().url().optional().nullable().or(z.literal('')),
  product_program: z.string().max(50000).optional(),
  icon: z.string().max(10).optional(),
  status: ProductStatus.optional(),
  settings: z.string().optional(),
  build_mode: z.enum(['auto_build', 'plan_first']).optional(),
  default_branch: z.string().max(200).optional(),
  cost_cap_per_task: z.number().min(0).optional().nullable(),
  cost_cap_monthly: z.number().min(0).optional().nullable(),
  batch_review_threshold: z.number().int().min(1).max(100).optional(),
});

export const SwipeActionSchema = z.object({
  idea_id: z.string().min(1, 'Idea ID is required'),
  action: SwipeAction,
  notes: z.string().max(2000).optional(),
});

export const CreateIdeaSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().min(1, 'Description is required').max(10000),
  category: IdeaCategory,
  complexity: IdeaComplexity.optional(),
  impact_score: z.number().min(1).max(10).optional(),
  feasibility_score: z.number().min(1).max(10).optional(),
  estimated_effort_hours: z.number().min(0).optional(),
  tags: z.array(z.string()).optional(),
  technical_approach: z.string().max(5000).optional(),
  risks: z.array(z.string()).optional(),
});

export const CreateCostCapSchema = z.object({
  workspace_id: z.string().optional(),
  product_id: z.string().optional().nullable(),
  cap_type: CostCapType,
  limit_usd: z.number().positive('Limit must be positive'),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
});

export const UpdateCostCapSchema = z.object({
  limit_usd: z.number().positive().optional(),
  status: z.enum(['active', 'paused']).optional(),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
});

export const CreateCostEventSchema = z.object({
  product_id: z.string().optional().nullable(),
  workspace_id: z.string().optional(),
  task_id: z.string().optional().nullable(),
  cycle_id: z.string().optional().nullable(),
  agent_id: z.string().optional().nullable(),
  event_type: CostEventType,
  provider: z.string().optional(),
  model: z.string().optional(),
  tokens_input: z.number().int().min(0).optional(),
  tokens_output: z.number().int().min(0).optional(),
  cost_usd: z.number().min(0),
  metadata: z.string().optional(),
});

export const CreateScheduleSchema = z.object({
  schedule_type: z.enum([
    'research', 'ideation', 'maybe_reevaluation', 'seo_audit',
    'content_refresh', 'analytics_report', 'social_batch', 'growth_experiment'
  ]),
  cron_expression: z.string().min(1, 'Cron expression is required'),
  timezone: z.string().optional(),
  enabled: z.boolean().optional(),
  config: z.string().optional(),
});

export const UpdateScheduleSchema = z.object({
  cron_expression: z.string().min(1).optional(),
  timezone: z.string().optional(),
  enabled: z.boolean().optional(),
  config: z.string().optional(),
});

// Type exports for use in routes
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type CreateActivityInput = z.infer<typeof CreateActivitySchema>;
export type CreateDeliverableInput = z.infer<typeof CreateDeliverableSchema>;
export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
export type SwipeActionInput = z.infer<typeof SwipeActionSchema>;
export type CreateIdeaInput = z.infer<typeof CreateIdeaSchema>;
export type CreateCostCapInput = z.infer<typeof CreateCostCapSchema>;
export type UpdateCostCapInput = z.infer<typeof UpdateCostCapSchema>;
export type CreateCostEventInput = z.infer<typeof CreateCostEventSchema>;
export type CreateScheduleInput = z.infer<typeof CreateScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof UpdateScheduleSchema>;
