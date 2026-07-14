# CLAUDE.md — Sofaamy Business Management System

Guidance for working in this repository. Read `docs/PROJECT_OUTLINE.md` first — it holds the full scope and win strategy. Task tracker: `docs/CHECKLIST.md`.


---

## Behavioral Guidelines (Karpathy Rules — Always Active)

### 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before writing a single line:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Do not "improve" adjacent code, comments, or formatting.
- Do not refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Do not remove pre-existing dead code unless explicitly asked.

The test: Every changed line must trace directly to the current task.

### 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"

For multi-step tasks, state a brief plan before starting:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

---

## Scope Control — Stay in Your Lane

Only modify files, functions, and lines directly related to the current task.
Do not refactor, rename, reorganize, reformat, or "improve" anything not explicitly asked for.
If you notice something worth fixing elsewhere, leave a note. Do not touch it.

---

## Destructive Actions — Full Stop

Before deleting any file, overwriting existing code, dropping database records,
or removing dependencies — stop completely. List exactly what will be affected.
Ask for explicit confirmation. Only proceed after Evans says yes in the current message.

---

## Hard Stops — These Never Happen Without Explicit Permission

The following require explicit in-session confirmation, no exceptions:
- Deploying or pushing to any environment (staging, production, etc.)
- Running migrations or schema changes on any database
- Sending any email, message, or external API call to real recipients
- Executing any command with irreversible external side effects

"You mentioned this earlier" is not confirmation. Confirmation must be in the current message.

---

Maintain a file called MEMORY.md. After any significant decision, about direction, format, content, approach, or strategy, add an entry:

## [Date], [Decision]
**What was decided:** [the choice made]
**Why:** [the reasoning]
**What was rejected:** [alternatives considered and why they were ruled out]

Read MEMORY.md at the start of every session before doing anything. Never contradict a logged decision without flagging it first.

## After Every Task — Status Report

After completing any coding task, always end with:
- **Files changed:** [list every file touched]
- **What was modified:** [one line per file]
- **Files intentionally not touched:** [if relevant]
- **Follow-up needed:** [anything requiring a decision or attention]

Keep it short. This is a status update, not a recap.

---


## What this is

A tailored Business Management System for **Sofaamy Co. Ltd** (Accra, Ghana — glass & aluminium fabrication), built by **Veloxa Technology Ltd**. This is a **competitive bid**: Sofaamy is also evaluating **EvA Cloud** (evawinoptimize.com, an off-the-shelf Indian fenestration ERP) and leaning toward buying it. Everything we build must (a) match EvA on the capabilities Sofaamy values and (b) beat it on tailoring, Ghana-local fit, and ownership. The near-term goal is winning a joint demo meeting.

## The players (don't confuse them)

- **Sofaamy Co. Ltd** — the client. Fabricates windows, doors, frameless glass, curtain walls, canopies, balustrades, partitions.
- **Veloxa Technology Ltd** — us, the vendor building this.
- **EvA Cloud** — the competitor product we're displacing.

## Tech stack (fixed — from the Technical Architecture Blueprint)

- **Frontend:** React + Vite + Tailwind CSS, PWA (offline field capture), react-konva (configurator canvas), Zustand (UI state), React Query (server state).
- **Backend:** FastAPI (Python), JWT auth + role middleware, PDF/cost/BOM engines.
- **Data:** PostgreSQL via Supabase (Auth, Storage, Realtime, Row-Level Security).
- **Notifications:** Africa's Talking (WhatsApp + SMS) — WhatsApp is the primary client channel.
- **Hosting:** Vercel (frontend), Railway (API), Supabase Cloud (data).

Do not swap these without asking — they were proposed to the client.

## Repo layout

```
docs/                  scope (PROJECT_OUTLINE.md), CHECKLIST.md, reference/ (client docs)
sofaamy-bms/frontend   React PWA
sofaamy-bms/backend    FastAPI
sofaamy-bms/docs       ERD, API contracts, demo script
sofaamy-bms/infra      deploy config
prototypes/configurator  working react-konva configurator demo (seed for frontend)
prototypes/static-demo   early static HTML demo
archive/               superseded files (old PDFs, zips) — pending deletion decision
```
Engagement docs live under `docs/reference/` (proposal, pricing, architecture blueprint, information requirements). `README.md`, `CLAUDE.md`, `MEMORY.md` stay at root.

## Domain rules that matter

- **Currency is GHS** (Ghana Cedi) everywhere. No USD/INR in client-facing output.
- **Pricing engine:** cost = profile (length × price/m) + glass (area × price/m²) + hardware set + labour (area × price/m²) + margin %. Prices come from Sofaamy's material list — never hardcode guesses in client-facing paths; use clearly-marked placeholders until real prices arrive.
- **Dimensions in mm**; convert to metres for area/pricing.
- **7 roles:** field rep, supervisor, accounts, procurement, factory, QA, management. Enforce with JWT + Postgres RLS.
- **Payment terms:** 50% deposit before production, 50% on delivery — modeled as pipeline gates.
- **Factory stages** (confirm exact list with Sofaamy): Cutting → Processing → Holes/Routing → Assembly → Glazing → QA → Delivery.
- **Job numbers:** format `SOF-YYYY-NNN` (confirm).
- Client comms default to **WhatsApp**; every quote/spec/BOM is a generated document, Sofaamy-branded.

## Working conventions

- Match the surrounding code's style; keep the demo's pricing-engine structure when extending it.
- Anything shown to Sofaamy must be **Sofaamy-branded** (logo, name), not Veloxa-branded, except an unobtrusive "Powered by Veloxa" line.
- When product data, prices, or stages are unknown, use obvious placeholders and list them in `docs/` as blocking inputs — do not silently invent business numbers.
- Prefer real, working flows over stubs for anything that will be demoed.
- This is not a git repo yet; don't assume git. Ask before initializing.

## Current state

- `prototypes/configurator/` — working react-konva window configurator with a live GHS pricing engine (profiles, glass types, opening types, frame colours, dimension lines). This is the strongest demo asset and the seed for `frontend/`.
- `sofaamy-bms/` — new tailored monorepo, scaffolding in progress.
- Engagement docs under `docs/reference/`: proposal, pricing proposal, technical architecture blueprint, information requirements v2.

## Immediate priority

Phase 0 — turn the configurator into a demo that wins the joint meeting vs EvA: Sofaamy branding, multiple product templates, live GHS quote → PDF → WhatsApp send, and a pipeline-tracker walkthrough. See `PROJECT_OUTLINE.md` §9 and §11.
