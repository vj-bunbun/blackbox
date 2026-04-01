---
title: Configuration
---

# Configuration

## Default Vault (`~/.airc`)

Create a file at `~/.airc` to set your default vault path:

```
defaultVault=/path/to/your/vault
```

All scripts will use this vault unless you pass `--vault` explicitly.

## Script Flags

### `init.ts`

| Argument | Description |
|----------|-------------|
| `[path]` | Where to create the vault (default: `./vault`) |

| Flag | Description |
|------|-------------|
| `--no-default` | Don't set this vault as default in `~/.airc` |

### `context.ts`

| Flag | Description |
|------|-------------|
| `--vault <path>` | Target vault directory |
| `--domain <name>` | Filter files by domain |
| `--tags <list>` | Filter by comma-separated tags |
| `--budget <n>` | Token budget (default varies by provider) |
| `--provider <name>` | `default`, `anthropic`, `openai`, `google`, `local` |
| `--clipboard` | Copy output to clipboard |
| `--output <path>` | Write to a specific file |
| `--session` | Include the current open session |
| `--quiet` | Suppress progress output |

### `session.ts`

| Command | Description |
|---------|-------------|
| `start <title>` | Create a new session |
| `log <note>` | Append a timestamped entry |
| `close` | Close the current session |
| `status` | Show current session info |

| Flag | Description |
|------|-------------|
| `--vault <path>` | Target vault directory |

### `consolidate.ts`

| Flag | Description |
|------|-------------|
| `--vault <path>` | Target vault directory |
| `--since <date>` | Only process sessions after this date (YYYY-MM-DD) |
| `--execute` | Apply changes (default is dry-run) |

### `migrate.ts`

| Flag | Description |
|------|-------------|
| `--source <path>` | Source memory directory to migrate from |
| `--vault <path>` | Target vault directory |
| `--execute` | Apply changes (default is dry-run) |

## Vault Structure

```
your-vault/
├── INDEX.md              ← Master index (always include in AI context)
├── project-name/         ← Project-specific knowledge
│   ├── architecture.md
│   └── decisions.md
├── preferences/          ← Your rules (highest priority in context)
│   └── coding-style.md
├── reference/            ← General reference material
├── Sessions/             ← Session logs (date-prefixed)
└── Context/              ← Generated context output (gitignored)
```

## Obsidian Setup

Open your vault folder in Obsidian. Recommended settings:

- **Excluded files**: Add `scripts/` and `.git/` to Settings > Files & Links > Excluded files
- **Templates folder**: Set to `Templates/` in Settings > Core Plugins > Templates
- **New file location**: Set to vault root or a specific folder

## Common Workflows

All commands run from the `scripts/` folder.

**Daily usage:**
```bash
bun run session.ts start "what I'm working on today"
# ... work with any AI, log insights as you go ...
bun run session.ts log "key insight here"
bun run session.ts close
```

**Before an AI conversation:**
```bash
bun run context.ts --clipboard
# paste into any AI chat
```

**Weekly maintenance:**
```bash
bun run consolidate.ts              # see what sessions produced
bun run consolidate.ts --execute    # promote learnings to knowledge
```

## Tips

- Use `status: archived` instead of deleting old knowledge files
- Run `consolidate.ts` after closing a few sessions to keep knowledge fresh
- Keep INDEX.md entries short (under 150 chars each)
- Session files are append-only — never edit them after closing
