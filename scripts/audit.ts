#!/usr/bin/env bun
/**
 * audit.ts — Vault health check.
 *
 * Scans your vault and reports issues: stale files, bloated content,
 * missing frontmatter, empty sections, and token budget analysis.
 * Deterministic — no AI calls.
 *
 * Usage:
 *   bun run audit.ts                          # audit default vault
 *   bun run audit.ts --vault ~/my-vault       # audit specific vault
 *   bun run audit.ts --stale 60               # flag files not updated in 60+ days
 *   bun run audit.ts --budget 8000            # show what fits in 8000 tokens
 */

import { Command } from 'commander';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { resolveVault, discoverKnowledgeFiles, vaultPaths } from './lib/vault.js';
import { parseFile } from './lib/frontmatter.js';
import { estimateTokens, getDefaultBudget, type Provider } from './lib/tokens.js';

// ── CLI ────────────────────────────────────────────────────────────

const program = new Command()
  .name('audit')
  .description('Scan your vault for stale, bloated, or incomplete files')
  .option('--vault <path>', 'Vault directory')
  .option('--stale <days>', 'Flag files not updated in N days (default: 90)', '90')
  .option('--provider <name>', 'Provider for token estimation')
  .option('--budget <tokens>', 'Show what fits in this token budget')
  .parse();

const opts = program.opts();
const vaultRoot = resolveVault(opts.vault);
const staleDays = parseInt(opts.stale) || 90;
const provider = (opts.provider || 'default') as Provider;
const budget = parseInt(opts.budget) || getDefaultBudget(provider);

if (!existsSync(vaultRoot)) {
  console.error(`Error: vault not found: ${vaultRoot}`);
  process.exit(1);
}

// ── Scan ──────────────────────────────────────────────────────────

const files = discoverKnowledgeFiles(vaultRoot);
const now = Date.now();

interface Issue {
  file: string;
  type: 'stale' | 'bloat' | 'missing-field' | 'empty-section' | 'placeholder' | 'no-content';
  detail: string;
}

const issues: Issue[] = [];
const fileStats: { path: string; tokens: number; days: number; priority: string; type: string; status: string }[] = [];
let totalTokens = 0;

for (const file of files) {
  try {
    const parsed = parseFile(file.path);
    const { data, content } = parsed;
    const tokens = estimateTokens(content, provider);
    totalTokens += tokens;

    // Days since update
    const updated = data.updated || data.created;
    const daysSince = updated
      ? Math.floor((now - new Date(updated).getTime()) / (1000 * 60 * 60 * 24))
      : -1;

    fileStats.push({
      path: file.relativePath,
      tokens,
      days: daysSince,
      priority: data.priority || 'medium',
      type: data.type || '—',
      status: data.status || '—',
    });

    // ── Check: Stale ──────────────────────────────────────────
    if (daysSince >= staleDays) {
      issues.push({
        file: file.relativePath,
        type: 'stale',
        detail: `not updated in ${daysSince} days`,
      });
    }

    // ── Check: Bloat ──────────────────────────────────────────
    if (tokens > 2000) {
      issues.push({
        file: file.relativePath,
        type: 'bloat',
        detail: `${tokens} tokens — consider splitting or compressing`,
      });
    }

    // ── Check: Missing frontmatter fields ─────────────────────
    if (!data.title) {
      issues.push({ file: file.relativePath, type: 'missing-field', detail: 'missing title' });
    }
    if (!data.domain) {
      issues.push({ file: file.relativePath, type: 'missing-field', detail: 'missing domain' });
    }
    if (!data.type) {
      issues.push({ file: file.relativePath, type: 'missing-field', detail: 'missing type' });
    }
    if (!data.updated && !data.created) {
      issues.push({ file: file.relativePath, type: 'missing-field', detail: 'missing created/updated date' });
    }

    // ── Check: No meaningful content ──────────────────────────
    if (content.length < 20) {
      issues.push({
        file: file.relativePath,
        type: 'no-content',
        detail: 'less than 20 characters of content',
      });
    }

    // ── Check: Template placeholders still present ────────────
    const lines = content.split('\n');
    const placeholders = lines.filter(l => l.trim().startsWith('_') && l.trim().endsWith('_'));
    if (placeholders.length > 0) {
      issues.push({
        file: file.relativePath,
        type: 'placeholder',
        detail: `${placeholders.length} template placeholder(s) still present`,
      });
    }

    // ── Check: Empty sections ─────────────────────────────────
    const emptySections: string[] = [];
    let currentHeader = '';
    let hasContent = false;
    for (const line of lines) {
      const headerMatch = line.match(/^##+ (.+)/);
      if (headerMatch) {
        if (currentHeader && !hasContent) {
          emptySections.push(currentHeader);
        }
        currentHeader = headerMatch[1].trim();
        hasContent = false;
      } else if (line.trim() && !line.trim().startsWith('_')) {
        hasContent = true;
      }
    }
    if (currentHeader && !hasContent) {
      emptySections.push(currentHeader);
    }
    if (emptySections.length > 0) {
      issues.push({
        file: file.relativePath,
        type: 'empty-section',
        detail: `empty sections: ${emptySections.join(', ')}`,
      });
    }
  } catch {
    issues.push({ file: file.relativePath, type: 'missing-field', detail: 'could not parse file' });
  }
}

// ── Sessions check ────────────────────────────────────────────────

const sessionsDir = join(vaultRoot, 'Sessions');
let openSessions = 0;
let unconsolidated = 0;
let totalSessions = 0;

if (existsSync(sessionsDir)) {
  const sessionFiles = readdirSync(sessionsDir).filter(f => f.endsWith('.md'));
  totalSessions = sessionFiles.length;

  for (const f of sessionFiles) {
    try {
      const raw = readFileSync(join(sessionsDir, f), 'utf-8');
      const { data } = matter(raw);
      if (data.status === 'open') openSessions++;
      if (data.status === 'closed' && !data.consolidated) unconsolidated++;
    } catch { /* skip */ }
  }
}

// ── Report ────────────────────────────────────────────────────────

console.log(`\nVault Audit: ${vaultRoot}`);
console.log(`${'─'.repeat(60)}`);

// Summary
console.log(`\n  Knowledge files:  ${files.length}`);
console.log(`  Total tokens:     ${totalTokens} (${provider})`);
console.log(`  Budget:           ${budget} tokens`);
console.log(`  Utilization:      ${Math.round((totalTokens / budget) * 100)}%`);
if (totalTokens > budget) {
  console.log(`  OVER BUDGET by:   ${totalTokens - budget} tokens`);
}
console.log(`  Sessions:         ${totalSessions} total, ${openSessions} open, ${unconsolidated} unconsolidated`);

// Token breakdown by file (sorted largest first)
console.log(`\n  Token Breakdown (largest first):`);
const sorted = fileStats.sort((a, b) => b.tokens - a.tokens);
let runningTotal = 0;
for (const f of sorted) {
  runningTotal += f.tokens;
  const fits = runningTotal <= budget ? ' ' : 'X';
  const staleFlag = f.days >= staleDays ? ' STALE' : '';
  console.log(
    `  ${fits} ${f.tokens.toString().padStart(5)} tok  ${f.days >= 0 ? f.days + 'd' : '—'.padStart(4)}  ${f.type.padEnd(13)} ${f.priority.padEnd(6)}  ${f.path}${staleFlag}`
  );
}

// Issues
if (issues.length > 0) {
  console.log(`\n  Issues Found: ${issues.length}`);
  console.log(`  ${'─'.repeat(56)}`);

  const grouped = new Map<string, Issue[]>();
  for (const issue of issues) {
    if (!grouped.has(issue.type)) grouped.set(issue.type, []);
    grouped.get(issue.type)!.push(issue);
  }

  const typeLabels: Record<string, string> = {
    stale: 'Stale (not updated recently)',
    bloat: 'Bloated (high token count)',
    'missing-field': 'Missing Frontmatter',
    'empty-section': 'Empty Sections',
    placeholder: 'Template Placeholders',
    'no-content': 'No Content',
  };

  for (const [type, typeIssues] of grouped) {
    console.log(`\n  ${typeLabels[type] || type}:`);
    for (const issue of typeIssues) {
      console.log(`    - ${issue.file} — ${issue.detail}`);
    }
  }
} else {
  console.log('\n  No issues found. Vault is clean.');
}

// Recommendations
console.log(`\n  Recommendations:`);
if (unconsolidated > 0) {
  console.log(`    - Run consolidate.ts — ${unconsolidated} sessions have unprocessed learnings`);
}
if (issues.some(i => i.type === 'stale')) {
  const staleCount = issues.filter(i => i.type === 'stale').length;
  console.log(`    - Review ${staleCount} stale files — archive or update them`);
}
if (issues.some(i => i.type === 'bloat')) {
  const bloatCount = issues.filter(i => i.type === 'bloat').length;
  console.log(`    - Run tidy.ts on ${bloatCount} bloated files to compress them`);
}
if (totalTokens > budget) {
  console.log(`    - Vault exceeds budget — set priority: low on less important files, or archive stale ones`);
}
if (issues.some(i => i.type === 'placeholder')) {
  console.log(`    - Fill or remove template placeholders — they waste tokens`);
}
if (issues.length === 0 && unconsolidated === 0) {
  console.log(`    - Vault is healthy. Nothing to do.`);
}

console.log('');
