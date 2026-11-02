// Karaoke Solo — port từ karaoke-solo-page.tsx của web Moodify
// Sân khấu: lyrics đồng bộ theo dòng, nhạc nền instrumental riêng (không qua PlayerContext),
// ghi pitch realtime bằng native module KaraokePitch rồi gửi server chấm điểm.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { usePlayer } from '@/context/PlayerContext';
import { KaraokeApi } from '@/services/api';
import {
  PitchCaptureError,
  abortPitchCapture,
  finishPitchCapture,
  isKaraokePitchAvailable,
  setPitchCaptureErrorHandler,
  startPitchCapture,
} from '@/services/karaoke-pitch-capture';
import { findLyricLineAtTime, formatKaraokeClock, parseSyncedLyrics } from '@/utils/karaoke-lyrics';
import { KaraokeTrackCatalog } from '@/components/karaoke/KaraokeTrackCatalog';
import { KaraokeScoreModal } from '@/components/karaoke/KaraokeScoreModal';
import { KaraokeMicCheckCard } from '@/components/karaoke/KaraokeMicCheckCard';
import type { KaraokeScoreResponse, KaraokeSessionResponse, KaraokeTrackSummary } from '@/types';

type KaraokeScoreState = 'idle' | 'preparing' | 'recording' | 'uploading' | 'completed' | 'error';

export default function KaraokeSoloScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ songId?: string }>();
  const { isPlaying: globalIsPlaying, togglePlayPause } = usePlayer();

  const [song, setSong] = useState<KaraokeTrackSummary | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const [scoreState, setScoreState] = useState<KaraokeScoreState>('idle');
  const [scoreMessage, setScoreMessage] = useState('');
  const [scoreError, setScoreError] = useState('');
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [scoreResult, setScoreResult] = useState<KaraokeScoreResponse | null>(null);

  // Nhạc nền karaoke dùng player riêng — không đi qua PlayerContext (tránh Ad Engine/sleep timer)
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  const activeScoreSessionRef = useRef<KaraokeSessionResponse | null>(null);
  const recordingStartOffsetRef = useRef(0);
  const scoreStartLockRef = useRef(false);
  const scoreStateRef = useRef<KaraokeScoreState>('idle');
  const scoreStartRef = useRef<((track: KaraokeTrackSummary) => Promise<void>) | null>(null);
  const seekBarWidthRef = useRef(0);


  const syncedLyrics = useMemo(() => parseSyncedLyrics(song?.lyricsSynced), [song?.lyricsSynced]);
  const currentTime = status.currentTime;
  const activeLyricIndex = useMemo(
    () => findLyricLineAtTime(syncedLyrics, currentTime),
    [syncedLyrics, currentTime]
  );
  const activeLyric = activeLyricIndex >= 0 ? syncedLyrics[activeLyricIndex] : null;
  const upcomingLyric = syncedLyrics[activeLyricIndex >= 0 ? activeLyricIndex + 1 : 0] ?? null;
  const totalDuration = status.duration > 0 ? status.duration : (song?.durationMs ?? 0) / 1000;
  const hasLyrics = Boolean(song?.lyricsSynced?.trim() || song?.lyricsPlain?.trim());
  const overallScore = scoreResult?.score?.overall ?? null;
  const isBusy = scoreState === 'preparing' || scoreState === 'uploading';

  useEffect(() => {
    scoreStateRef.current = scoreState;
  }, [scoreState]);

  useEffect(() => {
    if (globalIsPlaying) togglePlayPause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPitchCaptureErrorHandler((message) => {
      if (scoreStateRef.current !== 'recording') return;
      abortPitchCapture();
      activeScoreSessionRef.current = null;
      player.pause();
      setScoreState('error');
      setScoreMessage('');
      setScoreError(message);
    });
    return () => {
      setPitchCaptureErrorHandler(null);
      abortPitchCapture();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishScoring = useCallback(async () => {
    const session = activeScoreSessionRef.current;
    if (!session) return;

    setScoreState('uploading');
    setScoreMessage('Bài hát đã kết thúc. Đang chốt điểm…');
    setScoreError('');
    try {
      const features = await finishPitchCapture(recordingStartOffsetRef.current);
      const result = await KaraokeApi.submitPitchFeatures(session.sessionId, features);
      setScoreResult(result);
      setScoreDialogOpen(Boolean(result.score));
      setScoreState('completed');
      setScoreMessage(result.score ? 'Đã chấm điểm xong.' : 'Bản thu chưa đủ dữ liệu để tính điểm.');
      setScoreError('');
    } catch (error) {
      if (error instanceof PitchCaptureError && error.message === 'Đã hủy bản thu.') return;
      setScoreState('error');
      setScoreMessage('');
      setScoreError(error instanceof Error ? error.message : 'Không thể chốt điểm Karaoke.');
    } finally {
      activeScoreSessionRef.current = null;
    }
  }, []);

  const beginScoring = useCallback(async (track: KaraokeTrackSummary) => {
    if (scoreStartLockRef.current || activeScoreSessionRef.current) return;
    if (!track.scoringAvailable) {
      setScoreState('error');
      setScoreError('Bài này chưa có dữ liệu tham chiếu đủ tin cậy để chấm điểm.');
      return;
    }
    scoreStartLockRef.current = true;
    setScoreState('preparing');
    setScoreDialogOpen(false);
    setScoreMessage('Đang xin quyền micro và tạo phiên chấm điểm…');
    setScoreError('');
    setScoreResult(null);

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new PitchCaptureError(
          'Chưa cấp quyền micro. Hãy mở Cài đặt → Ứng dụng → Moodify → Quyền và cho phép Micro.'
        );
      }

      // Android: AudioRecord đọc trực tiếp không cần đổi audio mode
      // (MODE_IN_COMMUNICATION có thể đẩy nhạc nền sang loa gọi điện). iOS thì cần.
      if (Platform.OS === 'ios') {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      }

      const session = await KaraokeApi.startSession(track.songId);
      activeScoreSessionRef.current = session;
      recordingStartOffsetRef.current = 0;

      await startPitchCapture();
      player.seekTo(0);
      player.play();
      recordingStartOffsetRef.current = Math.round(player.currentTime * 1000);
      setScoreState('recording');
      setScoreMessage('Đang phân tích giọng hát. Hãy đeo tai nghe; điểm tổng sẽ hiện sau khi bài kết thúc.');
    } catch (error) {
      abortPitchCapture();
      activeScoreSessionRef.current = null;
      player.pause();
      setScoreState('error');
      setScoreMessage('');
      setScoreError(
        error instanceof Error ? error.message : 'Không thể bắt đầu ghi âm để chấm điểm.'
      );
    } finally {
      scoreStartLockRef.current = false;
    }
  }, [player]);

  // Lưu callback vào ref để effect didJustFinish không phải đăng ký lại
  useEffect(() => {
    scoreStartRef.current = beginScoring;
  }, [beginScoring]);

  // Hết bài → chốt điểm (như onEnded của web)
  useEffect(() => {
    const subscription = player.addListener('playbackStatusUpdate', (update) => {
      setIsPlaying(update.playing);
      if (update.didJustFinish) {
        setIsPlaying(false);
        if (activeScoreSessionRef.current && scoreStateRef.current === 'recording') {
          void finishScoring();
        }
      }
    });
    return () => subscription.remove();
  }, [player, finishScoring]);

  const handleSelect = useCallback(
    (track: KaraokeTrackSummary) => {
      if (scoreStateRef.current === 'preparing' || scoreStateRef.current === 'uploading') {
        setScoreError('Đang chuẩn bị hoặc gửi bản thu; hãy đợi thao tác này hoàn tất rồi chọn bài khác.');
        return;
      }
      if (scoreStateRef.current === 'recording') {
        abortPitchCapture();
        activeScoreSessionRef.current = null;
        player.pause();
      }
      setSong(track);
      setIsPlaying(false);
      setPlaybackError('');
      setScoreState('idle');
      setScoreMessage('');
      setScoreError('');
      setScoreDialogOpen(false);
      setScoreResult(null);

      if (!track.instrumentalUrl) {
        setPlaybackError('Bài này chưa có URL nhạc nền. Hãy tải lại danh sách hoặc kiểm tra backend.');
        return;
      }
      player.replace({ uri: track.instrumentalUrl });
      player.seekTo(0);
      if (track.scoringAvailable) {
        if (!isKaraokePitchAvailable()) {
          // Module native chưa build vào app (Expo Go / iOS / dev client cũ)
          // → vẫn nghe nhạc nền + lời, chỉ tắt chấm điểm
          setScoreState('error');
          setScoreError(
            'Thiết bị này chưa hỗ trợ chấm điểm (module native chỉ có trong bản dev build Android). Bạn vẫn nghe nhạc nền và xem lời bình thường.'
          );
          return;
        }
        void scoreStartRef.current?.(track);
      }
    },
    [player]
  );

  // Vào từ FullscreenPlayer với songId — tự chọn bài; 404 nghĩa là bài chưa được chuẩn bị karaoke
  useEffect(() => {
    const songId = params.songId;
    if (!songId || song) return;
    let cancelled = false;
    KaraokeApi.getTrackById(String(songId))
      .then((track) => {
        if (!cancelled) handleSelect(track);
      })
      .catch(() => {
        if (!cancelled) {
          Alert.alert('Karaoke', 'Bài hát này chưa được chuẩn bị dữ liệu Karaoke.');
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.songId]);

  const cancelScoring = useCallback(() => {
    abortPitchCapture();
    activeScoreSessionRef.current = null;
    player.pause();
    setScoreState('idle');
    setScoreDialogOpen(false);
    setScoreMessage('Đã hủy bản thu; bản thu chưa được gửi đi.');
    setScoreError('');
    if (Platform.OS === 'ios') {
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    }
  }, [player]);

  const togglePlayback = useCallback(() => {
    if (scoreState === 'recording') {
      cancelScoring();
      return;
    }
    if (!song?.instrumentalUrl) return;
    if (status.playing) {
      player.pause();
    } else {
      setPlaybackError('');
      player.play();
    }
  }, [cancelScoring, player, scoreState, song?.instrumentalUrl, status.playing]);

  const handleSeek = useCallback(
    (locationX: number) => {
      if (totalDuration <= 0 || isBusy || scoreState === 'recording') return;
      const fraction = Math.max(0, Math.min(1, locationX / Math.max(1, seekBarWidthRef.current)));
      const time = fraction * totalDuration;
      player.seekTo(time);
    },
    [isBusy, player, scoreState, totalDuration]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color="#e5e7eb" />
            <Text style={styles.backText}>Chọn chế độ</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.intro}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowLine} />
            <Text style={styles.eyebrow}>MOODIFY KARAOKE</Text>
            <View style={styles.eyebrowLine} />
          </View>
          <Text style={styles.title}>Sân khấu của riêng bạn.</Text>
          <Text style={styles.subtitle}>Chọn một bài đã được chuẩn bị để bắt đầu karaoke.</Text>
        </View>

        <View style={styles.stage}>
          <View style={styles.stageTopline}>
            <View style={styles.stageIdentity}>
              <View style={styles.stageIdentityIcon}>
                <Ionicons name="musical-notes" size={16} color="#c4b5fd" />
              </View>
              <View>
                <Text style={styles.stageIdentitySmall}>MOODIFY KARAOKE</Text>
                <Text style={styles.stageIdentityStrong}>Sân khấu của bạn</Text>
              </View>
            </View>
            {!song && <Text style={styles.stageRoom}>HÁT MỘT MÌNH</Text>}
          </View>

          <View style={styles.stageSong}>
            <Ionicons name="musical-note" size={15} color="#9ca3af" />
            <View style={styles.stageSongCopy}>
              <Text style={styles.stageSongTitle} numberOfLines={1}>
                {song?.title ?? 'Chưa chọn bài hát'}
              </Text>
              <Text style={styles.stageSongArtist} numberOfLines={1}>
                {song?.artist ?? 'Chọn một bài trong danh sách bên dưới'}
              </Text>
            </View>
          </View>

          <View style={styles.lyrics}>
            {!song ? (
              <Text style={styles.lyricFaded}>Chọn một bài đã chuẩn bị để bắt đầu.</Text>
            ) : !hasLyrics ? (
              <>
                <Text style={styles.lyricFaded}>
                  {song.scoringAvailable ? 'Có thể chấm điểm sau khi hát' : 'Nhạc nền đã sẵn sàng'}
                </Text>
                <Text style={styles.lyricActive}>Bài hát này chưa có lời trong dữ liệu.</Text>
                <Text style={styles.lyricFaded}>Bạn vẫn có thể nghe nhạc nền karaoke.</Text>
              </>
            ) : syncedLyrics.length === 0 ? (
              <>
                <Text style={styles.lyricFaded}>Bài này chưa có lời đồng bộ theo thời gian</Text>
                <Text style={styles.lyricActive}>Nhạc nền vẫn phát bình thường.</Text>
                <Text style={styles.lyricFaded}>
                  Dữ liệu hiện chỉ có lời văn bản, chưa có mốc LRC; hệ thống không tự chia lời theo thời lượng.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.lyricActive} numberOfLines={2}>
                  {activeLyric?.text ?? (isPlaying ? 'Sắp đến câu đầu tiên…' : 'Nhấn Phát để bắt đầu')}
                </Text>
                <View style={styles.lyricPreviewSlot}>
                  {upcomingLyric ? (
                    <Text style={styles.lyricPreview} numberOfLines={1}>
                      {upcomingLyric.text}
                    </Text>
                  ) : null}
                </View>
              </>
            )}
          </View>

          <View style={styles.playbackControls}>
            <TouchableOpacity
              style={styles.playbackButton}
              activeOpacity={0.8}
              disabled={!song?.instrumentalUrl || isBusy}
              onPress={togglePlayback}
            >
              <Ionicons
                name={scoreState === 'recording' ? 'stop' : isPlaying ? 'pause' : 'play'}
                size={15}
                color="#ffffff"
              />
              <Text style={styles.playbackButtonText}>
                {scoreState === 'recording' ? 'Dừng & hủy' : isPlaying ? 'Tạm dừng' : 'Phát'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.clock}>{formatKaraokeClock(currentTime)}</Text>
            <View
              style={styles.seekTrack}
              onLayout={(event) => {
                seekBarWidthRef.current = event.nativeEvent.layout.width;
              }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(event) => handleSeek(event.nativeEvent.locationX)}
              onResponderMove={(event) => handleSeek(event.nativeEvent.locationX)}
            >
              <View
                style={[
                  styles.seekFill,
                  { width: `${Math.min(100, Math.max(0, (currentTime / (totalDuration || 1)) * 100))}%` },
                ]}
              />
            </View>
            <Text style={styles.clock}>{formatKaraokeClock(totalDuration)}</Text>
          </View>

          {playbackError ? <Text style={styles.playbackError}>{playbackError}</Text> : null}

          <View style={styles.stageProgress}>
            <Text style={styles.stageProgressText}>
              {song?.durationMs ? formatKaraokeClock((song.durationMs ?? 0) / 1000) : 'Chưa có thời lượng'}
            </Text>
            <Text style={styles.stageProgressText}>
              {song
                ? song.scoringAvailable
                  ? 'Hỗ trợ chấm điểm'
                  : 'Chưa có dữ liệu chấm điểm'
                : 'Chưa chọn bài'}
            </Text>
          </View>
        </View>

        <View style={styles.statusCard}>
          <Ionicons name="headset" size={26} color="#c4b5fd" />
          <View style={styles.statusCopy}>
            {scoreMessage ? <Text style={styles.scoreMessage}>{scoreMessage}</Text> : null}
            {scoreError ? <Text style={styles.scoreError}>{scoreError}</Text> : null}
            {song && !song.scoringAvailable ? (
              <Text style={styles.scoreMessage}>Bài này chưa có dữ liệu tham chiếu đủ tin cậy để chấm điểm.</Text>
            ) : null}
            {!scoreMessage && !scoreError && !(!song || !song.scoringAvailable) ? (
              <Text style={styles.statusHeading}>Sẵn sàng để cất giọng?</Text>
            ) : null}
          </View>
        </View>

        <KaraokeMicCheckCard disabled={isBusy || scoreState === 'recording'} />

        <View style={styles.catalogSection}>
          <Text style={styles.sectionKicker}>KHO BÀI ĐÃ CHUẨN BỊ</Text>
          <Text style={styles.sectionHeading}>Chọn bài hát để Karaoke</Text>
          <KaraokeTrackCatalog selectedSongId={song?.songId ?? null} onSelect={handleSelect} />
        </View>
      </ScrollView>

      <KaraokeScoreModal
        visible={scoreDialogOpen && overallScore !== null}
        onClose={() => setScoreDialogOpen(false)}
        overall={overallScore}
        songTitle={song?.title ?? null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    color: '#e5e7eb',
    fontSize: 13,
  },
  intro: {
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eyebrowLine: {
    width: 28,
    height: 1,
    backgroundColor: 'rgba(139, 92, 246, 0.6)',
  },
  eyebrow: {
    color: '#a78bfa',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
  },
  title: {
    color: '#f9fafb',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 13,
  },
  stage: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#383854',
    backgroundColor: '#14141f',
    padding: 16,
    gap: 14,
  },
  stageTopline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stageIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stageIdentityIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(139, 92, 246, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageIdentitySmall: {
    color: '#9ca3af',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  stageIdentityStrong: {
    color: '#f9fafb',
    fontSize: 12,
    fontWeight: '700',
  },
  stageRoom: {
    color: '#a78bfa',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  stageSong: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0c0c10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e1e28',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stageSongCopy: {
    flex: 1,
    gap: 1,
  },
  stageSongTitle: {
    color: '#f3f4f6',
    fontSize: 14,
    fontWeight: '600',
  },
  stageSongArtist: {
    color: '#9ca3af',
    fontSize: 11,
  },
  lyrics: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 150,
    gap: 12,
    paddingHorizontal: 8,
  },
  lyricActive: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(139, 92, 246, 0.55)',
    textShadowRadius: 14,
  },
  lyricPreviewSlot: {
    height: 22,
  },
  lyricPreview: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
  },
  lyricFaded: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
  },
  playbackControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#8b5cf6',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  playbackButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  clock: {
    color: '#9ca3af',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    minWidth: 34,
    textAlign: 'center',
  },
  seekTrack: {
    flex: 1,
    height: 20,
    borderRadius: 999,
    backgroundColor: '#262638',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  seekFill: {
    height: 4,
    borderRadius: 999,
    backgroundColor: '#8b5cf6',
  },
  playbackError: {
    color: '#f87171',
    fontSize: 12,
    textAlign: 'center',
  },
  stageProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stageProgressText: {
    color: '#9ca3af',
    fontSize: 11,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1f1f2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#383854',
    padding: 14,
  },
  statusCopy: {
    flex: 1,
    gap: 4,
  },
  statusHeading: {
    color: '#f9fafb',
    fontSize: 14,
    fontWeight: '700',
  },
  scoreMessage: {
    color: '#9ca3af',
    fontSize: 12,
  },
  scoreError: {
    color: '#f87171',
    fontSize: 12,
  },
  catalogSection: {
    gap: 10,
  },
  sectionKicker: {
    color: '#a78bfa',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  sectionHeading: {
    color: '#f9fafb',
    fontSize: 17,
    fontWeight: '700',
    marginTop: -4,
  },
});
