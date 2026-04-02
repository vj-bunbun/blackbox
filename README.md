# Blackbox

**The problem is in the name.**

AI providers are getting better at memory. Some let you view it, edit it, even export it if you dig. But your context still lives inside their black box — and the moment you switch providers, you're starting from zero.

This Blackbox flips that. Your AI memory lives as plain markdown files on your machine. Human-readable, human-editable, version-controlled. Any AI that can read files picks up where the last one left off.

No accounts. No telemetry. No lock-in. Just files you own.

## How It Works

You don't start by writing knowledge files. You start by working.

```
 Day 1:  Start sessions, log what matters as you work
 Day 7:  Consolidation promotes learnings to knowledge
 Day 8:  Context assembly picks what's relevant
         Paste into ANY AI → it knows your stuff
```

Your vault builds itself from your sessions. The more you use it, the smarter the context gets — problems you keep hitting float to the top.

## Quick Start

```bash
# Clone and install
git clone https://github.com/vj-bunbun/blackbox.git
cd blackbox/scripts && bun install

# Initialize your vault (creates structure + sets it as default in ~/.airc)
# All scripts will read from this vault unless you pass --vault explicitly
bun run init.ts ~/Documents/my-vault

# Edit the starter file — tell AI who you are
# (open ~/Documents/my-vault/preferences/about-me.md)

# Start working
bun run session.ts start "what I'm working on"

# Log insights as you go
bun run session.ts log "learned how the caching layer works"
bun run session.ts log "found a bug in the retry logic"

# Done for the day
bun run session.ts close

# After a few sessions, promote learnings to knowledge
bun run consolidate.ts --execute

# Before any AI conversation, grab your context
bun run context.ts --clipboard
# Paste into any AI — it knows where you left off
```

## What's In the Box

### `context.ts` — The core value
Reads your default vault (set by `init.ts` in `~/.airc`), scores relevance, assembles context within a token budget. Use `--vault` to target a different vault.

```bash
bun run context.ts                          # reads from default vault
bun run context.ts --vault ~/other-vault    # reads from a specific vault
bun run context.ts --domain myproject       # filter by project
bun run context.ts --tags api,auth          # filter by topic
bun run context.ts --budget 4000            # tight context window
bun run context.ts --provider openai        # provider-specific tokens
```

### `session.ts` — Track your work
Structured session notes with goals, decisions, errors, and learnings.

```bash
bun run session.ts start "refactoring the data layer"
bun run session.ts log "found a cleaner pattern for caching"
bun run session.ts close
```

### `consolidate.ts` — Learn while you sleep
Reviews closed sessions and promotes durable knowledge into your vault. The "dreaming" process.

```bash
bun run consolidate.ts              # preview what would change
bun run consolidate.ts --execute    # apply it
```

### `migrate.ts` — Bring your existing memory
Import from other AI memory systems into your vault. Edit the `MIGRATION_MAP` in `migrate.ts` to define where each source file lands.

```bash
bun run migrate.ts --source ~/.ai-tool/memory              # preview (dry-run)
bun run migrate.ts --source ~/.ai-tool/memory --execute     # apply
```

### `audit.ts` — Vault health check
Scans for stale files, bloated content, missing frontmatter, empty sections, and token budget overruns.

```bash
bun run audit.ts                          # audit default vault
bun run audit.ts --stale 60               # flag files not updated in 60+ days
bun run audit.ts --budget 8000            # show what fits in 8000 tokens
```

### `tidy.ts` — Clean up noise
Strips template placeholders, removes empty sections, collapses excess whitespace. Optionally archives stale files.

```bash
bun run tidy.ts                           # preview what would change
bun run tidy.ts --execute                 # apply cleanup
bun run tidy.ts --archive-stale 90        # also archive files >90 days old
```

## Vault Structure

Your knowledge lives as plain markdown with YAML frontmatter:

```
my-vault/
├── INDEX.md                ← Master index
├── project-name/           ← Project knowledge
│   ├── architecture.md
│   └── decisions.md
├── preferences/            ← Your rules (always included first)
├── reference/              ← General reference material
├── Sessions/               ← Work session logs
└── Context/                ← Generated output (gitignored)
```

Every file looks like this:

```markdown
---
title: Project Architecture
domain: my-project
type: architecture
priority: high
tags: [architecture, system-design]
created: 2026-04-01
updated: 2026-04-01
status: active
---

The app uses a three-layer architecture with caching at the edge...
```

**Type** controls how foundational a file is — `architecture` and `decision` files always outrank `log` and `reference` files. **Priority** gives you explicit control — `high` files surface first, `low` files only fill remaining budget.

## Why Not Just Use [Provider]'s Memory?

| | Blackbox | Provider Memory |
|---|---|---|
| Switch AI providers | Keep everything | Start over |
| Offline access | Always works | Depends on service |
| Edit your memory | Open any text editor | Web UI (varies) |
| Version control | Git, just works | Not available |
| See what AI "knows" | Read the files | Black box (ironic) |
| Data ownership | 100% yours | Read the ToS |
| Cost | Free forever | Bundled into subscription |

### Works with Claude Code's Memory

Claude Code has built-in auto-memory (`~/.claude/projects/*/memory/`). The two systems complement each other:

- **Claude Code auto-memory** captures conversation patterns automatically — what you corrected, what worked, user preferences
- **Blackbox** holds curated project knowledge — architecture, decisions, aesthetic guides, debugging lessons

Claude Code's memory is tied to Claude Code. Blackbox vault files work with any AI. Use both: Claude Code for session-level learning, Blackbox for durable knowledge that survives provider switches.

Write directly to Claude Code's system prompt:

```bash
bun run context.ts --output ~/my-project/CLAUDE.md
# Every new Claude Code conversation now has your vault context
```

## Integrations

### How the scripts find your vault

1. `--vault ~/path` flag (explicit, highest priority)
2. `~/.airc` default (set automatically by `init.ts`)
3. Current directory (fallback)

You set up your vault once with `init.ts`. After that, all scripts just work — no paths needed.

### Multiple projects

Keep a separate vault per project. Pass `--vault` to target each one:

```bash
bun run context.ts --vault ~/vaults/project-a --clipboard
bun run context.ts --vault ~/vaults/project-b --output ~/project-b/CLAUDE.md
```

### Auto-load context into AI tools

Instead of copying to clipboard every time, write context directly to a file your AI tool reads:

```bash
# Claude Code — writes to CLAUDE.md in your project root
bun run context.ts --output ~/my-project/CLAUDE.md

# Any tool that reads a context file — same idea
bun run context.ts --output ~/my-project/.ai-context.md
```

Every new conversation automatically has your vault context. Re-run whenever your knowledge updates.

### Clipboard (manual paste)

```bash
bun run context.ts --clipboard
# Paste into any AI chat
```

## Design Principles

1. **You own everything** — plain files on your disk, no cloud, no database
2. **Any AI works** — output is markdown that any model can consume
3. **Skeptical memory** — context tells the AI to verify before trusting
4. **Precision over recall** — better to omit than to pollute context
5. **Deterministic** — no AI in the pipeline, works offline, costs nothing
6. **Obsidian-compatible** — wikilinks, tags, frontmatter, graph view all work

## License

MIT
