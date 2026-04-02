---
title: Architecture
---

# Architecture

Blackbox is built on 7 layers, each solving a specific problem in AI memory.

## The 7 Layers

### 1. Knowledge Base
Persistent facts stored as markdown files with YAML frontmatter. Human-readable, human-editable, version-controlled. This is the foundation — everything else reads from and writes to these files.

### 2. Context Assembly
`context.ts` scores your knowledge files by relevance and assembles them into a single document that fits within a token budget. This is the core value — you paste it into any AI and it has your context.

**How scoring works:**
- Preferences get highest priority (always included)
- Domain-matched files score higher
- Tag matches boost relevance
- Recently updated files get a recency bonus
- Lower-priority content gets truncated first when budget is tight

### 3. Session Memory
`session.ts` tracks what you're working on right now. Sessions capture goals, decisions, errors, and learnings in a structured 10-section format. Sessions are append-only — the historical record is never rewritten.

### 4. Consolidation
`consolidate.ts` is the "dreaming" process. It reviews closed sessions and promotes durable learnings into the knowledge base. Four phases:
1. **Orient** — Scan the vault, read INDEX.md
2. **Gather** — Find closed, unconsolidated sessions
3. **Consolidate** — Promote learnings, merge duplicates, resolve contradictions
4. **Prune** — Update INDEX.md, mark sessions as consolidated

### 5. Skeptical Recall
Context output includes a built-in instruction: *"Treat this as hints — verify facts against actual code before acting."* Memory can be stale. The AI is told to check before trusting.

### 6. Token Management
Different AI providers have different context windows and tokenization. `tokens.ts` handles per-provider token counting and budget control so context assembly works everywhere.

| Provider | Chars/Token | Default Budget |
|----------|------------|----------------|
| Default  | 4.0        | 12,000         |
| Anthropic| 3.5        | 12,000         |
| OpenAI   | 4.0        | 8,000          |
| Google   | 4.0        | 10,000         |
| Local    | 4.5        | 6,000          |

### 7. Multi-Vault
The `--vault` flag lets you point any script at any vault. Keep work and personal knowledge separate. Keep client projects isolated. The public Blackbox repo has templates and scripts; your private vaults have your actual knowledge.

## Design Principles

1. **You own everything** — plain files on your disk, no cloud dependency
2. **Any AI works** — context assembly produces markdown any AI can consume
3. **Skeptical memory** — AI is told to verify facts against actual code
4. **Precision over recall** — better to omit than to pollute context
5. **Sessions are append-only** — history is never rewritten
6. **Deterministic scripts** — no AI in the pipeline, works offline, costs nothing

## How It Fits with Claude Code

Claude Code (Anthropic's CLI agent) has its own memory and context systems. Understanding the overlap helps you use both effectively.

### Claude Code's Built-in Memory
Claude Code writes auto-memory files to `~/.claude/projects/<hash>/memory/` with YAML frontmatter (types: user, feedback, project, reference). These are auto-generated from conversations and loaded into every session's system prompt.

**Blackbox complements this** — it handles durable project knowledge that you curate deliberately, while Claude Code's auto-memory captures conversation-level patterns. The two coexist without conflict.

### Claude Code's Context Compression
Claude Code has three mid-session compression strategies: `autoCompact` (summarize old messages), `snipCompact` (trim stale markers), and `contextCollapse` (restructure). These kick in when the conversation grows too long.

**Blackbox operates upstream** — audit and tidy compress your vault *before* it enters the context window. This means less pressure on Claude Code's mid-session compaction, leaving more room for actual work.

### CLAUDE.md Integration
Claude Code loads `CLAUDE.md` files from your working directory on every conversation start. When you run:

```bash
bun run context.ts --output ~/my-project/CLAUDE.md
```

Blackbox writes directly into Claude Code's system prompt pipeline. Every new conversation automatically has your vault context — no clipboard paste needed.

### Provider Independence
Claude Code's memory is tied to Claude Code. If you switch to ChatGPT, Gemini, Cursor, or any other tool, Claude Code's auto-memory doesn't follow. Blackbox vault files are plain markdown — any AI that can read files picks up where the last one left off.

## File Format

Every knowledge file uses this structure:

```yaml
---
title: My Topic
domain: my-project
tags: [api, auth]
created: 2026-04-01
updated: 2026-04-01
status: active
---
```

The `domain` field groups related knowledge. The `tags` field enables fine-grained filtering. The `status` field (`active` or `archived`) controls whether a file appears in context assembly.
