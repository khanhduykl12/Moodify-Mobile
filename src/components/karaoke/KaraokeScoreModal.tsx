// Modal kết quả điểm Karaoke — port từ score modal trong karaoke-solo-page.tsx của web

import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  visible: boolean;
  onClose: () => void;
  overall: number | null;
  songTitle?: string | null;
};

export const KaraokeScoreModal: React.FC<Props> = ({ visible, onClose, overall, songTitle }) => {
  if (overall === null) return null;
  const progress = Math.max(0, Math.min(100, overall));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={18} color="#9ca3af" />
          </TouchableOpacity>

          <View style={styles.mark}>
            <Ionicons name="mic" size={20} color="#c4b5fd" />
          </View>
          <Text style={styles.eyebrow}>KẾT QUẢ KARAOKE</Text>
          <Text style={styles.title}>Điểm tổng của bạn</Text>
          {songTitle ? (
            <Text style={styles.song} numberOfLines={1}>{songTitle}</Text>
          ) : null}

          <View style={styles.valueRow}>
            <Text style={styles.value}>{overall.toFixed(1)}</Text>
            <Text style={styles.valueUnit}>/ 100</Text>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>

          <Text style={styles.description}>Cảm ơn bạn đã hát cùng Moodify.</Text>

          <TouchableOpacity style={styles.action} activeOpacity={0.8} onPress={onClose}>
            <Text style={styles.actionText}>Tiếp tục</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 6, 10, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1f1f2e',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#383854',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0c0c10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  eyebrow: {
    color: '#a78bfa',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 6,
  },
  title: {
    color: '#f9fafb',
    fontSize: 20,
    fontWeight: '700',
  },
  song: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 4,
    maxWidth: 260,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 16,
  },
  value: {
    color: '#f9fafb',
    fontSize: 46,
    fontWeight: '800',
  },
  valueUnit: {
    color: '#9ca3af',
    fontSize: 16,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: '#0c0c10',
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#8b5cf6',
  },
  description: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 14,
    textAlign: 'center',
  },
  action: {
    marginTop: 18,
    backgroundColor: '#8b5cf6',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 32,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
