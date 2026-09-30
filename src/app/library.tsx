import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PlaylistApi, TrackApi } from '@/services/api';
import { Playlist, Track } from '@/types';
import { usePlayer } from '@/context/PlayerContext';

const DEFAULT_PLAYLISTS: Playlist[] = [
  {
    id: 'fav',
    name: 'Bài hát đã thích',
    description: 'Danh sách bài hát yêu thích của bạn',
    coverUrl: null,
    trackCount: 12,
  },
  {
    id: 'p1',
    name: 'Giai điệu thư giãn cuối tuần',
    description: 'Chill, Acoustic, Ballad êm dịu',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500',
    trackCount: 24,
  },
  {
    id: 'p2',
    name: 'Rap Việt On Repeat',
    description: 'Flow đỉnh cao, underground',
    coverUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500',
    trackCount: 18,
  },
  {
    id: 'p3',
    name: 'Năng Lượng Làm Việc',
    description: 'Deep focus, lofi, tập trung',
    coverUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=500',
    trackCount: 30,
  },
];

export default function LibraryScreen() {
  const { playTrack } = usePlayer();
  const [filter, setFilter] = useState('all');
  const [playlists, setPlaylists] = useState<Playlist[]>(DEFAULT_PLAYLISTS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    PlaylistApi.getMyPlaylists()
      .then((data) => {
        if (data && data.length > 0) {
          setPlaylists([DEFAULT_PLAYLISTS[0], ...data]);
        }
      })
      .catch(() => {});
  }, []);

  const handleCreatePlaylist = () => {
    if (!newTitle.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên danh sách phát');
      return;
    }

    const created: Playlist = {
      id: `p_${Date.now()}`,
      name: newTitle.trim(),
      description: newDesc.trim() || 'Danh sách phát mới tạo',
      coverUrl: null,
      trackCount: 0,
    };

    setPlaylists([created, ...playlists]);
    setNewTitle('');
    setNewDesc('');
    setIsModalOpen(false);
    Alert.alert('Thành công', `Đã tạo danh sách phát "${created.name}"`);
  };

  const handlePlaySample = async () => {
    try {
      const data = await TrackApi.getTracks(0, 10);
      if (data.content && data.content.length > 0) {
        playTrack(data.content[0], data.content);
      }
    } catch {}
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>K</Text>
            </View>
            <Text style={styles.headerTitle}>Thư viện</Text>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="search" size={22} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setIsModalOpen(true)}>
              <Ionicons name="add" size={28} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {['all', 'playlists', 'artists', 'downloaded'].map((item) => {
            const labels: Record<string, string> = {
              all: 'Tất cả',
              playlists: 'Danh sách phát',
              artists: 'Nghệ sĩ',
              downloaded: 'Đã tải xuống',
            };
            const active = filter === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(item)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {labels[item]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Playlist List */}
        <FlatList
          data={playlists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isFav = item.id === 'fav';
            return (
              <TouchableOpacity
                style={styles.playlistItem}
                onPress={handlePlaySample}
                activeOpacity={0.7}
              >
                {isFav ? (
                  <View style={styles.favCover}>
                    <Ionicons name="heart" size={26} color="#ffffff" />
                  </View>
                ) : item.coverUrl ? (
                  <Image source={{ uri: item.coverUrl }} style={styles.cover} />
                ) : (
                  <View style={styles.placeholderCover}>
                    <Ionicons name="musical-notes" size={26} color="#8b5cf6" />
                  </View>
                )}

                <View style={styles.info}>
                  <Text style={styles.playlistName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.playlistMeta} numberOfLines={1}>
                    Danh sách phát • {item.trackCount || 0} bài hát
                  </Text>
                </View>

                {isFav && (
                  <View style={styles.pinBadge}>
                    <Ionicons name="pin" size={14} color="#8b5cf6" />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />

        {/* Create Playlist Modal */}
        <Modal
          visible={isModalOpen}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setIsModalOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Tạo danh sách phát</Text>
              <Text style={styles.modalSubtitle}>Đặt tên cho playlist cảm xúc của bạn</Text>

              <TextInput
                style={styles.modalInput}
                placeholder="Tên danh sách phát..."
                placeholderTextColor="#6b7280"
                value={newTitle}
                onChangeText={setNewTitle}
                autoFocus
              />

              <TextInput
                style={[styles.modalInput, { height: 70 }]}
                placeholder="Mô tả (tùy chọn)..."
                placeholderTextColor="#6b7280"
                value={newDesc}
                onChangeText={setNewDesc}
                multiline
              />

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setIsModalOpen(false)}
                >
                  <Text style={styles.modalCancelText}>Hủy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalSubmitBtn}
                  onPress={handleCreatePlaylist}
                >
                  <Text style={styles.modalSubmitText}>Tạo ngay</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0c10',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 6,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1e1e28',
  },
  filterChipActive: {
    backgroundColor: '#8b5cf6',
  },
  filterText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 110,
    gap: 8,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  favCover: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cover: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#1f1f2e',
    marginRight: 14,
  },
  placeholderCover: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#1f1f2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  info: {
    flex: 1,
  },
  playlistName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  playlistMeta: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 4,
  },
  pinBadge: {
    padding: 6,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#1f1f2e',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#383854',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#12121a',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2e2e40',
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: '#9ca3af',
    fontWeight: '700',
    fontSize: 14,
  },
  modalSubmitBtn: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  modalSubmitText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
});
