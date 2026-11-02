// Phòng hát Karaoke — port từ karaoke-room-page.tsx của web
// Mỗi máy tự phát instrumental, sync bằng server clock (EWMA offset, re-seek lệch >0.4s),
// realtime qua WebSocket, host điều khiển với optimistic concurrency (expectedVersion).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { usePlayer } from '@/context/PlayerContext';
import { KaraokeApi, KaraokeRoomApiError } from '@/services/api';
import { useKaraokeRoomLive } from '@/hooks/use-karaoke-room-live';
import { useKaraokeRoomScoring } from '@/hooks/use-karaoke-room-scoring';
import { useKaraokeVoice } from '@/hooks/use-karaoke-voice';
import { findLyricLineAtTime, parseSyncedLyrics } from '@/utils/karaoke-lyrics';
import { KaraokeTrackCatalog } from '@/components/karaoke/KaraokeTrackCatalog';
import { KaraokeScoreModal } from '@/components/karaoke/KaraokeScoreModal';
import type { KaraokeRoomDetail, KaraokeRoomQueueItem, KaraokeTrackSummary } from '@/types';

function clockLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function durationLabel(durationMs: number | null): string {
  if (!durationMs || durationMs < 0) return '--:--';
  return `${Math.floor(durationMs / 60000)}:${String(Math.floor(durationMs / 1000) % 60).padStart(2, '0')}`;
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể tải dữ liệu phòng.';
}

function isInviteError(error: unknown): boolean {
  return (
    error instanceof KaraokeRoomApiError &&
    (error.code === 'ROOM_INVITE_REQUIRED' || error.code === 'ROOM_INVITE_INVALID')
  );
}

function isClosedRoomError(error: unknown): boolean {
  return error instanceof KaraokeRoomApiError && (error.code === 'ROOM_CLOSED' || error.status === 410);
}

export default function KaraokeRoomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ roomId?: string }>();
  const { isPlaying: globalIsPlaying, togglePlayPause } = usePlayer();
  const numericRoomId = Number(Array.isArray(params.roomId) ? params.roomId[0] : params.roomId);

  const [room, setRoom] = useState<KaraokeRoomDetail | null>(null);
  const [snapshotAt, setSnapshotAt] = useState(0);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const snapshotGuardRef = useRef({
    roomId: numericRoomId,
    requestStartedAt: 0,
    playbackVersion: -1,
  });
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteRequired, setInviteRequired] = useState(false);
  const [roomClosed, setRoomClosed] = useState(false);
  const [inviteCodeCopied, setInviteCodeCopied] = useState(false);
  const [joined, setJoined] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<KaraokeTrackSummary | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [micEnabled, setMicEnabled] = useState(false);
  const [groupScoreOpen, setGroupScoreOpen] = useState(false);
  const lastOpenedScoreSessionRef = useRef('');
  const roomClosedRedirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nhạc nền phòng phát trên player riêng — sync theo server, không qua PlayerContext
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const currentSourceRef = useRef<string | null>(null);

  useEffect(() => {
    if (globalIsPlaying) togglePlayPause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToRooms = useCallback(() => {
    if (roomClosedRedirectTimerRef.current !== null) {
      clearTimeout(roomClosedRedirectTimerRef.current);
      roomClosedRedirectTimerRef.current = null;
    }
    router.replace('/karaoke/rooms');
  }, [router]);

  const handleRoomClosed = useCallback(() => {
    setRoomClosed(true);
    setJoined(false);
    setInviteRequired(false);
    setBusy(false);
    setLoading(false);
    if (roomClosedRedirectTimerRef.current !== null) {
      clearTimeout(roomClosedRedirectTimerRef.current);
    }
    roomClosedRedirectTimerRef.current = setTimeout(goToRooms, 3500);
  }, [goToRooms]);

  useEffect(
    () => () => {
      if (roomClosedRedirectTimerRef.current !== null) {
        clearTimeout(roomClosedRedirectTimerRef.current);
      }
    },
    []
  );

  const applyRoomSnapshot = useCallback(
    (snapshot: KaraokeRoomDetail, requestStartedAt = Date.now()) => {
      const receivedAt = Date.now();
      const guard = snapshotGuardRef.current;
      if (guard.roomId !== numericRoomId) {
        guard.roomId = numericRoomId;
        guard.requestStartedAt = 0;
        guard.playbackVersion = -1;
      }
      if (requestStartedAt < guard.requestStartedAt || snapshot.playback.version < guard.playbackVersion) return;
      guard.requestStartedAt = requestStartedAt;
      guard.playbackVersion = snapshot.playback.version;
      setRoom(snapshot);
      setSnapshotAt(receivedAt);
      const serverTimeMs = snapshot.playback?.serverTimeMs;
      if (typeof serverTimeMs === 'number' && Number.isFinite(serverTimeMs) && serverTimeMs > 0) {
        const midpoint = (requestStartedAt + receivedAt) / 2;
        const offsetSample = serverTimeMs - midpoint;
        // EWMA: lần đầu lấy thẳng, sau làm mượt 75/25 như web
        setServerOffsetMs((previous) => (previous === 0 ? offsetSample : previous * 0.75 + offsetSample * 0.25));
      }
    },
    [numericRoomId]
  );

  const refreshRoom = useCallback(
    async (silent = false) => {
      if (!Number.isSafeInteger(numericRoomId) || numericRoomId <= 0) {
        setPageError('Đường dẫn phòng không hợp lệ.');
        setLoading(false);
        return false;
      }
      try {
        const requestStartedAt = Date.now();
        const snapshot = await KaraokeApi.getRoom(numericRoomId);
        applyRoomSnapshot(snapshot, requestStartedAt);
        setPageError('');
        return true;
      } catch (error) {
        if (isClosedRoomError(error)) {
          handleRoomClosed();
          return false;
        }
        if (!silent) setPageError(messageFor(error));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [applyRoomSnapshot, handleRoomClosed, numericRoomId]
  );

  const enterRoom = useCallback(
    async (code?: string) => {
      if (!Number.isSafeInteger(numericRoomId) || numericRoomId <= 0) {
        setPageError('Đường dẫn phòng không hợp lệ.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setPageError('');
      setInviteError('');
      try {
        const requestStartedAt = Date.now();
        const snapshot = await KaraokeApi.joinRoom(numericRoomId, code);
        applyRoomSnapshot(snapshot, requestStartedAt);
        setJoined(true);
        setInviteRequired(false);
        setInviteCode(code ?? '');
      } catch (error) {
        if (isInviteError(error)) {
          setInviteRequired(true);
          setInviteError(error instanceof Error ? error.message : 'Nhập mã mời để vào phòng riêng.');
        } else if (isClosedRoomError(error)) {
          handleRoomClosed();
        } else {
          setPageError(messageFor(error));
        }
        setJoined(false);
      } finally {
        setLoading(false);
      }
    },
    [applyRoomSnapshot, handleRoomClosed, numericRoomId]
  );

  useEffect(() => {
    const timeout = setTimeout(() => void enterRoom(), 0);
    return () => clearTimeout(timeout);
  }, [enterRoom]);

  const beforeSocketConnect = useCallback(async () => {
    const requestStartedAt = Date.now();
    const snapshot = await KaraokeApi.joinRoom(numericRoomId, inviteCode || undefined);
    applyRoomSnapshot(snapshot, requestStartedAt);
  }, [applyRoomSnapshot, inviteCode, numericRoomId]);

  const onRealtimeEvent = useCallback(
    (event: { type: string }) => {
      if (event.type === 'room.closed') {
        handleRoomClosed();
        return true;
      }
      void refreshRoom();
      return false;
    },
    [handleRoomClosed, refreshRoom]
  );

  const onSubscribed = useCallback(() => {
    setConnectionError('');
    void refreshRoom();
  }, [refreshRoom]);

  const onRealtimeError = useCallback(
    (error: Error) => {
      if (isClosedRoomError(error)) {
        handleRoomClosed();
        return;
      }
      if (error.message.includes('ROOM_INVITE_REQUIRED') || error.message.includes('ROOM_INVITE_INVALID')) {
        setJoined(false);
        setInviteRequired(true);
        setInviteError(error.message);
        return;
      }
      setConnectionError('Đang thử kết nối lại để cập nhật phòng.');
    },
    [handleRoomClosed]
  );

  const { connected } = useKaraokeRoomLive({
    scope: 'room',
    roomId: numericRoomId,
    enabled: joined && !inviteRequired && !pageError,
    beforeConnect: beforeSocketConnect,
    onEvent: onRealtimeEvent,
    onSubscribed,
    onError: onRealtimeError,
  });

  // Fallback polling 1s khi realtime chưa connect
  useEffect(() => {
    if (!joined || inviteRequired || connected) return;
    let requestInFlight = false;
    const syncRoom = () => {
      if (requestInFlight) return;
      requestInFlight = true;
      void refreshRoom(true).finally(() => {
        requestInFlight = false;
      });
    };
    const timer = setInterval(syncRoom, 1000);
    return () => clearInterval(timer);
  }, [connected, inviteRequired, joined, refreshRoom]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const playback = room?.playback;
  const currentTrack = playback?.track;
  const playingElapsedMs =
    playback?.status !== 'PLAYING'
      ? 0
      : playback.serverTimeMs > 0
        ? Math.max(0, clockNow + serverOffsetMs - playback.serverTimeMs)
        : Math.max(0, clockNow - snapshotAt);
  const currentPositionMs = playback ? playback.positionMs + playingElapsedMs : 0;

  // Voice chat mediasoup — kết nối ngay khi đã vào phòng
  const voice = useKaraokeVoice(numericRoomId, joined && !inviteRequired && !pageError);
  const { setRemoteVoiceMuted, remoteVoices } = voice;
  const [mutedMembers, setMutedMembers] = useState<Record<number, boolean>>({});
  useEffect(() => {
    for (const [userIdStr, muted] of Object.entries(mutedMembers)) {
      setRemoteVoiceMuted(userIdStr, muted);
    }
  }, [mutedMembers, remoteVoices, setRemoteVoiceMuted]);

  const roomScoring = useKaraokeRoomScoring({
    roomId: numericRoomId,
    playbackRunId: playback?.playbackRunId ?? null,
    songId: currentTrack?.trackId ?? null,
    songTitle: currentTrack?.title ?? null,
    durationMs: currentTrack?.durationMs ?? null,
    playbackStatus: playback?.status ?? 'IDLE',
    positionMs: currentPositionMs,
    micEnabled,
    enabled: joined && !inviteRequired && !pageError,
  });

  useEffect(() => {
    if (roomScoring.score === null || !roomScoring.scoreSessionId) return;
    if (lastOpenedScoreSessionRef.current === roomScoring.scoreSessionId) return;
    lastOpenedScoreSessionRef.current = roomScoring.scoreSessionId;
    setGroupScoreOpen(true);
  }, [roomScoring.score, roomScoring.scoreSessionId]);

  // Đồng bộ nhạc nền với trạng thái phòng: đổi src, re-seek nếu lệch >0.4s, play/pause
  useEffect(() => {
    const url = currentTrack?.instrumentalUrl;
    if (!url || !playback) {
      player.pause();
      currentSourceRef.current = null;
      return;
    }
    if (currentSourceRef.current !== url) {
      currentSourceRef.current = url;
      player.replace({ uri: url });
    }
    const targetSeconds = Math.max(0, currentPositionMs / 1000);
    const bounded =
      Number.isFinite(status.duration) && status.duration > 0
        ? Math.min(targetSeconds, Math.max(0, status.duration - 0.15))
        : targetSeconds;
    if (Math.abs(status.currentTime - bounded) > 0.4) {
      void player.seekTo(bounded).catch(() => undefined);
    }
    if (playback.status === 'PLAYING') {
      if (!status.playing) player.play();
    } else if (status.playing) {
      player.pause();
    }
  }, [currentPositionMs, currentTrack?.instrumentalUrl, playback, player, status]);

  // Hết bài bản địa → báo scoring finish (host/backend sẽ chuyển bài kế)
  useEffect(() => {
    const subscription = player.addListener('playbackStatusUpdate', (update) => {
      if (update.didJustFinish) {
        roomScoring.trackEnded();
      }
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  const lyricCues = useMemo(() => parseSyncedLyrics(currentTrack?.lyricsSynced), [currentTrack?.lyricsSynced]);
  const activeLyricIndex = findLyricLineAtTime(lyricCues, currentPositionMs / 1000);
  const prevLyric = activeLyricIndex > 0 ? lyricCues[activeLyricIndex - 1] : null;
  const activeLyric = activeLyricIndex >= 0 ? lyricCues[activeLyricIndex] : null;
  const nextLyric = activeLyricIndex >= 0 ? lyricCues[activeLyricIndex + 1] : lyricCues[0] ?? null;

  const myQueueItem = room?.queue.find((item) => item.requestedByMe);

  const addRequest = async () => {
    if (!selectedTrack || busy) return;
    setBusy(true);
    try {
      await KaraokeApi.addQueueItem(numericRoomId, selectedTrack.songId);
      setIsRequestOpen(false);
      setSelectedTrack(null);
      setNotice('Đã thêm bài vào hàng đợi. Chủ phòng có thể bắt đầu phát trên sân khấu.');
      await refreshRoom();
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  const removeRequest = async (item: KaraokeRoomQueueItem) => {
    if (busy) return;
    setBusy(true);
    try {
      await KaraokeApi.removeQueueItem(numericRoomId, item.id);
      setNotice('Đã rút bài hát khỏi hàng đợi.');
      await refreshRoom();
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  const leaveRoom = async () => {
    setBusy(true);
    try {
      await KaraokeApi.leaveRoom(numericRoomId);
      router.replace('/karaoke/rooms');
    } catch (error) {
      setNotice(messageFor(error));
      setBusy(false);
    }
  };

  const closeRoom = async () => {
    if (!room?.canManage || busy) return;
    Alert.alert('Đóng phòng', 'Đóng phòng này? Thành viên sẽ bị đưa ra khỏi phòng.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đóng',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await KaraokeApi.closeRoom(numericRoomId);
            handleRoomClosed();
          } catch (error) {
            setNotice(messageFor(error));
            setBusy(false);
          }
        },
      },
    ]);
  };

  const copyRoomInviteCode = async () => {
    if (!room?.inviteCode) return;
    try {
      Clipboard.setString(room.inviteCode);
      setInviteCodeCopied(true);
      setTimeout(() => setInviteCodeCopied(false), 1800);
    } catch {
      setNotice('Không thể sao chép mã mời. Hãy ghi lại mã thủ công.');
    }
  };

  const playbackCommand = async (command: 'start' | 'pause' | 'resume' | 'skip') => {
    if (!room || busy) return;
    setBusy(true);
    try {
      const requestStartedAt = Date.now();
      const snapshot = await KaraokeApi.controlPlayback(numericRoomId, command, room.playback.version);
      applyRoomSnapshot(snapshot, requestStartedAt);
      setNotice(command === 'skip' ? 'Đã chuyển sang bài tiếp theo.' : 'Đã cập nhật trạng thái sân khấu.');
    } catch (error) {
      if (error instanceof KaraokeRoomApiError && error.status === 409) {
        await refreshRoom();
        setNotice(
          error.code === 'PLAYBACK_VERSION_CONFLICT'
            ? 'Phòng vừa có thao tác khác. Đã tải trạng thái mới; hãy thử lại.'
            : messageFor(error)
        );
      } else {
        setNotice(messageFor(error));
      }
    } finally {
      setBusy(false);
    }
  };

  const submitInvite = async () => {
    const trimmed = inviteCode.trim();
    if (!trimmed) return;
    await enterRoom(trimmed);
  };

  if (roomClosed) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <View style={styles.closedIcon}>
            <Ionicons name="log-out" size={25} color="#c4b5fd" />
          </View>
          <Text style={styles.closedKicker}>PHÒNG KARAOKE</Text>
          <Text style={styles.closedTitle}>Phòng đã đóng</Text>
          <Text style={styles.closedBody}>
            Chủ phòng đã đóng phòng này. Bạn sẽ được đưa về danh sách phòng trong giây lát.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={goToRooms}>
            <Text style={styles.primaryButtonText}>Về danh sách phòng</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !room && !inviteRequired) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color="#8b5cf6" />
          <Text style={styles.messageBody}>Đang kết nối vào phòng…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (inviteRequired) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color="#e5e7eb" />
            <Text style={styles.backText}>Quay lại danh sách phòng</Text>
          </TouchableOpacity>
          <View style={styles.invitePanel}>
            <View style={styles.invitePanelIcon}>
              <Ionicons name="lock-closed" size={20} color="#fbbf24" />
            </View>
            <Text style={styles.closedKicker}>PHÒNG RIÊNG</Text>
            <Text style={styles.closedTitle}>Nhập mã mời</Text>
            <Text style={styles.closedBody}>Phòng này chỉ dành cho người có mã mời.</Text>
            <TextInput
              style={styles.textInput}
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="Mã mời"
              placeholderTextColor="#6b7280"
              autoCapitalize="characters"
            />
            {inviteError ? <Text style={styles.formError}>{inviteError}</Text> : null}
            {pageError ? <Text style={styles.formError}>{pageError}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryButton, !inviteCode.trim() && styles.primaryButtonDisabled]}
              disabled={loading || !inviteCode.trim()}
              onPress={() => void submitInvite()}
            >
              <Text style={styles.primaryButtonText}>{loading ? 'Đang xác thực…' : 'Vào phòng'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (pageError || !room) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color="#e5e7eb" />
            <Text style={styles.backText}>Quay lại danh sách phòng</Text>
          </TouchableOpacity>
          <View style={styles.messageCard}>
            <Text style={styles.messageTitle}>Không thể mở phòng</Text>
            <Text style={styles.messageBody}>{pageError || 'Phòng không tồn tại.'}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const canStart = playback?.status === 'IDLE' && Boolean(room.queue.length);
  const isPlaying = playback?.status === 'PLAYING';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color="#e5e7eb" />
            <Text style={styles.backText}>Danh sách phòng</Text>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            {room.canManage ? (
              <TouchableOpacity style={styles.ghostButton} disabled={busy} onPress={() => void closeRoom()}>
                <Text style={styles.ghostButtonText}>Đóng phòng</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.ghostButton} disabled={busy} onPress={() => void leaveRoom()}>
              <Ionicons name="log-out" size={13} color="#e5e7eb" />
              <Text style={styles.ghostButtonText}>Rời phòng</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.intro}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowLine} />
            <Text style={styles.eyebrow}>MOODIFY KARAOKE</Text>
            <View style={styles.eyebrowLine} />
          </View>
          <Text style={styles.title} numberOfLines={2}>{room.name}</Text>
          <Text style={styles.connectionText}>
            {connectionError ||
              (connected ? 'Dữ liệu đang đồng bộ trực tiếp' : 'Đang kết nối…')}
          </Text>
        </View>

        {notice ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {room.visibility === 'PRIVATE' && room.canManage && room.inviteCode ? (
          <View style={styles.inviteCard}>
            <Ionicons name="lock-closed" size={16} color="#fbbf24" />
            <View style={styles.inviteCopy}>
              <Text style={styles.sectionKicker}>MÃ MỜI PHÒNG RIÊNG</Text>
              <Text style={styles.inviteCodeInline}>{room.inviteCode}</Text>
            </View>
            <TouchableOpacity style={styles.ghostButton} onPress={() => void copyRoomInviteCode()}>
              <Text style={styles.ghostButtonText}>{inviteCodeCopied ? 'Đã copy!' : 'Copy'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Sân khấu */}
        <View style={styles.stage}>
          <View style={styles.stageTopline}>
            <View style={styles.stageIdentity}>
              <View style={styles.stageIdentityIcon}>
                <Ionicons name="musical-notes" size={16} color="#c4b5fd" />
              </View>
              <View>
                <Text style={styles.stageIdentitySmall}>SÂN KHẤU</Text>
                <Text style={styles.stageIdentityStrong}>
                  {playback?.status === 'PLAYING'
                    ? 'Đang phát'
                    : playback?.status === 'PAUSED'
                      ? 'Tạm dừng'
                      : 'Chờ bài hát'}
                </Text>
              </View>
            </View>
            <Text style={styles.stageRoom}>{room.members.length}/{room.maxMembers} NGƯỜI</Text>
          </View>

          <View style={styles.stageSong}>
            <Ionicons name="musical-note" size={15} color="#9ca3af" />
            <View style={styles.stageSongCopy}>
              <Text style={styles.stageSongTitle} numberOfLines={1}>
                {currentTrack?.title ?? 'Chưa có bài hát nào'}
              </Text>
              <Text style={styles.stageSongArtist} numberOfLines={1}>
                {currentTrack?.artist ?? 'Đăng ký bài để bắt đầu buổi hát'}
              </Text>
            </View>
            {currentTrack ? (
              <Text style={styles.stageDuration}>{durationLabel(currentTrack.durationMs)}</Text>
            ) : null}
          </View>

          <View style={styles.lyrics}>
            <Text style={styles.lyricPrev} numberOfLines={1}>
              {prevLyric?.text ?? ' '}
            </Text>
            <Text style={styles.lyricActive} numberOfLines={2}>
              {activeLyric?.text ??
                (isPlaying ? 'Sắp đến câu đầu tiên…' : 'Chủ phòng chưa bắt đầu phát.')}
            </Text>
            <Text style={styles.lyricNext} numberOfLines={1}>
              {nextLyric?.text ?? ' '}
            </Text>
          </View>

          <View style={styles.progressRow}>
            <Text style={styles.clock}>{clockLabel(currentPositionMs)}</Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(
                      100,
                      Math.max(0, (currentPositionMs / Math.max(1, currentTrack?.durationMs ?? 1)) * 100)
                    )}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.clock}>{clockLabel(currentTrack?.durationMs ?? 0)}</Text>
          </View>

          {room.canManage ? (
            <View style={styles.hostControls}>
              {canStart ? (
                <TouchableOpacity style={styles.hostButton} disabled={busy} onPress={() => void playbackCommand('start')}>
                  <Ionicons name="play" size={15} color="#ffffff" />
                  <Text style={styles.hostButtonText}>Bắt đầu</Text>
                </TouchableOpacity>
              ) : isPlaying ? (
                <TouchableOpacity style={styles.hostButton} disabled={busy} onPress={() => void playbackCommand('pause')}>
                  <Ionicons name="pause" size={15} color="#ffffff" />
                  <Text style={styles.hostButtonText}>Tạm dừng</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.hostButton, !currentTrack && styles.primaryButtonDisabled]}
                  disabled={busy || !currentTrack}
                  onPress={() => void playbackCommand('resume')}
                >
                  <Ionicons name="play" size={15} color="#ffffff" />
                  <Text style={styles.hostButtonText}>Tiếp tục</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.hostButtonGhost, !currentTrack && styles.primaryButtonDisabled]}
                disabled={busy || !currentTrack}
                onPress={() => void playbackCommand('skip')}
              >
                <Ionicons name="play-skip-forward" size={15} color="#e5e7eb" />
                <Text style={styles.hostButtonGhostText}>Bài kế</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.stageHint}>Chỉ chủ phòng điều khiển sân khấu.</Text>
          )}
        </View>

        {/* Thu giọng: voice chat + điểm nhóm */}
        <TouchableOpacity
          style={[styles.micToggleCard, micEnabled && styles.micToggleCardActive]}
          activeOpacity={0.8}
          onPress={() => {
            const next = !micEnabled;
            setMicEnabled(next);
            if (next) void voice.toggleMicrophone();
            else if (voice.microphoneOn) void voice.toggleMicrophone();
          }}
        >
          <Ionicons name={micEnabled ? 'mic' : 'mic-off'} size={20} color={micEnabled ? '#10b981' : '#9ca3af'} />
          <View style={styles.micToggleCopy}>
            <Text style={styles.micToggleTitle}>
              {micEnabled ? 'Đang bật micro của bạn' : 'Bật micro (voice + điểm nhóm)'}
            </Text>
            <Text style={styles.micToggleSubtitle}>
              {voice.voiceError
                ? voice.voiceError
                : roomScoring.capturing
                  ? 'Đang ghi pitch…'
                  : roomScoring.scoringStatus === 'collecting'
                    ? 'Phiên chấm đang thu dữ liệu cả phòng'
                    : micEnabled
                      ? 'Người khác nghe được bạn; giọng bạn cũng được chấm điểm'
                      : 'Bật để nói chuyện và được tính vào điểm chung'}
            </Text>
          </View>
          <View style={[styles.toggleDot, micEnabled && styles.toggleDotActive]} />
        </TouchableOpacity>
        {roomScoring.scoreError ? <Text style={styles.formError}>{roomScoring.scoreError}</Text> : null}

        {/* Hàng đợi */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <View>
              <Text style={styles.sectionKicker}>HÀNG ĐỢI</Text>
              <Text style={styles.sectionHeading}>Đăng ký lượt hát</Text>
            </View>
            <TouchableOpacity
              style={styles.primaryButtonSmall}
              activeOpacity={0.8}
              onPress={() => {
                setSelectedTrack(null);
                setIsRequestOpen(true);
              }}
            >
              <Ionicons name="add" size={14} color="#ffffff" />
              <Text style={styles.primaryButtonSmallText}>Đăng ký</Text>
            </TouchableOpacity>
          </View>
          {room.queue.length ? (
            <View style={styles.queueList}>
              {room.queue.map((item, index) => (
                <View key={item.id} style={styles.queueItem}>
                  <Text style={styles.queueIndex}>{String(index + 1).padStart(2, '0')}</Text>
                  <View style={styles.queueCopy}>
                    <Text style={styles.queueTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.queueArtist} numberOfLines={1}>
                      {item.artist} · {item.requestedBy}
                      {item.requestedByMe ? ' (bạn)' : ''}
                    </Text>
                  </View>
                  <Text style={styles.queueDuration}>{durationLabel(item.durationMs)}</Text>
                  {item.requestedByMe || room.canManage ? (
                    <TouchableOpacity onPress={() => void removeRequest(item)} hitSlop={8}>
                      <Ionicons name="close" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.queueEmpty}>Chưa có bài nào trong hàng đợi.</Text>
          )}
          {myQueueItem ? (
            <Text style={styles.queueHint}>Bạn đã đăng ký 1 bài — hàng đợi chơi theo thứ tự.</Text>
          ) : null}
        </View>

        {/* Thành viên */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <View>
              <Text style={styles.sectionKicker}>THÀNH VIÊN</Text>
              <Text style={styles.sectionHeading}>Trong phòng</Text>
            </View>
            <Text style={styles.sectionCount}>{room.members.length}/{room.maxMembers}</Text>
          </View>
          <View style={styles.memberList}>
            {room.members.map((member) => {
              const isSpeaking = voice.speakingUserIds.includes(String(member.userId));
              const muted = mutedMembers[member.userId] ?? false;
              const hasVoice = remoteVoices.some((v) => v.userId === String(member.userId));
              return (
                <View key={member.userId} style={styles.memberItem}>
                  <View style={[styles.memberAvatar, isSpeaking && styles.memberAvatarSpeaking]}>
                    <Text style={styles.memberAvatarText}>
                      {member.name.trim().slice(0, 2).toUpperCase() || '?'}
                    </Text>
                  </View>
                  <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
                  {member.host ? (
                    <View style={styles.hostBadge}>
                      <Text style={styles.hostBadgeText}>CHỦ PHÒNG</Text>
                    </View>
                  ) : null}
                  {hasVoice ? (
                    <TouchableOpacity
                      onPress={() => setMutedMembers((current) => ({ ...current, [member.userId]: !muted }))}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={muted ? 'volume-mute' : 'volume-high'}
                        size={17}
                        color={muted ? '#6b7280' : '#10b981'}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Modal đăng ký bài */}
      <Modal visible={isRequestOpen} animationType="slide" onRequestClose={() => setIsRequestOpen(false)}>
        <SafeAreaView style={styles.modalScreen} edges={['top']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Đăng ký lượt hát</Text>
            <TouchableOpacity onPress={() => setIsRequestOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color="#e5e7eb" />
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>
            <KaraokeTrackCatalog
              selectedSongId={selectedTrack?.songId ?? null}
              onSelect={(track) => setSelectedTrack(track)}
            />
            <TouchableOpacity
              style={[styles.primaryButton, (!selectedTrack || busy) && styles.primaryButtonDisabled]}
              disabled={!selectedTrack || busy}
              onPress={() => void addRequest()}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {selectedTrack ? `Đăng ký "${selectedTrack.title}"` : 'Chọn một bài hát'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <KaraokeScoreModal
        visible={groupScoreOpen && roomScoring.score !== null}
        onClose={() => setGroupScoreOpen(false)}
        overall={roomScoring.score}
        songTitle={roomScoring.scoreSongTitle}
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
    gap: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  backText: {
    color: '#e5e7eb',
    fontSize: 13,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  ghostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#383854',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  ghostButtonText: {
    color: '#e5e7eb',
    fontSize: 11,
    fontWeight: '600',
  },
  intro: {
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
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
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  connectionText: {
    color: '#6b7280',
    fontSize: 11,
  },
  memberAvatarSpeaking: {
    borderWidth: 2,
    borderColor: '#10b981',
  },
  noticeCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  noticeText: {
    color: '#c4b5fd',
    fontSize: 12,
    textAlign: 'center',
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(251, 191, 36, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
    borderRadius: 14,
    padding: 12,
  },
  inviteCopy: {
    flex: 1,
    gap: 2,
  },
  inviteCodeInline: {
    color: '#fbbf24',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 3,
  },
  stage: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#383854',
    backgroundColor: '#14141f',
    padding: 16,
    gap: 12,
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
    letterSpacing: 1.5,
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
  stageDuration: {
    color: '#9ca3af',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  stageHint: {
    color: '#6b7280',
    fontSize: 11,
    textAlign: 'center',
  },
  lyrics: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    gap: 10,
    paddingHorizontal: 6,
  },
  lyricPrev: {
    color: '#4b5563',
    fontSize: 12,
  },
  lyricActive: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(139, 92, 246, 0.55)',
    textShadowRadius: 14,
  },
  lyricNext: {
    color: '#6b7280',
    fontSize: 13,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clock: {
    color: '#9ca3af',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    minWidth: 34,
    textAlign: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#262638',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#8b5cf6',
  },
  hostControls: {
    flexDirection: 'row',
    gap: 10,
  },
  hostButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    paddingVertical: 10,
  },
  hostButtonGhost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#383854',
    borderRadius: 10,
    paddingVertical: 10,
  },
  hostButtonGhostText: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '700',
  },
  hostButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  micToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1f1f2e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#383854',
    padding: 12,
  },
  micToggleCardActive: {
    borderColor: 'rgba(16, 185, 129, 0.5)',
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
  },
  micToggleCopy: {
    flex: 1,
    gap: 2,
  },
  micToggleTitle: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '600',
  },
  micToggleSubtitle: {
    color: '#9ca3af',
    fontSize: 11,
  },
  toggleDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#4b5563',
  },
  toggleDotActive: {
    borderColor: '#10b981',
    backgroundColor: '#10b981',
  },
  sectionCard: {
    backgroundColor: '#1f1f2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#383854',
    padding: 14,
    gap: 10,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionKicker: {
    color: '#a78bfa',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  sectionHeading: {
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '700',
  },
  sectionCount: {
    color: '#9ca3af',
    fontSize: 12,
  },
  primaryButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#8b5cf6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  primaryButtonSmallText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  queueList: {
    gap: 8,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0c0c10',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e1e28',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  queueIndex: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '700',
  },
  queueCopy: {
    flex: 1,
    gap: 1,
  },
  queueTitle: {
    color: '#f3f4f6',
    fontSize: 13,
    fontWeight: '600',
  },
  queueArtist: {
    color: '#9ca3af',
    fontSize: 11,
  },
  queueDuration: {
    color: '#9ca3af',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  queueEmpty: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 8,
  },
  queueHint: {
    color: '#9ca3af',
    fontSize: 11,
  },
  memberList: {
    gap: 8,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    color: '#c4b5fd',
    fontSize: 11,
    fontWeight: '700',
  },
  memberName: {
    flex: 1,
    color: '#e5e7eb',
    fontSize: 13,
  },
  hostBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.45)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hostBadgeText: {
    color: '#c4b5fd',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  modalScreen: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  modalTitle: {
    color: '#f9fafb',
    fontSize: 17,
    fontWeight: '700',
  },
  modalBody: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  invitePanel: {
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1f1f2e',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#383854',
    padding: 20,
    marginTop: 24,
    alignSelf: 'stretch',
  },
  invitePanelIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    alignSelf: 'stretch',
    backgroundColor: '#0c0c10',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#383854',
    color: '#f3f4f6',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    textAlign: 'center',
  },
  formError: {
    color: '#f87171',
    fontSize: 12,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 24,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  messageCard: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1f1f2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#383854',
    paddingVertical: 28,
    paddingHorizontal: 16,
    marginTop: 24,
  },
  messageTitle: {
    color: '#f9fafb',
    fontSize: 14,
    fontWeight: '700',
  },
  messageBody: {
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center',
  },
  closedIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedKicker: {
    color: '#a78bfa',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  closedTitle: {
    color: '#f9fafb',
    fontSize: 22,
    fontWeight: '800',
  },
  closedBody: {
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center',
  },
});
