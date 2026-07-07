import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FolderKanban,
  GitBranch,
  ListChecks,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'AI Agent Orchestration Platform for Human-Reviewed Work | Mission Control',
  description:
    'Coordinate AI agent tasks with queues, ownership, review gates, deliverables, activity logs, and growth opportunities in one Mission Control dashboard.',
};

const CTA_TARGET = '#walkthrough';

const workflowSteps = [
  {
    title: 'Intake',
    body: 'Tasks and opportunities enter a visible queue instead of disappearing into chat threads.',
    primitive: 'Queue',
  },
  {
    title: 'Planning',
    body: 'Unclear work can pause for clarification before an agent starts executing.',
    primitive: 'Planning state',
  },
  {
    title: 'Assignment',
    body: 'Each task can show an owner, agent, priority, type, and current responsibility.',
    primitive: 'Owner',
  },
  {
    title: 'Execution',
    body: 'In-progress work stays visible by state so operators can see what is moving.',
    primitive: 'In progress',
  },
  {
    title: 'Review/testing',
    body: 'Outputs can wait in testing or review before anyone treats them as complete.',
    primitive: 'Review gate',
  },
  {
    title: 'Deliverables/activity',
    body: 'Completed work keeps a path back to evidence, updates, and handoff context.',
    primitive: 'Deliverable trail',
  },
];

const proofRows = [
  {
    icon: Users,
    label: 'Ownership',
    title: 'Know who has the task',
    body: 'Mission Control is built around visible queues, assigned agents, owners, priorities, and next actions.',
  },
  {
    icon: Clock3,
    label: 'State',
    title: 'See where work is stuck',
    body: 'Planning, assigned, in-progress, testing, review, and done states make agent work inspectable.',
  },
  {
    icon: FileCheck2,
    label: 'Evidence',
    title: 'Keep proof with the work',
    body: 'Deliverables and activity history help reviewers understand what changed and what still needs attention.',
  },
];

const statusPills = [
  { label: 'Planning', tone: 'border-mc-border bg-mc-bg-tertiary text-mc-text-secondary' },
  { label: 'Assigned', tone: 'border-blue-500/30 bg-blue-500/15 text-blue-300' },
  { label: 'In Progress', tone: 'border-blue-500/30 bg-blue-500/15 text-blue-300' },
  { label: 'Testing', tone: 'border-amber-500/30 bg-amber-500/15 text-amber-300' },
  { label: 'Review', tone: 'border-amber-500/30 bg-amber-500/15 text-amber-300' },
  { label: 'Done', tone: 'border-green-500/30 bg-green-500/15 text-green-300' },
];

const opportunityRows = [
  {
    query: 'ai agent orchestration platform',
    impressions: '12,400',
    position: '18.3',
    ctr: '0.021',
    page: '/',
    priority: 'High',
  },
  {
    query: 'mission control dashboard for agents',
    impressions: '8,700',
    position: '24.1',
    ctr: '0.015',
    page: '/features',
    priority: 'High',
  },
  {
    query: 'ai task management automation',
    impressions: '9,800',
    position: '42.5',
    ctr: '0.007',
    page: '/',
    priority: 'High',
  },
];

const guardrails = [
  {
    icon: Users,
    title: 'Visible owner',
    body: 'Agent work needs an accountable handoff, not just an output.',
  },
  {
    icon: ShieldCheck,
    title: 'Review and testing states',
    body: 'Human reviewers can inspect work before it is marked complete.',
  },
  {
    icon: FileCheck2,
    title: 'Deliverable trail',
    body: 'Outputs stay connected to the task and handoff context.',
  },
  {
    icon: Activity,
    title: 'Activity history',
    body: 'Recent updates help operators understand what happened next.',
  },
];

const bestFit = [
  'Teams coordinating AI-assisted research, build, QA, content, and growth workflows.',
  'Operators who need to see agent work state, blockers, review readiness, and delivered evidence.',
  'Product, growth, and engineering teams experimenting with reviewed agent workflows.',
  'Internal teams that need a control surface around specialist agents.',
];

const notFit = [
  'Buyers looking only for a developer framework or SDK.',
  'Generic project-management replacement shoppers.',
  'Teams expecting production observability, tracing, alerting, evals, or broad third-party integrations from this page.',
  'Enterprise procurement audiences unless proof is upgraded later.',
];

const faqs = [
  {
    question: 'What is an AI agent orchestration platform?',
    answer:
      'An AI agent orchestration platform helps coordinate work across AI agents, tasks, states, and human review points. For Mission Control, that means a dashboard for queues, owners, statuses, deliverables, activity, and review gates around agent-assisted work.',
  },
  {
    question: 'Is Mission Control an agent framework?',
    answer:
      'Mission Control is not positioned here as a developer framework for building agents from scratch. It is the operator dashboard around agent work: what is queued, who owns it, what state it is in, what has been delivered, and what still needs review.',
  },
  {
    question: 'How is this different from workflow automation?',
    answer:
      'Workflow automation often focuses on triggers and actions. Mission Control focuses on visible handling of agent work: task intake, assignment, status, evidence, review, and activity history.',
  },
  {
    question: 'Does Mission Control run agents autonomously in production?',
    answer:
      'This page does not frame Mission Control around autonomous production execution. The supported claim is human-reviewed coordination of agent work, with review and testing states before work is treated as complete.',
  },
  {
    question: 'Can Mission Control help with SEO and growth workflows?',
    answer:
      'The current growth dashboard connects task metrics, agent status, pipeline health, an SEO opportunity queue, research dispatch, and measurement files. It is an example of agent work moving from opportunity to reviewable output.',
  },
  {
    question: 'Who should request a walkthrough?',
    answer:
      'Teams coordinating AI-assisted research, QA, build, content, or growth workflows should request a walkthrough if they need visibility, ownership, review gates, and deliverable tracking around agent work.',
  },
];

function CtaButton({ variant, children, className = '' }: { variant: 'primary' | 'secondary'; children: ReactNode; className?: string }) {
  const base =
    'inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mc-accent';
  const styles =
    variant === 'primary'
      ? 'bg-mc-accent text-white hover:bg-blue-500'
      : 'border border-mc-border bg-mc-bg-secondary text-mc-text hover:bg-mc-bg-tertiary';

  return (
    <Link href={CTA_TARGET} className={`${base} ${styles} ${className}`}>
      {children}
    </Link>
  );
}

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return <span className={`rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>{label}</span>;
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mc-accent-cyan">{children}</p>;
}

export default function AgentOrchestrationLandingPage() {
  return (
    <div className="dark min-h-screen bg-mc-bg text-mc-text">
      <header className="sticky top-0 z-20 border-b border-mc-border bg-mc-bg/95 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6" aria-label="Mission Control landing page">
          <Link href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mc-accent">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-mc-border bg-mc-bg-secondary text-mc-accent-cyan">
              <Target className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-mc-text">Mission Control</span>
              <span className="hidden text-xs text-mc-text-secondary sm:block">Agent orchestration dashboard</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <CtaButton variant="secondary" className="hidden sm:inline-flex">
              Join the private preview
            </CtaButton>
            <CtaButton variant="primary">Request a walkthrough</CtaButton>
          </div>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid min-h-[calc(100vh-72px)] max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.95fr,1.05fr] lg:py-28">
          <div>
            <SectionEyebrow>AI agent orchestration platform for human-reviewed work</SectionEyebrow>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight tracking-[-0.04em] text-mc-text sm:text-5xl lg:text-7xl lg:leading-[0.95]">
              Mission Control for AI agent orchestration
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-mc-text-secondary sm:text-lg">
              Coordinate agent work from intake to assignment, evidence, review, and delivery with a dashboard built for human oversight.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CtaButton variant="primary" className="w-full sm:w-auto">
                Request a walkthrough
              </CtaButton>
              <CtaButton variant="secondary" className="w-full sm:w-auto">
                Join the private preview
              </CtaButton>
            </div>
            <p className="mt-5 text-sm text-mc-text-secondary">
              Private-preview and walkthrough access only. No public signup, free trial, or pricing claim is made on this page.
            </p>
          </div>

          <WorkControlFlow />
        </section>

        <section className="border-y border-mc-border bg-mc-bg-secondary/45 py-16 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr,1.1fr] lg:items-start">
            <div>
              <SectionEyebrow>Why orchestration needs a dashboard</SectionEyebrow>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-mc-text lg:text-5xl">
                Agents can move fast. Operators still need a control surface.
              </h2>
              <p className="mt-5 text-base leading-7 text-mc-text-secondary sm:text-lg">
                AI agents can produce work quickly, but the operational burden shifts to coordination. Teams need to know what was requested, who owns it, what state it is in, what proof exists, and what still needs human review.
              </p>
            </div>
            <div className="grid gap-4">
              {proofRows.map((item) => (
                <div key={item.title} className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
                  <div className="flex gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-mc-border bg-mc-bg-tertiary text-mc-accent-cyan">
                      <item.icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-mc-text-secondary">{item.label}</p>
                      <h3 className="mt-2 text-lg font-semibold text-mc-text">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-mc-text-secondary">{item.body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-3xl">
            <SectionEyebrow>How Mission Control handles work</SectionEyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-mc-text lg:text-5xl">
              From agent task to reviewed deliverable
            </h2>
            <p className="mt-5 text-base leading-7 text-mc-text-secondary sm:text-lg">
              Mission Control gives reviewed agent work a visible path from queue to owner to review gate to deliverable trail.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-6">
            {workflowSteps.map((step, index) => (
              <article key={step.title} className="relative rounded-2xl border border-mc-border bg-mc-bg-secondary p-5 lg:min-h-[260px]">
                <div className="flex items-center gap-3 lg:block">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-mc-border bg-mc-bg-tertiary text-sm font-semibold text-mc-accent-cyan">
                    {index + 1}
                  </span>
                  <div className="lg:mt-5">
                    <h3 className="text-base font-semibold text-mc-text">{step.title}</h3>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-mc-text-secondary">{step.primitive}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-mc-text-secondary">{step.body}</p>
                {index < workflowSteps.length - 1 && (
                  <div className="absolute -bottom-3 left-8 h-6 border-l border-mc-border lg:-right-2 lg:bottom-auto lg:left-auto lg:top-9 lg:h-px lg:w-4 lg:border-l-0 lg:border-t" aria-hidden="true" />
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="bg-mc-bg-secondary/45 py-16 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[0.9fr,1.1fr]">
            <div className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-mc-accent-cyan" aria-hidden="true" />
                <h2 className="text-base font-semibold text-mc-text">Workflow model</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-mc-text-secondary">
                Representative labels, not live customer data. The model uses verified Mission Control primitives: queues, owners, task states, review gates, deliverables, and activity history.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {statusPills.map((pill) => (
                  <StatusPill key={pill.label} label={pill.label} tone={pill.tone} />
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-mc-accent-purple" aria-hidden="true" />
                <h2 className="text-base font-semibold text-mc-text">Recent activity pattern</h2>
              </div>
              <div className="mt-5 grid gap-3">
                {['Task updated in review', 'Review requested by owner', 'Deliverable attached to task'].map((item) => (
                  <div key={item} className="flex items-center justify-between rounded-xl border border-mc-border bg-mc-bg p-4">
                    <span className="text-sm text-mc-text">{item}</span>
                    <span className="text-xs text-mc-text-secondary">Example event</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.85fr,1.15fr] lg:items-start">
            <div>
              <SectionEyebrow>Growth and opportunity proof</SectionEyebrow>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-mc-text lg:text-5xl">
                From opportunity to agent research
              </h2>
              <p className="mt-5 text-base leading-7 text-mc-text-secondary sm:text-lg">
                The growth dashboard connects task metrics, agent status, pipeline health, an opportunity queue, research dispatch, and measurement files. It shows how an opportunity can become reviewable agent work.
              </p>
              <Link href="/growth" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-mc-border bg-mc-bg-secondary px-5 py-2.5 text-sm font-semibold text-mc-text transition hover:bg-mc-bg-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mc-accent">
                Review the growth dashboard pattern
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="overflow-hidden rounded-2xl border border-mc-border bg-mc-bg-secondary">
              <div className="border-b border-mc-border p-5">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-mc-accent-cyan" aria-hidden="true" />
                  <h3 className="text-base font-semibold text-mc-text">Internal opportunity queue signals</h3>
                </div>
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-mc-bg-tertiary text-xs uppercase tracking-[0.16em] text-mc-text-secondary">
                    <tr>
                      <th className="px-5 py-3 font-medium">Query</th>
                      <th className="px-5 py-3 font-medium">Impressions</th>
                      <th className="px-5 py-3 font-medium">Position</th>
                      <th className="px-5 py-3 font-medium">CTR</th>
                      <th className="px-5 py-3 font-medium">Mapped page</th>
                      <th className="px-5 py-3 font-medium">Priority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mc-border">
                    {opportunityRows.map((row) => (
                      <tr key={row.query}>
                        <td className="px-5 py-4 font-medium text-mc-text">{row.query}</td>
                        <td className="px-5 py-4 text-mc-text-secondary">{row.impressions}</td>
                        <td className="px-5 py-4 text-mc-text-secondary">{row.position}</td>
                        <td className="px-5 py-4 text-mc-text-secondary">{row.ctr}</td>
                        <td className="px-5 py-4 text-mc-text-secondary">{row.page}</td>
                        <td className="px-5 py-4"><StatusPill label={row.priority} tone="border-red-500/30 bg-red-500/15 text-red-300" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 p-4 md:hidden">
                {opportunityRows.map((row) => (
                  <div key={row.query} className="rounded-xl border border-mc-border bg-mc-bg p-4">
                    <p className="font-medium text-mc-text">{row.query}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm text-mc-text-secondary">
                      <div><dt className="text-xs uppercase tracking-[0.14em]">Impressions</dt><dd className="mt-1 text-mc-text">{row.impressions}</dd></div>
                      <div><dt className="text-xs uppercase tracking-[0.14em]">Position</dt><dd className="mt-1 text-mc-text">{row.position}</dd></div>
                      <div><dt className="text-xs uppercase tracking-[0.14em]">CTR</dt><dd className="mt-1 text-mc-text">{row.ctr}</dd></div>
                      <div><dt className="text-xs uppercase tracking-[0.14em]">Mapped page</dt><dd className="mt-1 text-mc-text">{row.page}</dd></div>
                    </dl>
                  </div>
                ))}
              </div>
              <p className="border-t border-mc-border p-5 text-xs leading-5 text-mc-text-secondary">
                Internal opportunity-queue signals only. Not a claim about current SERP rankings, search volume, revenue, or conversion performance.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-mc-border bg-mc-bg-secondary/45 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <SectionEyebrow>Human oversight</SectionEyebrow>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-mc-text lg:text-5xl">
                Human review stays in the loop
              </h2>
              <p className="mt-5 text-base leading-7 text-mc-text-secondary sm:text-lg">
                Mission Control is designed for reviewed work, not blind execution. Review and testing states give operators a place to inspect work before it is treated as done.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {guardrails.map((item) => (
                <article key={item.title} className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-mc-border bg-mc-bg-tertiary text-mc-accent-cyan">
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-mc-text">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-mc-text-secondary">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-6 lg:grid-cols-2">
            <AudienceCard title="Best fit" items={bestFit} tone="text-green-300" />
            <AudienceCard title="Not built for this page" items={notFit} tone="text-amber-300" />
          </div>
        </section>

        <section className="bg-mc-bg-secondary/45 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <SectionEyebrow>FAQ</SectionEyebrow>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-mc-text lg:text-5xl">
                Questions about AI agent orchestration
              </h2>
            </div>
            <div className="mt-10 grid gap-4">
              {faqs.map((faq) => (
                <article key={faq.question} className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
                  <h3 className="text-lg font-semibold text-mc-text">{faq.question}</h3>
                  <p className="mt-3 text-sm leading-6 text-mc-text-secondary sm:text-base sm:leading-7">{faq.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="walkthrough" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="rounded-3xl border border-mc-border bg-mc-bg-secondary p-6 sm:p-10 lg:p-12">
            <div className="grid gap-8 lg:grid-cols-[1fr,0.8fr] lg:items-center">
              <div>
                <SectionEyebrow>Private preview</SectionEyebrow>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-mc-text lg:text-5xl">
                  Bring reviewed agent work into one control surface
                </h2>
                <p className="mt-5 text-base leading-7 text-mc-text-secondary sm:text-lg">
                  Use Mission Control to give agent work a queue, an owner, a state, a review gate, and a deliverable trail. Walkthroughs and private-preview access are currently handled through existing Mission Control contacts.
                </p>
              </div>
              <div className="rounded-2xl border border-mc-border bg-mc-bg p-5">
                <h3 className="text-base font-semibold text-mc-text">Walkthrough request path</h3>
                <p className="mt-3 text-sm leading-6 text-mc-text-secondary">
                  This public page does not publish a signup form or demo route. Request a walkthrough or private-preview access through your existing Mission Control or OpenClaw contact.
                </p>
                <div className="mt-5 flex flex-col gap-3">
                  <span className="inline-flex min-h-11 items-center justify-center rounded-full bg-mc-accent px-5 py-2.5 text-sm font-semibold text-white">
                    Request a walkthrough
                  </span>
                  <span className="inline-flex min-h-11 items-center justify-center rounded-full border border-mc-border bg-mc-bg-secondary px-5 py-2.5 text-sm font-semibold text-mc-text">
                    Join the private preview
                  </span>
                </div>
                <p className="mt-4 text-xs leading-5 text-mc-text-secondary">
                  CTA labels are bounded to private-preview and walkthrough intent until a verified public conversion route exists.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function WorkControlFlow() {
  const nodes = ['Intake', 'Planning', 'Owner', 'In progress', 'Review', 'Deliverable'];

  return (
    <div className="rounded-3xl border border-mc-border bg-mc-bg-secondary p-4 sm:p-5" aria-label="Work control flow diagram">
      <div className="flex items-center justify-between gap-3 border-b border-mc-border pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-mc-text-secondary">Work Control Flow</p>
          <h2 className="mt-2 text-lg font-semibold text-mc-text">Queue to owner to review to deliverable</h2>
        </div>
        <GitBranch className="h-5 w-5 text-mc-accent-cyan" aria-hidden="true" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Queue', value: 'Task intake', icon: ListChecks, tone: 'text-mc-accent-cyan' },
          { label: 'Assigned', value: 'Visible owner', icon: Users, tone: 'text-blue-300' },
          { label: 'Review', value: 'Human gate', icon: CheckCircle2, tone: 'text-amber-300' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-mc-border bg-mc-bg p-4">
            <div className="flex items-center gap-2">
              <item.icon className={`h-4 w-4 ${item.tone}`} aria-hidden="true" />
              <p className="text-xs uppercase tracking-[0.16em] text-mc-text-secondary">{item.label}</p>
            </div>
            <p className="mt-3 text-sm font-semibold text-mc-text">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-mc-border bg-mc-bg p-4">
        <div className="grid gap-3 md:grid-cols-6">
          {nodes.map((node, index) => (
            <div key={node} className="relative rounded-xl border border-mc-border bg-mc-bg-secondary p-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-mc-border bg-mc-bg-tertiary text-xs font-semibold text-mc-accent-cyan">
                {index + 1}
              </span>
              <p className="mt-3 text-sm font-medium text-mc-text">{node}</p>
              {index < nodes.length - 1 && <div className="absolute -bottom-2 left-6 h-4 border-l border-mc-border md:-right-2 md:bottom-auto md:left-auto md:top-7 md:h-px md:w-4 md:border-l-0 md:border-t" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
        <div className="rounded-2xl border border-mc-border bg-mc-bg p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-mc-text-secondary">Activity</p>
          <div className="mt-3 space-y-3">
            {['Task updated', 'Review requested', 'Deliverable attached'].map((event) => (
              <div key={event} className="flex items-center gap-3 text-sm text-mc-text-secondary">
                <span className="h-2 w-2 rounded-full bg-mc-accent-cyan" aria-hidden="true" />
                {event}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-mc-border bg-mc-bg p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-mc-text-secondary">Human review stays in the loop</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {['Planning', 'Testing', 'Review', 'Done'].map((label) => (
              <StatusPill key={label} label={label} tone={statusPills.find((pill) => pill.label === label)?.tone || 'border-mc-border bg-mc-bg-tertiary text-mc-text-secondary'} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AudienceCard({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <article className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5 sm:p-6">
      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-mc-text">{title}</h2>
      <ul className="mt-5 space-y-4">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-mc-text-secondary sm:text-base">
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${tone === 'text-green-300' ? 'bg-green-300' : 'bg-amber-300'}`} aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
