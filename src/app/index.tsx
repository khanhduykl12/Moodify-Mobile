import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from '@/constants/config';
import { TrackApi } from '@/services/api';
import { Track } from '@/types';

export default function HomeScreen() {
  const [loading, setLoading] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [statusMsg, setStatusMsg] = useState('Chưa kết nối API');
  const [apiSuccess, setApiSuccess] = useState<boolean | null>(null);

  const testBackendConnection = async () => {
    setLoading(true);
    setStatusMsg('Đang gửi request tới Backend...');
    try {
      const data = await TrackApi.getTracks(0, 5);
      setTracks(data.content || []);
      setApiSuccess(true);
      setStatusMsg(`Thành công! Lấy được ${data.content?.length || 0} bài hát từ Backend 🎉`);
    } catch (err: any) {
      console.error('Lỗi gọi API:', err);
      setApiSuccess(false);
      setStatusMsg(`Lỗi kết nối: ${err.message || 'Network Error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header Branding */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIcon}>🎵</Text>
          </View>
          <Text style={styles.title}>Moodify Mobile</Text>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Fast Refresh: Đang hoạt động</Text>
          </View>
        </View>

        {/* Server Info Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📡 Cấu hình máy chủ</Text>
          <Text style={styles.cardSubtitle}>API Endpoint:</Text>
          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>{API_BASE_URL}</Text>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={testBackendConnection}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>🚀 Bấm để test kết nối Backend</Text>
            )}
          </TouchableOpacity>

          {/* Status Result */}
          {statusMsg !== '' && (
            <View
              style={[
                styles.statusBox,
                apiSuccess === true && styles.statusSuccess,
                apiSuccess === false && styles.statusError,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  apiSuccess === true && styles.statusTextSuccess,
                  apiSuccess === false && styles.statusTextError,
                ]}
              >
                {statusMsg}
              </Text>
            </View>
          )}
        </View>

        {/* Tracks Preview */}
        {tracks.length > 0 && (
          <View style={styles.tracksCard}>
            <Text style={styles.cardTitle}>🎶 Danh sách bài hát mẫu:</Text>
            {tracks.map((t, idx) => (
              <View key={t.id || idx} style={styles.trackItem}>
                <Text style={styles.trackNumber}>{idx + 1}</Text>
                <View style={styles.trackInfo}>
                  <Text style={styles.trackName} numberOfLines={1}>
                    {t.name}
                  </Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {t.artistName} • {t.albumName || 'Single'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footerText}>
          Thay đổi code trong VS Code và lưu lại để thấy điều kỳ diệu! ✨
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1f1f2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#383854',
  },
  logoIcon: {
    fontSize: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginRight: 6,
  },
  liveText: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#16161f',
    borderRadius: 16,
    padding: 18,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#262638',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
  },
  codeBlock: {
    backgroundColor: '#0d0d14',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  codeText: {
    color: '#a78bfa',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  button: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  statusBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#1f1f2e',
  },
  statusSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  statusError: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  statusText: {
    fontSize: 13,
    color: '#d1d5db',
    textAlign: 'center',
  },
  statusTextSuccess: {
    color: '#4ade80',
    fontWeight: '600',
  },
  statusTextError: {
    color: '#f87171',
    fontWeight: '600',
  },
  tracksCard: {
    backgroundColor: '#16161f',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262638',
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#262638',
  },
  trackNumber: {
    color: '#6b7280',
    fontSize: 14,
    width: 24,
    fontWeight: '600',
  },
  trackInfo: {
    flex: 1,
  },
  trackName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  trackArtist: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
  footerText: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});
