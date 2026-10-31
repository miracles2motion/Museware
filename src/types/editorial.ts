/** Shared content parsing for canvas, lint and static export. */
export function marqueeItems(value: unknown): string[] {
  return (
    Array.isArray(value)
      ? value.map(String)
      : typeof value === 'string'
        ? value.split(',')
        : []
  )
    .map((item) => item.trim())
    .filter(Boolean);
}
export function accordionItems(
  value: unknown,
  rows: Record<string, unknown>[] = [],
): Array<{ question: string; answer: string }> {
  if (rows.length)
    return rows.map((row) => ({
      question: String(row.question ?? row.title ?? ''),
      answer: String(row.answer ?? row.detail ?? ''),
    }));
  return (typeof value === 'string' ? value.split(/\r?\n/) : [])
    .filter((line) => line.trim() && line.includes('|'))
    .map((line) => {
      const [question, ...answer] = line.split('|');
      return { question: question.trim(), answer: answer.join('|').trim() };
    });
}
