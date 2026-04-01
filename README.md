# Blackbox

**The problem is in the name.**

AI providers are getting better at memory. Some let you view it, edit it, even export it if you dig. But your context still lives inside their black box — and the moment you switch providers, you're starting from zero.

Blackbox flips that. Your AI memory lives as plain markdown files on your machine. Human-readable, human-editable, version-controlled. Any AI that can read files picks up where the last one left off.

No accounts. No telemetry. No lock-in. Just files you own.

## How It Works

```bash
# Assemble your knowledge into a context document
bun run context.ts --clipboard

# Paste into any AI conversation — it now knows everything you've taught it
```

That's it. Blackbox reads your vault, scores files by relevance, fits them within a token budget, and copies the result to your clipboard. Paste it into any AI and pick up where you left off.

### The Full Lifecycle

```
 You work with AI ──→ Session captures what happened
                              │
                    Consolidation promotes learnings
                              │
                    Knowledge base grows over time
                              │
                    Context assembly picks what's relevant
                              │
                    Paste into ANY AI ──→ It knows your stuff
```

## Quick Start

```bash
# Clone and install
git clone https://github.com/vj-bunbun/blackbox.git
cd blackbox/scripts && bun install

# Set your vault location
echo "defaultVault=~/Documents/my-vault" > ~/.airc
mkdir ~/Documents/my-vault

# Start a work session
bun run session.ts start "my first project"

# Log what you learn
bun run session.ts log "learned how the caching layer works"

# Close the session
bun run session.ts close

# Assemble context for any AI
bun run context.ts --clipboard
```

## What's In the Box

### `context.ts` — The core value
Reads your vault, scores relevance, assembles context within a token budget. Supports per-provider token counting (Anthropic, OpenAI, Google, local models).

```bash
bun run context.ts                          # everything relevant
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
tags: [architecture, decisions]
created: 2026-04-01
updated: 2026-04-01
status: active
---

The app uses a three-layer architecture with caching at the edge...
```

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

## Design Principles

1. **You own everything** — plain files on your disk, no cloud, no database
2. **Any AI works** — output is markdown that any model can consume
3. **Skeptical memory** — context tells the AI to verify before trusting
4. **Precision over recall** — better to omit than to pollute context
5. **Deterministic** — no AI in the pipeline, works offline, costs nothing
6. **Obsidian-compatible** — wikilinks, tags, frontmatter, graph view all work

## License

MIT
