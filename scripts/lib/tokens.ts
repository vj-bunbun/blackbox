/**
 * Token counting — provider-agnostic estimation.
 *
 * Default: 4 characters per token (good enough for planning).
 * Provider-specific overrides available for tighter budgets.
 */

export type Provider = 'default' | 'anthropic' | 'openai' | 'google' | 'local';

const CHARS_PER_TOKEN: Record<Provider, number> = {
  default: 4,
  anthropic: 3.5,  // Slightly denser tokenization
  openai: 4,       // cl100k_base
  google: 4,
  local: 4.5,      // Conservative for smaller tokenizers
};

const DEFAULT_BUDGETS: Record<Provider, number> = {
  default: 12000,
  anthropic: 12000,
  openai: 8000,
  google: 10000,
  local: 6000,
};

/**
 * Estimate token count for a string.
 */
export function estimateTokens(text: string, provider: Provider = 'default'): number {
  const cpt = CHARS_PER_TOKEN[provider];
  return Math.ceil(text.length / cpt);
}

/**
 * Get the default token budget for a provider.
 */
export function getDefaultBudget(provider: Provider = 'default'): number {
  return DEFAULT_BUDGETS[provider];
}

/**
 * Truncate text to fit within a token budget.
 * Truncates from the end, preserving the beginning (most important context first).
 */
export function truncateToFit(
  text: string,
  budget: number,
  provider: Provider = 'default'
): string {
  const cpt = CHARS_PER_TOKEN[provider];
  const maxChars = budget * cpt;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n[... truncated to fit token budget ...]';
}
