/**
 * CSV cells (RFC 4180), safe to open in a spreadsheet: quoted when they hold
 * a comma, quote or line break, and never read as a formula (a leading
 * = + - @ tab or CR gets a ' in front, the usual CSV-injection guard).
 */
export function csvText(value: string | null | undefined): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Any value: numbers as they are, dates in ISO 8601, objects as JSON. */
export function csvCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return csvText(value);
  if (typeof value === 'bigint') return value.toString();
  // objects (and anything else) as JSON, so nothing becomes "[object Object]"
  return csvText(JSON.stringify(value) ?? '');
}

export const csvRow = (values: unknown[]): string =>
  values.map(csvCell).join(',');
