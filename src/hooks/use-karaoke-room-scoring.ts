// Điểm nhóm cho phòng Karaoke — port từ use-karaoke-room-scoring.ts của web
// Khác web: web capture pitch từ stream mic của voice chat bằng AudioWorklet;
// mobile dùng native module KaraokePitch (chỉ chạy 1 capture tại một thời điểm —
// trùng với ràng buộc activeCapture đơn của web).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KaraokeApi,
} from '../services/api';
import {
  PitchCaptureError,
  abortPitchCapture,
  finishPitchCapture,
  startPitchCapture,
} from '../services/karaoke-pitch-capture';
import type { KaraokeRoomPitchSegment, KaraokeRoomScoreSession } from '../types';

type RoomRun = {
  roomId: number;
  runId: string;
  songId: string;
  durationMs: number;
  sessionPromise: Promise<KaraokeRoomScoreSession>;
  participantPromise: Promise<KaraokeRoomScoreSession> | null;
  activeCapture: boolean;
  captureStarting: boolean;
  offsetMs: number;
  segments: KaraokeRoomPitchSegment[];
  lastPositionMs: number;
  closed: boolean;
  finishing: boolean;
};

function scoreFromSession(session: KaraokeRoomScoreSession | null): number | null {
  const value = session?.score?.score?.overall;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function useKaraokeRoomScoring(input: {
  roomId: number;
  playbackRunId: string | null;
  songId: string | null;
  songTitle: string | null;
  durationMs: number | null;
  playbackStatus: 'IDLE' | 'PLAYING' | 'PAUSED';
  positionMs: number;
  micEnabled: boolean;
  enabled: boolean;
}) {
  const runRef = useRef<RoomRun | null>(null);
  const micEnabledRef = useRef(input.micEnabled);
  const playbackStatusRef = useRef(input.playbackStatus);
  const watchedTitlesRef = useRef(new Map<string, string>());
  const watchedStatusesRef = useRef(new Map<string, KaraokeRoomScoreSession['status']>());
  const [watchedSessionIds, setWatchedSessionIds] = useState<string[]>([]);
  const [scoringStatus, setScoringStatus] = useState<KaraokeRoomScoreSession['status'] | 'idle'>('idle');
  const [score, setScore] = useState<number | null>(null);
  const [scoreSessionId, setScoreSessionId] = useState('');
  const [scoreSongTitle, setScoreSongTitle] = useState('');
  const [scoreError, setScoreError] = useState('');
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    micEnabledRef.current = input.micEnabled;
    playbackStatusRef.current = input.playbackStatus;
  }, [input.micEnabled, input.playbackStatus]);

  const stopCapture = useCallback(async (run: RoomRun, discard = false) => {
    if (!run.activeCapture) return;
    run.activeCapture = false;
    setCapturing(false);

    if (discard) {
      abortPitchCapture();
      return;
    }

    try {
      const features = await finishPitchCapture(0);
      if (features.duration_seconds > 0.05) {
        run.segments.push({ offset_ms: run.offsetMs, features });
        void run.sessionPromise.then(async (session) => {
          if (session.status !== 'collecting' || run.segments.length === 0) return;
          run.participantPromise ??= KaraokeApi.registerRoomScoreParticipant(run.roomId, session.sessionId);
          await run.participantPromise;
          await KaraokeApi.submitRoomContribution({
            roomId: run.roomId,
            sessionId: session.sessionId,
            segments: run.segments,
          });
        }).catch(() => undefined);
      }
    } catch (error) {
      if (error instanceof PitchCaptureError && error.message === 'Đã hủy bản thu.') return;
      setScoreError(error instanceof Error ? error.message : 'Không thể chốt phần giọng hát.');
    }
  }, []);

  const discardRun = useCallback((run: RoomRun) => {
    run.closed = true;
    if (!run.activeCapture) return;
    run.activeCapture = false;
    setCapturing(false);
    abortPitchCapture();
  }, []);

  const finishRun = useCallback(async (run: RoomRun) => {
    if (run.finishing || run.closed) return;
    run.finishing = true;
    await stopCapture(run);
    try {
      const session = await run.sessionPromise;
      if (session.status === 'collecting') {
        if (run.segments.length) {
          await (run.participantPromise ?? KaraokeApi.registerRoomScoreParticipant(run.roomId, session.sessionId));
          await KaraokeApi.submitRoomContribution({
            roomId: run.roomId,
            sessionId: session.sessionId,
            segments: run.segments,
          });
        }
        const finished = await KaraokeApi.finishRoomScoreSession(run.roomId, session.sessionId);
        setScoringStatus(finished.status);
        const overall = scoreFromSession(finished);
        if (overall !== null) {
          setScore(overall);
          setScoreSessionId(finished.sessionId);
          setScoreSongTitle(input.songTitle ?? 'Bài hát trong phòng');
        }
      } else {
        setScoringStatus(session.status);
        const overall = scoreFromSession(session);
        if (overall !== null) {
          setScore(overall);
          setScoreSessionId(session.sessionId);
          setScoreSongTitle(input.songTitle ?? 'Bài hát trong phòng');
        }
      }
    } catch (error) {
      setScoreError(error instanceof Error ? error.message : 'Không thể gửi dữ liệu chấm điểm cho phòng.');
    } finally {
      run.closed = true;
    }
  }, [input.songTitle, stopCapture]);

  // Mở phiên điểm mới cho mỗi playbackRunId; run cũ được finish (gần hết bài) hoặc discard
  useEffect(() => {
    if (!input.enabled || !input.playbackRunId || !input.songId || !input.durationMs) return;
    const active = runRef.current;
    if (active?.runId === input.playbackRunId && active.songId === input.songId) return;

    if (active) {
      if (active.lastPositionMs >= active.durationMs - 700) void finishRun(active);
      else discardRun(active);
    }

    setScoreError('');
    const next: RoomRun = {
      roomId: input.roomId,
      runId: input.playbackRunId,
      songId: input.songId,
      durationMs: input.durationMs,
      sessionPromise: KaraokeApi.startRoomScoreSession(input.roomId),
      participantPromise: null,
      activeCapture: false,
      captureStarting: false,
      offsetMs: 0,
      segments: [],
      lastPositionMs: 0,
      closed: false,
      finishing: false,
    };
    runRef.current = next;
    setScoringStatus('collecting');
    void next.sessionPromise.then((session) => {
      watchedTitlesRef.current.set(session.sessionId, input.songTitle ?? 'Bài hát trong phòng');
      watchedStatusesRef.current.set(session.sessionId, session.status);
      setWatchedSessionIds((current) => (current.includes(session.sessionId) ? current : [...current, session.sessionId]));
      setScoringStatus(session.status);
      const overall = scoreFromSession(session);
      if (overall !== null) {
        setScore(overall);
        setScoreSessionId(session.sessionId);
        setScoreSongTitle(input.songTitle ?? 'Bài hát trong phòng');
      }
    }).catch((error: unknown) => {
      setScoreError(error instanceof Error ? error.message : 'Không thể mở phiên chấm điểm cho phòng.');
      setScoringStatus('failed');
    });

    return () => {
      if (runRef.current !== next) return;
      if (next.lastPositionMs >= next.durationMs - 700) void finishRun(next);
      else discardRun(next);
      runRef.current = null;
    };
  }, [discardRun, finishRun, input.durationMs, input.enabled, input.playbackRunId, input.roomId, input.songId, input.songTitle]);

  // Theo tick vị trí phát: bắt/ dừng capture segment và finish khi gần hết bài
  useEffect(() => {
    const run = runRef.current;
    if (!run || run.closed) return;
    run.lastPositionMs = input.positionMs;
    // Backend có thể chuyển sang PAUSED đúng ranh giới bài hát (sau reconnect);
    // vị trí vẫn là nguồn đáng tin trong trạng thái đó nên không bắt buộc PLAYING.
    if (input.positionMs >= run.durationMs - 300) {
      void finishRun(run);
      return;
    }

    if (!input.micEnabled || input.playbackStatus !== 'PLAYING') {
      if (run.activeCapture) void stopCapture(run);
      return;
    }
    if (run.activeCapture || run.captureStarting || run.finishing) return;

    const offsetMs = Math.max(0, Math.min(run.durationMs, input.positionMs));
    run.captureStarting = true;
    void (async () => {
      try {
        const session = await run.sessionPromise;
        if (session.status !== 'collecting' || run.closed || runRef.current !== run) return;
        run.participantPromise ??= KaraokeApi.registerRoomScoreParticipant(run.roomId, session.sessionId);
        await run.participantPromise;
        if (run.closed || runRef.current !== run || playbackStatusRef.current !== 'PLAYING' || !micEnabledRef.current) {
          return;
        }
        await startPitchCapture();
        if (run.closed || runRef.current !== run || playbackStatusRef.current !== 'PLAYING' || !micEnabledRef.current) {
          abortPitchCapture();
          return;
        }
        run.offsetMs = offsetMs;
        run.activeCapture = true;
        setCapturing(true);
      } catch (error) {
        abortPitchCapture();
        setScoreError(error instanceof Error ? error.message : 'Không thể phân tích micro trong phòng.');
      } finally {
        run.captureStarting = false;
      }
    })();
  }, [finishRun, input.micEnabled, input.playbackStatus, input.positionMs, stopCapture]);

  // Poll kết quả chấm chung mỗi 2.5s cho các phiên đang theo dõi
  useEffect(() => {
    if (!watchedSessionIds.length) return;
    let stopped = false;
    const refresh = async () => {
      await Promise.all(watchedSessionIds.map(async (id) => {
        if (['completed', 'failed'].includes(watchedStatusesRef.current.get(id) ?? 'collecting')) return;
        try {
          const session = await KaraokeApi.getRoomScoreSession(input.roomId, id);
          if (stopped) return;
          watchedStatusesRef.current.set(id, session.status);
          if (runRef.current?.runId === session.playbackRunId || session.status === 'completed' || session.status === 'failed') {
            setScoringStatus(session.status);
          }
          const overall = scoreFromSession(session);
          if (overall !== null) {
            setScore(overall);
            setScoreSessionId(id);
            setScoreSongTitle(watchedTitlesRef.current.get(id) ?? 'Bài hát trong phòng');
          } else if (session.status === 'failed') {
            setScoreError('Không thể chấm điểm phiên hát chung. Hãy thử lại ở bài tiếp theo.');
          }
        } catch {
          // Realtime có thể đang reconnect — lần poll kế sẽ thử lại.
        }
      }));
    };
    const timer = setInterval(() => void refresh(), 2500);
    void refresh();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [input.roomId, watchedSessionIds]);

  const trackEnded = useCallback(() => {
    const run = runRef.current;
    if (run) {
      run.lastPositionMs = run.durationMs;
      void finishRun(run);
    }
  }, [finishRun]);

  return { score, scoreSessionId, scoreSongTitle, scoringStatus, scoreError, capturing, trackEnded };
}
