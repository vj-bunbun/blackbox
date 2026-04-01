---
title: Project Vault Bootstrap
---

# Setting Up a New Project Vault

Create a new Obsidian vault (or folder) for your project knowledge:

```
my-project-vault/
├── INDEX.md              ← Master pointer index
├── architecture.md       ← System architecture notes
├── preferences/          ← Your rules and preferences for AI assistants
│   └── coding-style.md
├── reference/            ← External references and research
├── Sessions/             ← Session logs (created by session.ts)
└── .obsidian/            ← Obsidian config (auto-created)
```

## Quick Start

1. Copy this template to your new vault
2. Configure your default vault in `~/.airc`:
   ```
   defaultVault=/path/to/your/vault
   ```
3. Create your first knowledge file:
   ```bash
   # Use the Knowledge template as a starting point
   cp Templates/Knowledge.md my-topic.md
   ```
4. Start a session:
   ```bash
   cd scripts && bun run session.ts start "my first task"
   ```
5. Assemble context for any AI:
   ```bash
   bun run context.ts --clipboard
   ```

## File Format

Every knowledge file uses YAML frontmatter:

```markdown
---
title: My Topic
domain: my-project
tags: [relevant, tags]
created: 2026-04-01
updated: 2026-04-01
status: active
---

Content here...
```

## Tips

- Keep INDEX.md entries under 150 characters each
- Use `status: archived` instead of deleting old knowledge
- Session files are append-only — never edit after closing
- Run consolidation periodically to promote session learnings to knowledge
