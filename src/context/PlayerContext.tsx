import React, { createContext, useContext, useState, useRef } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { Track } from '@/types';
import { API_BASE_URL } from '@/constants/config';

type PlayerContextType = {
  currentTrack: Track | null;
  isPlaying: boolean;
  playTrack: (track: Track) => void;
  togglePlayPause: () => void;
  isLoadingAudio: boolean;
  currentTime: number;
  duration: number;
};

const PlayerContext = createContext<PlayerContextType>({
  currentTrack: null,
  isPlaying: false,
  playTrack: () => {},
  togglePlayPause: () => {},
  isLoadingAudio: false,
  currentTime: 0,
  duration: 0,
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
    </script>
  </body>
</html>
`;

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const webViewRef = useRef<WebView | null>(null);

  const playTrack = (track: Track) => {
    setIsLoadingAudio(true);
    setCurrentTrack(track);

    let audioUri = track.previewUrl;
    if (!audioUri && track.id) {
      audioUri = `${API_BASE_URL}/tracks/${track.id}/stream`;
    }

    if (!audioUri) {
      Alert.alert('Thông báo', `Bài hát "${track.name}" hiện chưa có file âm thanh trên hệ thống.`);
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
