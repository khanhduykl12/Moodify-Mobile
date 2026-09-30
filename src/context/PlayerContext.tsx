import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { Track } from '@/types';
import { API_BASE_URL } from '@/constants/config';
import { UserLibraryApi } from '@/services/api';

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
  playNext: () => void;
  playPrev: () => void;
  playlist: Track[];
  isLiked: (trackIdOrSpotifyId?: string) => boolean;
  toggleLikeTrack: (track: Track) => Promise<void>;
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

  const playTrack = (track: Track, newPlaylist?: Track[]) => {
    setIsLoadingAudio(true);
    setCurrentTrack(track);

    if (newPlaylist && newPlaylist.length > 0) {
      setPlaylist(newPlaylist);
    } else if (playlist.length === 0) {
      setPlaylist([track]);
    }

    let audioUri = track.previewUrl;
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

  const playNext = () => {
    if (!currentTrack || playlist.length === 0) return;
    const currentIndex = playlist.findIndex((t) => t.id === currentTrack.id);
    const nextIndex = (currentIndex + 1) % playlist.length;
    playTrack(playlist[nextIndex]);
  };

  const playPrev = () => {
    if (!currentTrack || playlist.length === 0) return;
    const currentIndex = playlist.findIndex((t) => t.id === currentTrack.id);
    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    playTrack(playlist[prevIndex]);
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'play') {
        setIsPlaying(true);
      } else if (data.type === 'pause') {
        setIsPlaying(false);
      } else if (data.type === 'ended') {
        setIsPlaying(false);
        setCurrentTime(0);
        playNext();
      } else if (data.type === 'timeupdate') {
        setCurrentTime(data.currentTime);
        if (data.duration && data.duration > 0) {
          setDuration(data.duration);
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
      }}
    >
      {children}

      {/* Bộ máy phát âm thanh siêu ổn định chạy ngầm */}
      <View style={styles.hiddenAudioContainer} pointerEvents="none">
        <WebView
          ref={webViewRef}
          source={{ html: AUDIO_HTML }}
          originWhitelist={['*']}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback={true}
          javaScriptEnabled={true}
          onMessage={handleMessage}
        />
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
