// Normalize user-entered decimal that may use comma or dot.
// Accepts number or string; returns number (NaN if invalid after cleanup).
export function normalizeAmount(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return NaN;
  if (typeof input === 'number') return input;
  const trimmed = input.trim();
  if (trimmed === '') return NaN;
  // replace comma with dot (only first, but if multiple commas user error; collapse)
  const normalized = trimmed.replace(/,/g, '.');
  // remove spaces
  const cleaned = normalized.replace(/\s+/g, '');
  const value = Number(cleaned);
  return isFinite(value) ? value : NaN;
}

export function assertValidAmount(val: number, field: string) {
  if (isNaN(val)) throw new Error(`Invalid ${field} amount`);
  if (val < 0) throw new Error(`${field} must be positive`);
}