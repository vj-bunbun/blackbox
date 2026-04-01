#!/usr/bin/env bun
/**
 * tidy.ts — Vault cleanup.
 *
 * Deterministic cleanup operations on knowledge files:
 *   - Strip template placeholders (_italic placeholder_ lines)
 *   - Remove empty sections (## headers with no content below)
 *   - Trim excessive whitespace (3+ blank lines → 2)
 *   - Archive stale files (move to status: archived)
 *   - Remove duplicate blank lines within sections
 *
 * Does NOT rewrite or summarize content — that's the user's job
 * or a future --smart flag. Tidy only removes noise.
 *
 * Usage:
 *   bun run tidy.ts                              # dry-run on default vault
 *   bun run tidy.ts --vault ~/my-vault           # dry-run on specific vault
 *   bun run tidy.ts --execute                    # apply changes
 *   bun run tidy.ts --archive-stale 90           # also archive files >90 days old
 *   bun run tidy.ts --file path/to/file.md       # tidy a single file
 */

import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import matter from 'gray-matter';
import { resolveVault, discoverKnowledgeFiles } from './lib/vault.js';
import { parseFile, serializeFile, today, type KnowledgeFrontmatter } from './lib/frontmatter.js';
import { estimateTokens, type Provider } from './lib/tokens.js';

// ── CLI ────────────────────────────────────────────────────────────

const program = new Command()
  .name('tidy')
  .description('Clean up vault files — strip placeholders, empty sections, excess whitespace')
  .option('--vault <path>', 'Vault directory')
  .option('--file <path>', 'Tidy a single file (relative to vault)')
  .option('--archive-stale <days>', 'Archive files not updated in N days')
  .option('--provider <name>', 'Provider for token estimation')
  .option('--execute', 'Apply changes (default is dry-run)')
  .parse();

const opts = program.opts();
const vaultRoot = resolveVault(opts.vault);
const dryRun = !opts.execute;
const provider = (opts.provider || 'default') as Provider;
const archiveDays = opts.archiveStale ? parseInt(opts.archiveStale) : null;

if (!existsSync(vaultRoot)) {
  console.error(`Error: vault not found: ${vaultRoot}`);
  process.exit(1);
}

console.log(`\n${dryRun ? 'DRY RUN' : 'EXECUTING'} — Vault Tidy`);
console.log(`  Vault: ${vaultRoot}\n`);

// ── Discover files ────────────────────────────────────────────────

let filesToProcess: { path: string; relativePath: string }[];

if (opts.file) {
  const fullPath = resolve(vaultRoot, opts.file);
  if (!existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
  }
  filesToProcess = [{ path: fullPath, relativePath: opts.file }];
} else {
  filesToProcess = discoverKnowledgeFiles(vaultRoot);
}

// ── Tidy each file ────────────────────────────────────────────────

interface TidyResult {
  file: string;
  changes: string[];
  tokensBefore: number;
  tokensAfter: number;
  archived: boolean;
}

const results: TidyResult[] = [];

for (const file of filesToProcess) {
  try {
    const parsed = parseFile(file.path);
    const { data, content } = parsed;
    const tokensBefore = estimateTokens(content, provider);
    const changes: string[] = [];
    let tidied = content;
    let archived = false;

    // ── 1. Strip template placeholders ────────────────────────
    const lines = tidied.split('\n');
    const stripped = lines.filter(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('_') && trimmed.endsWith('_') && trimmed.length > 2) {
        // Check it's an italic placeholder like "_Starting session_"
        const inner = trimmed.slice(1, -1);
        if (inner.length > 0 && !inner.includes('_')) {
          changes.push(`stripped placeholder: ${trimmed}`);
          return false;
        }
      }
      return true;
    });
    tidied = stripped.join('\n');

    // ── 2. Remove empty sections ──────────────────────────────
    const sectionLines = tidied.split('\n');
    const cleaned: string[] = [];
    let i = 0;

    while (i < sectionLines.length) {
      const line = sectionLines[i];
      const headerMatch = line.match(/^(#{2,})\s+(.+)/);

      if (headerMatch) {
        // Look ahead: is there any content before the next header?
        let j = i + 1;
        let hasContent = false;
        const sectionBuffer = [line];

        while (j < sectionLines.length) {
          const nextLine = sectionLines[j];
          if (nextLine.match(/^#{2,}\s+/)) break; // next header
          sectionBuffer.push(nextLine);
          if (nextLine.trim()) hasContent = true;
          j++;
        }

        if (hasContent) {
          cleaned.push(...sectionBuffer);
        } else {
          changes.push(`removed empty section: ${headerMatch[2]}`);
        }
        i = j;
      } else {
        cleaned.push(line);
        i++;
      }
    }
    tidied = cleaned.join('\n');

    // ── 3. Collapse excessive blank lines (3+ → 2) ───────────
    const before = tidied;
    tidied = tidied.replace(/\n{4,}/g, '\n\n\n');
    if (tidied !== before) {
      changes.push('collapsed excessive blank lines');
    }

    // ── 4. Trim trailing whitespace on each line ──────────────
    const trimmedLines = tidied.split('\n').map(l => l.trimEnd());
    const afterTrim = trimmedLines.join('\n');
    if (afterTrim !== tidied) {
      changes.push('trimmed trailing whitespace');
    }
    tidied = afterTrim;

    // ── 5. Trim leading/trailing blank lines ──────────────────
    tidied = tidied.trim();

    // ── 6. Archive stale files ────────────────────────────────
    if (archiveDays && data.status === 'active') {
      const updated = data.updated || data.created;
      if (updated) {
        const daysSince = Math.floor((Date.now() - new Date(updated).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince >= archiveDays) {
          data.status = 'archived';
          archived = true;
          changes.push(`archived (${daysSince} days since last update)`);
        }
      }
    }

    // ── Report ────────────────────────────────────────────────
    if (changes.length > 0) {
      const tokensAfter = estimateTokens(tidied, provider);
      const saved = tokensBefore - tokensAfter;

      results.push({
        file: file.relativePath,
        changes,
        tokensBefore,
        tokensAfter,
        archived,
      });

      // Apply changes
      if (!dryRun) {
        writeFileSync(file.path, serializeFile(data, tidied), 'utf-8');
      }
    }
  } catch {
    console.warn(`  Warning: could not process ${file.relativePath}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────

if (results.length === 0) {
  console.log('  Nothing to tidy. Vault is clean.\n');
  process.exit(0);
}

let totalSaved = 0;

console.log(`  Files tidied: ${results.length}\n`);

for (const r of results) {
  const saved = r.tokensBefore - r.tokensAfter;
  totalSaved += saved;
  const savedStr = saved > 0 ? ` (saved ${saved} tokens)` : '';
  console.log(`  ${r.file}${savedStr}`);
  for (const change of r.changes) {
    console.log(`    - ${change}`);
  }
}

console.log(`\n  Total tokens saved: ${totalSaved}`);

if (dryRun) {
  console.log('  Run with --execute to apply changes.\n');
} else {
  console.log(`  Applied to ${results.length} files.\n`);
}
