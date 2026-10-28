/**
 * The house key's wallet. A public landing page means anonymous visitors can
 * spend the owner's money, so the cap is enforced HERE, on the server, not in
 * the browser where anyone could ignore it.
 *
 * Two jobs:
 *   1. price a response from its usage block (same rate card as client.ts §6.1)
 *   2. keep a per-UTC-day tally and answer "may I spend?" before every call
 *
 * The tally lives in module scope: warm serverless instances share it, cold
 * ones reset. That is honest for a demo-scale product and stated plainly —
 * it is a circuit breaker, not an invoice.
 */

export interface UsageLike {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
}

/** §6.1 rate card, USD per 1M tokens. */
const RATES: Record<string, { in: number; out: number }> = {
  'muse-spark-1.3': { in: 1.25, out: 4.25 },
  'muse-spark-1.2': { in: 1.1, out: 3.9 },
  'muse-spark-1.1': { in: 1.0, out: 3.5 },
  'muse-wonder-1.0': { in: 4.0, out: 20.0 },
  'muse-spark-1.3-contributor': { in: 0.1, out: 0.2 },
};

export function priceUsd(model: string, usage: UsageLike | null | undefined): number {
  if (!usage) return 0;
  const rate = RATES[model] || RATES['muse-spark-1.3'];
  const input = Math.max(0, Number(usage.inputTokens) || 0);
  const cached = Math.min(input, Math.max(0, Number(usage.cachedTokens) || 0));
  const output = Math.max(0, Number(usage.outputTokens) || 0);
  const fresh = input - cached;
  return (
    (fresh / 1_000_000) * rate.in * 1 +
    (cached / 1_000_000) * rate.in * 0.1 +
    (output / 1_000_000) * rate.out
  );
}

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export interface BudgetState {
  /** null means no cap is configured — the ledger still tallies. */
  capUsd: number | null;
  spentUsd: number;
  day: string;
  warn: boolean;
  exhausted: boolean;
}

export class BudgetLedger {
  private day = utcDay();
  private spent = 0;
  private capUsd: number | null;

  constructor(capUsd: number | null) {
    this.capUsd = capUsd;
  }

  setCap(capUsd: number | null): void {
    this.capUsd = capUsd;
  }

  private roll(): void {
    const today = utcDay();
    if (today !== this.day) {
      this.day = today;
      this.spent = 0;
    }
  }

  charge(model: string, usage: UsageLike | null | undefined): number {
    this.roll();
    const cost = priceUsd(model, usage);
    this.spent += cost;
    return cost;
  }

  get state(): BudgetState {
    this.roll();
    const cap = this.capUsd;
    const ratio = cap && cap > 0 ? this.spent / cap : 0;
    return {
      capUsd: cap,
      spentUsd: Math.round(this.spent * 10_000) / 10_000,
      day: this.day,
      warn: Boolean(cap && ratio >= 0.8),
      exhausted: Boolean(cap && this.spent >= cap),
    };
  }

  /** Called before every billable call. */
  maySpend(): boolean {
    return !this.state.exhausted;
  }
}

let ledger = new BudgetLedger(null);

export function budget(capUsd?: number | string | null): BudgetLedger {
  const cap =
    capUsd === undefined || capUsd === null || capUsd === '' ? null : Number(capUsd);
  ledger.setCap(Number.isFinite(cap as number) ? (cap as number) : null);
  return ledger;
}

/** Tests only: forget the tally between cases. */
export function resetBudget(capUsd: number | null = null): void {
  ledger = new BudgetLedger(capUsd);
}

/**
 * Pull usage out of an SSE chunk without buffering the stream. The SSE
 * `stream_options.include_usage` frame is the last one that matters, and its
 * shape is `{"usage":{"prompt_tokens":…}}` or camelCase from some gateways.
 */
export function usageFromSseLine(
  line: string,
): { usage: UsageLike; model?: string } | null {
  if (!line.includes('usage')) return null;
  const dataStart = line.indexOf('{');
  if (dataStart < 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.slice(dataStart));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const raw =
    (obj.usage as Record<string, unknown> | undefined) ||
    ((obj.response as Record<string, unknown> | undefined)?.usage as
      | Record<string, unknown>
      | undefined);
  if (!raw) return null;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    usage: {
      inputTokens: num(raw.prompt_tokens ?? raw.input_tokens ?? raw.inputTokens),
      outputTokens: num(raw.completion_tokens ?? raw.output_tokens ?? raw.outputTokens),
      cachedTokens: num(
        (raw.prompt_tokens_details as Record<string, unknown> | undefined)?.cached_tokens ??
          (raw.input_tokens_details as Record<string, unknown> | undefined)
            ?.cached_tokens ??
          raw.cached_tokens,
      ),
    },
    model: typeof obj.model === 'string' ? obj.model : undefined,
  };
}
