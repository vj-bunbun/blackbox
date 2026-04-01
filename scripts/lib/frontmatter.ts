/**
 * YAML frontmatter parse/serialize helpers.
 * Wraps gray-matter for consistent usage across all scripts.
 */

import matter from 'gray-matter';
import { readFileSync, writeFileSync } from 'fs';

// ── Types ──────────────────────────────────────────────────────────

export interface KnowledgeFrontmatter {
  title: string;
  domain?: string;
  type?: 'architecture' | 'decision' | 'reference' | 'log' | 'guide' | 'preference';
  priority?: 'high' | 'medium' | 'low';
  tags?: string[];
  created?: string;
  updated?: string;
  status?: 'active' | 'archived' | 'superseded' | 'open' | 'closed';
  superseded_by?: string;
  // Session-specific
  date?: string;
  started?: string;
  ended?: string;
  consolidated?: boolean;
}

export interface ParsedFile {
  data: KnowledgeFrontmatter;
  content: string;
  rawContent: string;
}

// ── Parse ──────────────────────────────────────────────────────────

export function parseFile(filePath: string): ParsedFile {
  const raw = readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);
  return {
    data: data as KnowledgeFrontmatter,
    content: content.trim(),
    rawContent: raw,
  };
}

export function parseString(raw: string): ParsedFile {
  const { data, content } = matter(raw);
  return {
    data: data as KnowledgeFrontmatter,
    content: content.trim(),
    rawContent: raw,
  };
}

// ── Serialize ──────────────────────────────────────────────────────

export function serializeFile(data: KnowledgeFrontmatter, content: string): string {
  return matter.stringify('\n' + content.trim() + '\n', data);
}

export function writeKnowledgeFile(
  filePath: string,
  data: KnowledgeFrontmatter,
  content: string
): void {
  const output = serializeFile(data, content);
  writeFileSync(filePath, output, 'utf-8');
}

// ── Helpers ────────────────────────────────────────────────────────

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Update the 'updated' field in frontmatter to today.
 */
export function touchUpdated(data: KnowledgeFrontmatter): KnowledgeFrontmatter {
  return { ...data, updated: today() };
}
