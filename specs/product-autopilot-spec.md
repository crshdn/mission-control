# Product Autopilot — Autonomous Product Development Engine for Mission Control

**Version:** 1.0  
**Date:** 2026-03-18  
**Status:** Draft  
**Author:** Charlie (AI assistant)  
**Repo:** https://github.com/crshdn/mission-control (v1.5.3)

---

## Reference Implementations

- **Gas Town** (https://github.com/steveyegge/gastown) — Multi-agent orchestration with parallel execution, convoy-based work tracking, and persistent state. Informs our convoy integration and agent health monitoring.
- **Karpathy's Autoresearch** (https://github.com/karpathy/autoresearch) — Autonomous research loop pattern: agent modifies code → runs experiment → evaluates → keeps/discards → repeats. The key insight: "you don't program the code, you program the program." We adapt this pattern for product development: agent researches → generates ideas → user evaluates (swipe) → agent builds → loop repeats with learned preferences.
- **IdeaSwipe** (previously built MVP) — Tinder-style swipe interface for business ideas with touch/keyboard/button interaction. We rebuild this concept natively inside Mission Control.

---

## Table of Contents

1. [Vision](#1-vision)
2. [Architecture Overview](#2-architecture-overview)
3. [Phase 1 — Product Autopilot Core](#3-phase-1--product-autopilot-core)
4. [Phase 2 — Learning Engine & Preference Evolution](#4-phase-2--learning-engine--preference-evolution)
5. [Phase 3 — Post-Launch Operations](#5-phase-3--post-launch-operations)
6. [Phase 4 — Full Autonomous Business Loop](#6-phase-4--full-autonomous-business-loop)
7. [Convoy Integration as Pipeline Phase](#7-convoy-integration-as-pipeline-phase)
8. [Cost Tracking System](#8-cost-tracking-system)
9. [Database Schema](#9-database-schema)
10. [API Endpoints](#10-api-endpoints)
11. [UI Components](#11-ui-components)
12. [Agent Prompts & Programs](#12-agent-prompts--programs)
13. [Configuration & Scheduling](#13-configuration--scheduling)
14. [File Inventory](#14-file-inventory)
15. [Migration & Build Order](#15-migration--build-order)
16. [Testing Plan](#16-testing-plan)

---

## 1. Vision

Mission Control becomes a **fully autonomous product development and business operations platform**. The end state:

1. **Research** — Agents autonomously analyze the product, competitors, market trends, user feedback, and technology landscape
2. **Ideation** — Agents generate feature ideas, business improvements, content strategies, and growth opportunities
3. **Curation** — User swipes through ideas (Yes / No / Maybe / 🔥 Build Now) with a Tinder-style interface
4. **Building** — Approved ideas become tasks that flow through the MC pipeline, with convoy mode for parallel execution, producing branches and PRs
5. **Launch** — Completed features are deployed, monitored, and iterated on
6. **Operations** — Post-launch agents handle SEO, content creation, social media, analytics, keyword optimization, and continuous improvement
7. **Learning** — Every swipe, every build outcome, every operational metric feeds back into the system, making research better, ideation sharper, and execution more reliable over time

The user's daily involvement shrinks to: **swipe in the morning, review PRs, merge what's good.** Everything else is autonomous.

---

## 2. Architecture Overview

### The Full Loop

```
┌─────────────────────────────────────────────────────────┐
│                    PRODUCT AUTOPILOT                      │
│                                                           │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│  │ RESEARCH │───→│ IDEATION │───→│  SWIPE   │           │
│  │  AGENTS  │    │  AGENTS  │    │   DECK   │           │
│  └──────────┘    └──────────┘    └────┬─────┘           │
│       ↑                               │                  │
│       │                    ┌──────────┼──────────┐       │
│       │                    ↓          ↓          ↓       │
│       │                  👈 No     👉 Yes     🔥 Now    │
│       │                    ↓          ↓          ↓       │
│       │               Archive    Build Queue   Immediate │
│       │                    ↓          ↓       Dispatch   │
│       │              ┌─────┘    ┌────┴────┐      ↓       │
│       │              ↓          ↓         ↓      ↓       │
│  ┌────┴─────┐   Learning    PLANNING → CONVOY → BUILD   │
│  │ LEARNING │   Signal         ↓                  ↓      │
│  │  ENGINE  │←──────────── TESTING ← ── ── ── ── ┘      │
│  └──────────┘                  ↓                         │
│       ↑                     REVIEW                       │
│       │                        ↓                         │
│       │                      DONE                        │
│       │                        ↓                         │
│       │               ┌───────┴────────┐                 │
│       │               ↓                ↓                 │
│       │          POST-LAUNCH     OPERATIONS              │
│       │          MONITORING      (SEO, Content,          │
│       │               ↓          Social, etc.)           │
│       └───────────────┴────────────────┘                 │
│                                                           │
│              👇 Maybe (Resurface Later)                   │
│              → Maybe Pool → Re-evaluate periodically     │
└─────────────────────────────────────────────────────────┘
```

### Multi-Product Support

Each product is an independent autopilot instance with its own:
- Product Program (instructions for research/ideation agents)
- Idea queue and swipe deck
- Learning model (preference history)
- Build pipeline and agent assignments
- Cost tracking and caps
- Operations agents (post-launch)

A single Mission Control workspace can run multiple products simultaneously.

---

## 3. Phase 1 — Product Autopilot Core

This is the foundation. Everything else builds on it.

### 3.1 Product Setup

A "Product" in MC is a new top-level entity representing something the user is building and wants to improve autonomously.

**Creating a Product:**
1. User clicks "New Product" in the Autopilot section
2. Enters basic info: name, description, repo URL (optional), live URL (optional)
3. Chooses setup mode:
   - **AI-Assisted:** MC analyzes the repo/URL and generates a draft Product Program. User reviews and tweaks.
   - **Manual:** User writes the Product Program from scratch.
   - **Planning Mode:** Interactive Q&A where MC asks targeted questions to build the Product Program collaboratively (same pattern as MC's existing planning mode for tasks).
4. Configures research schedule (when and how often)
5. Sets cost cap per cycle
6. Assigns or auto-discovers agents for research/ideation/building

**Product Program** (the Karpathy `program.md` analog):

This is a markdown document that instructs the research and ideation agents. It contains:

```markdown
# Product Program: [Product Name]

## Identity
- Name: Mission Control
- Type: Web application (Next.js + SQLite)
- Repo: https://github.com/crshdn/mission-control
- Live URL: http://192.168.1.65:4000
- Stack: Next.js 14, React 18, SQLite (better-sqlite3), TypeScript, Tailwind CSS

## Purpose
What this product does and who it's for. Written by the user or generated by AI.

## Target Users
Who uses this and what problems they have.

## Business Model
How this makes money (if applicable). What drives revenue.

## Competitive Landscape
Known competitors, differentiators, market position.

## Priorities
What matters most — growth, stability, features, UX, performance, etc.
User can rank or weight these.

## Constraints
Technical limitations, budget constraints, timeline pressure, etc.

## Research Directives
Specific areas the user wants the research agent to focus on.
Example: "Focus on features that enterprise customers need" or
"Look for ways to reduce churn" or "Find integration opportunities."

## Exclusions
Things the user explicitly does NOT want suggested.
Example: "No blockchain features" or "Don't suggest mobile app — we're web only."

## Learned Preferences
[Auto-populated from swipe history]
This section is updated automatically as the learning engine accumulates data.
```

### 3.2 Research Agent

The research agent runs on the configured schedule (nightly, daily, weekly, etc.) and produces raw research that feeds the ideation agent.

**What it researches:**

1. **Codebase Analysis** — Clones/pulls the repo, analyzes structure, identifies:
   - Missing features (based on the product type)
   - Code quality issues (no tests, poor error handling, accessibility gaps)
   - Performance bottlenecks
   - Security concerns
   - UX gaps (based on UI component analysis)
   - Outdated dependencies

2. **Competitor Analysis** — Web searches for competitor products, analyzes:
   - Feature comparisons (what they have that we don't)
   - Pricing models
   - Recent launches/announcements
   - User reviews of competitors (what people complain about)

3. **Market & Trend Analysis** — Searches for:
   - Industry trends relevant to the product category
   - Emerging technologies that could apply
   - Product Hunt / Hacker News trending in the space
   - GitHub trending repos in related categories

4. **User Feedback Analysis** (if available) — Ingests:
   - Customer feedback forms (if configured)
   - Support tickets or complaints
   - App store reviews (if applicable)
   - Social media mentions

5. **Technology Landscape** — Checks for:
   - New libraries, frameworks, or tools that could improve the product
   - API integrations that would add value (e.g., Stripe, Twilio, SendGrid)
   - Infrastructure improvements (CDN, caching, database upgrades)

**Research Output:**

The research agent produces a structured research report stored in the database:

```json
{
  "product_id": "prod-123",
  "cycle_id": "cycle-456",
  "created_at": "2026-03-19T06:00:00Z",
  "sections": {
    "codebase": {
      "findings": [...],
      "gaps": [...],
      "opportunities": [...]
    },
    "competitors": {
      "products_analyzed": [...],
      "feature_gaps": [...],
      "market_position": "..."
    },
    "trends": {
      "relevant_trends": [...],
      "emerging_tech": [...],
      "community_signals": [...]
    },
    "user_feedback": {
      "themes": [...],
      "pain_points": [...],
      "feature_requests": [...]
    },
    "technology": {
      "new_tools": [...],
      "integration_opportunities": [...],
      "infrastructure_improvements": [...]
    }
  },
  "cost": {
    "tokens_used": 45000,
    "estimated_cost_usd": 2.35
  }
}
```

### 3.3 Ideation Agent

Takes the research report + Product Program + learned preferences and generates ideas.

**Process:**

1. Reads the Product Program (including learned preferences section)
2. Reads the latest research report
3. Reads the swipe history (last 100 swipes with outcomes)
4. Generates 10-30 ideas, each with:

```json
{
  "id": "idea-789",
  "product_id": "prod-123",
  "cycle_id": "cycle-456",
  "title": "Real-time Collaboration Mode",
  "description": "Add WebSocket-based real-time collaboration so multiple team members can view and manage the task board simultaneously. Cursors, live updates, and presence indicators.",
  "category": "feature",
  "research_backing": "3 of 5 analyzed competitors (Linear, Notion, Monday) have real-time collaboration. This was the #2 most requested feature in project management tool reviews on G2.",
  "impact_score": 8.5,
  "feasibility_score": 6.0,
  "complexity": "L",
  "estimated_effort_hours": 40,
  "competitive_analysis": "Linear has this. Asana doesn't. Monday has limited version. Would be a differentiator vs. smaller tools.",
  "target_user_segment": "Teams (3+ people managing agents together)",
  "revenue_potential": "Enables team pricing tier — $X/seat/month",
  "technical_approach": "Use existing SSE infrastructure, upgrade to WebSocket for bidirectional. Add presence tracking table. Optimistic UI updates with conflict resolution.",
  "risks": ["WebSocket scaling at high user counts", "Conflict resolution complexity"],
  "tags": ["collaboration", "real-time", "team", "enterprise"],
  "source_research": ["competitor_gap", "market_trend"],
  "created_at": "2026-03-19T06:15:00Z"
}
```

**Idea Categories:**

| Category | Description |
|----------|-------------|
| `feature` | New functionality |
| `improvement` | Enhance existing feature |
| `ux` | User experience / design improvement |
| `performance` | Speed, efficiency, resource usage |
| `integration` | Third-party service integration |
| `infrastructure` | Architecture, scaling, reliability |
| `content` | Content strategy, SEO, documentation |
| `growth` | Marketing, acquisition, retention |
| `monetization` | Revenue, pricing, upsell opportunities |
| `operations` | Automation, monitoring, maintenance |
| `security` | Security hardening, compliance |

**Scoring:**

- `impact_score` (1-10): How much value this adds to users
- `feasibility_score` (1-10): How achievable with current stack/resources
- `complexity`: S (< 4 hours), M (4-16 hours), L (16-40 hours), XL (40+ hours)
- Scores are influenced by learned preferences — if user consistently approves high-impact/low-feasibility ideas, the agent adjusts its weighting

### 3.4 Swipe Interface

The swipe deck is the user's primary interaction with Product Autopilot. New ideas appear as cards.

**Swipe Actions:**

| Action | Gesture | Keyboard | Button | Result |
|--------|---------|----------|--------|--------|
| **Reject** | Swipe left | ← arrow | 👎 | Archived, learning signal recorded |
| **Approve** | Swipe right | → arrow | 👍 | Added to build queue |
| **Build Now** | Swipe up | ↑ arrow | 🔥 | Immediate dispatch to build pipeline |
| **Maybe Later** | Swipe down | ↓ arrow | 🤔 | Sent to Maybe Pool, resurfaced later |

**Idea Card Contents:**

```
┌─────────────────────────────────────┐
│  🏷️ feature                    L   │  ← category + complexity
│                                     │
│  Real-time Collaboration Mode       │  ← title
│                                     │
│  Add WebSocket-based real-time      │  ← description
│  collaboration so multiple team     │
│  members can view and manage the    │
│  task board simultaneously.         │
│                                     │
│  📊 Impact: 8.5  ⚙️ Feasibility: 6 │  ← scores
│                                     │
│  🔍 Research: 3/5 competitors have  │  ← research backing (collapsed)
│  this. #2 most requested feature... │
│                                     │
│  💰 Revenue: Enables team pricing   │  ← revenue potential
│  tier — $X/seat/month               │
│                                     │
│  🛠️ Approach: Upgrade SSE to WS,   │  ← technical approach (collapsed)
│  add presence tracking...           │
│                                     │
│  ⚠️ Risks: WebSocket scaling,      │  ← risks (collapsed)
│  conflict resolution complexity     │
│                                     │
│  vs. Linear ✅  vs. Asana ❌        │  ← competitive comparison
│  vs. Monday ⚠️                      │
│                                     │
│  ┌─────┬─────┬──────┬──────┐       │
│  │ 👎  │ 🤔  │  👍  │  🔥  │       │  ← action buttons
│  └─────┴─────┴──────┴──────┘       │
└─────────────────────────────────────┘
```

Collapsible sections: research backing, technical approach, and risks are collapsed by default with expand toggles. The card should be scannable in 5 seconds but have depth if the user wants it.

**Additional Card Actions:**
- **Edit** — User can modify the idea title/description before approving
- **Add Note** — Attach a note that gets passed to the build agent
- **Change Priority** — Override the auto-assigned priority before it enters the queue

### 3.5 Idea Queue & Build Flow

**Approved ideas** (right swipe) enter the build queue:

1. Idea is converted to a Mission Control task
2. Task enters the normal MC pipeline: `planning` → `inbox` → `assigned` → `in_progress` → `testing` → `review` → `done`
3. If the idea's complexity is L or XL, it's flagged as a convoy candidate — MC can auto-decompose it into sub-tasks (using the convoy pipeline phase)
4. Build agents create feature branches and PRs against the product's repo
5. Completed tasks produce deliverables (PRs, deployed features, documentation)

**🔥 ideas** (up swipe) skip the queue:
1. Immediately created as a task with `urgent` priority
2. Auto-dispatched to the next available build agent
3. Enters the pipeline at `in_progress` (skips inbox wait)

**Maybe ideas** (down swipe) go to the Maybe Pool:
1. Stored with the original research context
2. Periodically re-evaluated (configurable: weekly, monthly)
3. Re-evaluation considers: has the market changed? Have competitors launched this? Has the user's preference evolved?
4. If re-evaluation suggests the idea is now more relevant, it re-enters the swipe deck with a "Resurfaced" badge and the reason why

**Rejected ideas** (left swipe):
1. Archived (never deleted)
2. Learning signal recorded (category, tags, scores → rejection)
3. Can be manually browsed in an "Archive" view
4. May be resurfaced if significant market change occurs (configurable — default off, opt-in)

### 3.6 Manual Idea Submission

Users can manually add ideas to the swipe deck or directly to the build queue:

- **"Add Idea" button** in the Autopilot UI
- Form: title, description, category, priority, notes
- Option to add it to swipe deck (for evaluation) or directly to build queue (skip swipe)
- Manually submitted ideas are tagged `source: manual` vs. agent-generated `source: research`

---

## 4. Phase 2 — Learning Engine & Preference Evolution

### 4.1 Preference Tracking

Every swipe is a training signal stored in the database:

```json
{
  "idea_id": "idea-789",
  "product_id": "prod-123",
  "action": "approve",
  "category": "feature",
  "tags": ["collaboration", "real-time", "team", "enterprise"],
  "impact_score": 8.5,
  "feasibility_score": 6.0,
  "complexity": "L",
  "timestamp": "2026-03-19T07:30:00Z"
}
```

### 4.2 Simple Mode (Toggle: Simple)

Tracks approval rate per category and per tag. Uses this to:
- Sort future ideas (higher-approved categories first)
- Filter out categories with < 10% approval rate (with override)
- Annotate ideas with "You usually approve ideas like this" or "You rarely approve this type"

Implementation: weighted averages per category/tag, updated on each swipe.

### 4.3 Advanced Mode (Toggle: Advanced)

Everything in Simple Mode plus:

**Category Preference Model:**

For each idea category, maintain:
- Approval rate (rolling 90-day window)
- Average score of approved vs. rejected ideas
- Trend direction (are approvals increasing or decreasing for this category?)
- Correlation analysis: which tag combinations predict approval?

**Product Program Evolution:**

The learning engine periodically (weekly) generates a "Preference Report" and proposes updates to the Product Program's `Learned Preferences` section:

```markdown
## Learned Preferences (Auto-Updated 2026-03-25)

### Strong Signals (>80% approval rate)
- UX improvements: 92% approval (23/25)
- Integration features: 85% approval (17/20)
- Features tagged "enterprise": 88% approval

### Weak Signals (<30% approval rate)
- Admin/settings features: 15% approval (3/20)
- Performance optimizations: 25% approval (5/20)
- Ideas with complexity XL: 20% approval

### Observed Patterns
- User strongly prefers features that create new revenue streams (🔥 rate: 40%)
- User rejects most infrastructure-only improvements
- User approves competitive-gap features at 3x the rate of trend-following features
- Optimal complexity: M (4-16 hours) has highest approval at 78%

### Recommendations for Research Agent
- Increase weight on: revenue-generating features, integrations, UX
- Decrease weight on: admin features, performance-only improvements
- Target complexity: S-M preferred over L-XL
- Focus competitor analysis on: [top 3 competitors user responds to]
```

The user can review and approve/edit these preference updates before they take effect, or enable auto-apply.

**Ideation Quality Score:**

Track how many agent-generated ideas get approved over time:
- Week 1: 30% approval rate (baseline)
- Week 4: 55% approval rate (learning taking effect)
- Week 8: 70%+ (well-calibrated)

If approval rate drops, flag it to the user: "Idea quality has decreased — consider updating your Product Program."

**Build Outcome Feedback:**

Close the loop by tracking what happens AFTER an idea is approved and built:
- Did the PR get merged or closed?
- If merged, did the feature get used? (analytics, if available)
- Did the user request changes during review?
- How many rework cycles did it take?

This feeds back into ideation: "Ideas in category X get approved but PRs often get closed → agent should improve technical approach for this category."

### 4.4 Feedback Capture from Customer Forms

Future extension point (flagged as "maybe" per discussion):
- Configurable webhook endpoint that accepts customer feedback
- Feedback is categorized and stored
- Research agent includes customer feedback themes in its analysis
- Ideas can be tagged with "inspired by customer feedback"

The endpoint would accept:
```
POST /api/products/{id}/feedback
{
  "source": "contact_form",
  "content": "I wish I could export my task history as a PDF",
  "customer_id": "optional",
  "timestamp": "2026-03-19T10:00:00Z"
}
```

This is a Phase 2 extension, not a Phase 1 requirement.

---

## 5. Phase 3 — Post-Launch Operations

Once features are built and shipped, the system doesn't stop. Post-launch agents handle ongoing operations.

### 5.1 SEO Agent

**Purpose:** Optimize the product's web presence for search engines.

**Capabilities:**
- Analyze current site structure and content for SEO issues
- Generate meta tags, structured data, and Open Graph tags
- Identify keyword opportunities (using web search analysis)
- Suggest and create content optimized for target keywords
- Monitor search rankings for tracked keywords (via Google Search Console API if configured)
- Identify technical SEO issues (page speed, mobile-friendliness, crawlability)
- Generate sitemap updates when new pages/features are added

**Operational Loop:**
1. Weekly: Run full SEO audit of the product
2. Generate SEO improvement ideas → feed into the ideation pipeline
3. For approved SEO improvements, create implementation tasks
4. Track keyword ranking changes over time
5. Report SEO performance metrics

**Google Search Console Integration:**
- OAuth connection to GSC account
- Pull: search queries, impressions, clicks, average position, CTR
- Identify: declining keywords, rising opportunities, content gaps
- Feed insights into the research agent for keyword-driven idea generation

### 5.2 Content Agent

**Purpose:** Create and manage content that drives traffic, engagement, and authority.

**Capabilities:**
- Generate blog posts, documentation, tutorials, and guides
- Create landing page copy for new features
- Write changelog entries and release notes
- Produce social media content (see 5.3)
- Generate email newsletters / drip campaigns
- Create help documentation and FAQs
- Optimize existing content based on performance data

**Content Strategy Loop:**
1. Research agent identifies content opportunities (keyword gaps, competitor content, trending topics)
2. Content ideas enter the swipe deck alongside feature ideas (category: `content`)
3. Approved content ideas become tasks with content-specific workflow:
   `outline` → `draft` → `review` → `publish`
4. Published content is tracked for performance (pageviews, engagement, conversions)
5. Underperforming content is flagged for optimization

**Content Management:**
- Track all content pieces in a content inventory
- Manage publication schedule (content calendar)
- A/B test headlines and descriptions
- Auto-generate internal links between related content pieces
- Refresh stale content based on age or declining performance

### 5.3 Social Media Agent

**Purpose:** Maintain active social media presence and drive engagement.

**Capabilities:**
- Generate social media posts for supported platforms (Twitter/X, LinkedIn, etc.)
- Create posts announcing new features, blog posts, milestones
- Engage with relevant conversations (curated, not spam)
- Track post performance (impressions, engagement, clicks)
- Optimize posting schedule based on audience analytics

**Social Strategy Loop:**
1. New feature shipped → auto-generate announcement posts for configured platforms
2. New content published → auto-generate social promotion posts
3. Generate a weekly batch of value-add posts (tips, insights, industry commentary)
4. All generated posts enter a review queue before publishing (never auto-post without approval)
5. Track performance and learn which post styles/topics perform best

**Social Media Queue:**
- Separate from the swipe deck — its own review interface
- Cards show: platform, post text, suggested image/media, optimal post time
- User approves, edits, or rejects
- Approved posts are scheduled or posted immediately
- API integrations for posting (Phase 4, uses platform APIs or Buffer/Hootsuite-style intermediaries)

### 5.4 Analytics Agent

**Purpose:** Monitor product health and surface actionable insights.

**Capabilities:**
- Track feature usage (if analytics are configured)
- Monitor error rates, performance metrics, uptime
- Identify user drop-off points
- Analyze conversion funnels
- Generate weekly analytics reports
- Surface anomalies (traffic spike, error spike, conversion drop)

**Data Sources:**
- Application analytics (if instrumented)
- Server logs
- Error tracking (Sentry, etc., if configured)
- Google Analytics (if connected)
- Database metrics (growth rates, usage patterns)

**Reporting:**
- Weekly automated analytics report → delivered to user via MC notification or Discord
- Anomaly alerts → immediate notification
- Analytics insights feed into the research agent ("Users aren't using feature X → maybe improve it" or "Feature Y has 10x expected usage → double down")

### 5.5 Keyword & Growth Agent

**Purpose:** Identify and execute growth opportunities.

**Capabilities:**
- Keyword research using search data and competitor analysis
- Identify long-tail keyword opportunities
- Generate keyword-optimized page suggestions
- A/B test landing page variations
- Track keyword performance over time
- Suggest paid advertising keywords and budgets (recommendations only, no auto-spend)

**Growth Loop:**
1. Weekly keyword analysis → identify new opportunities
2. Keyword-driven ideas → swipe deck (category: `growth`)
3. Approved keywords → content agent creates optimized pages
4. SEO agent optimizes the pages
5. Analytics agent tracks performance
6. Results feed back into keyword strategy

---

## 6. Phase 4 — Full Autonomous Business Loop

This is the end state where all agents work in concert.

### 6.1 The Orchestration Layer

A meta-agent (or the existing MC orchestrator) coordinates all Phase 3 agents:

```
PRODUCT PROGRAM (user-defined strategy)
         ↓
    ORCHESTRATOR
    ┌────┼────┬────────┬──────────┬────────┐
    ↓    ↓    ↓        ↓          ↓        ↓
Research Ideation  SEO Agent  Content  Social  Analytics
 Agent   Agent                Agent   Agent    Agent
    ↓    ↓    ↓        ↓          ↓        ↓
    └────┼────┴────────┴──────────┴────────┘
         ↓
    UNIFIED DASHBOARD
    (ideas, content, SEO, social, analytics — all in one view)
         ↓
    USER REVIEWS & APPROVES
         ↓
    BUILD/PUBLISH PIPELINE
         ↓
    POST-LAUNCH MONITORING
         ↓
    FEEDBACK → LEARNING ENGINE → NEXT CYCLE
```

### 6.2 Cross-Agent Intelligence

In Phase 4, agents share intelligence:

- **Research → SEO:** "Competitor X just launched feature Y and is ranking #1 for keyword Z"
- **Analytics → Content:** "Blog post about feature A has 5x traffic — write more like it"
- **SEO → Ideation:** "We rank #15 for 'agent task management' — a feature targeting this keyword would help"
- **Social → Content:** "Posts about pricing do poorly but posts about automation tips get 10x engagement"
- **Content → SEO:** "Published 3 new pages — update sitemap and internal links"

This cross-agent communication uses the inter-agent mailbox system from the convoy spec, extended to work at the product level (not just within convoys).

### 6.3 Autonomous Improvement Cycles

The system runs continuous improvement cycles:

1. **Feature Improvement Cycle** (nightly/weekly)
   - Analyze existing features for improvement opportunities
   - Generate improvement ideas → swipe deck
   - Build approved improvements

2. **Content Refresh Cycle** (weekly)
   - Identify stale or underperforming content
   - Generate refresh plans → content review queue
   - Execute approved refreshes

3. **SEO Optimization Cycle** (weekly)
   - Run SEO audit
   - Generate optimization tasks
   - Execute approved optimizations
   - Track ranking changes

4. **Growth Experiment Cycle** (weekly)
   - Identify growth hypotheses from data
   - Generate experiment ideas → swipe deck
   - Run approved experiments
   - Measure results, learn, iterate

### 6.4 Reporting & Visibility

**Weekly Autopilot Report** (sent via Discord or in-app):

```
📊 Weekly Autopilot Report — Mission Control
Week of March 17-23, 2026

IDEATION
- 24 ideas generated
- 16 swiped (8 approved, 5 rejected, 3 maybe)
- Approval rate: 50% (↑ from 42% last week)

BUILDING  
- 5 features built
- 3 PRs merged, 1 in review, 1 closed
- Convoy efficiency: 3 sub-tasks avg per feature

CONTENT
- 2 blog posts published
- 1 documentation page updated
- Total views: 1,240 (↑ 15%)

SEO
- Average position: 14.2 (↑ from 16.8)
- New keywords ranking: 8
- Top mover: "ai agent orchestration" → position 9 (was 23)

COST
- Research: $4.20
- Ideation: $1.85
- Building: $18.50
- Content: $3.10
- Total: $27.65 (under $50 cap)

LEARNING
- Preference model updated
- Top category this week: integrations (100% approval)
- Emerging signal: user approving more "growth" category ideas
```

---

## 7. Convoy Integration as Pipeline Phase

Convoy mode should be a configurable phase within the Mission Control pipeline, not a separate system.

### Current Pipeline

```
PLANNING → INBOX → ASSIGNED → IN_PROGRESS → TESTING → REVIEW → DONE
```

### Updated Pipeline with Convoy Phase

```
PLANNING → INBOX → ASSIGNED → [CONVOY_DECOMPOSE] → IN_PROGRESS → TESTING → REVIEW → DONE
```

The `CONVOY_DECOMPOSE` stage is **optional and configurable**:

- If the task is simple (complexity S/M), it flows directly from ASSIGNED → IN_PROGRESS as today
- If the task is complex (complexity L/XL) or explicitly marked as a convoy, it enters CONVOY_DECOMPOSE where it gets broken into sub-tasks
- Sub-tasks each follow their own ASSIGNED → IN_PROGRESS → TESTING → DONE cycle
- Parent task moves to `convoy_active` status while sub-tasks execute
- When all sub-tasks complete, parent task moves to REVIEW

### Configuration

In the workspace workflow template, convoy is a configurable stage:

```json
{
  "stages": [
    { "id": "planning", "label": "Planning", "role": null, "status": "planning" },
    { "id": "inbox", "label": "Inbox", "role": null, "status": "inbox" },
    { "id": "assigned", "label": "Assigned", "role": "builder", "status": "assigned" },
    { "id": "convoy_decompose", "label": "Decompose", "role": "coordinator", "status": "convoy_active",
      "optional": true,
      "auto_trigger": { "complexity": ["L", "XL"] },
      "config": {
        "max_subtasks": 10,
        "max_parallel_agents": 5,
        "failure_threshold": 0.5,
        "auto_decompose": true
      }
    },
    { "id": "in_progress", "label": "In Progress", "role": "builder", "status": "in_progress" },
    { "id": "testing", "label": "Testing", "role": "tester", "status": "testing" },
    { "id": "review", "label": "Review", "role": null, "status": "review" },
    { "id": "done", "label": "Done", "role": null, "status": "done" }
  ]
}
```

### How This Works with Product Autopilot

1. Autopilot-generated idea gets approved via swipe
2. Idea becomes a task, enters PLANNING (spec generation) or skips to INBOX
3. Task gets assigned to builder agent(s)
4. If complexity is L/XL (or user/system flags it), it enters CONVOY_DECOMPOSE
5. Coordinator agent (or AI decomposition) breaks it into sub-tasks
6. Sub-tasks execute in parallel via convoy
7. All sub-tasks complete → parent task moves to TESTING → REVIEW
8. User reviews the combined output

---

## 8. Cost Tracking System

Every operation that incurs a cost is tracked.

### 8.1 Cost Events

A cost event is recorded whenever tokens are consumed or external APIs are called:

```json
{
  "id": "cost-abc",
  "product_id": "prod-123",
  "workspace_id": "default",
  "task_id": "task-456",
  "cycle_id": "cycle-789",
  "agent_id": "agent-research",
  "event_type": "agent_dispatch",
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "tokens_input": 25000,
  "tokens_output": 3500,
  "cost_usd": 0.0925,
  "metadata": {
    "operation": "research_cycle",
    "phase": "competitor_analysis"
  },
  "created_at": "2026-03-19T06:05:00Z"
}
```

### 8.2 Cost Sources

| Source | How Cost Is Captured |
|--------|---------------------|
| Agent dispatch (OpenClaw) | Token usage from session metadata |
| Research web searches | Per-search cost (if using paid API) |
| External API calls | Rate-based estimation per API |
| Convoy sub-tasks | Sum of all sub-task agent costs |
| Content generation | Token usage for content creation |
| SEO analysis | Token usage + any external tool costs |

### 8.3 Cost Caps

Configurable at multiple levels:

| Level | Scope | Example |
|-------|-------|---------|
| **Per-cycle cap** | Max spend per research/ideation cycle | $10/cycle |
| **Per-task cap** | Max spend building a single feature | $25/task |
| **Daily cap** | Max total spend per day across all operations | $50/day |
| **Monthly cap** | Max total spend per month | $500/month |
| **Per-product cap** | Max spend per product per month | $200/product/month |

When a cap is approached (80% threshold), the system:
1. Logs a warning
2. Notifies the user via SSE event + Discord notification
3. Continues until the cap is hit

When a cap is hit:
1. Current operation completes (don't kill mid-task)
2. No new operations are started
3. User is notified: "Cost cap reached — autopilot paused until [next period / cap increase]"
4. User can override: increase cap, or manually approve one more cycle

### 8.4 Cost Dashboard

New section in the MC UI showing:

- **Real-time spend:** Current day/week/month totals with progress bar toward caps
- **Breakdown by category:** Research, ideation, building, content, SEO, operations
- **Breakdown by product:** Per-product spend (for multi-product setups)
- **Breakdown by agent:** Which agents are consuming the most
- **Cost per idea:** Average cost to research + generate one idea
- **Cost per shipped feature:** Average cost from idea → merged PR
- **Trend chart:** Daily/weekly spend over time
- **ROI indicators:** Cost vs. value delivered (if measurable)

### 8.5 Cost Estimation

Before dispatching, the system estimates the cost:

- Research cycle: estimate based on historical average
- Build task: estimate based on complexity (S: $2-5, M: $5-15, L: $15-40, XL: $40-100)
- Content piece: estimate based on length/type

Estimates are shown to the user:
- In the swipe card: "Estimated build cost: ~$12"
- In convoy view: "Estimated convoy cost: ~$35 (5 sub-tasks)"
- Before dispatch: "This will cost approximately $X. Proceed?"

---

## 9. Database Schema

### New Tables

```sql
-- Products: top-level entities for autopilot
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  repo_url TEXT,
  live_url TEXT,
  product_program TEXT,              -- Markdown: the Product Program document
  icon TEXT DEFAULT '🚀',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  settings TEXT,                     -- JSON: per-product configuration
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Research cycles: each run of the research agent
CREATE TABLE IF NOT EXISTS research_cycles (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  report TEXT,                       -- JSON: structured research report
  ideas_generated INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  agent_id TEXT REFERENCES agents(id),
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  error_message TEXT
);

-- Ideas: generated by ideation agent or manually submitted
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cycle_id TEXT REFERENCES research_cycles(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'feature', 'improvement', 'ux', 'performance', 'integration',
    'infrastructure', 'content', 'growth', 'monetization', 'operations', 'security'
  )),
  research_backing TEXT,             -- Markdown: research evidence supporting this idea
  impact_score REAL,                 -- 1.0-10.0
  feasibility_score REAL,            -- 1.0-10.0
  complexity TEXT CHECK (complexity IN ('S', 'M', 'L', 'XL')),
  estimated_effort_hours REAL,
  competitive_analysis TEXT,
  target_user_segment TEXT,
  revenue_potential TEXT,
  technical_approach TEXT,
  risks TEXT,                        -- JSON array of risk strings
  tags TEXT,                         -- JSON array of tag strings
  source TEXT DEFAULT 'research' CHECK (source IN ('research', 'manual', 'resurfaced', 'feedback')),
  source_research TEXT,              -- JSON array of research section keys that inspired this
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'maybe', 'building', 'built', 'shipped'
  )),
  swiped_at TEXT,                    -- When the user made a decision
  task_id TEXT REFERENCES tasks(id), -- Link to MC task when building
  user_notes TEXT,                   -- Notes added by user during swipe
  resurfaced_from TEXT REFERENCES ideas(id),  -- If resurfaced, link to original
  resurfaced_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Swipe history: every swipe action for learning
CREATE TABLE IF NOT EXISTS swipe_history (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'maybe', 'fire')),
  category TEXT NOT NULL,
  tags TEXT,                         -- JSON array (denormalized for fast queries)
  impact_score REAL,
  feasibility_score REAL,
  complexity TEXT,
  user_notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Preference model: learned preferences per product
CREATE TABLE IF NOT EXISTS preference_models (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  model_type TEXT DEFAULT 'simple' CHECK (model_type IN ('simple', 'advanced')),
  category_weights TEXT,             -- JSON: { "feature": 0.85, "ux": 0.92, ... }
  tag_weights TEXT,                  -- JSON: { "enterprise": 0.9, "admin": 0.15, ... }
  complexity_weights TEXT,           -- JSON: { "S": 0.7, "M": 0.78, "L": 0.45, "XL": 0.2 }
  patterns TEXT,                     -- JSON: detected patterns and signals
  learned_preferences_md TEXT,       -- Markdown: auto-generated preferences section
  total_swipes INTEGER DEFAULT 0,
  approval_rate REAL DEFAULT 0,
  last_updated TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Maybe pool: ideas deferred for later
CREATE TABLE IF NOT EXISTS maybe_pool (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  last_evaluated_at TEXT,
  next_evaluate_at TEXT,             -- When to re-evaluate this idea
  evaluation_count INTEGER DEFAULT 0,
  evaluation_notes TEXT,             -- JSON array of evaluation results
  created_at TEXT DEFAULT (datetime('now'))
);

-- Product feedback: external feedback from customers/users (Phase 2)
CREATE TABLE IF NOT EXISTS product_feedback (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source TEXT NOT NULL,              -- 'contact_form', 'support_ticket', 'review', 'social', 'manual'
  content TEXT NOT NULL,
  customer_id TEXT,
  category TEXT,                     -- Auto-categorized
  sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
  processed INTEGER DEFAULT 0,      -- Has the research agent seen this?
  idea_id TEXT REFERENCES ideas(id), -- If this feedback inspired an idea
  created_at TEXT DEFAULT (datetime('now'))
);

-- Cost events: every cost-incurring operation
CREATE TABLE IF NOT EXISTS cost_events (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  task_id TEXT REFERENCES tasks(id),
  cycle_id TEXT REFERENCES research_cycles(id),
  agent_id TEXT REFERENCES agents(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'agent_dispatch', 'research_cycle', 'ideation_cycle', 'build_task',
    'content_generation', 'seo_analysis', 'web_search', 'external_api'
  )),
  provider TEXT,                     -- 'anthropic', 'openai', etc.
  model TEXT,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  metadata TEXT,                     -- JSON: additional context
  created_at TEXT DEFAULT (datetime('now'))
);

-- Cost caps: configurable spending limits
CREATE TABLE IF NOT EXISTS cost_caps (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  product_id TEXT REFERENCES products(id),  -- NULL = workspace-level cap
  cap_type TEXT NOT NULL CHECK (cap_type IN ('per_cycle', 'per_task', 'daily', 'monthly', 'per_product_monthly')),
  limit_usd REAL NOT NULL,
  current_spend_usd REAL DEFAULT 0,
  period_start TEXT,                 -- For daily/monthly caps
  period_end TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'exceeded')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Product schedules: when research/operations run
CREATE TABLE IF NOT EXISTS product_schedules (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN (
    'research', 'ideation', 'maybe_reevaluation', 'seo_audit',
    'content_refresh', 'analytics_report', 'social_batch', 'growth_experiment'
  )),
  cron_expression TEXT NOT NULL,     -- Standard cron expression
  timezone TEXT DEFAULT 'America/Denver',
  enabled INTEGER DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  config TEXT,                       -- JSON: schedule-specific configuration
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Operations log: tracks all post-launch operations
CREATE TABLE IF NOT EXISTS operations_log (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL CHECK (operation_type IN (
    'seo_audit', 'content_publish', 'content_refresh', 'social_post',
    'keyword_research', 'analytics_report', 'growth_experiment',
    'feedback_processing', 'preference_update'
  )),
  status TEXT DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
  summary TEXT,
  details TEXT,                      -- JSON: operation-specific details
  cost_usd REAL DEFAULT 0,
  agent_id TEXT REFERENCES agents(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Content inventory: tracks all content pieces (Phase 3)
CREATE TABLE IF NOT EXISTS content_inventory (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN (
    'blog_post', 'documentation', 'tutorial', 'landing_page', 'changelog',
    'newsletter', 'faq', 'social_post', 'guide', 'case_study'
  )),
  title TEXT NOT NULL,
  url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  target_keywords TEXT,              -- JSON array
  performance TEXT,                  -- JSON: { views, engagement, conversions, etc. }
  last_refreshed_at TEXT,
  idea_id TEXT REFERENCES ideas(id), -- Source idea, if applicable
  task_id TEXT REFERENCES tasks(id), -- Build task, if applicable
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Social media queue (Phase 3)
CREATE TABLE IF NOT EXISTS social_queue (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('twitter', 'linkedin', 'facebook', 'instagram', 'reddit', 'other')),
  content TEXT NOT NULL,
  media_url TEXT,
  suggested_post_time TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'posted', 'failed')),
  posted_at TEXT,
  performance TEXT,                  -- JSON: { impressions, engagement, clicks, etc. }
  idea_id TEXT REFERENCES ideas(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- SEO tracking (Phase 3)
CREATE TABLE IF NOT EXISTS seo_keywords (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  current_position REAL,
  previous_position REAL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  target_position REAL,
  status TEXT DEFAULT 'tracking' CHECK (status IN ('tracking', 'optimizing', 'achieved', 'abandoned')),
  content_ids TEXT,                  -- JSON array of content_inventory ids targeting this keyword
  last_checked_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_workspace ON products(workspace_id);
CREATE INDEX IF NOT EXISTS idx_research_cycles_product ON research_cycles(product_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_product ON ideas(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
CREATE INDEX IF NOT EXISTS idx_ideas_product_pending ON ideas(product_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_swipe_history_product ON swipe_history(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swipe_history_category ON swipe_history(product_id, category);
CREATE INDEX IF NOT EXISTS idx_maybe_pool_next ON maybe_pool(product_id, next_evaluate_at);
CREATE INDEX IF NOT EXISTS idx_cost_events_product ON cost_events(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_workspace ON cost_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_task ON cost_events(task_id);
CREATE INDEX IF NOT EXISTS idx_cost_caps_workspace ON cost_caps(workspace_id);
CREATE INDEX IF NOT EXISTS idx_product_schedules_product ON product_schedules(product_id);
CREATE INDEX IF NOT EXISTS idx_operations_log_product ON operations_log(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_inventory_product ON content_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_social_queue_product ON social_queue(product_id, status);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_product ON seo_keywords(product_id);
CREATE INDEX IF NOT EXISTS idx_product_feedback_product ON product_feedback(product_id, processed);
```

### Changes to Existing Tables

```sql
-- Add product linkage to tasks table
ALTER TABLE tasks ADD COLUMN product_id TEXT REFERENCES products(id);
ALTER TABLE tasks ADD COLUMN idea_id TEXT REFERENCES ideas(id);
ALTER TABLE tasks ADD COLUMN estimated_cost_usd REAL;
ALTER TABLE tasks ADD COLUMN actual_cost_usd REAL DEFAULT 0;

-- Add cost tracking to existing agents table
ALTER TABLE agents ADD COLUMN total_cost_usd REAL DEFAULT 0;
ALTER TABLE agents ADD COLUMN total_tokens_used INTEGER DEFAULT 0;
```

---

## 10. API Endpoints

### Product Management

```
POST   /api/products                           Create a product
GET    /api/products                           List products for workspace
GET    /api/products/{id}                      Get product details
PATCH  /api/products/{id}                      Update product (including Product Program)
DELETE /api/products/{id}                      Archive product (soft delete)

POST   /api/products/{id}/analyze              Trigger AI analysis of repo/URL to generate Product Program draft
POST   /api/products/{id}/planning             Start planning mode for Product Program
POST   /api/products/{id}/planning/answer      Answer a planning question
POST   /api/products/{id}/planning/approve     Approve and finalize Product Program
```

### Research & Ideation

```
POST   /api/products/{id}/research/run         Trigger a research cycle
GET    /api/products/{id}/research/cycles       List research cycles
GET    /api/products/{id}/research/cycles/{cycleId}  Get research cycle details + report

POST   /api/products/{id}/ideation/run         Trigger ideation (usually follows research)
GET    /api/products/{id}/ideas                List ideas (filterable: status, category, tags)
GET    /api/products/{id}/ideas/pending        Get pending ideas for swipe deck
POST   /api/products/{id}/ideas                Manually submit an idea
PATCH  /api/products/{id}/ideas/{ideaId}       Update idea (edit, add notes)
```

### Swipe

```
POST   /api/products/{id}/swipe                Record a swipe action
GET    /api/products/{id}/swipe/deck           Get the current swipe deck (ordered, unreviewed ideas)
GET    /api/products/{id}/swipe/history        Get swipe history
GET    /api/products/{id}/swipe/stats          Get swipe statistics (approval rates, etc.)
```

Request body for swipe:
```json
{
  "idea_id": "idea-789",
  "action": "approve",
  "notes": "Love this — prioritize the WebSocket approach"
}
```

### Maybe Pool

```
GET    /api/products/{id}/maybe                List ideas in maybe pool
POST   /api/products/{id}/maybe/{ideaId}/resurface   Manually resurface an idea
POST   /api/products/{id}/maybe/evaluate       Trigger re-evaluation of due maybe ideas
```

### Learning Engine

```
GET    /api/products/{id}/preferences          Get current preference model
PATCH  /api/products/{id}/preferences          Update preference settings (simple/advanced toggle)
POST   /api/products/{id}/preferences/refresh  Force recalculation of preference model
GET    /api/products/{id}/preferences/report   Get latest preference report (markdown)
POST   /api/products/{id}/preferences/apply    Apply preference report to Product Program
```

### Cost Tracking

```
GET    /api/costs                              Workspace-level cost overview
GET    /api/costs/breakdown                    Breakdown by category, product, agent, time period
GET    /api/products/{id}/costs                Product-level cost details
GET    /api/tasks/{id}/costs                   Task-level cost details

GET    /api/costs/caps                         List all cost caps
POST   /api/costs/caps                         Create a cost cap
PATCH  /api/costs/caps/{id}                    Update a cost cap
DELETE /api/costs/caps/{id}                    Remove a cost cap
GET    /api/costs/caps/status                  Check all caps (are any near limit?)
POST   /api/costs/event                        Record a cost event (called by agents/system)
```

### Post-Launch Operations (Phase 3)

```
-- SEO
POST   /api/products/{id}/seo/audit            Run SEO audit
GET    /api/products/{id}/seo/keywords          List tracked keywords
POST   /api/products/{id}/seo/keywords          Add keyword to track
GET    /api/products/{id}/seo/report            Get latest SEO report
POST   /api/products/{id}/seo/gsc/connect       Connect Google Search Console

-- Content
GET    /api/products/{id}/content               List content inventory
POST   /api/products/{id}/content               Add content piece
PATCH  /api/products/{id}/content/{contentId}   Update content (status, performance)
POST   /api/products/{id}/content/refresh       Trigger content refresh evaluation
GET    /api/products/{id}/content/calendar       Get content calendar

-- Social
GET    /api/products/{id}/social/queue           List social media queue
POST   /api/products/{id}/social/generate        Generate social posts batch
PATCH  /api/products/{id}/social/{postId}        Approve/reject/edit a queued post
POST   /api/products/{id}/social/{postId}/post   Publish an approved post

-- Analytics
GET    /api/products/{id}/analytics/report       Get latest analytics report
POST   /api/products/{id}/analytics/run          Trigger analytics analysis

-- Feedback
POST   /api/products/{id}/feedback               Submit customer feedback
GET    /api/products/{id}/feedback                List feedback entries
POST   /api/products/{id}/feedback/process        Trigger feedback processing (feed to research agent)
```

### Schedules

```
GET    /api/products/{id}/schedules              List all schedules for product
POST   /api/products/{id}/schedules              Create a schedule
PATCH  /api/products/{id}/schedules/{schedId}    Update schedule (enable/disable, change cron, etc.)
DELETE /api/products/{id}/schedules/{schedId}    Remove a schedule
```

### Operations

```
GET    /api/products/{id}/operations             List operations log
GET    /api/products/{id}/operations/report       Get weekly operations report
```

---

## 11. UI Components

### 11.1 Autopilot Section (New Top-Level Navigation)

Add "Autopilot" to the main navigation alongside the existing workspace/task views.

**Autopilot Landing:**
- Grid of product cards (name, icon, status, approval rate, last cycle, spend)
- "New Product" button
- Quick stats: total ideas pending, active builds, weekly spend

### 11.2 Product Dashboard

When a user clicks into a product:

**Tabs:**

| Tab | Contents |
|-----|----------|
| **Swipe** | The swipe deck — primary interaction |
| **Ideas** | Full idea list (filterable by status, category, source) |
| **Research** | Research cycle history, latest report |
| **Build Queue** | Active tasks/convoys being built from approved ideas |
| **Operations** | SEO, Content, Social, Analytics dashboards (Phase 3) |
| **Learning** | Preference model, approval trends, preference report |
| **Costs** | Product-level cost dashboard |
| **Program** | Product Program editor |
| **Settings** | Schedules, caps, agent assignments, toggle simple/advanced |

### 11.3 Swipe Deck Component

**Layout:**
```
┌─────────────────────────────────────────┐
│          [Product Name] Swipe Deck      │
│          12 ideas to review             │
│                                         │
│    ┌─────────────────────────────┐      │
│    │                             │      │
│    │      [IDEA CARD - see 3.4]  │      │
│    │                             │      │
│    │      (swipeable / animated) │      │
│    │                             │      │
│    └─────────────────────────────┘      │
│                                         │
│    ┌──────┬──────┬───────┬───────┐      │
│    │  👎  │  🤔  │  👍   │  🔥   │      │
│    │  No  │Maybe │  Yes  │ Now!  │      │
│    └──────┴──────┴───────┴───────┘      │
│                                         │
│    ← → ↑ ↓ keyboard shortcuts           │
│    Touch swipe enabled                  │
│                                         │
│    Progress: 4/12 reviewed              │
│    Session: 2 approved, 1 maybe, 1 no   │
└─────────────────────────────────────────┘
```

**Card animations:**
- Swipe left: card slides left and fades (red tint)
- Swipe right: card slides right and fades (green tint)
- Swipe up: card flies up with fire animation (orange glow)
- Swipe down: card slides down and fades (yellow/amber tint)
- Next card slides in from the stack

**Mobile responsive:** Cards must work on phone screens. Touch gestures are primary; buttons are fallback.

### 11.4 Ideas List View

Table/grid view of all ideas with:
- Filters: status, category, source, complexity, date range
- Sort: impact score, feasibility score, created date, category
- Bulk actions: approve selected, reject selected, move to maybe
- Search: full-text search across idea titles and descriptions
- Each row expandable to show full details

### 11.5 Cost Dashboard Component

```
┌──────────────────────────────────────────────────┐
│  💰 Cost Dashboard                               │
│                                                   │
│  Today: $4.20   This Week: $27.65   Month: $89   │
│  ████████░░░░░ 56% of monthly cap ($500)          │
│                                                   │
│  ┌─────────────────────────────────────┐          │
│  │  [Bar chart: daily spend last 30d]  │          │
│  └─────────────────────────────────────┘          │
│                                                   │
│  Breakdown:                                       │
│  Research    ████░░░░░░  $12.40 (14%)             │
│  Ideation    ██░░░░░░░░  $5.20  (6%)              │
│  Building    ████████░░  $52.00 (58%)             │
│  Content     ███░░░░░░░  $8.50  (10%)             │
│  Operations  ███░░░░░░░  $10.90 (12%)             │
│                                                   │
│  Top Costs:                                       │
│  1. Convoy: Auth System rebuild — $18.50          │
│  2. Research cycle #12 — $4.20                    │
│  3. Blog post: "Getting Started" — $3.10          │
│                                                   │
│  Per-Feature Stats:                               │
│  Avg cost per idea: $0.58                         │
│  Avg cost per shipped feature: $14.20             │
│  Avg cost per content piece: $3.80                │
└──────────────────────────────────────────────────┘
```

### 11.6 Operations Dashboard (Phase 3)

Sub-tabs within the Operations tab:

**SEO:**
- Keyword ranking table (keyword, position, change, impressions, clicks)
- SEO health score
- Recent audit findings
- Quick actions: run audit, add keyword, connect GSC

**Content:**
- Content inventory (type, title, status, performance)
- Content calendar (scheduled publications)
- Performance metrics (top performing, declining)
- Quick actions: generate post, refresh content

**Social:**
- Social queue (pending posts with approve/reject/edit)
- Published posts with performance
- Post schedule (calendar view)
- Platform breakdown

**Analytics:**
- Key metrics overview
- Anomaly alerts
- Weekly report viewer
- Custom metric tracking

### 11.7 Learning Dashboard

```
┌──────────────────────────────────────────────────┐
│  🧠 Learning Engine        [Simple ◉ Advanced]   │
│                                                   │
│  Approval Rate: 62% (↑ 8% from last week)        │
│  Total Swipes: 247                                │
│  Model Confidence: Moderate (needs ~50 more)      │
│                                                   │
│  Category Performance:                            │
│  feature      ████████░░  82% approval            │
│  ux           █████████░  92% approval            │
│  integration  ████████░░  85% approval            │
│  content      ██████░░░░  65% approval            │
│  growth       █████░░░░░  55% approval            │
│  performance  ██░░░░░░░░  25% approval ⚠️         │
│  operations   ███░░░░░░░  30% approval ⚠️         │
│                                                   │
│  Detected Patterns:                               │
│  • You strongly prefer revenue-generating ideas   │
│  • M complexity has highest approval (78%)        │
│  • Ideas with "enterprise" tag: 88% approval      │
│  • You rarely approve admin/settings features     │
│                                                   │
│  [View Full Preference Report]                    │
│  [Apply to Product Program]                       │
│  [Reset Learning Data]                            │
└──────────────────────────────────────────────────┘
```

### 11.8 New SSE Event Types

```typescript
export type SSEEventType =
  | 'task_updated' | 'task_created' | 'task_deleted'
  | 'activity_logged' | 'deliverable_added'
  | 'agent_spawned' | 'agent_completed'
  // Autopilot events:
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
  // Operations events:
  | 'seo_audit_completed'
  | 'content_published'
  | 'social_posted'
  | 'analytics_anomaly'
  | 'operations_report';
```

---

## 12. Agent Prompts & Programs

### 12.1 Research Agent System Prompt

```markdown
You are a Product Research Agent for Mission Control. Your job is to research 
and analyze a product to identify improvement opportunities.

## Your Process

1. Read the Product Program to understand what this product is, who uses it, 
   and what matters to the owner.

2. If a repo URL is provided, analyze the codebase:
   - Identify the tech stack, architecture, and file structure
   - Find missing features, code quality issues, UX gaps
   - Check for outdated dependencies, security issues, performance problems
   - Note what tests exist and what's untested

3. Research competitors:
   - Search the web for products in the same category
   - Identify features they have that this product doesn't
   - Note their pricing, positioning, and recent changes
   - Read user reviews of competitors for pain points

4. Research market trends:
   - Search for industry trends relevant to this product
   - Look for emerging technologies that could apply
   - Check Product Hunt, Hacker News, GitHub trending
   - Identify potential integration opportunities

5. If customer feedback is available, analyze it:
   - Categorize feedback by theme
   - Identify the most common pain points
   - Note feature requests

6. Research the technology landscape:
   - New libraries or frameworks that could improve the product
   - API integrations that would add value
   - Infrastructure improvements

## Output Format

Produce a structured JSON research report with sections for each area.
Include specific, actionable findings — not generic observations.
Every finding should be something that could inspire a concrete idea.

## Cost Awareness

You have a budget for this research cycle. Track your tool usage.
Prioritize depth in the areas the Product Program emphasizes.
If you're running low on budget, focus on the highest-value research areas.

## Product Program

{product_program_content}

## Learned Preferences

{learned_preferences_content}
```

### 12.2 Ideation Agent System Prompt

```markdown
You are a Product Ideation Agent for Mission Control. Your job is to generate
high-quality feature ideas based on research findings and user preferences.

## Your Process

1. Read the Product Program and Learned Preferences carefully.
2. Read the research report from the latest cycle.
3. Review the swipe history — understand what the user approves and rejects.
4. Generate 10-30 ideas that:
   - Are specific and actionable (not vague)
   - Have clear research backing
   - Include a realistic technical approach
   - Are honest about complexity and risks
   - Align with the user's demonstrated preferences
   - Cover a mix of categories (don't all be the same type)
   - Include at least a few ideas that might surprise the user (stretch ideas)

## Idea Quality Standards

- Every idea must be buildable by a coding agent against the repo
- "Add dark mode" is too generic. "Add dark mode with system preference detection,
  custom color tokens, and persistent user toggle in the header" is specific enough.
- Include competitive context: "Linear has this, Asana doesn't"
- Include revenue potential where applicable
- Be honest about risks — don't hide complexity to make ideas look better

## Scoring

- impact_score: How much value does this add to users? (1-10)
- feasibility_score: How achievable is this with the current stack? (1-10)
- complexity: S (<4h), M (4-16h), L (16-40h), XL (40h+)

Adjust scoring based on learned preferences:
- If user consistently approves M complexity, score M ideas slightly higher
- If user rejects XL complexity, lower impact scores for XL ideas
- Weight categories the user has historically approved

## Output

JSON array of idea objects. See the idea schema in the spec.
Generate ideas in descending order of expected user approval likelihood.

## Product Program

{product_program_content}

## Research Report

{research_report_content}

## Swipe History (Last 100)

{swipe_history_content}

## Learned Preferences

{learned_preferences_content}
```

### 12.3 Karpathy-Style Program Pattern

Following the autoresearch pattern, we also maintain a `product-autopilot-program.md` that evolves over time:

```markdown
# Autopilot Program v{version}

## Research Strategy
{What to research, how deeply, which sources matter most}

## Ideation Strategy  
{How many ideas per cycle, category distribution, scoring weights}

## Build Strategy
{When to use convoy vs single agent, complexity thresholds, quality gates}

## Operations Strategy
{Which post-launch operations are active, their cadence, priorities}

## Changelog
- v3: Increased weight on integration ideas after 3 consecutive approvals
- v2: Reduced XL ideas to max 2 per cycle (user rejects 80% of them)
- v1: Initial program
```

This program file evolves via the learning engine. Each significant preference shift triggers a version bump with a changelog entry explaining what changed and why.

---

## 13. Configuration & Scheduling

### 13.1 Product Settings

```json
{
  "research": {
    "enabled": true,
    "schedule": "0 23 * * *",
    "timezone": "America/Denver",
    "sources": ["codebase", "competitors", "trends", "technology"],
    "max_search_queries": 20,
    "depth": "standard"
  },
  "ideation": {
    "enabled": true,
    "follows_research": true,
    "ideas_per_cycle": { "min": 10, "max": 30 },
    "category_distribution": "auto"
  },
  "building": {
    "auto_dispatch_fire": true,
    "convoy_threshold": "L",
    "max_parallel_builds": 3,
    "branch_prefix": "autopilot/",
    "create_prs": true,
    "pr_auto_assign_reviewer": true
  },
  "learning": {
    "mode": "advanced",
    "auto_apply_preferences": false,
    "preference_update_frequency": "weekly",
    "maybe_reevaluation_frequency": "weekly"
  },
  "operations": {
    "seo": { "enabled": false },
    "content": { "enabled": false },
    "social": { "enabled": false },
    "analytics": { "enabled": false }
  },
  "costs": {
    "per_cycle_cap_usd": 10,
    "per_task_cap_usd": 25,
    "daily_cap_usd": 50,
    "monthly_cap_usd": 500,
    "warning_threshold": 0.8
  },
  "notifications": {
    "research_complete": true,
    "ideas_ready": true,
    "build_complete": true,
    "cost_warning": true,
    "weekly_report": true,
    "channel": "discord"
  }
}
```

### 13.2 Schedule Management

Schedules are managed via the `product_schedules` table and synced with OpenClaw crons (or Mission Control's own scheduling system).

Default schedules for a new product:

| Schedule | Default Cron | Description |
|----------|-------------|-------------|
| Research + Ideation | `0 23 * * *` (11pm daily) | Run research then ideation |
| Maybe Re-evaluation | `0 10 * * 1` (10am Monday) | Re-evaluate maybe pool weekly |
| Preference Update | `0 9 * * 1` (9am Monday) | Recalculate preference model weekly |
| SEO Audit | `0 2 * * 1` (2am Monday) | Weekly SEO audit (when enabled) |
| Content Refresh | `0 3 * * 3` (3am Wednesday) | Evaluate content for refresh (when enabled) |
| Social Batch | `0 8 * * 1` (8am Monday) | Generate weekly social posts (when enabled) |
| Analytics Report | `0 7 * * 1` (7am Monday) | Generate weekly analytics (when enabled) |
| Weekly Report | `0 7 * * 1` (7am Monday) | Compile and send weekly autopilot report |

All schedules are configurable per product.

---

## 14. File Inventory

### New Files

```
-- Core Autopilot
src/lib/autopilot/index.ts                     — Module exports
src/lib/autopilot/products.ts                  — Product CRUD logic
src/lib/autopilot/research.ts                  — Research agent orchestration
src/lib/autopilot/ideation.ts                  — Ideation agent orchestration
src/lib/autopilot/swipe.ts                     — Swipe logic + deck management
src/lib/autopilot/learning.ts                  — Preference learning engine
src/lib/autopilot/maybe-pool.ts                — Maybe pool management + resurfacing
src/lib/autopilot/scheduling.ts                — Schedule management + cron sync
src/lib/autopilot/program.ts                   — Product Program generation + evolution

-- Cost Tracking
src/lib/costs/index.ts                         — Cost tracking module
src/lib/costs/tracker.ts                       — Cost event recording
src/lib/costs/caps.ts                          — Cost cap management + enforcement
src/lib/costs/reporting.ts                     — Cost aggregation + reporting

-- Operations (Phase 3)
src/lib/operations/seo.ts                      — SEO agent orchestration
src/lib/operations/content.ts                  — Content agent orchestration
src/lib/operations/social.ts                   — Social media agent orchestration
src/lib/operations/analytics.ts                — Analytics agent orchestration
src/lib/operations/keywords.ts                 — Keyword research + tracking
src/lib/operations/feedback.ts                 — Customer feedback processing

-- API Routes: Products
src/app/api/products/route.ts                  — Product list + create
src/app/api/products/[id]/route.ts             — Product CRUD
src/app/api/products/[id]/analyze/route.ts     — AI analysis
src/app/api/products/[id]/planning/route.ts    — Product Program planning mode
src/app/api/products/[id]/planning/answer/route.ts
src/app/api/products/[id]/planning/approve/route.ts

-- API Routes: Research & Ideation
src/app/api/products/[id]/research/run/route.ts
src/app/api/products/[id]/research/cycles/route.ts
src/app/api/products/[id]/research/cycles/[cycleId]/route.ts
src/app/api/products/[id]/ideation/run/route.ts
src/app/api/products/[id]/ideas/route.ts
src/app/api/products/[id]/ideas/pending/route.ts
src/app/api/products/[id]/ideas/[ideaId]/route.ts

-- API Routes: Swipe
src/app/api/products/[id]/swipe/route.ts
src/app/api/products/[id]/swipe/deck/route.ts
src/app/api/products/[id]/swipe/history/route.ts
src/app/api/products/[id]/swipe/stats/route.ts

-- API Routes: Maybe Pool
src/app/api/products/[id]/maybe/route.ts
src/app/api/products/[id]/maybe/[ideaId]/resurface/route.ts
src/app/api/products/[id]/maybe/evaluate/route.ts

-- API Routes: Learning
src/app/api/products/[id]/preferences/route.ts
src/app/api/products/[id]/preferences/refresh/route.ts
src/app/api/products/[id]/preferences/report/route.ts
src/app/api/products/[id]/preferences/apply/route.ts

-- API Routes: Costs
src/app/api/costs/route.ts
src/app/api/costs/breakdown/route.ts
src/app/api/costs/caps/route.ts
src/app/api/costs/caps/[id]/route.ts
src/app/api/costs/caps/status/route.ts
src/app/api/costs/event/route.ts
src/app/api/products/[id]/costs/route.ts
src/app/api/tasks/[id]/costs/route.ts

-- API Routes: Operations (Phase 3)
src/app/api/products/[id]/seo/audit/route.ts
src/app/api/products/[id]/seo/keywords/route.ts
src/app/api/products/[id]/seo/report/route.ts
src/app/api/products/[id]/seo/gsc/connect/route.ts
src/app/api/products/[id]/content/route.ts
src/app/api/products/[id]/content/[contentId]/route.ts
src/app/api/products/[id]/content/refresh/route.ts
src/app/api/products/[id]/content/calendar/route.ts
src/app/api/products/[id]/social/queue/route.ts
src/app/api/products/[id]/social/generate/route.ts
src/app/api/products/[id]/social/[postId]/route.ts
src/app/api/products/[id]/social/[postId]/post/route.ts
src/app/api/products/[id]/analytics/report/route.ts
src/app/api/products/[id]/analytics/run/route.ts
src/app/api/products/[id]/feedback/route.ts
src/app/api/products/[id]/feedback/process/route.ts
src/app/api/products/[id]/schedules/route.ts
src/app/api/products/[id]/schedules/[schedId]/route.ts
src/app/api/products/[id]/operations/route.ts
src/app/api/products/[id]/operations/report/route.ts

-- UI Components
src/components/autopilot/AutopilotLanding.tsx         — Product grid + quick stats
src/components/autopilot/ProductDashboard.tsx          — Main product view with tabs
src/components/autopilot/SwipeDeck.tsx                 — Swipe card stack (core interaction)
src/components/autopilot/IdeaCard.tsx                  — Individual idea card
src/components/autopilot/IdeasList.tsx                 — Filterable ideas table/grid
src/components/autopilot/ResearchReport.tsx            — Research cycle viewer
src/components/autopilot/BuildQueue.tsx                — Active builds from approved ideas
src/components/autopilot/LearningDashboard.tsx         — Preference model + approval trends
src/components/autopilot/MaybePool.tsx                 — Maybe pool viewer
src/components/autopilot/ProductProgramEditor.tsx      — Product Program markdown editor
src/components/autopilot/ProductSetupWizard.tsx        — New product setup flow
src/components/autopilot/WeeklyReport.tsx              — Weekly autopilot report viewer

-- Cost UI
src/components/costs/CostDashboard.tsx                 — Cost overview + breakdown
src/components/costs/CostBreakdownChart.tsx            — Bar/pie charts for cost categories
src/components/costs/CostCapManager.tsx                — Cap configuration UI
src/components/costs/CostEstimate.tsx                  — Inline cost estimate display

-- Operations UI (Phase 3)
src/components/operations/SEODashboard.tsx
src/components/operations/ContentInventory.tsx
src/components/operations/ContentCalendar.tsx
src/components/operations/SocialQueue.tsx
src/components/operations/AnalyticsDashboard.tsx
src/components/operations/KeywordTracker.tsx
src/components/operations/OperationsReport.tsx

-- Hooks
src/hooks/useSwipe.ts                                 — Touch + keyboard swipe gesture hook
src/hooks/useCosts.ts                                 — Cost data fetching hook
src/hooks/useAutopilot.ts                             — Autopilot state management

-- Pages
src/app/autopilot/page.tsx                            — Autopilot landing
src/app/autopilot/[productId]/page.tsx                — Product dashboard
src/app/autopilot/[productId]/swipe/page.tsx          — Full-screen swipe mode
src/app/autopilot/new/page.tsx                        — New product setup
```

### Modified Files

```
src/lib/db/schema.ts                — Add all new tables
src/lib/db/migrations.ts            — Add migration for new tables + task columns
src/lib/types.ts                    — Add all new types
src/lib/events.ts                   — Add new SSE event types
src/lib/orchestration.ts            — Add autopilot-aware orchestration
src/lib/auto-dispatch.ts            — Add autopilot idea → task dispatch
src/lib/task-governance.ts          — Add cost tracking on task transitions
src/components/Header.tsx            — Add "Autopilot" to main navigation
src/components/TaskModal.tsx         — Show idea source + cost info on autopilot tasks
src/components/WorkspaceDashboard.tsx — Add autopilot summary stats
src/hooks/useSSE.ts                  — Handle new SSE event types
src/app/layout.tsx                   — Add autopilot routes
src/middleware.ts                    — Add autopilot route handling
```

---

## 15. Migration & Build Order

### Phase 1A: Foundation (Database + Core APIs)
1. Add all new tables via migration
2. Add new columns to tasks table
3. Add new types to `types.ts`
4. Build Product CRUD API (`/api/products/*`)
5. Build Cost Event + Cost Cap APIs (`/api/costs/*`)
6. Build basic Product setup UI (create product, edit Product Program)

### Phase 1B: Research & Ideation Pipeline
7. Build Research Agent orchestration (`src/lib/autopilot/research.ts`)
8. Build Ideation Agent orchestration (`src/lib/autopilot/ideation.ts`)
9. Build Research + Ideation API endpoints
10. Build research report viewer UI
11. Build idea list/detail UI
12. Wire scheduling (product schedules → cron execution)

### Phase 1C: Swipe Interface
13. Build SwipeDeck component (touch, keyboard, buttons)
14. Build IdeaCard component (full card with collapsible sections)
15. Build Swipe API (record action, get deck, history, stats)
16. Build idea → task conversion (approved idea becomes MC task)
17. Build 🔥 immediate dispatch flow
18. Build Maybe Pool management + UI
19. Wire SSE events for swipe actions

### Phase 1D: Integration + Polish
20. Build Autopilot landing page (product grid)
21. Build Product Dashboard with all tabs
22. Integrate with existing MC pipeline (ideas flow through planning → convoy → build)
23. Build notification system (Discord alerts for research complete, ideas ready, etc.)
24. Add Autopilot summary to workspace dashboard
25. Build cost dashboard UI

### Phase 2: Learning Engine
26. Build Simple preference tracking (category/tag weights)
27. Build Advanced preference model (patterns, correlations, trends)
28. Build preference report generator (markdown output)
29. Build preference → Product Program auto-update flow
30. Build learning dashboard UI
31. Build build-outcome feedback loop (PR merged/closed → learning signal)
32. Build Product Program evolution system (versioning + changelog)

### Phase 3: Post-Launch Operations
33. Build SEO agent orchestration + GSC integration
34. Build Content agent orchestration + content inventory
35. Build Social media agent orchestration + queue
36. Build Analytics agent orchestration + reporting
37. Build Keyword research + tracking
38. Build Customer feedback ingestion
39. Build all Phase 3 UI components
40. Build cross-agent intelligence (inter-agent insights)

### Phase 4: Full Autonomous Loop
41. Build orchestration layer coordinating all agents
42. Build autonomous improvement cycles
43. Build weekly autopilot report generation
44. Build Product Program self-evolution (fully autonomous preference adaptation)
45. Polish, optimize, harden

---

## 16. Testing Plan

### Unit Tests

- Product CRUD operations
- Idea creation and scoring
- Swipe action recording + preference model updates
- Cost event recording + cap enforcement
- Maybe pool re-evaluation logic
- Schedule CRUD + cron expression validation
- Preference model calculation (simple + advanced)
- Idea → task conversion logic

### Integration Tests

- Full research → ideation → swipe → build cycle
- Cost cap hit → operations paused → user override → resume
- Maybe pool: idea deferred → time passes → resurfaced → swiped
- Learning loop: swipe 50 ideas → preference model updates → ideation uses preferences
- Multi-product: two products running simultaneous cycles without interference
- 🔥 swipe → immediate task creation → dispatch

### E2E Tests (Playwright)

- Product setup wizard flow
- Swipe deck: touch swipe, keyboard, button — all four actions
- Idea card: expand/collapse sections, add notes, edit
- Cost dashboard: check all visualizations render
- Learning dashboard: verify stats update after swipe
- Navigation: Autopilot → Product → Swipe → back to list

### Manual Testing Scenarios

1. **New product setup:** Create product from repo URL → AI generates Product Program → user tweaks → save
2. **First research cycle:** Trigger manually → verify report → verify ideas generated
3. **Swipe session:** Review 20 ideas → mix of approve/reject/maybe/🔥 → verify all actions recorded
4. **Build flow:** Approved idea → task created → enters pipeline → convoy decompose → sub-tasks → complete
5. **Cost cap:** Set low cap → run research → verify it stops when cap hit → increase cap → resume
6. **Learning:** Swipe 50+ ideas → check preference model → verify next cycle ideas align with preferences
7. **Maybe resurface:** Swipe "maybe" on 5 ideas → trigger re-evaluation → verify resurfaced ideas appear with badge

---

## Open Questions (For User Decision)

1. **Charts library:** What charting library for cost dashboards and analytics? Options: recharts (already common in React), chart.js, d3. Recommendation: recharts (lightest integration with React).

2. **Social media posting:** Phase 3 social agent generates posts but needs platform APIs to actually publish. Should we integrate directly with platform APIs (Twitter API, LinkedIn API), or use a third-party scheduler (Buffer, Hootsuite API)? Or is the queue-and-copy-paste approach sufficient for v1?

3. **GSC OAuth:** Google Search Console integration requires OAuth. Should we use the same gog auth flow or build a separate OAuth connection in MC's settings?

4. **Product Program versioning:** Should we store every version of the Product Program (git-style history), or just current + last? Recommendation: store all versions — it's cheap in SQLite and valuable for understanding evolution.

5. **Idea deduplication:** If the ideation agent generates a similar idea to one that was previously rejected, should the system auto-detect and filter it? Or surface it with a "Similar to rejected idea X" badge?

---

## Summary

Product Autopilot transforms Mission Control from a task execution platform into a **fully autonomous product development and business operations engine**. The core loop — research, ideate, swipe, build, learn, repeat — runs continuously with minimal human input. Post-launch operations extend this to SEO, content, social media, analytics, and growth experimentation.

The user's job becomes: write a Product Program, swipe through ideas every morning, review PRs, and watch the product get better every day.

Everything else is autonomous.
