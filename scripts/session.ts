#!/usr/bin/env bun
/**
 * session.ts — Session lifecycle management.
 *
 * Usage:
 *   bun run session.ts start "fixing auth bug" --vault ~/Documents/my-vault
 *   bun run session.ts log "found the root cause in middleware"
 *   bun run session.ts close
 *   bun run session.ts status
 */

import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import matter from 'gray-matter';
import { resolveVault, vaultPaths, ensureDir, findOpenSession } from './lib/vault.js';
import { serializeFile, today, nowISO, type KnowledgeFrontmatter } from './lib/frontmatter.js';

// ── Session template ───────────────────────────────────────────────

function sessionTemplate(title: string): { data: KnowledgeFrontmatter; content: string } {
  return {
    data: {
      title,
      date: today(),
      started: nowISO(),
      ended: '',
      tags: [],
      status: 'open',
      consolidated: false,
    },
    content: `# ${title}

## Current State
_Starting session_

## Task Specification
_What needs to be done?_

## Files and Functions
_Important files and their relevance_

## Workflow
_Commands and their interpretation_

## Errors & Corrections
_Errors encountered and how they were fixed_

## Codebase and System Documentation
_Important system components_

## Learnings
_What has worked well? What has not?_

## Key Results
_Specific outputs or results_

## Worklog
- ${nowISO().slice(11, 16)} — Session started`,
  };
}

// ── Slugify title for filename ─────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
}

// ── Commands ───────────────────────────────────────────────────────

const program = new Command()
  .name('session')
  .description('Manage work sessions')
  .option('--vault <path>', 'Vault directory');

program
  .command('start <title>')
  .description('Start a new session')
  .action((title: string) => {
    const vaultRoot = resolveVault(program.opts().vault);
    const sessionsDir = join(vaultRoot, 'Sessions');
    ensureDir(sessionsDir);

    // Check for already open session
    const existing = findOpenSession(vaultRoot);
    if (existing) {
      console.error(`Error: session already open: ${basename(existing)}`);
      console.error('Close it first with: bun run session.ts close');
      process.exit(1);
    }

    const slug = slugify(title);
    const filename = `${today()}-${slug}.md`;
    const filePath = join(sessionsDir, filename);

    if (existsSync(filePath)) {
      console.error(`Error: session file already exists: ${filename}`);
      process.exit(1);
    }

    const { data, content } = sessionTemplate(title);
    writeFileSync(filePath, serializeFile(data, content), 'utf-8');

    console.log(`Session started: ${filename}`);
    console.log(`  Path: ${filePath}`);
  });

program
  .command('log <note>')
  .description('Append a note to the current open session')
  .action((note: string) => {
    const vaultRoot = resolveVault(program.opts().vault);
    const sessionPath = findOpenSession(vaultRoot);

    if (!sessionPath) {
      console.error('Error: no open session. Start one with: bun run session.ts start "title"');
      process.exit(1);
    }

    const raw = readFileSync(sessionPath, 'utf-8');
    const timestamp = nowISO().slice(11, 16);
    const entry = `\n- ${timestamp} — ${note}`;

    // Append to Worklog section
    const updated = raw.trimEnd() + entry + '\n';
    writeFileSync(sessionPath, updated, 'utf-8');

    console.log(`Logged to ${basename(sessionPath)}: ${note}`);
  });

program
  .command('close')
  .description('Close the current open session')
  .action(() => {
    const vaultRoot = resolveVault(program.opts().vault);
    const sessionPath = findOpenSession(vaultRoot);

    if (!sessionPath) {
      console.error('Error: no open session to close.');
      process.exit(1);
    }

    const raw = readFileSync(sessionPath, 'utf-8');
    const { data, content } = matter(raw);

    data.ended = nowISO();
    data.status = 'closed';

    // Calculate duration
    if (data.started) {
      const start = new Date(data.started);
      const end = new Date(data.ended);
      const mins = Math.round((end.getTime() - start.getTime()) / 60000);
      const hours = Math.floor(mins / 60);
      const remainMins = mins % 60;
      const duration = hours > 0 ? `${hours}h ${remainMins}m` : `${mins}m`;

      // Append closing entry to worklog
      const timestamp = nowISO().slice(11, 16);
      const closingNote = `\n- ${timestamp} — Session closed (${duration})`;
      const output = matter.stringify('\n' + content.trimEnd() + closingNote + '\n', data);
      writeFileSync(sessionPath, output, 'utf-8');
      console.log(`Session closed: ${basename(sessionPath)} (${duration})`);
    } else {
      const output = matter.stringify('\n' + content + '\n', data);
      writeFileSync(sessionPath, output, 'utf-8');
      console.log(`Session closed: ${basename(sessionPath)}`);
    }
  });

program
  .command('status')
  .description('Show current session status')
  .action(() => {
    const vaultRoot = resolveVault(program.opts().vault);
    const sessionPath = findOpenSession(vaultRoot);

    if (!sessionPath) {
      console.log('No open session.');
    } else {
      const { data } = matter(readFileSync(sessionPath, 'utf-8'));
      console.log(`Open session: ${basename(sessionPath)}`);
      console.log(`  Title: ${data.title}`);
      console.log(`  Started: ${data.started}`);
    }
  });

program.parse();
