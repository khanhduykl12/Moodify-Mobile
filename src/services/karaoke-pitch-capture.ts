// ============================================================================
// Quản lý phiên ghi pitch cho Karaoke — bọc native module KaraokePitch
// Thu thập f0_hz / voiced_probability từ event, chốt summary khi finalize.
// Flow giống hệt cách web dùng AudioWorklet (start → features batches → finalize/abort).
// Khi module native chưa có trong app (Expo Go / iOS / dev client cũ), các hàm
// trả lỗi thân thiện thay vì crash — UI karaoke vẫn chạy được phần nghe nhạc + lời.
// ============================================================================

import KaraokePitch, {
  KARAOKE_PITCH_AVAILABLE,
  addErrorListener,
  addFeaturesListener,
  addSummaryListener,
} from '../../modules/karaoke-pitch';
import type { KaraokePitchFeatures } from '../types';

export type PitchCaptureSummary = {
  duration_seconds: number;
  rms_dbfs: number;
  clipped_fraction: number;
  frame_count: number;
};

export class PitchCaptureError extends Error {}

export function isKaraokePitchAvailable(): boolean {
  return KARAOKE_PITCH_AVAILABLE;
}

const UNAVAILABLE_MESSAGE =
  'Thiết bị này chưa cài module chấm điểm Karaoke. Hãy dùng bản dev build Android (npx expo run:android) thay cho Expo Go.';

type SummaryWaiter = {
  resolve: (summary: PitchCaptureSummary) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

let attached = false;
let f0Hz: (number | null)[] = [];
let voicedProbability: number[] = [];
let activeWaiter: SummaryWaiter | null = null;
let errorHandler: ((message: string) => void) | null = null;

function ensureAttached() {
  if (attached || !KARAOKE_PITCH_AVAILABLE) return;
  attached = true;
  addFeaturesListener((event) => {
    f0Hz.push(...event.f0_hz);
    voicedProbability.push(...event.voiced_probability);
  });
  addSummaryListener((summary) => {
    const waiter = activeWaiter;
    activeWaiter = null;
    if (waiter) {
      clearTimeout(waiter.timeout);
      waiter.resolve(summary);
    }
  });
  addErrorListener((event) => {
    errorHandler?.(event.message);
  });
}

export function setPitchCaptureErrorHandler(handler: ((message: string) => void) | null) {
  errorHandler = handler;
}

/** Bắt đầu ghi pitch từ micro (native AudioRecord 22050Hz + YIN realtime). */
export async function startPitchCapture(): Promise<void> {
  if (!KARAOKE_PITCH_AVAILABLE) {
    throw new PitchCaptureError(UNAVAILABLE_MESSAGE);
  }
  ensureAttached();
  f0Hz = [];
  voicedProbability = [];
  await KaraokePitch!.start();
}

/**
 * Chốt bản thu: pad frame thiếu, flush batch cuối, chờ summary từ native (timeout 5s),
 * kiểm tra dữ liệu đầy đủ rồi trả về features JSON để gửi server chấm điểm.
 */
export async function finishPitchCapture(recordingStartOffsetMs: number): Promise<KaraokePitchFeatures> {
  if (!KARAOKE_PITCH_AVAILABLE) {
    throw new PitchCaptureError(UNAVAILABLE_MESSAGE);
  }
  KaraokePitch!.finalize();
  const summary = await new Promise<PitchCaptureSummary>((resolve, reject) => {
    const timeout = setTimeout(() => {
      activeWaiter = null;
      reject(new PitchCaptureError('Không thể hoàn tất phân tích âm thanh.'));
    }, 5000);
    activeWaiter = { resolve, reject, timeout };
  });
  if (f0Hz.length !== summary.frame_count || voicedProbability.length !== summary.frame_count) {
    throw new PitchCaptureError('Dữ liệu âm thanh chưa đầy đủ để tính điểm.');
  }
  return {
    duration_seconds: summary.duration_seconds,
    rms_dbfs: summary.rms_dbfs,
    clipped_fraction: summary.clipped_fraction,
    f0_hz: f0Hz,
    voiced_probability: voicedProbability,
    recording_start_offset_ms: recordingStartOffsetMs,
    capture_latency_ms: 0,
    allow_octave_shift: true,
  };
}

/** Hủy bản thu — dừng capture, xóa dữ liệu, đánh thức waiter đang chờ. */
export function abortPitchCapture(): void {
  if (!KARAOKE_PITCH_AVAILABLE) return;
  KaraokePitch!.abort();
  const waiter = activeWaiter;
  activeWaiter = null;
  if (waiter) {
    clearTimeout(waiter.timeout);
    waiter.reject(new PitchCaptureError('Đã hủy bản thu.'));
  }
  f0Hz = [];
  voicedProbability = [];
}

export function isPitchCapturing(): boolean {
  if (!KARAOKE_PITCH_AVAILABLE) return false;
  return KaraokePitch!.isCapturing();
}
