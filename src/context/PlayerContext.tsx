import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { Alert } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import { Track, Entitlements, AdReason } from '@/types';
import { chooseAdAudioAsset } from '@/constants/ad-audio-assets';
import { API_BASE_URL } from '@/constants/config';
import { Storage } from '@/services/storage';
import { OfflineLicenseValidator } from '@/services/offline/OfflineLicenseValidator';
import { UserLibraryApi, SubscriptionApi } from '@/services/api';

type PlayerContextType = {
  currentTrack: Track | null;
  isPlaying: boolean;
  playTrack: (track: Track, newPlaylist?: Track[]) => void | Promise<void>;
  togglePlayPause: () => void;
  isLoadingAudio: boolean;
  currentTime: number;
  duration: number;
  seekTo: (seconds: number) => void;
  isPlayerModalVisible: boolean;
  openPlayerModal: () => void;
  closePlayerModal: () => void;
  playNext: (isAutoAdvance?: boolean) => void;
  playPrev: () => void;
  playlist: Track[];
  isLiked: (trackIdOrSpotifyId?: string) => boolean;
  toggleLikeTrack: (track: Track) => Promise<void>;
  isShuffle: boolean;
  isRepeat: boolean;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  volume: number;
  setVolume: (vol: number) => void;
  sleepTimerMinutes: number | null;
  sleepTimerRemaining: number | null;
  setSleepTimer: (minutes: number | null) => void;
  // ── Ad Engine (đồng bộ với web) ──
  isAdPlaying: boolean;
  adReason: AdReason;
  adSecondsRemaining: number;
  adTotalDuration: number;
  currentAdTitle: string | null;
  canSkipAd: boolean;
  skipAd: (force?: boolean) => void;
  refreshEntitlements: () => Promise<void>;
  entitlements: Entitlements;
};

const PlayerContext = createContext<PlayerContextType>({
  currentTrack: null,
  isPlaying: false,
  playTrack: () => {},
  togglePlayPause: () => {},
  isLoadingAudio: false,
  currentTime: 0,
  duration: 0,
  seekTo: () => {},
  isPlayerModalVisible: false,
  openPlayerModal: () => {},
  closePlayerModal: () => {},
  playNext: () => {},
  playPrev: () => {},
  playlist: [],
  isLiked: () => false,
  toggleLikeTrack: async () => {},
  isShuffle: false,
  isRepeat: false,
  toggleShuffle: () => {},
  toggleRepeat: () => {},
  volume: 1,
  setVolume: () => {},
  sleepTimerMinutes: null,
  sleepTimerRemaining: null,
  setSleepTimer: () => {},
  isAdPlaying: false,
  adReason: null,
  adSecondsRemaining: 0,
  adTotalDuration: 0,
  currentAdTitle: null,
  canSkipAd: false,
  skipAd: () => {},
  refreshEntitlements: async () => {},
  entitlements: {
    tier: 'FREE',
    adPolicy: 'FULL_ADS',
    adFreeDailyLimit: 0,
    adIntervalAfterLimit: 2,
    skipPolicy: 'LIMITED',
    skipDailyLimit: 6,
  },
});

// Entitlements mặc định cho tài khoản FREE — khớp freeEntitlements() của backend
const FREE_ENTITLEMENTS: Entitlements = {
  tier: 'FREE',
  tierName: 'Tài khoản Miễn Phí',
  adPolicy: 'FULL_ADS',
  adFreeDailyLimit: 0,
  adIntervalAfterLimit: 2,
  skipPolicy: 'LIMITED',
  skipDailyLimit: 6,
  offlineAllowed: false,
  offlineMaxTracks: 0,
  maxDevices: 1,
  syncedLyrics: false,
  vipBadge: false,
  familySharing: false,
  familyMembers: 0,
};

const AD_SKIP_DELAY = 5; // giây trước khi nút bỏ qua quảng cáo bật cho gói Tiết Kiệm

// ── Thống kê phát/skip theo ngày (bản mobile của getDailyStats trên web) ──
const DAILY_STATS_KEY = 'moodify_daily_stats';

type DailyStats = { date: string; tracks: number; skips: number };

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const readDailyStats = async (): Promise<DailyStats> => {
  try {
    const raw = await Storage.getItem(DAILY_STATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyStats;
      if (parsed && parsed.date === todayKey()) {
        return { date: parsed.date, tracks: Number(parsed.tracks) || 0, skips: Number(parsed.skips) || 0 };
      }
    }
  } catch {
    // Dữ liệu hỏng → coi như ngày mới
  }
  return { date: todayKey(), tracks: 0, skips: 0 };
};

const writeDailyStats = (stats: DailyStats) => Storage.setItem(DAILY_STATS_KEY, JSON.stringify(stats));

const recordDailyTrackPlayed = async (): Promise<number> => {
  const stats = await readDailyStats();
  stats.tracks += 1;
  await writeDailyStats(stats);
  return stats.tracks;
};

const recordDailySkip = async (): Promise<number> => {
  const stats = await readDailyStats();
  stats.skips += 1;
  await writeDailyStats(stats);
  return stats.skips;
};

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const trackPlayer = useAudioPlayer(null, {
    updateInterval: 500,
    preferredForwardBufferDuration: 12,
  });
  const trackStatus = useAudioPlayerStatus(trackPlayer);
  const adPlayer = useAudioPlayer(null, { updateInterval: 500 });
  const adStatus = useAudioPlayerStatus(adPlayer);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlayerModalVisible, setIsPlayerModalVisible] = useState<boolean>(false);
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isRepeat, setIsRepeat] = useState<boolean>(false);
  const [volume, setVolumeState] = useState<number>(1);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);

  // ── Ad Engine state ──
  const [entitlements, setEntitlements] = useState<Entitlements>(FREE_ENTITLEMENTS);
  const [isAdPlaying, setIsAdPlaying] = useState<boolean>(false);
  const [adReason, setAdReason] = useState<AdReason>(null);
  const [adSecondsRemaining, setAdSecondsRemaining] = useState<number>(0);
  const [adTotalDuration, setAdTotalDuration] = useState<number>(0);
  const [currentAdTitle, setCurrentAdTitle] = useState<string | null>(null);
  const [canSkipAd, setCanSkipAd] = useState<boolean>(false);

  const playbackRequestIdRef = useRef(0);
  const playbackSourceRef = useRef<{
    requestId: number;
    streamUri: string;
    isOffline: boolean;
    retryCount: number;
  } | null>(null);
  const trackHasStartedRef = useRef(false);
  const trackFinishHandledRef = useRef(false);
  const adHasStartedRef = useRef(false);
  const resumeTrackAfterAdRef = useRef(false);
  const lastTrackErrorRef = useRef<string | null>(null);
  const lastAdErrorRef = useRef<string | null>(null);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch((error) => {
      console.warn('[Player] Không thể cấu hình audio session:', error);
    });
  }, []);

  const sleepTimerRef = useRef<{ minutes: number | null; remaining: number | null }>({
    minutes: null,
    remaining: null,
  });
  sleepTimerRef.current = { minutes: sleepTimerMinutes, remaining: sleepTimerRemaining };

  const setSleepTimer = (minutes: number | null) => {
    setSleepTimerMinutes(minutes);
    if (minutes === null) {
      setSleepTimerRemaining(null);
    } else if (minutes === -1) {
      // End of current track
      setSleepTimerRemaining(-1);
    } else {
      setSleepTimerRemaining(minutes * 60);
    }
  };

  // Countdown timer for sleep timer
  useEffect(() => {
    if (!sleepTimerMinutes || sleepTimerMinutes <= 0 || sleepTimerRemaining === null) return;

    const interval = setInterval(() => {
      setSleepTimerRemaining((prev) => {
        if (prev === null || prev <= 1) {
          // Time expired! Pause music
          trackPlayer.pause();
          adPlayer.pause();
          setIsPlaying(false);
          setSleepTimerMinutes(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sleepTimerMinutes]);

  const isShuffleRef = useRef(isShuffle);
  isShuffleRef.current = isShuffle;

  const isRepeatRef = useRef(isRepeat);
  isRepeatRef.current = isRepeat;

  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;

  const playlistRef = useRef(playlist);
  playlistRef.current = playlist;

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // ── Ad Engine refs ──
  const entitlementsRef = useRef<Entitlements>(FREE_ENTITLEMENTS);
  const isPremiumUserRef = useRef(false);
  const isAdPlayingRef = useRef(false);
  const adSecondsRemainingRef = useRef(0);
  const lastAdIdRef = useRef<string | null>(null);
  const pendingTrackRef = useRef<{ track: Track; newPlaylist?: Track[] } | null>(null);
  const freeTracksSinceLastAdRef = useRef(0);
  // Ngưỡng ngẫu nhiên 1-3 bài cho lượt quảng cáo đầu tiên (giống web)
  const freeNextAdThresholdRef = useRef(Math.floor(Math.random() * 3) + 1);

  useEffect(() => {
    // Tải danh sách các bài hát đã thích khi khởi động
    UserLibraryApi.getLikedTrackIds()
      .then((ids) => {
        if (ids && ids.length > 0) {
          setLikedTrackIds(new Set(ids));
        }
      })
      .catch(() => {});

    // Tải entitlements theo gói; audio quảng cáo được đóng gói sẵn trong app.
    void loadEntitlements();
  }, []);

  const isLiked = (trackIdOrSpotifyId?: string): boolean => {
    if (!trackIdOrSpotifyId) return false;
    return likedTrackIds.has(trackIdOrSpotifyId);
  };

  const toggleLikeTrack = async (track: Track) => {
    const trackKey = track.spotifyId || track.id;
    if (!trackKey) return;

    const currentlyLiked = likedTrackIds.has(trackKey);
    const updated = new Set(likedTrackIds);

    if (currentlyLiked) {
      updated.delete(trackKey);
      setLikedTrackIds(updated);
      try {
        await UserLibraryApi.unlikeTrack(trackKey);
      } catch (err) {
        console.warn('Lỗi khi bỏ thích bài hát:', err);
      }
    } else {
      updated.add(trackKey);
      setLikedTrackIds(updated);
      try {
        await UserLibraryApi.likeTrack(trackKey);
      } catch (err) {
        console.warn('Lỗi khi thích bài hát:', err);
      }
    }
  };

  const loadEntitlements = async () => {
    try {
      const sub = await SubscriptionApi.getMySubscription();
      if (sub && sub.isPremium && sub.entitlements && typeof sub.entitlements === 'object') {
        const merged: Entitlements = {
          ...FREE_ENTITLEMENTS,
          ...(sub.entitlements as Partial<Entitlements>),
          tier: (sub.entitlements as Partial<Entitlements>).tier || sub.tier || 'FREE',
        };
        entitlementsRef.current = merged;
        setEntitlements(merged);
        isPremiumUserRef.current = true;
        setCanSkipAd(true);
        // Gói NO_ADS nhưng đang phát quảng cáo (vừa nâng cấp giữa chừng) → dừng QC
        if (merged.adPolicy === 'NO_ADS' && isAdPlayingRef.current) {
          finishAd();
        }
      } else {
        entitlementsRef.current = FREE_ENTITLEMENTS;
        setEntitlements(FREE_ENTITLEMENTS);
        isPremiumUserRef.current = false;
        setCanSkipAd(false);
      }
    } catch {
      // Mất kết nối: giữ nguyên entitlements hiện tại
    }
  };

  const executePlayTrack = async (track: Track, newPlaylist?: Track[]) => {
    const requestId = ++playbackRequestIdRef.current;
    trackHasStartedRef.current = false;
    trackFinishHandledRef.current = false;
    trackPlayer.pause();
    setIsLoadingAudio(true);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setCurrentTrack(track);

    if (newPlaylist && newPlaylist.length > 0) {
      setPlaylist(newPlaylist);
    } else if (playlist.length === 0) {
      setPlaylist([track]);
    }

    const trackIdentifier = track.id || track.spotifyId;
    if (!trackIdentifier) {
      Alert.alert('Thông báo', `Bài hát "${track.name}" hiện chưa có file âm thanh.`);
      setIsLoadingAudio(false);
      setIsPlaying(false);
      return;
    }

    // Always start playback through the backend. The backend resolves the
    // stored audio path and redirects to the configured audio server if needed.
    const streamUri = `${API_BASE_URL}/tracks/${encodeURIComponent(trackIdentifier)}/stream`;
    let audioUri = streamUri;
    let isOffline = false;
    try {
      const offlineCheck = await OfflineLicenseValidator.validate(track.id);
      if (offlineCheck.isValid && offlineCheck.tempPlaybackUri) {
        audioUri = offlineCheck.tempPlaybackUri;
        isOffline = true;
      }
    } catch (error) {
      console.warn('[Player] Offline playback unavailable, falling back to streaming:', error);
    }

    if (requestId !== playbackRequestIdRef.current) return;

    playbackSourceRef.current = {
      requestId,
      streamUri,
      isOffline,
      retryCount: 0,
    };

    console.log(`[Player] Đang phát audio qua backend: ${audioUri}`);
    trackPlayer.volume = volume;
    trackPlayer.replace({ uri: audioUri });
    trackPlayer.play();
  };

  // ── Ad Engine: phát quảng cáo, kết thúc, bỏ qua ──
  const playAdAudio = () => {
    const picked = chooseAdAudioAsset(lastAdIdRef.current);
    if (!picked) {
      console.warn('[Ad Engine] Không có audio quảng cáo trong app → bỏ qua');
      finishAd();
      return;
    }

    lastAdIdRef.current = picked.id;
    setCurrentAdTitle(picked.title);

    try {
      adHasStartedRef.current = false;
      adPlayer.volume = volume;
      adPlayer.replace(picked.assetModule);
      adPlayer.play();
    } catch (error) {
      console.warn(`[Ad Engine] Không thể phát ${picked.id} → bỏ qua`, error);
      if (isAdPlayingRef.current) finishAd();
    }
  };

  const finishAd = () => {
    if (!isAdPlayingRef.current) return;
    adPlayer.pause();
    void adPlayer.seekTo(0).catch(() => {});
    isAdPlayingRef.current = false;
    adSecondsRemainingRef.current = 0;
    setIsAdPlaying(false);
    setAdReason(null);
    setAdSecondsRemaining(0);
    setAdTotalDuration(0);
    setCurrentAdTitle(null);

    const pending = pendingTrackRef.current;
    pendingTrackRef.current = null;
    if (pending) {
      resumeTrackAfterAdRef.current = false;
      void executePlayTrack(pending.track, pending.newPlaylist);
    } else if (resumeTrackAfterAdRef.current) {
      resumeTrackAfterAdRef.current = false;
      trackPlayer.play();
      setIsPlaying(true);
    } else {
      resumeTrackAfterAdRef.current = false;
    }
  };

  const triggerAd = (
    force = false,
    trackToPlayAfter?: Track,
    newPlaylist?: Track[],
    reason: AdReason = 'FREE_REGULAR'
  ) => {
    // Gói NO_ADS (Gia Đình / Cá Nhân FULL) không bị chèn quảng cáo
    if (entitlementsRef.current.adPolicy === 'NO_ADS' && !force) return;
    if (isAdPlayingRef.current) {
      if (trackToPlayAfter) pendingTrackRef.current = { track: trackToPlayAfter, newPlaylist };
      return;
    }

    resumeTrackAfterAdRef.current = isPlayingRef.current;
    trackPlayer.pause();
    setIsPlaying(false);
    if (trackToPlayAfter) {
      pendingTrackRef.current = { track: trackToPlayAfter, newPlaylist };
    }
    setAdReason(reason);
    isAdPlayingRef.current = true;
    adSecondsRemainingRef.current = 20; // ước lượng ban đầu, được cập nhật theo timeupdate
    setIsAdPlaying(true);
    setAdSecondsRemaining(20);
    playAdAudio();
  };

  // Chỉ gói Tiết Kiệm (INDIVIDUAL_BASIC) / VIP mới được bỏ qua sớm; FREE phải nghe trọn
  const skipAd = (force = false) => {
    if (!isAdPlayingRef.current) return;
    const isSaverVip = entitlementsRef.current.tier === 'INDIVIDUAL_BASIC';
    if (!force && !isSaverVip && !isPremiumUserRef.current && adSecondsRemainingRef.current > 0) {
      return;
    }
    finishAd();
  };

  const playTrack = (track: Track, newPlaylist?: Track[]) => {
    if (isAdPlayingRef.current) {
      pendingTrackRef.current = { track, newPlaylist };
      return;
    }

    recordDailyTrackPlayed()
      .then((todayTracks) => {
        const ent = entitlementsRef.current;

        // Rule 1: Gói không quảng cáo hoàn toàn (adPolicy = NO_ADS)
        if (ent.adPolicy === 'NO_ADS') {
          executePlayTrack(track, newPlaylist);
          return;
        }

        // Rule 2: Hạn mức không quảng cáo theo ngày (DAILY_QUOTA — Gói Tiết Kiệm)
        if (ent.adPolicy === 'DAILY_QUOTA') {
          const adFreeLimit = Math.max(0, ent.adFreeDailyLimit);
          if (todayTracks <= adFreeLimit) {
            executePlayTrack(track, newPlaylist);
            return;
          }
          // Sau hạn mức: quảng cáo xuất hiện thưa hơn theo adIntervalAfterLimit
          const tracksAfter = todayTracks - adFreeLimit;
          const interval = Math.max(1, ent.adIntervalAfterLimit);
          if (tracksAfter % interval === 0) {
            triggerAd(false, track, newPlaylist, 'BASIC_DAILY_LIMIT_EXCEEDED');
            return;
          }
          executePlayTrack(track, newPlaylist);
          return;
        }

        // Rule 3: FULL_ADS — tài khoản FREE (ngẫu nhiên 1..adIntervalAfterLimit bài một quảng cáo)
        freeTracksSinceLastAdRef.current += 1;
        console.log(
          `[Ad Engine] Gói FREE: Đã phát ${freeTracksSinceLastAdRef.current}/${freeNextAdThresholdRef.current} bài trước quảng cáo tiếp theo.`
        );
        if (freeTracksSinceLastAdRef.current >= freeNextAdThresholdRef.current) {
          freeTracksSinceLastAdRef.current = 0;
          const intervalMax = Math.max(1, ent.adIntervalAfterLimit);
          freeNextAdThresholdRef.current =
            intervalMax > 1 ? Math.floor(Math.random() * intervalMax) + 1 : 1;
          triggerAd(false, track, newPlaylist, 'FREE_REGULAR');
          return;
        }

        executePlayTrack(track, newPlaylist);
      })
      .catch(() => executePlayTrack(track, newPlaylist));
  };

  const togglePlayPause = () => {
    if (isAdPlayingRef.current) {
      if (adPlayer.playing) {
        adPlayer.pause();
        setIsPlaying(false);
      } else {
        adPlayer.play();
        setIsPlaying(true);
      }
      return;
    }
    if (trackPlayer.playing) {
      trackPlayer.pause();
      setIsPlaying(false);
    } else {
      trackPlayer.play();
      setIsPlaying(true);
    }
  };

  const seekTo = (seconds: number) => {
    setCurrentTime(seconds);
    void trackPlayer.seekTo(seconds).catch((error) => {
      console.warn('[Player] Không thể tua audio:', error);
    });
  };

  const setVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    trackPlayer.volume = clamped;
    adPlayer.volume = clamped;
  };

  const playNext = (isAutoAdvance = false) => {
    const curr = currentTrackRef.current;
    const pl = playlistRef.current;
    if (!curr || pl.length === 0) return;
    if (isAdPlayingRef.current) return;

    const proceedNext = () => {
      if (pl.length === 1) {
        seekTo(0);
        return;
      }

      const currentIndex = pl.findIndex((t) => (t.id === curr.id) || (t.spotifyId && t.spotifyId === curr.spotifyId));
      let nextIndex = (currentIndex + 1) % pl.length;

      if (isShuffleRef.current) {
        let randIndex = Math.floor(Math.random() * pl.length);
        if (randIndex === currentIndex && pl.length > 1) {
          randIndex = (currentIndex + 1) % pl.length;
        }
        nextIndex = randIndex;
      }

      playTrack(pl[nextIndex]);
    };

    // Giới hạn lượt chuyển bài theo gói (không áp dụng cho tự động chuyển khi hết bài)
    if (!isAutoAdvance && entitlementsRef.current.skipPolicy === 'LIMITED') {
      recordDailySkip()
        .then((todaySkips) => {
          const skipLimit = Math.max(1, entitlementsRef.current.skipDailyLimit);
          if (todaySkips > skipLimit) {
            Alert.alert(
              'Giới hạn chuyển bài',
              entitlementsRef.current.tier === 'FREE'
                ? `Tài khoản Miễn phí chỉ có ${skipLimit} lượt chuyển bài mỗi ngày. Nâng cấp Gói Tiết Kiệm (29K) hoặc Cá Nhân FULL để chuyển bài thoải mái!`
                : `Bạn đã dùng hết ${skipLimit} lượt chuyển bài hôm nay. Nâng cấp lên Gói Cá Nhân FULL để chuyển bài không giới hạn!`,
              [
                { text: 'Để sau', style: 'cancel' },
                { text: 'Nâng cấp', onPress: () => router.push('/(tabs)/profile') },
              ]
            );
            return;
          }
          proceedNext();
        })
        .catch(() => proceedNext());
      return;
    }

    proceedNext();
  };

  const playPrev = () => {
    const curr = currentTrackRef.current;
    const pl = playlistRef.current;
    if (!curr || pl.length === 0) return;

    // Chuẩn Spotify: Nếu đã phát quá 3 giây thì tua lại từ đầu
    if (currentTime > 3) {
      seekTo(0);
      return;
    }

    const currentIndex = pl.findIndex((t) => (t.id === curr.id) || (t.spotifyId && t.spotifyId === curr.spotifyId));
    const prevIndex = (currentIndex - 1 + pl.length) % pl.length;
    playTrack(pl[prevIndex]);
  };

  const toggleShuffle = () => setIsShuffle((prev) => !prev);
  const toggleRepeat = () => setIsRepeat((prev) => !prev);

  useEffect(() => {
    const playbackTime = Math.max(0, trackStatus.currentTime || 0);
    setCurrentTime((previous) => (Math.abs(previous - playbackTime) < 0.05 ? previous : playbackTime));
    if (trackStatus.duration > 0) {
      setDuration((previous) => (previous === trackStatus.duration ? previous : trackStatus.duration));
    }

    if (trackStatus.isBuffering) {
      setIsLoadingAudio(true);
    } else if (trackStatus.isLoaded) {
      setIsLoadingAudio(false);
    }

    if (trackStatus.playing) trackHasStartedRef.current = true;
    if (!trackStatus.didJustFinish) trackFinishHandledRef.current = false;
    if (
      trackStatus.didJustFinish &&
      trackHasStartedRef.current &&
      !trackFinishHandledRef.current &&
      !isAdPlayingRef.current
    ) {
      trackFinishHandledRef.current = true;
      trackHasStartedRef.current = false;
      setCurrentTime(0);
      setIsPlaying(false);

      if (sleepTimerRef.current.minutes === -1) {
        setSleepTimerMinutes(null);
        setSleepTimerRemaining(null);
        return;
      }

      if (isRepeatRef.current) {
        void trackPlayer.seekTo(0).then(() => trackPlayer.play()).catch((error) => {
          console.warn('[Player] Không thể phát lại bài hát:', error);
        });
      } else {
        playNext(true);
      }
    }

    if (trackStatus.error && trackStatus.error !== lastTrackErrorRef.current) {
      lastTrackErrorRef.current = trackStatus.error;
      setIsLoadingAudio(false);
      setIsPlaying(false);

      const source = playbackSourceRef.current;
      if (!source || source.requestId !== playbackRequestIdRef.current) {
        console.warn('[Player] Audio playback error:', trackStatus.error);
        return;
      }

      if (source.isOffline) {
        source.isOffline = false;
        setCurrentTime(0);
        setDuration(0);
        setIsLoadingAudio(true);
        console.warn('[Player] File offline không phát được, chuyển sang stream:', trackStatus.error);
        trackPlayer.replace({ uri: source.streamUri });
        trackPlayer.play();
        return;
      }

      if (source.retryCount < 1) {
        source.retryCount += 1;
        setIsLoadingAudio(true);
        console.warn('[Player] Stream gặp lỗi, thử lại một lần:', trackStatus.error);
        const requestId = source.requestId;
        setTimeout(() => {
          if (requestId !== playbackRequestIdRef.current || isAdPlayingRef.current) return;
          trackPlayer.replace({ uri: source.streamUri });
          trackPlayer.play();
        }, 400);
        return;
      }

      console.warn('[Player] Stream không thể phát sau khi thử lại:', trackStatus.error);
    } else if (!trackStatus.error) {
      lastTrackErrorRef.current = null;
    }
  }, [
    trackStatus.currentTime,
    trackStatus.duration,
    trackStatus.isBuffering,
    trackStatus.isLoaded,
    trackStatus.playing,
    trackStatus.didJustFinish,
    trackStatus.error,
    trackPlayer,
    playNext,
  ]);

  useEffect(() => {
    const playing = isAdPlaying ? adStatus.playing : trackStatus.playing;
    setIsPlaying((previous) => (previous === playing ? previous : playing));
  }, [isAdPlaying, adStatus.playing, trackStatus.playing]);

  useEffect(() => {
    if (adStatus.duration > 0) {
      const total = Math.ceil(adStatus.duration);
      const remaining = Math.max(0, Math.ceil(adStatus.duration - adStatus.currentTime));
      adSecondsRemainingRef.current = remaining;
      setAdTotalDuration((previous) => (previous === total ? previous : total));
      setAdSecondsRemaining((previous) => (previous === remaining ? previous : remaining));
    }

    if (adStatus.playing) adHasStartedRef.current = true;
    if (adStatus.error && adStatus.error !== lastAdErrorRef.current) {
      lastAdErrorRef.current = adStatus.error;
      if (isAdPlayingRef.current) {
        console.warn('[Ad Engine] Audio quảng cáo không phát được, bỏ qua:', adStatus.error);
        finishAd();
      }
    } else if (!adStatus.error) {
      lastAdErrorRef.current = null;
    }

    if (adStatus.didJustFinish && adHasStartedRef.current && isAdPlayingRef.current) {
      adHasStartedRef.current = false;
      finishAd();
    }
  }, [
    adStatus.currentTime,
    adStatus.duration,
    adStatus.didJustFinish,
    adStatus.error,
    adStatus.playing,
    finishAd,
  ]);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        playTrack,
        togglePlayPause,
        isLoadingAudio,
        currentTime,
        duration,
        seekTo,
        isPlayerModalVisible,
        openPlayerModal: () => setIsPlayerModalVisible(true),
        closePlayerModal: () => setIsPlayerModalVisible(false),
        playNext,
        playPrev,
        playlist,
        isLiked,
        toggleLikeTrack,
        isShuffle,
        isRepeat,
        toggleShuffle,
        toggleRepeat,
        volume,
        setVolume,
        sleepTimerMinutes,
        sleepTimerRemaining,
        setSleepTimer,
        isAdPlaying,
        adReason,
        adSecondsRemaining,
        adTotalDuration,
        currentAdTitle,
        canSkipAd,
        skipAd,
        refreshEntitlements: loadEntitlements,
        entitlements,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => useContext(PlayerContext);
