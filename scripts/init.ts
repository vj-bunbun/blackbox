#!/usr/bin/env bun
/**
 * init.ts — Initialize a new Blackbox vault.
 *
 * Creates the vault structure, writes ~/.airc, and gets you
 * ready to start your first session in one command.
 *
 * Usage:
 *   bun run init.ts ~/Documents/my-vault
 *   bun run init.ts                          # defaults to ./vault
 */

import { Command } from 'commander';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { resolve, join, basename } from 'path';
import { homedir } from 'os';
import { ensureDir, loadAirc } from './lib/vault.js';
import { today } from './lib/frontmatter.js';

const AIRC_PATH = join(homedir(), '.airc');

const program = new Command()
  .name('init')
  .description('Initialize a new Blackbox vault')
  .argument('[path]', 'Where to create the vault', './vault')
  .option('--no-default', 'Do not set this vault as the default in ~/.airc')
  .parse();

const vaultPath = resolve(program.args[0] || './vault');
const setDefault = program.opts().default !== false;

// ── Check if already exists ───────────────────────────────────────

if (existsSync(join(vaultPath, 'INDEX.md'))) {
  console.log(`Vault already exists at: ${vaultPath}`);
  console.log('  Run `bun run session.ts start "topic"` to start working.');
  process.exit(0);
}

console.log(`\nCreating vault: ${vaultPath}\n`);

// ── Create structure ──────────────────────────────────────────────

ensureDir(vaultPath);
ensureDir(join(vaultPath, 'Sessions'));
ensureDir(join(vaultPath, 'preferences'));
ensureDir(join(vaultPath, 'reference'));
ensureDir(join(vaultPath, 'Context'));

// ── INDEX.md ──────────────────────────────────────────────────────

writeFileSync(join(vaultPath, 'INDEX.md'), `# Knowledge Index

_Your vault builds itself from sessions. Start working, log what matters, and consolidation promotes learnings here over time._

## Preferences
_(Rules and preferences for AI assistants — always included in context)_

## Knowledge
_(Promoted from sessions by consolidation)_

## Recent Sessions
_(Updated automatically by consolidation)_
`, 'utf-8');

// ── Starter preference file ──────────────────────────────────────

writeFileSync(join(vaultPath, 'preferences/about-me.md'), `---
title: About Me
domain: preferences
tags: [identity, context]
created: ${today()}
updated: ${today()}
status: active
---

# About Me

_Edit this file to give any AI instant context about who you are and how you work._

## Role
_(What do you do? e.g., "Full-stack developer", "Data scientist", "Product designer")_

## Stack
_(What technologies do you use daily?)_

## Preferences
_(How do you like AI to work with you? e.g., "Be concise", "Show code not explanations", "Ask before making changes")_
`, 'utf-8');

// ── .gitignore for the vault ─────────────────────────────────────

if (!existsSync(join(vaultPath, '.gitignore'))) {
  writeFileSync(join(vaultPath, '.gitignore'), `.obsidian/
.trash/
Context/
.DS_Store
Thumbs.db
`, 'utf-8');
}

// ── Set as default vault ─────────────────────────────────────────

if (setDefault) {
  const existing = loadAirc();
  if (existing.defaultVault && existing.defaultVault !== vaultPath) {
    console.log(`  Note: replacing previous default vault`);
    console.log(`    was: ${existing.defaultVault}`);
  }

  // Read existing file to preserve other settings
  let aircContent = '';
  if (existsSync(AIRC_PATH)) {
    aircContent = readFileSync(AIRC_PATH, 'utf-8');
    // Replace or remove existing defaultVault line
    aircContent = aircContent
      .split('\n')
      .filter(line => !line.trim().startsWith('defaultVault='))
      .join('\n')
      .trim();
  }

  aircContent = aircContent
    ? aircContent + '\n' + `defaultVault=${vaultPath}\n`
    : `# Blackbox defaults\ndefaultVault=${vaultPath}\n`;

  writeFileSync(AIRC_PATH, aircContent, 'utf-8');
  console.log(`  Default vault set in ~/.airc`);
}

// ── Done ──────────────────────────────────────────────────────────

console.log(`
  Created:
    ${vaultPath}/
    ├── INDEX.md
    ├── preferences/about-me.md
    ├── Sessions/
    ├── reference/
    ├── Context/
    └── .gitignore

  Next steps:

    1. Edit preferences/about-me.md — tell AI who you are
    2. Start your first session:
       bun run session.ts start "what I'm working on"
    3. Log insights as you work:
       bun run session.ts log "key thing I learned"
    4. Close when done:
       bun run session.ts close
    5. Assemble context for any AI:
       bun run context.ts --clipboard
`);
