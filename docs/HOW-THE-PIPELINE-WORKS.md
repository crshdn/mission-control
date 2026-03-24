# How the Pipeline Works

Mission Control uses a multi-agent pipeline to take a task from idea to done — automatically. Each stage has a dedicated agent with a specific job, and the system handles all the handoffs between them.

---

## The Stages

Here's what happens when you create a task and kick it off:

### 1. 📋 Planning
You describe what you want built. The system breaks it down, assigns agents, and moves the task to the queue.

### 2. 🔨 Building (In Progress)
The **Builder** agent picks up the task and writes the code. It reads the task spec, any attached files, and — crucially — lessons learned from previous tasks. When it's done, it registers its deliverables (files, URLs) and marks the task as ready for testing.

### 3. 🧪 Testing
The **Tester** agent runs automated checks against every deliverable. It launches a real browser (Playwright) and validates four things:

| Check | What it catches |
|-------|----------------|
| **JavaScript errors** | Console errors, uncaught exceptions |
| **CSS validation** | Syntax errors in stylesheets |
| **Resource loading** | Broken images, missing scripts, 404s |
| **HTTP status** | Server errors on URL deliverables |

It also takes a full-page screenshot as evidence.

- ✅ **All checks pass** → moves to Review
- ❌ **Any check fails** → kicks back to Builder with the exact errors

### 4. 👀 Review And Final Verification
The **Reviewer** agent owns the final verified gate in the rebuilt strict workflow. It examines the code itself — not just whether it runs, but whether it's *good* and whether it fulfills the original task. It looks at:

- Code quality and readability
- Architecture decisions
- Security concerns
- Whether the implementation matches the original spec and actually delivers what was asked for

Think of Testing as "does it work?" and Reviewer-owned verification as "is it well built, and is it actually the right thing?"

- ✅ **Reviewer passes** → task moves to **Done** 🎉
- ❌ **Review fails** → kicks back to Builder with feedback

---

## The Loop-Back

This is the key design principle: **any failure sends the task back to the Builder with the specific reason it failed.**

The Builder doesn't start from scratch — it gets the exact error messages, test screenshots, review notes, and verification feedback. Each iteration is targeted, not blind.

```
Builder → Tester (fail: "3 broken image links")
    ↑         |
    └─────────┘  Builder fixes those 3 images

Builder → Tester (pass) → Reviewer (fail: "SQL injection risk in search")
    ↑                          |
    └──────────────────────────┘  Builder fixes the SQL issue

Builder → Tester (pass) → Reviewer (pass + final verification) → Done ✅
```

The system tracks retry counts and uses exponential backoff (10s → 20s → 40s, up to 5 minutes). After 5 failed attempts, the task gets flagged for manual intervention so it doesn't loop forever.

---

## The Learner

The **Learner** isn't a stage — it's a hook that fires on **every stage transition**. Every time a task passes or fails at any stage, the Learner is notified and captures:

- **What went wrong** (if it failed)
- **What pattern caused the issue**
- **How to prevent it next time**
- **Checklist items** for future tasks

These lessons are saved to a knowledge base. The next time the Builder starts a new task, the most relevant lessons are injected directly into its context. So if a CSS import issue caused a failure last week, the Builder knows to avoid that pattern before writing a single line.

**Every failure makes every future build smarter.**

## Skill Creation Loop

Mission Control also extracts reusable product skills from completed tasks. This is separate from the Learner knowledge base:

- the Learner stores compact lessons and patterns
- the skill loop stores reusable procedures with steps, keywords, and verification guidance

When a completed task demonstrates a repeatable workflow, Mission Control creates or updates a product skill. On later matching tasks, those skills are injected directly into the dispatch payload before work starts. After the task finishes, usage is reported back so confidence can increase or decrease over time.

In the local Cutline trust gate, this loop is verified with `npm run test:self-improvement`.

---

## Concurrency

The system limits how many tasks can be actively worked on at once (default: 3). If the pipeline is full, new tasks wait in a queue and automatically advance when a slot opens up.

This prevents agents from overloading each other and keeps the pipeline flowing smoothly.

---

## Workflow Configuration

The pipeline is fully customizable. You can:

- **Define your own stages** — add, remove, or reorder stages
- **Set fail targets** — control where each stage sends failures (doesn't have to be the Builder)
- **Assign different agents** to different roles per task
- **Configure via WORKFLOW.md** in your workspace, or through the database

The default strict workflow (`Builder → Tester → Reviewer → Done`) works for most projects, and the Reviewer owns final verification in the currently verified Cutline setup.

---

## Quick Reference

| Agent | Role | What it does | On Pass | On Fail |
|-------|------|-------------|---------|---------|
| **Builder** | Build | Writes the code | → Testing | — |
| **Tester** | Test | Automated browser checks | → Review | → Builder |
| **Reviewer** | Review / Verify | Code review and final verification in the rebuilt strict workflow | → Done | → Builder |
| **Learner** | Learn | Captures lessons | *(always runs)* | *(always runs)* |

---

## Summary

1. You describe what you want
2. The Builder builds it
3. The Tester checks if it works
4. The Reviewer checks if it's well-built
5. The Reviewer closes the final verified gate
6. The Learner captures lessons at every step
7. Any failure loops back to the Builder with specific feedback
8. Each iteration gets smarter from previous lessons

The goal: you describe what you want, and the pipeline iterates until it's right — without you having to manage each step.
