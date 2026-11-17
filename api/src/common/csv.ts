export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  text = text.replace(/[\r\n\t]/g, ' ');
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
