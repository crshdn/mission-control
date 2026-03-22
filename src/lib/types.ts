// Core types for Mission Control

export type AgentStatus = 'standby' | 'working' | 'offline';

export type TaskStatus = 'pending_dispatch' | 'planning' | 'inbox' | 'assigned' | 'in_progress' | 'convoy_active' | 'testing' | 'review' | 'verification' | 'done';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type MessageType = 'text' | 'system' | 'task_update' | 'file';

export type ConversationType = 'direct' | 'group' | 'task';

export type EventType =
  | 'task_created'
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_completed'
  | 'message_sent'
  | 'agent_status_changed'
  | 'agent_joined'
  | 'system';

export type AgentSource = 'local' | 'gateway';

export interface Agent {
  id: string;
  name: string;
  role: string;
  description?: string;
  avatar_emoji: string;
  status: AgentStatus;
  is_master: boolean;
  workspace_id: string;
  soul_md?: string;
  user_md?: string;
  agents_md?: string;
  model?: string;
  source: AgentSource;
  gateway_agent_id?: string;
  session_key_prefix?: string;
  total_cost_usd?: number;
  total_tokens_used?: number;
  created_at: string;
  updated_at: string;
}

// Agent discovered from the OpenClaw Gateway (not yet imported)
export interface DiscoveredAgent {
  id: string;
  name: string;
  label?: string;
  model?: string;
  channel?: string;
  status?: string;
  already_imported: boolean;
  existing_agent_id?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_agent_id: string | null;
  created_by_agent_id: string | null;
  workspace_id: string;
  business_id: string;
  due_date?: string;
  workflow_template_id?: string;
  status_reason?: string;
  // Planning/dispatch metadata (optional fields from tasks table)
  planning_complete?: number;
  planning_dispatch_error?: string;
  planning_session_key?: string;
  images?: string; // JSON array of TaskImage objects
  convoy_id?: string;
  is_subtask?: number;
  product_id?: string;
  idea_id?: string;
  estimated_cost_usd?: number;
  actual_cost_usd?: number;
  repo_url?: string;
  repo_branch?: string;
  pr_url?: string;
  pr_status?: PRStatus;
  // Parallel build isolation
  workspace_path?: string;
  workspace_strategy?: 'worktree' | 'sandbox';
  workspace_port?: number;
  workspace_base_commit?: string;
  merge_status?: 'pending' | 'merged' | 'conflict' | 'pr_created' | 'abandoned';
  merge_pr_url?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  assigned_agent?: Agent;
  created_by_agent?: Agent;
}

export interface TaskImage {
  filename: string;
  original_name: string;
  uploaded_at: string;
}

export interface Conversation {
  id: string;
  title?: string;
  type: ConversationType;
  task_id?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  participants?: Agent[];
  last_message?: Message;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_agent_id?: string;
  content: string;
  message_type: MessageType;
  metadata?: string;
  created_at: string;
  // Joined fields
  sender?: Agent;
}

export interface Event {
  id: string;
  type: EventType;
  agent_id?: string;
  task_id?: string;
  message: string;
  metadata?: string;
  created_at: string;
  // Joined fields
  agent?: Agent;
  task?: Task;
}

export interface Business {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceStats {
  id: string;
  name: string;
  slug: string;
  icon: string;
  taskCounts: {
    pending_dispatch: number;
    planning: number;
    inbox: number;
    assigned: number;
    in_progress: number;
    convoy_active: number;
    testing: number;
    review: number;
    verification: number;
    done: number;
    total: number;
  };
  agentCount: number;
}

// Workflow template types
export interface WorkflowStage {
  id: string;
  label: string;
  role: string | null;
  status: TaskStatus;
}

export interface WorkflowTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  stages: WorkflowStage[];
  fail_targets: Record<string, string>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskRole {
  id: string;
  task_id: string;
  role: string;
  agent_id: string;
  created_at: string;
  // Joined fields
  agent?: Agent;
}

export interface KnowledgeEntry {
  id: string;
  workspace_id: string;
  task_id?: string;
  category: string;
  title: string;
  content: string;
  tags?: string[];
  confidence: number;
  created_by_agent_id?: string;
  created_at: string;
}

export interface OpenClawSession {
  id: string;
  agent_id: string;
  openclaw_session_id: string;
  channel?: string;
  status: string;
  session_type: 'persistent' | 'subagent';
  task_id?: string;
  ended_at?: string;
  created_at: string;
  updated_at: string;
}

export type ActivityType = 'spawned' | 'updated' | 'completed' | 'file_created' | 'status_changed';

export interface TaskActivity {
  id: string;
  task_id: string;
  agent_id?: string;
  activity_type: ActivityType;
  message: string;
  metadata?: string;
  created_at: string;
  // Joined fields
  agent?: Agent;
}

export type DeliverableType = 'file' | 'url' | 'artifact';

export interface TaskDeliverable {
  id: string;
  task_id: string;
  deliverable_type: DeliverableType;
  title: string;
  path?: string;
  description?: string;
  created_at: string;
}

// Planning types
export type PlanningQuestionType = 'multiple_choice' | 'text' | 'yes_no';

export type PlanningCategory = 
  | 'goal'
  | 'audience'
  | 'scope'
  | 'design'
  | 'content'
  | 'technical'
  | 'timeline'
  | 'constraints';

export interface PlanningQuestionOption {
  id: string;
  label: string;
}

export interface PlanningQuestion {
  id: string;
  task_id: string;
  category: PlanningCategory;
  question: string;
  question_type: PlanningQuestionType;
  options?: PlanningQuestionOption[];
  answer?: string;
  answered_at?: string;
  sort_order: number;
  created_at: string;
}

export interface PlanningSpec {
  id: string;
  task_id: string;
  spec_markdown: string;
  locked_at: string;
  locked_by?: string;
  created_at: string;
}

export interface PlanningState {
  questions: PlanningQuestion[];
  spec?: PlanningSpec;
  progress: {
    total: number;
    answered: number;
    percentage: number;
  };
  isLocked: boolean;
}

// API request/response types
export interface CreateAgentRequest {
  name: string;
  role: string;
  description?: string;
  avatar_emoji?: string;
  is_master?: boolean;
  soul_md?: string;
  user_md?: string;
  agents_md?: string;
  model?: string;
  session_key_prefix?: string;
}

export interface UpdateAgentRequest extends Partial<CreateAgentRequest> {
  status?: AgentStatus;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority?: TaskPriority;
  assigned_agent_id?: string;
  created_by_agent_id?: string;
  business_id?: string;
  due_date?: string;
}

export interface UpdateTaskRequest extends Partial<CreateTaskRequest> {
  status?: TaskStatus;
}

export interface SendMessageRequest {
  conversation_id: string;
  sender_agent_id: string;
  content: string;
  message_type?: MessageType;
  metadata?: string;
}

// OpenClaw WebSocket message types
export interface OpenClawMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface OpenClawSessionInfo {
  id: string;
  channel: string;
  peer?: string;
  model?: string;
  status: string;
}

// OpenClaw history message format (from Gateway)
export interface OpenClawHistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

// Agent with OpenClaw session info (extended for UI use)
export interface AgentWithOpenClaw extends Agent {
  openclawSession?: OpenClawSession | null;
}

// Convoy types
export type ConvoyStatus = 'active' | 'paused' | 'completing' | 'done' | 'failed';
export type DecompositionStrategy = 'manual' | 'ai' | 'planning';
export type AgentHealthState = 'idle' | 'working' | 'stalled' | 'stuck' | 'zombie' | 'offline';
export type CheckpointType = 'auto' | 'manual' | 'crash_recovery';

// Product Autopilot types
export type ProductStatus = 'active' | 'paused' | 'archived';

export type IdeaCategory =
  | 'feature' | 'improvement' | 'ux' | 'performance' | 'integration'
  | 'infrastructure' | 'content' | 'growth' | 'monetization' | 'operations' | 'security';

export type IdeaStatus = 'pending' | 'approved' | 'rejected' | 'maybe' | 'building' | 'built' | 'shipped';

export type IdeaSource = 'research' | 'manual' | 'resurfaced' | 'feedback';

export type IdeaComplexity = 'S' | 'M' | 'L' | 'XL';

export type SwipeAction = 'approve' | 'reject' | 'maybe' | 'fire';

export type CostEventType =
  | 'agent_dispatch' | 'research_cycle' | 'ideation_cycle' | 'build_task'
  | 'content_generation' | 'seo_analysis' | 'web_search' | 'external_api';

export type CostCapType = 'per_cycle' | 'per_task' | 'daily' | 'monthly' | 'per_product_monthly';

export type CostCapStatus = 'active' | 'paused' | 'exceeded';

export type ScheduleType =
  | 'research' | 'ideation' | 'maybe_reevaluation' | 'seo_audit'
  | 'content_refresh' | 'analytics_report' | 'social_batch' | 'growth_experiment';

export type OperationType =
  | 'seo_audit' | 'content_publish' | 'content_refresh' | 'social_post'
  | 'keyword_research' | 'analytics_report' | 'growth_experiment'
  | 'feedback_processing' | 'preference_update';

export type ContentType =
  | 'blog_post' | 'documentation' | 'tutorial' | 'landing_page' | 'changelog'
  | 'newsletter' | 'faq' | 'social_post' | 'guide' | 'case_study';

export type SocialPlatform = 'twitter' | 'linkedin' | 'facebook' | 'instagram' | 'reddit' | 'other';

export type FeedbackSentiment = 'positive' | 'negative' | 'neutral' | 'mixed';

export type BuildMode = 'auto_build' | 'plan_first';

export type ABTestStatus = 'active' | 'concluded' | 'cancelled';
export type ABTestSplitMode = 'concurrent' | 'alternating';

export type PRStatus = 'pending' | 'open' | 'merged' | 'closed';

export interface Product {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  repo_url?: string;
  live_url?: string;
  product_program?: string;
  icon: string;
  status: ProductStatus;
  settings?: string; // JSON
  build_mode?: BuildMode;
  default_branch?: string;
  cost_cap_per_task?: number;
  cost_cap_monthly?: number;
  health_weight_config?: string; // JSON: HealthWeightConfig
  batch_review_threshold?: number;
  created_at: string;
  updated_at: string;
}

// Health Score types
export type HealthComponent = 'research' | 'pipeline' | 'swipe' | 'build' | 'cost';

export interface HealthWeightConfig {
  research: number;
  pipeline: number;
  swipe: number;
  build: number;
  cost: number;
  disabled: HealthComponent[];
}

export interface HealthComponentScore {
  name: HealthComponent;
  label: string;
  score: number;
  weight: number;
  effectiveWeight: number;
  rawValue: number;
  unit: string;
  description: string;
}

export interface ProductHealthScore {
  id: string;
  product_id: string;
  overall_score: number;
  research_freshness_score: number;
  pipeline_depth_score: number;
  swipe_velocity_score: number;
  build_success_score: number;
  cost_efficiency_score: number;
  component_data?: string; // JSON: HealthComponentScore[]
  snapshot_date?: string;
  calculated_at: string;
}

export interface HealthScoreResponse {
  score: ProductHealthScore;
  components: HealthComponentScore[];
  weights: HealthWeightConfig;
  history: ProductHealthScore[];
}

export interface ProductProgramVariant {
  id: string;
  product_id: string;
  name: string;
  content: string;
  is_control: number;
  created_at: string;
}

export interface ProductABTest {
  id: string;
  product_id: string;
  variant_a_id: string;
  variant_b_id: string;
  status: ABTestStatus;
  split_mode: ABTestSplitMode;
  min_swipes: number;
  last_variant_used?: string;
  winner_variant_id?: string;
  created_at: string;
  concluded_at?: string;
  // Joined fields
  variant_a?: ProductProgramVariant;
  variant_b?: ProductProgramVariant;
}

export interface ABTestComparisonMetrics {
  variant_id: string;
  variant_name: string;
  is_control: boolean;
  ideas_generated: number;
  swipes_total: number;
  swipes_approved: number;
  swipes_rejected: number;
  swipes_maybe: number;
  acceptance_rate: number;
  tasks_created: number;
  tasks_completed: number;
  build_success_rate: number;
  cost_total_usd: number;
  cost_per_shipped_idea: number | null;
}

export interface ABTestComparison {
  test: ProductABTest;
  variant_a_metrics: ABTestComparisonMetrics;
  variant_b_metrics: ABTestComparisonMetrics;
  statistics: {
    chi_squared: number | null;
    p_value: number | null;
    confidence_tier: 'raw' | 'ci' | 'significance';
    significant: boolean;
    recommended_winner: string | null;
  };
}

export type ResearchCyclePhase = 'init' | 'llm_submitted' | 'llm_polling' | 'report_received' | 'completed';
export type IdeationCyclePhase = 'init' | 'llm_submitted' | 'llm_polling' | 'ideas_parsed' | 'ideas_stored' | 'completed';

export interface ResearchCycle {
  id: string;
  product_id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  report?: string; // JSON
  ideas_generated: number;
  cost_usd: number;
  tokens_used: number;
  agent_id?: string;
  current_phase?: ResearchCyclePhase;
  phase_data?: string; // JSON
  session_key?: string;
  last_heartbeat?: string;
  retry_count?: number;
  started_at: string;
  completed_at?: string;
  error_message?: string;
}

export interface IdeationCycle {
  id: string;
  product_id: string;
  research_cycle_id?: string;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  current_phase?: IdeationCyclePhase;
  phase_data?: string; // JSON
  session_key?: string;
  last_heartbeat?: string;
  retry_count?: number;
  ideas_generated: number;
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

export interface AutopilotActivityEntry {
  id: string;
  product_id: string;
  cycle_id: string;
  cycle_type: 'research' | 'ideation';
  event_type: string;
  message: string;
  detail?: string;
  cost_usd?: number;
  tokens_used?: number;
  created_at: string;
}

export interface Idea {
  id: string;
  product_id: string;
  cycle_id?: string;
  title: string;
  description: string;
  category: IdeaCategory;
  research_backing?: string;
  impact_score?: number;
  feasibility_score?: number;
  complexity?: IdeaComplexity;
  estimated_effort_hours?: number;
  competitive_analysis?: string;
  target_user_segment?: string;
  revenue_potential?: string;
  technical_approach?: string;
  risks?: string; // JSON array
  tags?: string; // JSON array
  source: IdeaSource;
  source_research?: string; // JSON array
  status: IdeaStatus;
  swiped_at?: string;
  task_id?: string;
  user_notes?: string;
  resurfaced_from?: string;
  resurfaced_reason?: string;
  similarity_flag?: string; // JSON array of similar idea refs
  auto_suppressed?: number; // 1 = suppressed due to similarity
  suppress_reason?: string;
  variant_id?: string;
  created_at: string;
  updated_at: string;
}

export interface SwipeHistoryEntry {
  id: string;
  idea_id: string;
  product_id: string;
  action: SwipeAction;
  category: string;
  tags?: string; // JSON array
  impact_score?: number;
  feasibility_score?: number;
  complexity?: string;
  user_notes?: string;
  created_at: string;
}

export interface PreferenceModel {
  id: string;
  product_id: string;
  model_type: 'simple' | 'advanced';
  category_weights?: string; // JSON
  tag_weights?: string; // JSON
  complexity_weights?: string; // JSON
  patterns?: string; // JSON
  learned_preferences_md?: string;
  total_swipes: number;
  approval_rate: number;
  last_updated: string;
  created_at: string;
}

export interface MaybePoolEntry {
  id: string;
  idea_id: string;
  product_id: string;
  last_evaluated_at?: string;
  next_evaluate_at?: string;
  evaluation_count: number;
  evaluation_notes?: string; // JSON array
  created_at: string;
  // Joined
  idea?: Idea;
}

export interface CostEvent {
  id: string;
  product_id?: string;
  workspace_id: string;
  task_id?: string;
  cycle_id?: string;
  agent_id?: string;
  event_type: CostEventType;
  provider?: string;
  model?: string;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  metadata?: string; // JSON
  created_at: string;
}

export interface CostCap {
  id: string;
  workspace_id: string;
  product_id?: string;
  cap_type: CostCapType;
  limit_usd: number;
  current_spend_usd: number;
  period_start?: string;
  period_end?: string;
  status: CostCapStatus;
  created_at: string;
  updated_at: string;
}

export interface ProductSchedule {
  id: string;
  product_id: string;
  schedule_type: ScheduleType;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  last_run_at?: string;
  next_run_at?: string;
  config?: string; // JSON
  created_at: string;
  updated_at: string;
}

// Task notes types (agent chat)
export type TaskNoteMode = 'note' | 'direct';
export type TaskNoteStatus = 'pending' | 'delivered' | 'read';

export interface TaskNote {
  id: string;
  task_id: string;
  content: string;
  mode: TaskNoteMode;
  role: 'user' | 'assistant';
  status: TaskNoteStatus;
  delivered_at?: string;
  created_at: string;
}

export interface Convoy {
  id: string;
  parent_task_id: string;
  name: string;
  status: ConvoyStatus;
  decomposition_strategy: DecompositionStrategy;
  decomposition_spec?: string;
  total_subtasks: number;
  completed_subtasks: number;
  failed_subtasks: number;
  created_at: string;
  updated_at: string;
  // Joined
  parent_task?: Task;
  subtasks?: ConvoySubtask[];
}

export interface ConvoySubtask {
  id: string;
  convoy_id: string;
  task_id: string;
  sort_order: number;
  depends_on?: string[];
  created_at: string;
  // Joined
  task?: Task;
}

export interface AgentHealth {
  id: string;
  agent_id: string;
  task_id?: string;
  health_state: AgentHealthState;
  last_activity_at?: string;
  last_checkpoint_at?: string;
  progress_score: number;
  consecutive_stall_checks: number;
  metadata?: Record<string, unknown>;
  updated_at: string;
  // Joined
  agent?: Agent;
}

export interface WorkCheckpoint {
  id: string;
  task_id: string;
  agent_id: string;
  checkpoint_type: CheckpointType;
  state_summary: string;
  files_snapshot?: Array<{ path: string; hash: string; size: number }>;
  context_data?: Record<string, unknown>;
  created_at: string;
}

export interface AgentMailMessage {
  id: string;
  convoy_id: string;
  from_agent_id: string;
  to_agent_id: string;
  subject?: string;
  body: string;
  read_at?: string;
  created_at: string;
  // Joined
  from_agent?: Agent;
  to_agent?: Agent;
}

// Real-time SSE event types
export type SSEEventType =
  | 'task_updated'
  | 'task_created'
  | 'task_deleted'
  | 'activity_logged'
  | 'deliverable_added'
  | 'agent_spawned'
  | 'agent_completed'
  | 'convoy_created'
  | 'convoy_progress'
  | 'convoy_completed'
  | 'agent_health_changed'
  | 'checkpoint_saved'
  | 'mail_received'
  | 'research_started'
  | 'research_completed'
  | 'ideas_generated'
  | 'idea_swiped'
  | 'idea_building'
  | 'idea_shipped'
  | 'maybe_resurfaced'
  | 'preference_updated'
  | 'cost_cap_warning'
  | 'cost_cap_exceeded'
  | 'note_queued'
  | 'note_delivered'
  | 'research_phase'
  | 'ideation_phase'
  | 'autopilot_activity'
  | 'health_score_updated'
  | 'ab_test_started'
  | 'ab_test_concluded'
  | 'ab_test_cancelled';

export interface SSEEvent {
  type: SSEEventType;
  payload: Task | TaskActivity | TaskDeliverable | {
    taskId: string;
    sessionId: string;
    agentName?: string;
    summary?: string;
    deleted?: boolean;
  } | {
    id: string;  // For task_deleted events
  } | Record<string, unknown>; // Autopilot + extensible event payloads
}
