/** Parse explicit booleans and finite numbers; leave ordinary text unchanged. */
export function parseStateValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return value;
}
