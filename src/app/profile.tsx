import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { AuthApi } from '@/services/api';
import { Storage } from '@/services/storage';

export default function ProfileScreen() {
  const [dataSaver, setDataSaver] = useState(false);
  const [highQuality, setHighQuality] = useState(true);
  const [cacheSize, setCacheSize] = useState('48.6 MB');

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
          await Storage.clearTokens();
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
          <View style={styles.userCard}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>K</Text>
            </View>

            <View style={styles.userInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.userName}>Khánh Duy</Text>
                <View style={styles.vipBadge}>
                  <Text style={styles.vipText}>PREMIUM</Text>
                </View>
              </View>
              <Text style={styles.userHandle}>@khanhduykl12</Text>
              <Text style={styles.userRole}>Thành viên VIP • Moodify Gold</Text>
            </View>
          </View>

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
                <Text style={styles.menuLabel}>Chất lượng âm thanh cao</Text>
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

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={20} color="#ef4444" style={{ marginRight: 8 }} />
            <Text style={styles.logoutText}>Đăng xuất tài khoản</Text>
          </TouchableOpacity>

          <View style={{ height: 110 }} />
        </ScrollView>
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
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 2,
  },
  userRole: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#161622',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#262638',
  },
  statBox: {
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
    height: 24,
    backgroundColor: '#262638',
  },
  sectionTitle: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  menuGroup: {
    backgroundColor: '#161622',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#262638',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#262638',
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
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  logoutText: {
    color: '#f87171',
    fontWeight: '700',
    fontSize: 15,
  },
});
