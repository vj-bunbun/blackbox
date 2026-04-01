---
title: Getting Started
---

# Getting Started with Blackbox

Blackbox is a provider-agnostic AI memory system. Your knowledge lives as plain markdown files — any AI that can read files picks up where the last one left off.

## Prerequisites

- [Bun](https://bun.sh) runtime installed
- [Obsidian](https://obsidian.md) (optional, for browsing your vault)

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/vj-bunbun/blackbox.git ~/Documents/blackbox
cd ~/Documents/blackbox/scripts && bun install
```

### 2. Initialize your vault

```bash
bun run init.ts ~/Documents/my-vault
```

This creates the vault structure, a starter preferences file, and sets it as your default in `~/.airc`. Edit `~/Documents/my-vault/preferences/about-me.md` to tell any AI who you are and how you work.

### 3. Start your first session

```bash
bun run session.ts start "getting set up"
```

This creates a timestamped session file in `my-vault/Sessions/`.

### 5. Log what you learn

```bash
bun run session.ts log "learned how sessions work"
```

### 6. Close the session

```bash
bun run session.ts close
```

### 7. Assemble context for any AI

```bash
bun run context.ts --vault ~/Documents/my-vault --clipboard
```

Paste into any AI conversation. It now has your full context.

## What's Next

- [[architecture]] — How the 7 layers work together
- [[configuration]] — All the options and flags
- [[Knowledge]] — Template for creating knowledge files
- [[Project]] — How to bootstrap a new project vault
