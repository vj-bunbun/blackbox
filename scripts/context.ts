#!/usr/bin/env bun
/**
 * context.ts — Assemble relevant context from any vault for any AI.
 *
 * The core value of Blackbox. Reads your vault, scores relevance,
 * assembles a context document within a token budget.
 *
 * Usage:
 *   bun run context.ts --vault ~/Documents/my-vault --clipboard
 *   bun run context.ts --domain myproject --tags api,auth --budget 8000
 *   bun run context.ts --vault ~/Documents/my-vault --output context.md
 */

import { Command } from 'commander';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { resolveVault, discoverKnowledgeFiles, vaultPaths, findOpenSession } from './lib/vault.js';
import { parseFile, type KnowledgeFrontmatter } from './lib/frontmatter.js';
import { scoreFile, rankFiles, buildFrequencyMap, getLastSession, taskBoost, type ScoredFile } from './lib/relevance.js';
import { estimateTokens, getDefaultBudget, truncateToFit, type Provider } from './lib/tokens.js';

// ── CLI ────────────────────────────────────────────────────────────

const program = new Command()
  .name('context')
  .description('Assemble relevant context from your vault for any AI')
  .option('--vault <path>', 'Vault directory')
  .option('--domain <domain>', 'Filter by domain (e.g., myproject, reference)')
  .option('--tags <tags>', 'Filter by tags (comma-separated)')
  .option('--budget <tokens>', 'Token budget (default: provider-dependent)')
  .option('--provider <name>', 'Provider: default, anthropic, openai, google, local')
  .option('--task <description>', 'What you are about to work on (boosts relevant files)')
  .option('--top <n>', 'Only include the top N files (default: all that fit budget)')
  .option('--clipboard', 'Copy to clipboard instead of writing file')
  .option('--output <path>', 'Output file path')
  .option('--session', 'Include current open session notes')
  .option('--quiet', 'Suppress progress output')
  .parse();

const opts = program.opts();
const vaultRoot = resolveVault(opts.vault);
const provider = (opts.provider || 'default') as Provider;
const budget = parseInt(opts.budget) || getDefaultBudget(provider);
const domain = opts.domain;
const tags = opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : undefined;
const task = opts.task;
const topN = opts.top ? parseInt(opts.top, 10) : undefined;
const quiet = opts.quiet;

if (!existsSync(vaultRoot)) {
  console.error(`Error: vault not found: ${vaultRoot}`);
  process.exit(1);
}

if (!quiet) {
  console.log(`\nAssembling context from: ${vaultRoot}`);
  console.log(`  Provider: ${provider} | Budget: ${budget} tokens`);
  if (domain) console.log(`  Domain filter: ${domain}`);
  if (tags) console.log(`  Tag filter: ${tags.join(', ')}`);
  if (task) console.log(`  Task: ${task}`);
  if (topN) console.log(`  Top: ${topN} files`);
}

// ── Discover and score files ───────────────────────────────────────

// Build frequency map from sessions — topics mentioned across sessions score higher
const frequencyMap = buildFrequencyMap(vaultRoot);

const files = discoverKnowledgeFiles(vaultRoot);
const scored: ScoredFile[] = [];

for (const file of files) {
  try {
    const parsed = parseFile(file.path);
    let score = scoreFile(parsed.data, parsed.content, { domain, tags, frequencyMap });
    if (task) score += taskBoost(parsed.data, parsed.content, task);
    scored.push({
      ...file,
      data: parsed.data,
      content: parsed.content,
      score,
    });
  } catch {
    // Skip files that can't be parsed
  }
}

let ranked = rankFiles(scored);

// Apply --top cap: only keep the top N files
if (topN && topN > 0) {
  ranked = ranked.slice(0, topN);
}

if (!quiet) {
  console.log(`  Found ${files.length} files, ${ranked.length} scored relevant\n`);
}

// ── Assemble context within budget ─────────────────────────────────

const sections: string[] = [];
let usedTokens = 0;

// Header
const header = `# Context — ${new Date().toISOString().slice(0, 10)}\n\n> This is assembled knowledge from your memory vault. Treat as hints — verify facts against actual code before acting.\n`;
sections.push(header);
usedTokens += estimateTokens(header, provider);

// Group by type for structured output
const preferences = ranked.filter(f => f.data.domain === 'preferences');
const projectFiles = ranked.filter(f => f.data.domain !== 'preferences' && f.data.domain !== 'reference' && f.data.domain !== 'business');
const referenceFiles = ranked.filter(f => f.data.domain === 'reference');
const businessFiles = ranked.filter(f => f.data.domain === 'business');

function addSection(title: string, files: ScoredFile[]): void {
  if (files.length === 0) return;

  const sectionHeader = `\n## ${title}\n`;
  const headerTokens = estimateTokens(sectionHeader, provider);

  if (usedTokens + headerTokens > budget) return;
  sections.push(sectionHeader);
  usedTokens += headerTokens;

  for (const file of files) {
    const fileBlock = `### ${file.data.title || file.name}\n${file.content}\n`;
    const blockTokens = estimateTokens(fileBlock, provider);

    if (usedTokens + blockTokens > budget) {
      // Try truncated version
      const remaining = budget - usedTokens;
      if (remaining > 200) {
        sections.push(truncateToFit(fileBlock, remaining, provider));
        usedTokens = budget;
      }
      return; // Budget exhausted
    }

    sections.push(fileBlock);
    usedTokens += blockTokens;
  }
}

// Last session first — "where I left off"
const lastSession = getLastSession(vaultRoot);
if (lastSession) {
  const sessionHeader = `\n## Where You Left Off\n`;
  const sessionTokens = estimateTokens(sessionHeader + lastSession.block, provider);
  if (usedTokens + sessionTokens <= budget) {
    sections.push(sessionHeader + lastSession.block + '\n');
    usedTokens += sessionTokens;
    if (!quiet) {
      console.log(`  Last session: ${lastSession.filename}`);
    }
  }
}

// Preferences always next (highest priority knowledge)
addSection('Preferences', preferences);

// Project knowledge
const projectLabel = domain ? `Project: ${domain}` : 'Project Knowledge';
addSection(projectLabel, projectFiles);

// Reference
addSection('Reference', referenceFiles);

// Business (lowest priority)
addSection('Business Context', businessFiles);

// Current session (if --session flag)
if (opts.session) {
  const sessionPath = findOpenSession(vaultRoot);
  if (sessionPath) {
    try {
      const sessionContent = readFileSync(sessionPath, 'utf-8');
      const sessionBlock = `\n## Current Session\n${sessionContent}\n`;
      const sessionTokens = estimateTokens(sessionBlock, provider);
      if (usedTokens + sessionTokens <= budget) {
        sections.push(sessionBlock);
        usedTokens += sessionTokens;
      }
    } catch { /* skip */ }
  }
}

// ── Output ─────────────────────────────────────────────────────────

const output = sections.join('\n');

if (opts.clipboard) {
  // Cross-platform clipboard
  const platform = process.platform;
  const clipCmd = platform === 'win32' ? 'clip.exe'
    : platform === 'darwin' ? 'pbcopy'
    : 'xclip -selection clipboard';
  const args = clipCmd.split(' ');
  const proc = Bun.spawn(args, { stdin: 'pipe' });
  proc.stdin.write(output);
  proc.stdin.end();
  await proc.exited;
  if (!quiet) {
    console.log(`Copied to clipboard (${usedTokens} tokens, ${output.length} chars)`);
  }
} else if (opts.output) {
  writeFileSync(opts.output, output, 'utf-8');
  if (!quiet) {
    console.log(`Written to ${opts.output} (${usedTokens} tokens, ${output.length} chars)`);
  }
} else {
  // Default: write to Context/latest.md in vault
  const paths = vaultPaths(vaultRoot);
  const { ensureDir } = await import('./lib/vault.js');
  ensureDir(paths.context);
  const latestPath = join(paths.context, 'latest.md');
  writeFileSync(latestPath, output, 'utf-8');
  if (!quiet) {
    console.log(`Written to ${latestPath} (${usedTokens} tokens, ${output.length} chars)`);
  }
}

// File breakdown
if (!quiet) {
  console.log('\nIncluded files:');
  for (const file of ranked) {
    const tokens = estimateTokens(file.content, provider);
    if (usedTokens <= 0) break;
    console.log(`  ${file.score.toString().padStart(3)} pts | ${tokens.toString().padStart(5)} tok | ${file.relativePath}`);
  }
}
