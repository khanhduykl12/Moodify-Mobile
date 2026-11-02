import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { router } from 'expo-router';
import { Track, Entitlements, AdReason } from '@/types';
import { API_BASE_URL } from '@/constants/config';
import { Storage } from '@/services/storage';
import { UserLibraryApi, SubscriptionApi, AdsApi } from '@/services/api';

type PlayerContextType = {
  currentTrack: Track | null;
  isPlaying: boolean;
  playTrack: (track: Track, newPlaylist?: Track[]) => void;
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

// File tĩnh (audio quảng cáo...) nằm ngoài /api: http://host:8080/uploads/** — khớp getBackendFileUrl của web
const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

const resolveBackendFileUrl = (url: string) => {
  if (/^https?:\/\//i.test(url)) return url;
  return `${BACKEND_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

const AUDIO_HTML = `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="background:transparent;margin:0;padding:0;">
    <audio id="audio" preload="auto" playsinline></audio>
    <audio id="ad-audio" preload="auto" playsinline></audio>
    <script>
      const audio = document.getElementById('audio');
      const adAudio = document.getElementById('ad-audio');

      audio.addEventListener('play', () => {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'play' }));
      });
      audio.addEventListener('pause', () => {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pause' }));
      });
      audio.addEventListener('ended', () => {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ended' }));
      });
      audio.addEventListener('timeupdate', () => {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'timeupdate',
          currentTime: audio.currentTime || 0,
          duration: audio.duration || 0
        }));
      });
      audio.addEventListener('error', (e) => {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          code: audio.error ? audio.error.code : -1
        }));
      });

      adAudio.addEventListener('play', () => {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ad_play' }));
      });
      adAudio.addEventListener('pause', () => {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ad_pause' }));
      });
      adAudio.addEventListener('ended', () => {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ad_ended' }));
      });
      adAudio.addEventListener('timeupdate', () => {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'ad_timeupdate',
          currentTime: adAudio.currentTime || 0,
          duration: adAudio.duration || 0
        }));
      });
      adAudio.addEventListener('error', () => {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ad_error' }));
      });

      window.playSong = function(url) {
        audio.src = url;
        audio.play().catch(function(err) {
          console.warn('Play error:', err);
        });
      };

      window.pauseSong = function() {
        audio.pause();
      };

      window.resumeSong = function() {
        audio.play().catch(function(err) {});
      };

      window.seekSong = function(seconds) {
        if (isFinite(seconds)) {
          audio.currentTime = seconds;
        }
      };

      window.setVolume = function(vol) {
        if (isFinite(vol)) {
          audio.volume = Math.max(0, Math.min(1, vol));
          adAudio.volume = Math.max(0, Math.min(1, vol));
        }
      };

      // ── Kênh phát quảng cáo (tách riêng để không đè bài hát đang phát) ──
      window.playAdSong = function(url) {
        adAudio.src = url;
        adAudio.play().catch(function(err) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ad_error' }));
        });
      };

      window.pauseAdSong = function() {
        adAudio.pause();
        adAudio.currentTime = 0;
      };

      window.resumeAdSong = function() {
        adAudio.play().catch(function(err) {});
      };
    </script>
  </body>
</html>
`;

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript('window.pauseSong(); true;');
          }
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

  const webViewRef = useRef<WebView | null>(null);

  // ── Ad Engine refs ──
  const entitlementsRef = useRef<Entitlements>(FREE_ENTITLEMENTS);
  const isPremiumUserRef = useRef(false);
  const isAdPlayingRef = useRef(false);
  const adSecondsRemainingRef = useRef(0);
  const activeAdsRef = useRef<{ id: string; title?: string; advertiser?: string; audioUrl: string }[]>([]);
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

    // Tải entitlements theo gói + danh sách chiến dịch quảng cáo ACTIVE
    void loadEntitlements();
    AdsApi.getActiveAds()
      .then((ads) => {
        activeAdsRef.current = ads;
      })
      .catch(() => {});
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

  const executePlayTrack = (track: Track, newPlaylist?: Track[]) => {
    setIsLoadingAudio(true);
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
    const audioUri = `${API_BASE_URL}/tracks/${encodeURIComponent(trackIdentifier)}/stream`;

    console.log(`[Player] Đang phát audio qua backend: ${audioUri}`);

    if (webViewRef.current) {
      const code = `window.playSong(${JSON.stringify(audioUri)}); true;`;
      webViewRef.current.injectJavaScript(code);
    }
    setIsPlaying(true);
    setIsLoadingAudio(false);
  };

  // ── Ad Engine: phát quảng cáo, kết thúc, bỏ qua ──
  const playAdAudio = () => {
    const campaigns = activeAdsRef.current;
    if (campaigns.length === 0) {
      // Bộ nhớ chưa có chiến dịch → thử tải lại một lần
      // (admin có thể vừa tạo/bật chiến dịch mới, không cần restart app)
      AdsApi.getActiveAds()
        .then((ads) => {
          activeAdsRef.current = ads;
          if (ads.length === 0) {
            console.log('[Ad Engine] Không có chiến dịch quảng cáo ACTIVE → bỏ qua');
            finishAd();
            return;
          }
          startAdCampaign(ads);
        })
        .catch(() => {
          console.log('[Ad Engine] Lỗi tải chiến dịch quảng cáo → bỏ qua');
          finishAd();
        });
      return;
    }
    startAdCampaign(campaigns);
  };

  const startAdCampaign = (
    campaigns: { id: string; title?: string; advertiser?: string; audioUrl: string }[]
  ) => {
    let picked = campaigns[Math.floor(Math.random() * campaigns.length)];
    if (campaigns.length > 1) {
      let guard = 0;
      while (picked.id === lastAdIdRef.current && guard < 10) {
        picked = campaigns[Math.floor(Math.random() * campaigns.length)];
        guard += 1;
      }
    }
    lastAdIdRef.current = picked.id;

    const adUri = resolveBackendFileUrl(picked.audioUrl);
    setCurrentAdTitle(picked.title || picked.advertiser || 'Quảng cáo Moodify');

    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`window.playAdSong(${JSON.stringify(adUri)}); true;`);
    }
    void AdsApi.recordAdImpression(picked.id);
  };

  const finishAd = () => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript('window.pauseAdSong(); true;');
    }
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
      executePlayTrack(pending.track, pending.newPlaylist);
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

    if (webViewRef.current) {
      webViewRef.current.injectJavaScript('window.pauseSong(); true;');
    }
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
    if (!webViewRef.current) return;
    if (isAdPlayingRef.current) {
      if (isPlayingRef.current) {
        webViewRef.current.injectJavaScript('window.pauseAdSong(); true;');
      } else {
        webViewRef.current.injectJavaScript('window.resumeAdSong(); true;');
      }
      return;
    }
    if (isPlaying) {
      webViewRef.current.injectJavaScript('window.pauseSong(); true;');
      setIsPlaying(false);
    } else {
      webViewRef.current.injectJavaScript('window.resumeSong(); true;');
      setIsPlaying(true);
    }
  };

  const seekTo = (seconds: number) => {
    if (!webViewRef.current) return;
    setCurrentTime(seconds);
    webViewRef.current.injectJavaScript(`window.seekSong(${seconds}); true;`);
  };

  const setVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`window.setVolume(${clamped}); true;`);
    }
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

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'play') {
        setIsPlaying(true);
        setIsLoadingAudio(false);
      } else if (data.type === 'pause') {
        setIsPlaying(false);
      } else if (data.type === 'ended') {
        setIsPlaying(false);
        setCurrentTime(0);
        // Kiểm tra hẹn giờ dừng khi hết bài hát
        if (sleepTimerRef.current.minutes === -1) {
          setSleepTimerMinutes(null);
          setSleepTimerRemaining(null);
          return;
        }

        if (isRepeatRef.current) {
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript('window.seekSong(0); window.resumeSong(); true;');
            setIsPlaying(true);
          }
        } else {
          playNext(true);
        }
      } else if (data.type === 'timeupdate') {
        setCurrentTime(data.currentTime);
        if (data.duration && data.duration > 0) {
          setDuration(data.duration);
        }
      } else if (data.type === 'error') {
        setIsLoadingAudio(false);
        setIsPlaying(false);
        console.warn('[Player] Audio stream error encountered');
      } else if (data.type === 'ad_play') {
        setIsPlaying(true);
      } else if (data.type === 'ad_pause') {
        setIsPlaying(false);
      } else if (data.type === 'ad_timeupdate') {
        if (data.duration && data.duration > 0) {
          const remaining = Math.max(0, Math.ceil(data.duration - (data.currentTime || 0)));
          adSecondsRemainingRef.current = remaining;
          setAdTotalDuration(Math.ceil(data.duration));
          setAdSecondsRemaining(remaining);
        }
      } else if (data.type === 'ad_ended' || data.type === 'ad_error') {
        if (data.type === 'ad_error') {
          console.warn('[Ad Engine] Quảng cáo lỗi, bỏ qua và phát bài đang chờ');
        }
        if (isAdPlayingRef.current) {
          finishAd();
        }
      }
    } catch {}
  };

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

      {/* Bộ máy phát âm thanh siêu ổn định chạy ngầm (nhạc + quảng cáo) */}
      <View style={styles.hiddenAudioContainer} pointerEvents="none">
        {React.createElement(WebView as any, {
          ref: webViewRef,
          source: { html: AUDIO_HTML },
          originWhitelist: ['*'],
          mediaPlaybackRequiresUserAction: false,
          allowsInlineMediaPlayback: true,
          javaScriptEnabled: true,
          onMessage: handleMessage,
        })}
      </View>
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => useContext(PlayerContext);

const styles = StyleSheet.create({
  hiddenAudioContainer: {
    width: 1,
    height: 1,
    opacity: 0.01,
    position: 'absolute',
    bottom: -10,
    left: -10,
  },
});
