// Danh sách phòng Karaoke — port từ karaoke-rooms-page.tsx của web
// List phòng realtime qua WebSocket + tạo phòng + mã mời

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { KaraokeApi } from '@/services/api';
import { useKaraokeRoomLive } from '@/hooks/use-karaoke-room-live';
import type { KaraokeRoomCreated, KaraokeRoomSummary, KaraokeRoomVisibility } from '@/types';

export default function KaraokeRoomsScreen() {
  const router = useRouter();
  const [rooms, setRooms] = useState<KaraokeRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdRoom, setCreatedRoom] = useState<KaraokeRoomCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [maxMembers, setMaxMembers] = useState(6);
  const [visibility, setVisibility] = useState<KaraokeRoomVisibility>('PUBLIC');

  const loadRooms = useCallback(async () => {
    try {
      setRooms(await KaraokeApi.getRooms());
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể tải danh sách phòng.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  // Phòng mới/đóng realtime → tải lại danh sách
  useKaraokeRoomLive({
    scope: 'rooms',
    enabled: true,
    onEvent: useCallback(() => {
      void loadRooms();
    }, [loadRooms]),
  });

  const openRoom = (roomId: number) => router.push(`/karaoke/room/${roomId}`);

  const createRoom = async () => {
    const trimmedName = roomName.trim();
    if (!trimmedName || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const created = await KaraokeApi.createRoom({ name: trimmedName, maxMembers, visibility });
      setIsCreateOpen(false);
      setRoomName('');
      if (created.visibility === 'PRIVATE' && created.inviteCode) {
        setCreatedRoom(created);
      } else {
        openRoom(created.id);
      }
      void loadRooms();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Không thể tạo phòng.');
    } finally {
      setCreating(false);
    }
  };

  const copyInviteCode = async () => {
    if (!createdRoom?.inviteCode) return;
    try {
      Clipboard.setString(createdRoom.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCreateError('Không thể sao chép mã mời. Hãy ghi lại mã thủ công.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color="#e5e7eb" />
            <Text style={styles.backText}>Chọn chế độ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.createButton}
            activeOpacity={0.8}
            onPress={() => {
              setCreateError('');
              setIsCreateOpen(true);
            }}
          >
            <Ionicons name="add" size={16} color="#ffffff" />
            <Text style={styles.createButtonText}>Tạo phòng</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.intro}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowLine} />
            <Text style={styles.eyebrow}>MOODIFY KARAOKE</Text>
            <View style={styles.eyebrowLine} />
          </View>
          <Text style={styles.title}>Chọn phòng hát.</Text>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionKicker}>CỘNG ĐỒNG KARAOKE</Text>
            <Text style={styles.sectionHeading}>Phòng đang mở</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{rooms.length} phòng</Text>
          </View>
        </View>

        {loadError ? (
          <View style={styles.messageCard}>
            <Text style={styles.messageTitle}>Không tải được phòng</Text>
            <Text style={styles.messageBody}>{loadError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => void loadRooms()}>
              <Ionicons name="refresh" size={14} color="#c4b5fd" />
              <Text style={styles.retryText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : loading && rooms.length === 0 ? (
          <View style={styles.messageCard}>
            <ActivityIndicator color="#8b5cf6" />
            <Text style={styles.messageBody}>Đang tải phòng…</Text>
          </View>
        ) : rooms.length ? (
          <View style={styles.roomList}>
            {rooms.map((room) => (
              <TouchableOpacity
                key={room.id}
                style={[styles.roomCard, room.visibility === 'PRIVATE' && styles.roomCardPrivate]}
                activeOpacity={0.8}
                onPress={() => openRoom(room.id)}
              >
                <View style={styles.roomCardTop}>
                  <View style={styles.roomCardIcon}>
                    <Ionicons
                      name={room.visibility === 'PRIVATE' ? 'lock-closed' : 'people'}
                      size={18}
                      color={room.visibility === 'PRIVATE' ? '#fbbf24' : '#93c5fd'}
                    />
                  </View>
                  <View style={styles.roomStatus}>
                    <Ionicons
                      name={room.visibility === 'PRIVATE' ? 'lock-closed' : 'radio'}
                      size={10}
                      color={room.visibility === 'PRIVATE' ? '#fbbf24' : '#10b981'}
                    />
                    <Text
                      style={[
                        styles.roomStatusText,
                        { color: room.visibility === 'PRIVATE' ? '#fbbf24' : '#10b981' },
                      ]}
                    >
                      {room.visibility === 'PRIVATE' ? 'Cần mã mời' : 'Đang mở'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.roomName} numberOfLines={1}>{room.name}</Text>
                <Text style={styles.roomHost} numberOfLines={1}>
                  Chủ phòng: <Text style={styles.roomHostStrong}>{room.hostName}</Text>
                </Text>
                <View style={styles.roomMetaRow}>
                  <View style={styles.roomMetaItem}>
                    <Ionicons name="people" size={13} color="#9ca3af" />
                    <Text style={styles.roomMetaText}>{room.memberCount}/{room.maxMembers} người</Text>
                  </View>
                  <View style={styles.roomMetaItem}>
                    <Ionicons
                      name={room.visibility === 'PRIVATE' ? 'lock-closed' : 'globe'}
                      size={12}
                      color="#9ca3af"
                    />
                    <Text style={styles.roomMetaText}>{room.visibility === 'PRIVATE' ? 'Riêng tư' : 'Công khai'}</Text>
                  </View>
                </View>
                <View style={styles.roomJoinButton}>
                  <Text style={styles.roomJoinText}>
                    {room.visibility === 'PRIVATE' ? 'Nhập mã mời' : 'Vào phòng'}
                  </Text>
                  <Ionicons name="arrow-forward" size={14} color="#ffffff" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="people" size={27} color="#6b7280" />
            <Text style={styles.messageTitle}>Chưa có phòng nào</Text>
            <Text style={styles.messageBody}>Tạo phòng mới để bắt đầu.</Text>
          </View>
        )}
      </ScrollView>

      {/* Modal tạo phòng */}
      <Modal
        visible={isCreateOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!creating) setIsCreateOpen(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalKicker}>PHÒNG KARAOKE</Text>
            <Text style={styles.modalTitle}>Tạo phòng mới</Text>
            <Text style={styles.modalFieldLabel}>Tên phòng</Text>
            <TextInput
              style={styles.textInput}
              value={roomName}
              onChangeText={setRoomName}
              placeholder="Ví dụ: Đêm nhạc cuối tuần"
              placeholderTextColor="#6b7280"
              maxLength={40}
            />
            <Text style={styles.modalFieldLabel}>Số người tối đa</Text>
            <View style={styles.chipRow}>
              {[2, 3, 4, 5, 6].map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.chip, maxMembers === value && styles.chipActive]}
                  onPress={() => setMaxMembers(value)}
                >
                  <Text style={[styles.chipText, maxMembers === value && styles.chipTextActive]}>{value}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalFieldLabel}>Ai có thể thấy phòng?</Text>
            <View style={styles.chipRow}>
              {(['PUBLIC', 'PRIVATE'] as KaraokeRoomVisibility[]).map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.chip, visibility === value && styles.chipActive]}
                  onPress={() => setVisibility(value)}
                >
                  <Text style={[styles.chipText, visibility === value && styles.chipTextActive]}>
                    {value === 'PUBLIC' ? 'Công khai' : 'Riêng tư (mã mời)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {createError ? <Text style={styles.formError}>{createError}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                disabled={creating}
                onPress={() => setIsCreateOpen(false)}
              >
                <Text style={styles.secondaryButtonText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, (!roomName.trim() || creating) && styles.primaryButtonDisabled]}
                disabled={!roomName.trim() || creating}
                onPress={() => void createRoom()}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Tạo phòng</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal mã mời phòng riêng */}
      <Modal visible={createdRoom !== null} transparent animationType="fade" onRequestClose={() => setCreatedRoom(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.inviteIcon}>
              <Ionicons name="lock-closed" size={20} color="#fbbf24" />
            </View>
            <Text style={styles.modalKicker}>PHÒNG RIÊNG</Text>
            <Text style={styles.modalTitle}>{createdRoom?.name}</Text>
            <Text style={styles.modalDescription}>Chia sẻ mã mời để bạn bè tham gia buổi hát.</Text>
            <View style={styles.inviteCodeBox}>
              <Text style={styles.inviteCodeText}>{createdRoom?.inviteCode ?? ''}</Text>
            </View>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => void copyInviteCode()}>
              <Text style={styles.secondaryButtonText}>{copied ? 'Đã sao chép!' : 'Sao chép mã mời'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                const roomId = createdRoom?.id;
                setCreatedRoom(null);
                if (roomId) openRoom(roomId);
              }}
            >
              <Text style={styles.primaryButtonText}>Vào phòng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
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
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#8b5cf6',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
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
  },
  countBadge: {
    backgroundColor: '#1f1f2e',
    borderWidth: 1,
    borderColor: '#383854',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countBadgeText: {
    color: '#9ca3af',
    fontSize: 11,
  },
  roomList: {
    gap: 12,
  },
  roomCard: {
    backgroundColor: '#1f1f2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#383854',
    padding: 14,
    gap: 8,
  },
  roomCardPrivate: {
    borderColor: 'rgba(251, 191, 36, 0.35)',
  },
  roomCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0c0c10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roomStatusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  roomName: {
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '700',
  },
  roomHost: {
    color: '#9ca3af',
    fontSize: 12,
  },
  roomHostStrong: {
    color: '#e5e7eb',
    fontWeight: '600',
  },
  roomMetaRow: {
    flexDirection: 'row',
    gap: 16,
  },
  roomMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  roomMetaText: {
    color: '#9ca3af',
    fontSize: 11,
  },
  roomJoinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    paddingVertical: 9,
    marginTop: 2,
  },
  roomJoinText: {
    color: '#ffffff',
    fontSize: 12,
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
  },
  emptyCard: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#14141f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#383854',
    paddingVertical: 32,
    paddingHorizontal: 16,
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
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#383854',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryText: {
    color: '#c4b5fd',
    fontSize: 12,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 6, 10, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1f1f2e',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#383854',
    padding: 20,
    gap: 10,
  },
  inviteIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  modalKicker: {
    color: '#a78bfa',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
  modalTitle: {
    color: '#f9fafb',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalDescription: {
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center',
  },
  modalFieldLabel: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  textInput: {
    backgroundColor: '#0c0c10',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#383854',
    color: '#f3f4f6',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#383854',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: {
    borderColor: '#8b5cf6',
    backgroundColor: 'rgba(139, 92, 246, 0.16)',
  },
  chipText: {
    color: '#9ca3af',
    fontSize: 12,
  },
  chipTextActive: {
    color: '#c4b5fd',
    fontWeight: '700',
  },
  formError: {
    color: '#f87171',
    fontSize: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#383854',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '600',
  },
  inviteCodeBox: {
    backgroundColor: '#0c0c10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.5)',
    alignItems: 'center',
    paddingVertical: 14,
  },
  inviteCodeText: {
    color: '#c4b5fd',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 4,
  },
});
