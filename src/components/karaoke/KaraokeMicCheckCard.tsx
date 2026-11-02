// Card kiểm tra micro — port từ phần "Kiểm tra micro" trong karaoke-solo-page.tsx của web
// Dùng expo-audio recorder + metering thay cho AnalyserNode RMS bên web

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import {
  RecordingOptions,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

type Props = {
  disabled?: boolean;
};

// Chỉ dùng để đo mức tín hiệu, ghi ra file tạm rồi xóa ngay
const MIC_CHECK_OPTIONS: RecordingOptions = {
  isMeteringEnabled: true,
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: 'aac ',
    audioQuality: 96,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

export const KaraokeMicCheckCard: React.FC<Props> = ({ disabled }) => {
  const [micState, setMicState] = useState<'idle' | 'requesting' | 'active' | 'error'>('idle');
  const [micLevel, setMicLevel] = useState(0);
  const [micMessage, setMicMessage] = useState('');
  const [micError, setMicError] = useState('');
  const lastMeterUpdateRef = useRef(0);

  const recorder = useAudioRecorder(MIC_CHECK_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);

  // metering là dB (thường -160..0): ánh xạ -50dB..0dB → 0..100
  useEffect(() => {
    const now = Date.now();
    if (now - lastMeterUpdateRef.current < 100) return;
    lastMeterUpdateRef.current = now;
    const db =
      typeof recorderState.metering === 'number' && Number.isFinite(recorderState.metering)
        ? recorderState.metering
        : -160;
    setMicLevel(Math.max(0, Math.min(100, Math.round(((db + 50) / 50) * 100))));
  }, [recorderState]);

  const startMicCheck = useCallback(async () => {
    setMicState('requesting');
    setMicError('');
    setMicMessage('');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setMicState('error');
        setMicError('Chưa cấp quyền micro. Hãy mở Cài đặt → Ứng dụng → Moodify → Quyền và cho phép Micro.');
        return;
      }
      await recorder.prepareToRecordAsync(MIC_CHECK_OPTIONS);
      recorder.record();
      setMicState('active');
      setMicMessage('Micro đang hoạt động. Hãy nói hoặc hát để xem mức tín hiệu.');
    } catch (error) {
      setMicState('error');
      setMicLevel(0);
      setMicError(
        error instanceof Error ? error.message : 'Không thể mở micro. Hãy kiểm tra quyền truy cập của ứng dụng.'
      );
    }
  }, [recorder]);

  const stopMicCheck = useCallback(async () => {
    try {
      const status = recorder.getStatus();
      const url = status.url;
      if (recorder.isRecording || status.isRecording) {
        await recorder.stop();
      }
      if (url) {
        try {
          const file = new File(url);
          if (file.exists) file.delete();
        } catch {
          // file tạm có thể đã bị hệ thống dọn
        }
      }
    } catch {
      // bỏ qua lỗi dừng ghi
    }
    setMicState('idle');
    setMicLevel(0);
    setMicMessage('');
    setMicError('');
  }, [recorder]);

  const toggle = useCallback(() => {
    if (micState === 'active') {
      void stopMicCheck();
    } else {
      void startMicCheck();
    }
  }, [micState, startMicCheck, stopMicCheck]);

  return (
    <View style={styles.card}>
      <View style={styles.cardArtwork}>
        <Ionicons name="headset" size={26} color="#c4b5fd" />
      </View>
      <View style={styles.cardCopy}>
        <Text style={styles.kicker}>THIẾT BỊ CỦA BẠN</Text>
        <Text style={styles.heading}>Sẵn sàng để cất giọng?</Text>
        {micMessage ? <Text style={styles.message}>{micMessage}</Text> : null}
        {micError ? <Text style={styles.error}>{micError}</Text> : null}
        {micState === 'active' ? (
          <View style={styles.meterRow}>
            <Text style={styles.meterLabel}>Mức âm</Text>
            <View style={styles.meterTrack}>
              <View style={[styles.meterFill, { width: `${Math.max(2, micLevel)}%` }]} />
            </View>
            <Text style={styles.meterStatus}>{micLevel > 5 ? 'Có tín hiệu' : 'Hãy nói hoặc hát'}</Text>
          </View>
        ) : null}
      </View>
      <TouchableOpacity
        style={[styles.button, micState === 'active' && styles.buttonActive, disabled && styles.buttonDisabled]}
        activeOpacity={0.8}
        disabled={disabled || micState === 'requesting'}
        onPress={toggle}
      >
        <Ionicons
          name={micState === 'active' ? 'pulse' : 'mic'}
          size={16}
          color={micState === 'active' ? '#10b981' : '#e5e7eb'}
        />
        <Text style={styles.buttonText}>
          {micState === 'requesting' ? 'Đang xin quyền...' : micState === 'active' ? 'Dừng kiểm tra' : 'Kiểm tra micro'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#1f1f2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#383854',
    padding: 14,
  },
  cardArtwork: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(139, 92, 246, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: {
    flex: 1,
    gap: 4,
  },
  kicker: {
    color: '#a78bfa',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  heading: {
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '700',
  },
  message: {
    color: '#9ca3af',
    fontSize: 12,
  },
  error: {
    color: '#f87171',
    fontSize: 12,
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  meterLabel: {
    color: '#9ca3af',
    fontSize: 11,
  },
  meterTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#0c0c10',
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#8b5cf6',
  },
  meterStatus: {
    color: '#9ca3af',
    fontSize: 10,
    width: 86,
    textAlign: 'right',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#262638',
    borderWidth: 1,
    borderColor: '#383854',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  buttonActive: {
    borderColor: 'rgba(16, 185, 129, 0.5)',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '600',
  },
});
