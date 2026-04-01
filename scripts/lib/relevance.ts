/**
 * Relevance scoring for context assembly.
 *
 * Scores knowledge files by domain, recency, tags, status,
 * and frequency — how often a topic appears across sessions.
 * Preferences always score highest (always included in context).
 * Precision over recall — better to omit than pollute.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import type { KnowledgeFrontmatter } from './frontmatter.js';

export interface ScoredFile {
  path: string;
  relativePath: string;
  name: string;
  data: KnowledgeFrontmatter;
  content: string;
  score: number;
}

interface ScoringOptions {
  domain?: string;
  tags?: string[];
  includeArchived?: boolean;
  frequencyMap?: Map<string, number>;
}

// ── Frequency analysis ────────────────────────────────────────────

/**
 * Scan all sessions and build a map of keyword → mention count.
 * Keywords are extracted from section headers, worklog entries, and
 * error descriptions. More mentions = more important problem.
 */
export function buildFrequencyMap(vaultRoot: string): Map<string, number> {
  const freq = new Map<string, number>();
  const sessionsDir = join(vaultRoot, 'Sessions');
  if (!existsSync(sessionsDir)) return freq;

  const files = readdirSync(sessionsDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    try {
      const raw = readFileSync(join(sessionsDir, file), 'utf-8');
      const { content } = matter(raw);

      // Extract meaningful words (3+ chars, lowercase, skip common filler)
      const words = content
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

      // Count each unique word once per session (presence, not raw count)
      const seen = new Set<string>();
      for (const word of words) {
        if (!seen.has(word)) {
          seen.add(word);
          freq.set(word, (freq.get(word) || 0) + 1);
        }
      }
    } catch { /* skip unparseable sessions */ }
  }

  return freq;
}

/**
 * Score how well a knowledge file matches frequently mentioned topics.
 * Returns a boost value (0-30) based on keyword overlap with sessions.
 */
function frequencyBoost(
  data: KnowledgeFrontmatter,
  content: string,
  frequencyMap: Map<string, number>
): number {
  if (frequencyMap.size === 0) return 0;

  const fileWords = new Set(
    `${data.title || ''} ${(data.tags || []).join(' ')} ${content}`
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w))
  );

  let matchScore = 0;
  for (const word of fileWords) {
    const mentions = frequencyMap.get(word) || 0;
    if (mentions >= 2) matchScore += mentions; // Only boost if mentioned in 2+ sessions
  }

  // Cap at 30 points, scale based on match density
  return Math.min(30, Math.round(matchScore * 2));
}

// ── Last session ──────────────────────────────────────────────────

/**
 * Find the most recent closed session and return its content
 * as a context-ready block. This answers "where did I leave off?"
 */
export function getLastSession(vaultRoot: string): { block: string; filename: string } | null {
  const sessionsDir = join(vaultRoot, 'Sessions');
  if (!existsSync(sessionsDir)) return null;

  const files = readdirSync(sessionsDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse(); // newest first

  for (const file of files) {
    try {
      const raw = readFileSync(join(sessionsDir, file), 'utf-8');
      const { data, content } = matter(raw);
      if (data.status === 'closed') {
        // Extract the most useful sections: Current State, Worklog, Learnings, Errors
        const useful = extractUsefulSections(content);
        if (useful) {
          return {
            block: `### Last Session: ${data.title || file}\n_${data.date || ''}_\n\n${useful}`,
            filename: file,
          };
        }
      }
    } catch { /* skip */ }
  }

  return null;
}

function extractUsefulSections(content: string): string | null {
  const sections = new Map<string, string>();
  let currentSection = '';
  let currentLines: string[] = [];

  for (const line of content.split('\n')) {
    const headerMatch = line.match(/^## (.+)/);
    if (headerMatch) {
      if (currentSection && currentLines.length > 0) {
        const text = currentLines.join('\n').trim();
        if (text && !text.startsWith('_')) {
          sections.set(currentSection, text);
        }
      }
      currentSection = headerMatch[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentSection && currentLines.length > 0) {
    const text = currentLines.join('\n').trim();
    if (text && !text.startsWith('_')) {
      sections.set(currentSection, text);
    }
  }

  // Prioritize these sections for "where I left off"
  const priority = ['Worklog', 'Current State', 'Learnings', 'Errors & Corrections', 'Key Results'];
  const parts: string[] = [];
  for (const name of priority) {
    const text = sections.get(name);
    if (text) parts.push(`**${name}:**\n${text}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

// ── Core scoring ──────────────────────────────────────────────────

/**
 * Score a knowledge file for relevance.
 */
export function scoreFile(
  data: KnowledgeFrontmatter,
  content: string,
  opts: ScoringOptions = {}
): number {
  let score = 0;

  // Status filter
  if (data.status === 'archived' && !opts.includeArchived) return -1;
  if (data.status === 'superseded') return -1;

  // Priority boost — explicit user control over what matters
  // high = always near the top, low = only included if budget allows
  if (data.priority === 'high') score += 40;
  else if (data.priority === 'low') score -= 20;
  // medium (or unset) = no adjustment

  // Type boost — foundational knowledge outranks granular logs
  const typeScores: Record<string, number> = {
    architecture: 30,   // How things work — always valuable
    decision: 25,       // Why things are the way they are
    guide: 20,          // How to do things
    preference: 15,     // Included via domain scoring too, small extra bump
    reference: 0,       // Neutral — scored by domain instead
    log: -15,           // Test logs, prompt logs — low value for context
  };
  if (data.type && data.type in typeScores) {
    score += typeScores[data.type];
  }

  // Base score by domain type
  if (data.domain === 'preferences') {
    score += 100;  // Always include preferences
  } else if (opts.domain && data.domain === opts.domain) {
    score += 80;   // Matching project domain
  } else if (data.domain === 'reference') {
    score += 40;   // General reference
  } else if (data.domain === 'business') {
    score += 20;   // Business context (lower priority for coding tasks)
  } else {
    score += 30;   // Other active knowledge
  }

  // Recency boost
  if (data.updated) {
    const updatedDate = new Date(data.updated);
    const daysSince = (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 7) score += 20;
    else if (daysSince <= 30) score += 10;
    else if (daysSince <= 90) score += 5;
  }

  // Tag match boost
  if (opts.tags && opts.tags.length > 0 && data.tags) {
    const matchCount = opts.tags.filter(t =>
      data.tags!.some(ft => ft.toLowerCase() === t.toLowerCase())
    ).length;
    score += matchCount * 15;
  }

  // Frequency boost — topics that come up across multiple sessions
  if (opts.frequencyMap) {
    score += frequencyBoost(data, content, opts.frequencyMap);
  }

  // Content size penalty — very large files get slight deprioritization
  if (content.length > 10000) score -= 5;
  if (content.length > 20000) score -= 10;

  return score;
}

/**
 * Sort scored files by relevance (highest first).
 */
export function rankFiles(files: ScoredFile[]): ScoredFile[] {
  return files
    .filter(f => f.score >= 0)
    .sort((a, b) => b.score - a.score);
}

// ── Stop words (filtered from frequency analysis) ─────────────────

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'were', 'they',
  'this', 'that', 'with', 'from', 'will', 'what', 'when', 'where', 'which',
  'their', 'there', 'would', 'could', 'should', 'about', 'each', 'make',
  'into', 'than', 'then', 'them', 'these', 'some', 'other', 'just', 'also',
  'more', 'very', 'after', 'before', 'between', 'does', 'done', 'here',
  'how', 'its', 'let', 'may', 'most', 'much', 'must', 'now', 'only',
  'over', 'such', 'take', 'too', 'use', 'used', 'using', 'well', 'why',
  'still', 'see', 'need', 'set', 'run', 'get', 'got', 'way', 'any',
  'new', 'old', 'first', 'last', 'long', 'great', 'since', 'back',
  'session', 'started', 'closed', 'open', 'file', 'files', 'note', 'notes',
]);
