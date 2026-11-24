// Shared by service validation, the form maxLength, and the character counter.
export const COMMENT_MAX_LENGTH = 1000;

export const COMMENTS_PAGE_SIZE = 10;
export const INITIAL_REPLIES_COUNT = 3;
export const REPLIES_PAGE_SIZE = 10;

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function formatRelativeTime(iso: string, now = Date.now()) {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (abs >= size) return rtf.format(Math.trunc(seconds / size), unit);
  }
  return "just now";
}
