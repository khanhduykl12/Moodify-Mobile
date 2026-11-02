// ============================================================================
// LRC parser cho Karaoke — port từ karaoke-solo-page.tsx của web Moodify
// Hỗ trợ tag [offset:±ms], nhiều timestamp trên một dòng, gộp mốc trùng
// ============================================================================

export type SyncedLyricLine = { startMs: number; text: string };

const LRC_TIMESTAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

export function parseSyncedLyrics(rawLyrics: string | null | undefined): SyncedLyricLine[] {
  if (!rawLyrics?.trim()) return [];

  const offsetMatch = rawLyrics.match(/^\s*\[offset:([+-]?\d+)\]\s*$/im);
  const offsetMs = offsetMatch ? Number(offsetMatch[1]) : 0;
  const parsed: SyncedLyricLine[] = [];

  for (const rawLine of rawLyrics.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const timestamps = Array.from(line.matchAll(LRC_TIMESTAMP));
    if (timestamps.length === 0) continue;
    const text = line.replace(LRC_TIMESTAMP, '').trim();
    if (!text) continue;

    for (const match of timestamps) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      if (seconds > 59) continue;
      const milliseconds = Number((match[3] ?? '').padEnd(3, '0').slice(0, 3) || '0');
      parsed.push({
        startMs: Math.max(0, minutes * 60_000 + seconds * 1_000 + milliseconds + offsetMs),
        text,
      });
    }
  }

  parsed.sort((left, right) => left.startMs - right.startMs);
  const lines: SyncedLyricLine[] = [];
  for (const cue of parsed) {
    const previous = lines[lines.length - 1];
    if (previous?.startMs === cue.startMs) {
      if (previous.text !== cue.text) previous.text += ` · ${cue.text}`;
    } else {
      lines.push({ ...cue });
    }
  }
  return lines;
}

// Tìm câu lời đang phát tại thời điểm timeSeconds (binary search cue cuối có startMs <= t)
export function findLyricLineAtTime(lines: SyncedLyricLine[], timeSeconds: number): number {
  const timeMs = timeSeconds * 1000;
  let low = 0;
  let high = lines.length - 1;
  let candidate = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (lines[middle].startMs <= timeMs) {
      candidate = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return candidate;
}

export function formatKaraokeClock(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(Math.floor(safeSeconds % 60)).padStart(2, '0')}`;
}
