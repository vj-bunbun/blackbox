/**
 * Vault discovery, path helpers, and configuration.
 * All scripts accept --vault <path> to target any vault.
 * Default vault path comes from ~/.airc or falls back to cwd.
 */

import { existsSync, readFileSync, mkdirSync } from 'fs';
import { resolve, join, normalize } from 'path';
import { homedir } from 'os';
import matter from 'gray-matter';

// ── Config file (~/.airc) ──────────────────────────────────────────

export interface AircConfig {
  defaultVault?: string;
  personalVault?: string;
}

const AIRC_PATH = join(homedir(), '.airc');

export function loadAirc(): AircConfig {
  if (!existsSync(AIRC_PATH)) return {};
  try {
    const raw = readFileSync(AIRC_PATH, 'utf-8');
    const config: AircConfig = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key === 'defaultVault') config.defaultVault = val;
      if (key === 'personalVault') config.personalVault = val;
    }
    return config;
  } catch {
    return {};
  }
}

// ── Vault resolution ───────────────────────────────────────────────

export function resolveVault(cliVault?: string): string {
  if (cliVault) return resolve(normalize(cliVault));

  const airc = loadAirc();
  if (airc.defaultVault) return resolve(normalize(airc.defaultVault));

  return resolve('.');
}

// ── Path helpers ───────────────────────────────────────────────────

export function vaultPaths(vaultRoot: string) {
  return {
    root: vaultRoot,
    index: join(vaultRoot, 'INDEX.md'),
    sessions: join(vaultRoot, 'Sessions'),
    templates: join(vaultRoot, 'Templates'),
    context: join(vaultRoot, 'Context'),
  };
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ── Knowledge file discovery ───────────────────────────────────────

import { readdirSync, statSync } from 'fs';

export interface VaultFile {
  path: string;
  relativePath: string;
  name: string;
}

/**
 * Recursively find all .md files in a vault directory.
 * Excludes: INDEX.md, Sessions/, Templates/, Context/, .obsidian/, scripts/, docs/, R&D/
 */
export function discoverKnowledgeFiles(vaultRoot: string): VaultFile[] {
  const excludeDirs = new Set([
    'Sessions', 'Templates', 'Context', '.obsidian',
    'scripts', 'docs', 'R&D', 'node_modules',
  ]);
  const excludeFiles = new Set(['INDEX.md', 'README.md']);
  const results: VaultFile[] = [];

  function walk(dir: string, relBase: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.isDirectory()) continue;
      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) continue;
        walk(join(dir, entry.name), join(relBase, entry.name));
      } else if (entry.name.endsWith('.md') && !excludeFiles.has(entry.name)) {
        results.push({
          path: join(dir, entry.name),
          relativePath: join(relBase, entry.name),
          name: entry.name.replace(/\.md$/, ''),
        });
      }
    }
  }

  walk(vaultRoot, '');
  return results;
}

/**
 * Find the currently open session (status: open) in the Sessions/ folder.
 */
export function findOpenSession(vaultRoot: string): string | null {
  const sessionsDir = join(vaultRoot, 'Sessions');
  if (!existsSync(sessionsDir)) return null;


  const files = readdirSync(sessionsDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse(); // newest first

  for (const file of files) {
    const fullPath = join(sessionsDir, file);
    const raw = readFileSync(fullPath, 'utf-8');
    const { data } = matter(raw);
    if (data.status === 'open') return fullPath;
  }
  return null;
}
