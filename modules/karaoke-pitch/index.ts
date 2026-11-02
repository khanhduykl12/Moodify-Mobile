// ============================================================================
// KaraokePitch — local Expo Module (Android) tính pitch YIN realtime trong lúc hát
// Port từ public/karaoke-pitch-worklet.js của web Moodify
// Dùng requireOptionalNativeModule để app không crash khi module chưa được
// build vào binary (Expo Go, iOS, hoặc dev client cũ) — UI tự degrade graceful.
// ============================================================================

import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

export type KaraokePitchFeaturesBatch = {
  f0_hz: (number | null)[];
  voiced_probability: number[];
};

export type KaraokePitchSummary = {
  duration_seconds: number;
  rms_dbfs: number;
  clipped_fraction: number;
  frame_count: number;
};

type KaraokePitchEvents = {
  onFeatures(event: KaraokePitchFeaturesBatch): void;
  onSummary(event: KaraokePitchSummary): void;
  onError(event: { message: string }): void;
};

declare class KaraokePitchNativeModule extends NativeModule<KaraokePitchEvents> {
  start(): Promise<void>;
  abort(): void;
  finalize(): void;
  isCapturing(): boolean;
}

const nativeModule = requireOptionalNativeModule<KaraokePitchNativeModule>('KaraokePitch');

// false khi module chưa nằm trong app (Expo Go / iOS / dev client cũ)
export const KARAOKE_PITCH_AVAILABLE = nativeModule !== null;

export default nativeModule;

type RemoveSubscription = { remove: () => void };

export function addFeaturesListener(listener: (event: KaraokePitchFeaturesBatch) => void): RemoveSubscription {
  return nativeModule?.addListener('onFeatures', listener) ?? { remove: () => undefined };
}

export function addSummaryListener(listener: (event: KaraokePitchSummary) => void): RemoveSubscription {
  return nativeModule?.addListener('onSummary', listener) ?? { remove: () => undefined };
}

export function addErrorListener(listener: (event: { message: string }) => void): RemoveSubscription {
  return nativeModule?.addListener('onError', listener) ?? { remove: () => undefined };
}
