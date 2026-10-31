import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { Track } from '@/types';
import { API_BASE_URL } from '@/constants/config';
import { UserLibraryApi } from '@/services/api';
import { OfflineLicenseValidator } from '@/services/offline/OfflineLicenseValidator';

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
  playNext: () => void;
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
});

const AUDIO_HTML = `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="background:transparent;margin:0;padding:0;">
    <audio id="audio" preload="auto" playsinline></audio>
    <script>
      const audio = document.getElementById('audio');

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
        }
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

  const webViewRef = useRef<WebView | null>(null);

  useEffect(() => {
    // Tải danh sách các bài hát đã thích khi khởi động
    UserLibraryApi.getLikedTrackIds()
      .then((ids) => {
        if (ids && ids.length > 0) {
          setLikedTrackIds(new Set(ids));
        }
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

  const playTrack = async (track: Track, newPlaylist?: Track[]) => {
    setIsLoadingAudio(true);
    setCurrentTrack(track);

    if (newPlaylist && newPlaylist.length > 0) {
      setPlaylist(newPlaylist);
    } else if (playlist.length === 0) {
      setPlaylist([track]);
    }

    let audioUri: string | null = null;
    try {
      if (track.id) {
        const offlineCheck = await OfflineLicenseValidator.validate(track.id);
        if (offlineCheck.isValid && offlineCheck.tempPlaybackUri) {
          audioUri = offlineCheck.tempPlaybackUri;
          console.log(`[Player] Phát nhạc OFFLINE từ bộ nhớ thiết bị: ${audioUri}`);
        }
      }
    } catch (e) {
      console.warn('[Player] Kiểm tra offline thất bại, fallback sang online:', e);
    }
    if (!audioUri) {
      audioUri = track.previewUrl;
    }
    if (!audioUri && track.id) {
      audioUri = `${API_BASE_URL}/tracks/${track.id}/stream`;
    }

    if (!audioUri) {
      Alert.alert('Thông báo', `Bài hát "${track.name}" hiện chưa có file âm thanh.`);
      setIsLoadingAudio(false);
      setIsPlaying(false);
      return;
    }

    console.log(`[Player] Đang phát audio stream: ${audioUri}`);

    if (webViewRef.current) {
      const code = `window.playSong("${audioUri}"); true;`;
      webViewRef.current.injectJavaScript(code);
    }
    setIsPlaying(true);
    setIsLoadingAudio(false);
  };

  const togglePlayPause = () => {
    if (!webViewRef.current) return;
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

  const playNext = () => {
    const curr = currentTrackRef.current;
    const pl = playlistRef.current;
    if (!curr || pl.length === 0) return;
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
          playNext();
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
      }}
    >
      {children}

      {/* Bộ máy phát âm thanh siêu ổn định chạy ngầm */}
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
