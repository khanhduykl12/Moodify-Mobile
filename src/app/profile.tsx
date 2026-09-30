import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AuthApi } from '@/services/api';
import { Storage } from '@/services/storage';
import { UserProfile } from '@/types';

export default function ProfileScreen() {
  const [dataSaver, setDataSaver] = useState(false);
  const [highQuality, setHighQuality] = useState(true);
  const [cacheSize, setCacheSize] = useState('48.6 MB');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);

  // Auth Modal State
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authLoading, setAuthLoading] = useState(false);

  // Form Fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [fullname, setFullname] = useState('');

  const loadUserProfile = async () => {
    setLoadingUser(true);
    try {
      const token = await Storage.getAccessToken();
      if (token) {
        const profile = await AuthApi.getProfile();
        setUser(profile);
      } else {
        const stored = await Storage.getItem('moodify_user_info');
        if (stored) {
          setUser(JSON.parse(stored));
        } else {
          setUser(null);
        }
      }
    } catch {
      // Fallback
      setUser(null);
    } finally {
      setLoadingUser(false);
    }
  };

  useEffect(() => {
    loadUserProfile();
  }, []);

  const handleClearCache = () => {
    Alert.alert('Xác nhận', 'Bạn có muốn giải phóng bộ nhớ đệm âm thanh và hình ảnh?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa ngay',
        style: 'destructive',
        onPress: () => {
          setCacheSize('0.0 MB');
          Alert.alert('Đã dọn dẹp', 'Bộ nhớ đệm đã được giải phóng thành công.');
        },
      },
    ]);
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
          Alert.alert('Thông báo', 'Đã đăng xuất tài khoản an toàn.');
        },
      },
    ]);
  };

  const handleAuthSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Lỗi', 'Vui lòng điền đầy đủ tài khoản và mật khẩu.');
      return;
    }

    setAuthLoading(true);
    try {
      if (authMode === 'login') {
        const res = await AuthApi.login({
          usernameOrEmail: username.trim(),
          password: password.trim(),
        });
        setUser(res.user);
        setAuthModalVisible(false);
        Alert.alert('Thành công', `Chào mừng trở lại, ${res.user?.fullname || res.user?.username || 'bạn'}!`);
      } else {
        if (!email.trim() || !fullname.trim()) {
          Alert.alert('Lỗi', 'Vui lòng nhập họ tên và email hợp lệ.');
          setAuthLoading(false);
          return;
        }
        const res = await AuthApi.register({
          username: username.trim(),
          password: password.trim(),
          email: email.trim(),
          fullname: fullname.trim(),
        });
        setUser(res.user);
        setAuthModalVisible(false);
        Alert.alert('Thành công', 'Đăng ký tài khoản thành công!');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin.';
      Alert.alert('Lỗi', msg);
    } finally {
      setAuthLoading(false);
    }
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
                  {(user.fullname || user.username || 'K').charAt(0).toUpperCase()}
                </Text>
              </View>

              <View style={styles.userInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {user.fullname || user.username}
                  </Text>
                  <View style={styles.vipBadge}>
                    <Text style={styles.vipText}>{user.role || 'PREMIUM'}</Text>
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
                onPress={() => setAuthModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.loginModalBtnText}>Đăng nhập / Đăng ký</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>147</Text>
              <Text style={styles.statLabel}>Bài hát</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>8</Text>
              <Text style={styles.statLabel}>Danh sách</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>24</Text>
              <Text style={styles.statLabel}>Nghệ sĩ</Text>
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

          {/* Settings Section: Lưu trữ */}
          <Text style={styles.sectionTitle}>BỘ NHỚ & DỮ LIỆU</Text>
          <View style={styles.menuGroup}>
            <TouchableOpacity style={styles.menuItem} onPress={handleClearCache}>
              <View style={styles.menuLeft}>
                <Ionicons name="trash-outline" size={20} color="#f87171" />
                <Text style={styles.menuLabel}>Dọn dẹp bộ nhớ đệm (Cache)</Text>
              </View>
              <Text style={styles.cacheText}>{cacheSize}</Text>
            </TouchableOpacity>
          </View>

          {/* Settings Section: Về ứng dụng */}
          <Text style={styles.sectionTitle}>THÔNG TIN DỰ ÁN</Text>
          <View style={styles.menuGroup}>
            <View style={styles.menuItem}>
              <View style={styles.menuLeft}>
                <Ionicons name="information-circle-outline" size={20} color="#60a5fa" />
                <Text style={styles.menuLabel}>Phiên bản Moodify Mobile</Text>
              </View>
              <Text style={styles.menuValue}>v1.0.0 (Release)</Text>
            </View>

            <View style={styles.menuItem}>
              <View style={styles.menuLeft}>
                <Ionicons name="school-outline" size={20} color="#60a5fa" />
                <Text style={styles.menuLabel}>Đồ án Khoá Luận Tốt Nghiệp</Text>
              </View>
              <Text style={styles.menuValue}>ĐH Công Thương TP.HCM</Text>
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

        {/* Auth Modal (Login / Register) */}
        <Modal
          visible={authModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setAuthModalVisible(false)}
        >
          <View style={styles.authModalBackdrop}>
            <View style={styles.authModalCard}>
              {/* Tab Switcher */}
              <View style={styles.authTabRow}>
                <TouchableOpacity
                  style={[styles.authTab, authMode === 'login' && styles.authTabActive]}
                  onPress={() => setAuthMode('login')}
                >
                  <Text style={[styles.authTabText, authMode === 'login' && styles.authTabTextActive]}>
                    Đăng nhập
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.authTab, authMode === 'register' && styles.authTabActive]}
                  onPress={() => setAuthMode('register')}
                >
                  <Text style={[styles.authTabText, authMode === 'register' && styles.authTabTextActive]}>
                    Đăng ký
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Form Inputs */}
              {authMode === 'register' && (
                <TextInput
                  style={styles.authInput}
                  placeholder="Họ và tên..."
                  placeholderTextColor="#6b7280"
                  value={fullname}
                  onChangeText={setFullname}
                />
              )}

              {authMode === 'register' && (
                <TextInput
                  style={styles.authInput}
                  placeholder="Email..."
                  placeholderTextColor="#6b7280"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              )}

              <TextInput
                style={styles.authInput}
                placeholder={authMode === 'login' ? 'Tên đăng nhập hoặc Email...' : 'Tên đăng nhập...'}
                placeholderTextColor="#6b7280"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />

              <TextInput
                style={styles.authInput}
                placeholder="Mật khẩu..."
                placeholderTextColor="#6b7280"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              {/* Submit Buttons */}
              <TouchableOpacity
                style={styles.authSubmitBtn}
                onPress={handleAuthSubmit}
                disabled={authLoading}
                activeOpacity={0.8}
              >
                {authLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.authSubmitText}>
                    {authMode === 'login' ? 'Đăng nhập ngay' : 'Đăng ký tài khoản'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.authCloseBtn}
                onPress={() => setAuthModalVisible(false)}
              >
                <Text style={styles.authCloseText}>Đóng</Text>
              </TouchableOpacity>
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
  vipText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
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
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#161622',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#262638',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#262638',
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
  menuValue: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '500',
  },
  cacheText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '700',
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

  // Auth Modal
  authModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  authModalCard: {
    width: '100%',
    backgroundColor: '#161622',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#383854',
  },
  authTabRow: {
    flexDirection: 'row',
    backgroundColor: '#0f0f17',
    borderRadius: 12,
    padding: 4,
    marginBottom: 18,
  },
  authTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  authTabActive: {
    backgroundColor: '#8b5cf6',
  },
  authTabText: {
    color: '#9ca3af',
    fontWeight: '700',
    fontSize: 14,
  },
  authTabTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  authInput: {
    backgroundColor: '#0c0c12',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2e2e42',
  },
  authSubmitBtn: {
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  authSubmitText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  authCloseBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  authCloseText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
  },
});
