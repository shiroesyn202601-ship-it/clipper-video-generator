/** 75.4 → "1:15", 3725 → "1:02:05" */
export function formatDuration(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  return `${minutes}:${ss}`;
}

/** Timestamp with tenths for precise clip edges: 75.43 → "1:15.4" */
export function formatTimestamp(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  const whole = Math.floor(safe);
  const tenths = Math.floor((safe - whole) * 10);
  return `${formatDuration(whole)}.${tenths}`;
}

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function toPercent(fraction: number): number {
  return Math.round(Math.max(0, Math.min(1, fraction)) * 100);
}

/** Elapsed seconds between two ISO timestamps (end defaults to now). */
export function elapsedSec(startIso: string, endIso: string | null, nowMs = Date.now()): number {
  const end = endIso ? Date.parse(endIso) : nowMs;
  return Math.max(0, (end - Date.parse(startIso)) / 1000);
}
