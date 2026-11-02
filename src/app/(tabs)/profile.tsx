import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AuthApi, SubscriptionApi } from '@/services/api';
import { Storage } from '@/services/storage';
import { UserProfile, SubscriptionInfo } from '@/types';
import { PremiumModal } from '@/components/subscription/PremiumModal';
import { usePlayer } from '@/context/PlayerContext';

const pad2 = (n: number) => String(n).padStart(2, '0');

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
};

export default function ProfileScreen() {
  const [dataSaver, setDataSaver] = useState(false);
  const [highQuality, setHighQuality] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);

  const isPremium = subscription?.isPremium === true;

  const [premiumModalVisible, setPremiumModalVisible] = useState(false);
  const [resumePremiumPackageId, setResumePremiumPackageId] = useState<number | null>(null);
  const pendingPremiumPackageIdRef = useRef<number | null>(null);

  // Player đọc entitlements (chính sách quảng cáo, hạn mức skip) — cập nhật ngay khi đổi gói
  const { refreshEntitlements } = usePlayer();

  const loadUserProfile = async () => {
    setLoadingUser(true);
    try {
      const token = await Storage.getAccessToken();
      if (token) {
        const [profile, sub] = await Promise.all([
          AuthApi.getProfile(),
          SubscriptionApi.getMySubscription(),
        ]);
        setUser(profile);
        setSubscription(sub);
      } else {
        const stored = await Storage.getItem('moodify_user_info');
        if (stored) {
          setUser(JSON.parse(stored));
        } else {
          setUser(null);
        }
        setSubscription(null);
      }
    } catch {
      // Fallback
      setUser(null);
      setSubscription(null);
    } finally {
      setLoadingUser(false);
    }
  };

  // Tải lại profile mỗi khi màn hình được focus (vd: quay lại từ trang Đăng nhập)
  useFocusEffect(
    useCallback(() => {
      loadUserProfile();
      const pendingPackageId = pendingPremiumPackageIdRef.current;
      if (pendingPackageId !== null) {
        pendingPremiumPackageIdRef.current = null;
        setResumePremiumPackageId(pendingPackageId);
        setPremiumModalVisible(true);
      }
    }, [])
  );

  const handlePremiumLoginRequired = (packageId: number) => {
    pendingPremiumPackageIdRef.current = packageId;
    setPremiumModalVisible(false);
    router.push('/auth');
  };

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất khỏi Moodify?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          await AuthApi.logout();
          setUser(null);
          setSubscription(null);
          void refreshEntitlements();
          Alert.alert('Thông báo', 'Đã đăng xuất tài khoản an toàn.');
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Tài khoản</Text>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* User Card */}
          {user ? (
            <View style={styles.userCard}>
              <View style={styles.avatarLarge}>
                <Text style={styles.avatarLargeText}>
                  {(user.fullName || user.username || 'K').charAt(0).toUpperCase()}
                </Text>
              </View>

              <View style={styles.userInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {user.fullName || user.username}
                  </Text>
                  <View style={[styles.vipBadge, !isPremium && styles.vipBadgeFree]}>
                    <Text style={[styles.vipText, !isPremium && styles.vipTextFree]}>
                      {isPremium ? 'VIP PREMIUM' : user.role || 'FREE'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.userHandle}>@{user.username}</Text>
                <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.guestCard}>
              <View style={styles.guestLeft}>
                <View style={styles.avatarGuest}>
                  <Ionicons name="person" size={26} color="#9ca3af" />
                </View>
                <View>
                  <Text style={styles.guestTitle}>Khách vãng lai</Text>
                  <Text style={styles.guestSubtitle}>Đăng nhập để đồng bộ thư viện và playlist</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.loginModalBtn}
                onPress={() => router.push('/auth')}
                activeOpacity={0.8}
              >
                <Text style={styles.loginModalBtnText}>Đăng nhập / Đăng ký</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* VIP Premium Banner */}
          <View style={styles.vipBannerCard}>
            <View style={styles.vipBannerContent}>
              <View style={styles.vipBannerLeft}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={styles.vipBannerTitle}>Moodify VIP Premium</Text>
                    <View style={styles.vipTag}>
                      <Text style={styles.vipTagText}>LOSSLESS</Text>
                    </View>
                  </View>
                  <Text style={styles.vipBannerSub}>
                    Mở khóa kho nhạc VIP, âm thanh chất lượng 320kbps & không giới hạn chuyển bài.
                  </Text>
                </View>
              </View>

              {isPremium && (
                <View style={styles.activePlanRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#34d399" />
                  <Text style={styles.activePlanText} numberOfLines={2}>
                    Đang sử dụng {subscription?.tierName || 'gói VIP'} • còn{' '}
                    {subscription?.daysRemaining ?? 0} ngày
                    {subscription?.expiresAt ? ` (hết hạn ${formatDate(subscription.expiresAt)})` : ''}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.vipUpgradeBtn}
                onPress={() => setPremiumModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.vipUpgradeBtnText}>
                  {isPremium ? 'Gia hạn / Nâng cấp gói' : 'Nâng cấp ngay'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Settings Section: Âm thanh & Phát lại */}
          <Text style={styles.sectionTitle}>CÀI ĐẶT ÂM THANH</Text>
          <View style={styles.menuGroup}>
            <View style={styles.menuItem}>
              <View style={styles.menuLeft}>
                <Ionicons name="musical-notes-outline" size={20} color="#a78bfa" />
                <Text style={styles.menuLabel}>Chất lượng âm thanh cao (Lossless)</Text>
              </View>
              <Switch
                value={highQuality}
                onValueChange={setHighQuality}
                thumbColor="#ffffff"
                trackColor={{ false: '#374151', true: '#8b5cf6' }}
              />
            </View>

            <View style={styles.menuItem}>
              <View style={styles.menuLeft}>
                <Ionicons name="cellular-outline" size={20} color="#a78bfa" />
                <Text style={styles.menuLabel}>Tiết kiệm dữ liệu di động</Text>
              </View>
              <Switch
                value={dataSaver}
                onValueChange={setDataSaver}
                thumbColor="#ffffff"
                trackColor={{ false: '#374151', true: '#8b5cf6' }}
              />
            </View>
          </View>

          {/* Logout Button if logged in */}
          {user && (
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={20} color="#ef4444" style={{ marginRight: 8 }} />
              <Text style={styles.logoutText}>Đăng xuất tài khoản</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 110 }} />
        </ScrollView>

        {/* Premium Upgrade Modal */}
        <PremiumModal
          visible={premiumModalVisible}
          initialPackageId={resumePremiumPackageId}
          onLoginRequired={handlePremiumLoginRequired}
          onClose={() => setPremiumModalVisible(false)}
          onSuccess={() => {
            // Thanh toán thành công: nạp lại trạng thái VIP + quyền hạn player ngay,
            // modal vẫn mở để hiển thị màn hình kích hoạt rồi người dùng tự đóng.
            loadUserProfile();
            void refreshEntitlements();
          }}
        />
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
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
  },
  iconBtn: {
    padding: 6,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161622',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#262638',
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarLargeText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  userInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  vipBadge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  vipBadgeFree: {
    backgroundColor: '#374151',
  },
  vipText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  vipTextFree: {
    color: '#d1d5db',
  },
  activePlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 14,
  },
  activePlanText: {
    flex: 1,
    color: '#a7f3d0',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  userHandle: {
    color: '#a78bfa',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  userEmail: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
  guestCard: {
    backgroundColor: '#161622',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#262638',
  },
  vipBannerCard: {
    backgroundColor: '#1c152e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#8b5cf6',
  },
  vipBannerContent: {},
  vipBannerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  vipBannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginRight: 8,
  },
  vipTag: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  vipTagText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  vipBannerSub: {
    fontSize: 12,
    color: '#c4b5fd',
    lineHeight: 18,
  },
  vipUpgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fbbf24',
    paddingVertical: 11,
    borderRadius: 10,
  },
  vipUpgradeBtnText: {
    color: '#0c0c10',
    fontSize: 14,
    fontWeight: '800',
  },
  guestLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarGuest: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#26263a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  guestTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  guestSubtitle: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
  loginModalBtn: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  loginModalBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  menuGroup: {
    backgroundColor: '#161622',
    borderRadius: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#262638',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#20202e',
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: '#ef4444',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 6,
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '800',
  },
});
