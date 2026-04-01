/**
 * Relevance scoring for context assembly.
 *
 * Scores knowledge files by domain, recency, tags, and status.
 * Preferences always score highest (always included in context).
 * Precision over recall — better to omit than pollute.
 */

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
}

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
