import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NotificationApi } from '@/services/api';
import { NotificationItem } from '@/types';

const { width } = Dimensions.get('window');

interface NotificationModalProps {
  visible: boolean;
  onClose: () => void;
  onNotificationsUpdated?: (unreadCount: number) => void;
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'Gần đây';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return date.toLocaleDateString('vi-VN');
  } catch {
    return 'Gần đây';
  }
}

function getTypeMeta(type?: string): { label: string; color: string; icon: any } {
  switch (type) {
    case 'BILLING':
      return { label: 'GIAO DỊCH', color: '#10b981', icon: 'card-outline' };
    case 'PROMO':
      return { label: 'ƯU ĐÃI', color: '#ec4899', icon: 'gift-outline' };
    case 'ANNOUNCEMENT':
      return { label: 'TIN TỨC', color: '#f59e0b', icon: 'megaphone-outline' };
    case 'MODERATION':
      return { label: 'QUY ĐỊNH', color: '#f87171', icon: 'shield-outline' };
    default:
      return { label: 'HỆ THỐNG', color: '#60a5fa', icon: 'notifications-outline' };
  }
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  visible,
  onClose,
  onNotificationsUpdated,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const data = await NotificationApi.getMyNotifications(40);
      setNotifications(data.items);
      setUnreadCount(data.unreadCount);
      onNotificationsUpdated?.(data.unreadCount);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadNotifications();
    }
  }, [visible]);

  const handleMarkRead = async (item: NotificationItem) => {
    if (!item.isRead && !item.readAt) {
      await NotificationApi.markRead(item.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      );
      const newCount = Math.max(0, unreadCount - 1);
      setUnreadCount(newCount);
      onNotificationsUpdated?.(newCount);
    }
  };

  const handleMarkAllRead = async () => {
    await NotificationApi.markAllRead();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);
    onNotificationsUpdated?.(0);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backBtn}>
              <Ionicons name="chevron-down" size={28} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.headerTitleBox}>
              <Text style={styles.headerTitle}>Thông báo</Text>
              {unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </View>

            {unreadCount > 0 ? (
              <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn}>
                <Text style={styles.markAllText}>Đã đọc tất cả</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>

          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text style={styles.loadingText}>Đang tải thông báo...</Text>
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.centerBox}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="notifications-off-outline" size={36} color="#6b7280" />
              </View>
              <Text style={styles.emptyTitle}>Chưa có thông báo nào</Text>
              <Text style={styles.emptySub}>
                Các cập nhật âm nhạc, thanh toán gói VIP và tính năng mới sẽ hiển thị tại đây.
              </Text>
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isRead = item.isRead || item.readAt !== null;
                const typeMeta = getTypeMeta(item.type);

                return (
                  <TouchableOpacity
                    style={[styles.notificationCard, !isRead && styles.notificationCardUnread]}
                    activeOpacity={0.8}
                    onPress={() => handleMarkRead(item)}
                  >
                    <View style={styles.cardHeader}>
                      <View style={[styles.typeBadge, { backgroundColor: `${typeMeta.color}20` }]}>
                        <Ionicons name={typeMeta.icon} size={12} color={typeMeta.color} style={{ marginRight: 4 }} />
                        <Text style={[styles.typeText, { color: typeMeta.color }]}>
                          {typeMeta.label}
                        </Text>
                      </View>
                      <Text style={styles.timeText}>{formatRelativeTime(item.createdAt)}</Text>
                    </View>

                    <Text style={[styles.itemTitle, !isRead && styles.itemTitleUnread]}>
                      {item.title}
                    </Text>

                    <Text style={styles.itemMessage}>{item.message}</Text>

                    {!isRead && <View style={styles.unreadDot} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a24',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  unreadBadge: {
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  markAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  markAllText: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '700',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    color: '#9ca3af',
    marginTop: 12,
    fontSize: 13,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#161622',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySub: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  notificationCard: {
    backgroundColor: '#161622',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222232',
    position: 'relative',
  },
  notificationCardUnread: {
    backgroundColor: '#1a172e',
    borderColor: '#8b5cf6',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  timeText: {
    fontSize: 11,
    color: '#6b7280',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e5e7eb',
    marginBottom: 4,
  },
  itemTitleUnread: {
    color: '#ffffff',
    fontWeight: '800',
  },
  itemMessage: {
    fontSize: 13,
    color: '#9ca3af',
    lineHeight: 18,
  },
  unreadDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8b5cf6',
  },
});
