#!/usr/bin/env bun
/**
 * consolidate.ts — The "dreaming" process.
 *
 * Reviews closed sessions, promotes learnings to knowledge files,
 * updates INDEX.md. Runs deterministically — no AI calls.
 *
 * 4-phase process:
 *   1. Orient — read INDEX.md, scan existing knowledge
 *   2. Gather — find closed, unconsolidated sessions
 *   3. Consolidate — extract promotable content
 *   4. Prune — update INDEX.md, mark sessions consolidated
 *
 * Usage:
 *   bun run consolidate.ts --vault ~/Documents/my-vault
 *   bun run consolidate.ts --vault ~/Documents/my-vault --execute
 */

import { Command } from 'commander';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import matter from 'gray-matter';
import { resolveVault, vaultPaths, ensureDir, discoverKnowledgeFiles } from './lib/vault.js';
import { parseFile, serializeFile, today, type KnowledgeFrontmatter } from './lib/frontmatter.js';

// ── Types ──────────────────────────────────────────────────────────

interface SessionInfo {
  path: string;
  filename: string;
  data: KnowledgeFrontmatter & { consolidated?: boolean };
  content: string;
  sections: Map<string, string>;
}

interface Promotion {
  type: 'new' | 'append';
  targetPath: string;
  section: string;
  content: string;
  source: string;
}

// ── Phase 1: Orient ────────────────────────────────────────────────

function orient(vaultRoot: string): { knowledgeFiles: string[]; indexExists: boolean } {
  const files = discoverKnowledgeFiles(vaultRoot);
  const indexExists = existsSync(join(vaultRoot, 'INDEX.md'));
  return {
    knowledgeFiles: files.map(f => f.relativePath),
    indexExists,
  };
}

// ── Phase 2: Gather ────────────────────────────────────────────────

function gatherSessions(vaultRoot: string, since?: string): SessionInfo[] {
  const sessionsDir = join(vaultRoot, 'Sessions');
  if (!existsSync(sessionsDir)) return [];

  const sessions: SessionInfo[] = [];

  for (const file of readdirSync(sessionsDir).filter(f => f.endsWith('.md')).sort()) {
    const fullPath = join(sessionsDir, file);
    const raw = readFileSync(fullPath, 'utf-8');
    const { data, content } = matter(raw);

    // Only process closed, unconsolidated sessions
    if (data.status !== 'closed') continue;
    if (data.consolidated === true) continue;

    // Filter by date if --since provided
    if (since && data.date && data.date < since) continue;

    // Parse sections
    const sections = new Map<string, string>();
    let currentSection = '';
    let currentContent: string[] = [];

    for (const line of content.split('\n')) {
      const headerMatch = line.match(/^## (.+)/);
      if (headerMatch) {
        if (currentSection && currentContent.length > 0) {
          const text = currentContent.join('\n').trim();
          if (text && !text.startsWith('_')) { // Skip template placeholders
            sections.set(currentSection, text);
          }
        }
        currentSection = headerMatch[1].trim();
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
    // Flush last section
    if (currentSection && currentContent.length > 0) {
      const text = currentContent.join('\n').trim();
      if (text && !text.startsWith('_')) {
        sections.set(currentSection, text);
      }
    }

    sessions.push({
      path: fullPath,
      filename: file,
      data: data as any,
      content,
      sections,
    });
  }

  return sessions;
}

// ── Phase 3: Consolidate ───────────────────────────────────────────

const PROMOTABLE_SECTIONS = [
  'Learnings',
  'Errors & Corrections',
  'Codebase and System Documentation',
  'Key Results',
];

function identifyPromotions(
  sessions: SessionInfo[],
  existingFiles: string[],
  vaultRoot: string
): Promotion[] {
  const promotions: Promotion[] = [];

  for (const session of sessions) {
    for (const sectionName of PROMOTABLE_SECTIONS) {
      const sectionContent = session.sections.get(sectionName);
      if (!sectionContent || sectionContent.length < 20) continue;

      // Try to find a matching knowledge file by domain
      const domain = session.data.domain;
      let targetRelPath: string | null = null;

      if (domain) {
        // Look for existing file in the domain folder
        targetRelPath = existingFiles.find(f =>
          f.startsWith(domain + '/') || f.startsWith(domain + '\\')
        ) || null;
      }

      if (targetRelPath) {
        promotions.push({
          type: 'append',
          targetPath: join(vaultRoot, targetRelPath),
          section: sectionName,
          content: sectionContent,
          source: session.filename,
        });
      } else {
        // No matching file — suggest as new knowledge
        promotions.push({
          type: 'new',
          targetPath: join(vaultRoot, `Sessions/_promotable/${session.filename}`),
          section: sectionName,
          content: sectionContent,
          source: session.filename,
        });
      }
    }
  }

  return promotions;
}

// ── Phase 4: Prune — Update INDEX.md ───────────────────────────────

function regenerateIndex(vaultRoot: string): string {
  const files = discoverKnowledgeFiles(vaultRoot);
  const byDomain = new Map<string, typeof files>();

  for (const file of files) {
    const parsed = parseFile(file.path);
    const domain = parsed.data.domain || 'other';
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(file);
  }

  const lines: string[] = ['# Knowledge Index\n'];

  // Domains are sorted by priority. Add your own domains here.
  const domainOrder = ['preferences', 'projects', 'business', 'reference', 'other'];
  const domainLabels: Record<string, string> = {
    preferences: 'Preferences',
    projects: 'Projects',
    business: 'Business',
    reference: 'Reference',
    other: 'Other',
  };

  for (const domain of domainOrder) {
    const domainFiles = byDomain.get(domain);
    if (!domainFiles || domainFiles.length === 0) continue;

    lines.push(`## ${domainLabels[domain] || domain}`);
    for (const file of domainFiles) {
      const parsed = parseFile(file.path);
      const title = parsed.data.title || file.name;
      const desc = parsed.data.tags?.slice(0, 3).join(', ') || '';
      lines.push(`- [${title}](${file.relativePath.replace(/\\/g, '/')})${desc ? ' — ' + desc : ''}`);
    }
    lines.push('');
  }

  // Recent sessions
  const sessionsDir = join(vaultRoot, 'Sessions');
  if (existsSync(sessionsDir)) {
    const sessionFiles = readdirSync(sessionsDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, 5);

    if (sessionFiles.length > 0) {
      lines.push('## Recent Sessions');
      for (const f of sessionFiles) {
        const raw = readFileSync(join(sessionsDir, f), 'utf-8');
        const { data } = matter(raw);
        const status = data.status === 'open' ? ' (open)' : '';
        lines.push(`- [${data.title || f}](Sessions/${f})${status}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── CLI ────────────────────────────────────────────────────────────

const program = new Command()
  .name('consolidate')
  .description('Review sessions, promote learnings to knowledge, update index')
  .option('--vault <path>', 'Vault directory')
  .option('--since <date>', 'Only process sessions after this date (YYYY-MM-DD)')
  .option('--execute', 'Apply changes (default is dry-run)')
  .parse();

const opts = program.opts();
const vaultRoot = resolveVault(opts.vault);
const dryRun = !opts.execute;

console.log(`\n${dryRun ? 'DRY RUN' : 'EXECUTING'} — Consolidation`);
console.log(`  Vault: ${vaultRoot}\n`);

// Phase 1: Orient
const { knowledgeFiles, indexExists } = orient(vaultRoot);
console.log(`Phase 1 (Orient): ${knowledgeFiles.length} knowledge files, index ${indexExists ? 'exists' : 'missing'}`);

// Phase 2: Gather
const sessions = gatherSessions(vaultRoot, opts.since);
console.log(`Phase 2 (Gather): ${sessions.length} closed unconsolidated sessions`);

if (sessions.length === 0) {
  console.log('\nNothing to consolidate.');

  // Still regenerate INDEX if requested
  if (!dryRun) {
    const newIndex = regenerateIndex(vaultRoot);
    writeFileSync(join(vaultRoot, 'INDEX.md'), newIndex, 'utf-8');
    console.log('INDEX.md regenerated.');
  }
  process.exit(0);
}

// Phase 3: Consolidate
const promotions = identifyPromotions(sessions, knowledgeFiles, vaultRoot);
console.log(`Phase 3 (Consolidate): ${promotions.length} potential promotions\n`);

if (promotions.length > 0) {
  console.log('Promotions:');
  for (const p of promotions) {
    const icon = p.type === 'append' ? '  +append' : '  +new   ';
    console.log(`${icon} [${p.section}] from ${p.source}`);
    if (p.type === 'append') {
      console.log(`           → ${basename(p.targetPath)}`);
    }
  }
}

// Phase 4: Prune — mark sessions and update INDEX
if (!dryRun) {
  // Mark sessions as consolidated
  for (const session of sessions) {
    const raw = readFileSync(session.path, 'utf-8');
    const { data, content } = matter(raw);
    data.consolidated = true;
    writeFileSync(session.path, matter.stringify('\n' + content + '\n', data), 'utf-8');
  }
  console.log(`\nMarked ${sessions.length} sessions as consolidated.`);

  // Regenerate INDEX.md
  const newIndex = regenerateIndex(vaultRoot);
  writeFileSync(join(vaultRoot, 'INDEX.md'), newIndex, 'utf-8');
  console.log('INDEX.md regenerated.');
} else {
  console.log(`\n  Run with --execute to apply changes.`);
}
