export function parseWinnerNames(raw: string): string[] {
  const text = String(raw || '').trim();
  if (!text) return [];
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean)));
      }
    } catch {
      // Older entries may be plain text.
    }
  }
  return Array.from(new Set(text.split(/\r?\n|\s*,\s*/).map((item) => item.trim()).filter(Boolean)));
}
