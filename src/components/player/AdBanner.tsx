import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { usePlayer } from '@/context/PlayerContext';
import { AdReason } from '@/types';

// Khớp AD_SKIP_DELAY của web: gói Tiết Kiệm được bỏ qua sau 5 giây
const AD_SKIP_DELAY = 5;

const reasonTextMap: Record<Exclude<AdReason, null>, string> = {
  FREE_REGULAR: 'Gói miễn phí — nâng cấp để nghe không quảng cáo',
  BASIC_DAILY_LIMIT_EXCEEDED: 'Bạn đã hết hạn mức không quảng cáo hôm nay',
  SKIP_PENALTY: 'Bạn đang nghe quảng cáo do vượt giới hạn chuyển bài',
};

interface AdBannerProps {
  variant?: 'mini' | 'full';
}

/**
 * Banner interstitial hiển thị khi Ad Engine đang phát quảng cáo.
 * - variant "mini": thay thế MiniPlayer card.
 * - variant "full": khối nổi bên trong FullscreenPlayer.
 * Nút "Bỏ qua" chỉ bật cho gói Tiết Kiệm/VIP sau AD_SKIP_DELAY giây;
 * tài khoản FREE thấy nút VIP dẫn sang màn Tài khoản để nâng cấp.
 */
export const AdBanner: React.FC<AdBannerProps> = ({ variant = 'mini' }) => {
  const {
    adReason,
    adSecondsRemaining,
    adTotalDuration,
    currentAdTitle,
    canSkipAd,
    skipAd,
  } = usePlayer();

  const elapsed = Math.max(0, adTotalDuration - adSecondsRemaining);
  const skipEnabled = canSkipAd && (adSecondsRemaining <= 0 || elapsed >= AD_SKIP_DELAY);
  const reasonText = (adReason && reasonTextMap[adReason]) || 'Quảng cáo trên Moodify';

  const handleUpgrade = () => {
    router.push('/(tabs)/profile');
  };

  if (variant === 'mini') {
    return (
      <View style={styles.miniCard}>
        <View style={styles.miniBadge}>
          <Text style={styles.miniBadgeText}>QC</Text>
        </View>

        <View style={styles.miniInfo}>
          <Text style={styles.miniTitle} numberOfLines={1}>
            {currentAdTitle || 'Moodify Ads'}
          </Text>
          <Text style={styles.miniSubtitle} numberOfLines={1}>
            {adSecondsRemaining > 0 ? `Kết thúc sau ${adSecondsRemaining}s • ${reasonText}` : reasonText}
          </Text>
        </View>

        {skipEnabled ? (
          <TouchableOpacity
            style={styles.miniSkipBtn}
            onPress={() => skipAd()}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="play-skip-forward" size={18} color="#ffffff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.miniUpgradeChip} onPress={handleUpgrade} activeOpacity={0.8}>
            <Ionicons name="diamond" size={12} color="#000000" />
            <Text style={styles.miniUpgradeChipText}>VIP</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.fullCard}>
      <View style={styles.fullHeader}>
        <View style={styles.fullBadge}>
          <Text style={styles.fullBadgeText}>QUẢNG CÁO</Text>
        </View>
        {adSecondsRemaining > 0 && (
          <View style={styles.countdownBox}>
            <Text style={styles.countdownText}>{adSecondsRemaining}s</Text>
          </View>
        )}
      </View>

      <Text style={styles.fullTitle} numberOfLines={1}>
        {currentAdTitle || 'Moodify Ads'}
      </Text>
      <Text style={styles.fullReason}>{reasonText}</Text>

      <View style={styles.fullActions}>
        <TouchableOpacity style={styles.fullUpgradeBtn} onPress={handleUpgrade} activeOpacity={0.85}>
          <Ionicons name="diamond" size={14} color="#000000" />
          <Text style={styles.fullUpgradeText}>Nâng cấp để bỏ quảng cáo</Text>
        </TouchableOpacity>

        {skipEnabled && (
          <TouchableOpacity style={styles.fullSkipBtn} onPress={() => skipAd()} activeOpacity={0.85}>
            <Ionicons name="play-skip-forward" size={15} color="#ffffff" />
            <Text style={styles.fullSkipText}>Bỏ qua quảng cáo</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // ── Variant mini ──
  miniCard: {
    backgroundColor: '#221b33',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  miniBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  miniInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  miniTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  miniSubtitle: {
    color: '#c4b5fd',
    fontSize: 11,
    marginTop: 2,
  },
  miniSkipBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniUpgradeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fbbf24',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
  },
  miniUpgradeChipText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '900',
  },

  // ── Variant full ──
  fullCard: {
    backgroundColor: 'rgba(34, 27, 51, 0.85)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#8b5cf6',
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 16,
  },
  fullHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  fullBadge: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  fullBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  countdownBox: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  countdownText: {
    color: '#c4b5fd',
    fontSize: 12,
    fontWeight: '800',
  },
  fullTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  fullReason: {
    color: '#c4b5fd',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  fullActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  fullUpgradeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fbbf24',
    paddingVertical: 11,
    borderRadius: 20,
  },
  fullUpgradeText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
  fullSkipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#6366f1',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 20,
  },
  fullSkipText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Ad-only fullscreen state ──
  adOnlyWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  adOnlyCenter: {
    alignItems: 'center',
    marginTop: 24,
  },
});
