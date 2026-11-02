import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { AxiosError } from 'axios';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SubscriptionApi } from '@/services/api';
import { API_BASE_URL } from '@/constants/config';
import { Storage } from '@/services/storage';
import { SubscriptionPackage, CheckoutResult, PaymentStatusResult } from '@/types';

const { width } = Dimensions.get('window');

const QR_VALIDITY_SECONDS = 15 * 60;
const POLL_INTERVAL_MS = 3000;

const pad2 = (n: number) => String(n).padStart(2, '0');

const formatCountdown = (secs: number) =>
  `${pad2(Math.floor(secs / 60))}:${pad2(Math.max(0, secs % 60))}`;

// Backend trả ngày dạng "yyyy-MM-dd HH:mm:ss" (có thể kèm ".0" từ Timestamp)
const formatPlanDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const isFinalFailedStatus = (status?: string) =>
  status === 'CANCELLED' || status === 'EXPIRED' || status === 'FAILED';

interface PremiumModalProps {
  visible: boolean;
  onClose: () => void;
  onLoginRequired: (packageId: number) => void;
  initialPackageId?: number | null;
  onSuccess?: () => void;
}

type PollingStatus = 'IDLE' | 'POLLING' | 'SUCCESS' | 'EXPIRED';

interface SuccessInfo {
  isScheduled: boolean;
  packageName?: string;
  startAt?: string | null;
  expiresAt?: string | null;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({
  visible,
  onClose,
  onLoginRequired,
  initialPackageId,
  onSuccess,
}) => {
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<SubscriptionPackage | null>(null);
  const selectedPackageIdRef = useRef<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [processing, setProcessing] = useState<boolean>(false);
  const [checkoutData, setCheckoutData] = useState<CheckoutResult | null>(null);
  const [checkingPayment, setCheckingPayment] = useState<boolean>(false);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [packageReloadKey, setPackageReloadKey] = useState(0);
  const [pollingStatus, setPollingStatus] = useState<PollingStatus>('IDLE');
  const [countdownSeconds, setCountdownSeconds] = useState(QR_VALIDITY_SECONDS);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);

  // Dùng ref để callback không phải dependency của effect polling
  // (Profile truyền arrow function mới mỗi render).
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (!visible) return;

    let active = true;
    const loadPackages = async () => {
      setLoading(true);
      setCheckoutData(null);
      setPollingStatus('IDLE');
      setSuccessInfo(null);
      setCountdownSeconds(QR_VALIDITY_SECONDS);
      setPackageError(null);
      setPackages([]);

      try {
        const data = await SubscriptionApi.getPackages();
        if (!active) return;

        setPackages(data);
        const preservedPackage =
          data.find((pkg) => pkg.id === selectedPackageIdRef.current) ??
          data.find((pkg) => pkg.id === initialPackageId);
        const nextPackage = preservedPackage ?? data[0] ?? null;
        setSelectedPackage(nextPackage);
        selectedPackageIdRef.current = nextPackage?.id ?? null;
        if (data.length === 0) {
          setPackageError('Hiện chưa có gói cước nào đang mở bán.');
        }
      } catch {
        if (!active) return;
        setSelectedPackage(null);
        selectedPackageIdRef.current = null;
        setPackageError('Không thể tải gói cước từ máy chủ. Vui lòng kiểm tra kết nối và thử lại.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPackages();
    return () => {
      active = false;
    };
  }, [visible, packageReloadKey, initialPackageId]);

  const handleCheckout = async () => {
    if (!selectedPackage) return;

    const accessToken = await Storage.getAccessToken();
    const refreshToken = await Storage.getRefreshToken();
    if (!accessToken && !refreshToken) {
      Alert.alert('Cần đăng nhập', 'Đăng nhập tài khoản Moodify trước khi tạo thanh toán.', [
        { text: 'Để sau', style: 'cancel' },
        { text: 'Đăng nhập', onPress: () => onLoginRequired(selectedPackage.id) },
      ]);
      return;
    }

    setProcessing(true);
    try {
      const result = await SubscriptionApi.checkout(selectedPackage.id);
      setSuccessInfo(null);
      setCountdownSeconds(QR_VALIDITY_SECONDS);
      setCheckoutData(result);
      setPollingStatus('POLLING');
    } catch (error) {
      const checkoutError = error as AxiosError<{
        message?: string;
        detail?: string;
        error?: string;
        title?: string;
      }>;
      const status = checkoutError.response?.status;
      const responseBody = checkoutError.response?.data;
      const serverMessage =
        responseBody?.message || responseBody?.detail || responseBody?.error || responseBody?.title;
      const errorMessage = error instanceof Error ? error.message : 'Lỗi không xác định.';

      console.warn('[Checkout] Không tạo được thanh toán', {
        apiBaseUrl: API_BASE_URL,
        status: status ?? null,
        errorCode: checkoutError.code ?? null,
        message: serverMessage || errorMessage,
      });

      if (status === 401) {
        Alert.alert('Phiên đăng nhập không hợp lệ', 'Đăng nhập lại trước khi tiếp tục thanh toán.', [
          { text: 'Để sau', style: 'cancel' },
          { text: 'Đăng nhập', onPress: () => onLoginRequired(selectedPackage.id) },
        ]);
      } else if (status) {
        Alert.alert(`Không thể tạo thanh toán (HTTP ${status})`, serverMessage || errorMessage);
      } else if (checkoutError.isAxiosError) {
        Alert.alert(
          'Không kết nối được backend',
          `Không nhận được phản hồi từ máy chủ. Địa chỉ đang dùng: ${API_BASE_URL}`
        );
      } else {
        Alert.alert('Thông tin thanh toán không hợp lệ', errorMessage);
      }
    } finally {
      setProcessing(false);
    }
  };

  // Thanh toán thành công: backend (SePay webhook) đã kích hoạt gói.
  // Modal giữ mở để hiện màn hình xác nhận, Profile tự nạp lại trạng thái VIP.
  const handlePaymentSuccess = (res: PaymentStatusResult) => {
    setSuccessInfo({
      isScheduled: res.isEffectiveNow === false,
      packageName: res.packageName ?? checkoutData?.packageName,
      startAt: res.startAt ?? null,
      expiresAt: res.expiresAt ?? null,
    });
    setPollingStatus('SUCCESS');
    onSuccessRef.current?.();
  };

  // Tự động kiểm tra trạng thái thanh toán mỗi 3 giây khi đang hiển thị mã QR.
  useEffect(() => {
    if (!visible || !checkoutData || pollingStatus !== 'POLLING') return;

    const intervalId = setInterval(async () => {
      try {
        const res = await SubscriptionApi.getPaymentStatus(checkoutData.orderCode);
        if (res.status === 'SUCCESS') {
          handlePaymentSuccess(res);
        } else if (isFinalFailedStatus(res.status)) {
          setPollingStatus('EXPIRED');
        }
      } catch {
        // Lỗi tạm thời (mất kết nối...) → chu kỳ sau sẽ thử lại.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, checkoutData, pollingStatus]);

  // Đếm ngược 15 phút hiệu lực mã QR; vẫn giữ polling tới khi backend chốt EXPIRED.
  useEffect(() => {
    if (!visible || pollingStatus !== 'POLLING') return;
    if (countdownSeconds <= 0) return;

    const timer = setInterval(() => {
      setCountdownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, pollingStatus, countdownSeconds]);

  const handleCheckStatus = async () => {
    if (!checkoutData) return;
    setCheckingPayment(true);
    try {
      const res = await SubscriptionApi.getPaymentStatus(checkoutData.orderCode);
      if (res.status === 'SUCCESS') {
        handlePaymentSuccess(res);
      } else if (isFinalFailedStatus(res.status)) {
        setPollingStatus('EXPIRED');
      } else {
        Alert.alert(
          'Chưa ghi nhận thanh toán',
          'Hệ thống chưa nhận được giao dịch. Vui lòng đảm bảo bạn đã chuyển ĐÚNG số tiền và nội dung chuyển khoản!'
        );
      }
    } catch {
      Alert.alert('Không thể kiểm tra thanh toán', 'Chưa nhận được trạng thái từ máy chủ. Vui lòng thử lại.');
    } finally {
      setCheckingPayment(false);
    }
  };

  const handleBackToPackages = () => {
    setCheckoutData(null);
    setPollingStatus('IDLE');
    setSuccessInfo(null);
    setCountdownSeconds(QR_VALIDITY_SECONDS);
  };

  const handleRetryCheckout = async () => {
    handleBackToPackages();
    await handleCheckout();
  };

  const handleFinishSuccess = () => {
    handleBackToPackages();
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          {/* Header */}
          <View style={styles.topHeader}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Ionicons name="close" size={26} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.headerTitleBox}>
              <Text style={styles.headerTitle}>Moodify Premium</Text>
            </View>

            <View style={{ width: 36 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {loading ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color="#8b5cf6" />
                <Text style={styles.loadingText}>Đang nạp các gói ưu đãi...</Text>
              </View>
            ) : checkoutData && pollingStatus === 'SUCCESS' ? (
              /* Payment Activated Success View */
              <View style={styles.successCard}>
                <View style={styles.successIconWrap}>
                  <Ionicons name="checkmark" size={42} color="#34d399" />
                </View>

                <View style={styles.activatedBadge}>
                  <View style={styles.statusDot} />
                  <Text style={styles.activatedBadgeText}>
                    {successInfo?.isScheduled ? 'GÓI ĐÃ ĐƯỢC XẾP LỊCH' : 'QUYỀN LỢI VIP ĐÃ MỞ KHÓA'}
                  </Text>
                </View>

                <Text style={styles.successTitle}>
                  {successInfo?.isScheduled ? 'Đã ghi nhận lịch gia hạn' : 'Chào mừng đến với Moodify VIP'}
                </Text>
                <Text style={styles.successMessage}>
                  {successInfo?.isScheduled
                    ? `Thanh toán thành công. Gói sẽ có hiệu lực${
                        successInfo.startAt ? ` từ ${formatPlanDate(successInfo.startAt)}` : ''
                      }${successInfo.expiresAt ? ` đến ${formatPlanDate(successInfo.expiresAt)}` : ''}.`
                    : `Thanh toán thành công. Gói đã được kích hoạt${
                        successInfo?.expiresAt ? ` đến ${formatPlanDate(successInfo.expiresAt)}` : ''
                      }.`}
                </Text>

                {successInfo?.packageName ? (
                  <View style={styles.successPackageRow}>
                    <Ionicons name="diamond" size={16} color="#fbbf24" />
                    <Text style={styles.successPackageName} numberOfLines={1}>
                      {successInfo.packageName}
                    </Text>
                    <Text style={styles.successPackageMark}>
                      {successInfo.isScheduled ? '• Đã xếp lịch' : '• Đã áp dụng'}
                    </Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={styles.successDoneBtn}
                  activeOpacity={0.85}
                  onPress={handleFinishSuccess}
                >
                  <Text style={styles.successDoneText}>Tiếp tục khám phá</Text>
                </TouchableOpacity>
              </View>
            ) : checkoutData && pollingStatus === 'EXPIRED' ? (
              /* QR Expired View */
              <View style={styles.expiredCard}>
                <View style={styles.expiredIconWrap}>
                  <Ionicons name="alert-circle-outline" size={54} color="#ef4444" />
                </View>
                <Text style={styles.expiredTitle}>Đơn hàng đã hết hạn</Text>
                <Text style={styles.expiredMessage}>
                  Mã QR và đơn thanh toán chỉ có hiệu lực trong 15 phút để đảm bảo an toàn. Vui lòng tạo lại mã
                  thanh toán mới.
                </Text>

                <TouchableOpacity
                  style={styles.retryCheckoutBtn}
                  activeOpacity={0.85}
                  onPress={handleRetryCheckout}
                >
                  <Ionicons name="refresh" size={16} color="#ffffff" />
                  <Text style={styles.retryCheckoutText}>Tạo lại mã thanh toán mới</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelCheckoutBtn} onPress={handleBackToPackages}>
                  <Text style={styles.cancelCheckoutText}>Chọn gói cước khác</Text>
                </TouchableOpacity>
              </View>
            ) : checkoutData ? (
              /* QR Payment View */
              <View style={styles.qrCard}>
                <Text style={styles.qrTitle}>Thanh toán VietQR Chuyển khoản</Text>
                <Text style={styles.qrSubtitle}>
                  Mở ứng dụng ngân hàng hoặc ví điện tử bất kỳ để quét mã QR bên dưới
                </Text>

                <View style={styles.qrCountdownRow}>
                  <Ionicons name="time-outline" size={14} color="#9ca3af" />
                  <Text style={styles.qrCountdownText}>
                    Mã QR còn hiệu lực: {formatCountdown(countdownSeconds)}
                  </Text>
                </View>

                <View style={styles.qrImageWrapper}>
                  <Image source={{ uri: checkoutData.qrUrl }} style={styles.qrImage} resizeMode="contain" />
                </View>

                <View style={styles.bankDetailCard}>
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>Ngân hàng:</Text>
                    <Text style={styles.bankValue}>{checkoutData.bankName}</Text>
                  </View>
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>Số tài khoản:</Text>
                    <Text style={[styles.bankValue, styles.highlightValue]}>
                      {checkoutData.bankAccount}
                    </Text>
                  </View>
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>Chủ tài khoản:</Text>
                    <Text style={styles.bankValue}>{checkoutData.accountName}</Text>
                  </View>
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>Số tiền:</Text>
                    <Text style={[styles.bankValue, { color: '#fbbf24', fontWeight: '900' }]}>
                      {checkoutData.amount.toLocaleString('vi-VN')} đ
                    </Text>
                  </View>
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>Nội dung CK:</Text>
                    <Text style={[styles.bankValue, styles.highlightValue]}>
                      {checkoutData.transferContent}
                    </Text>
                  </View>
                </View>

                <View style={styles.autoCheckRow}>
                  <ActivityIndicator size="small" color="#38bdf8" />
                  <Text style={styles.autoCheckText}>
                    Tự động kiểm tra thanh toán mỗi {POLL_INTERVAL_MS / 1000} giây
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.checkStatusBtn}
                  activeOpacity={0.8}
                  onPress={handleCheckStatus}
                  disabled={checkingPayment}
                >
                  {checkingPayment ? (
                    <ActivityIndicator size="small" color="#000000" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done" size={20} color="#000000" />
                      <Text style={styles.checkStatusText}>Tôi đã chuyển khoản thành công</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelCheckoutBtn} onPress={handleBackToPackages}>
                  <Text style={styles.cancelCheckoutText}>Chọn gói cước khác</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Package Selection View */
              <>
                {/* Hero Glow Card */}
                <View style={styles.heroCard}>
                  <Text style={styles.heroPre}>NÂNG TẦM TRẢI NGHIỆM</Text>
                  <Text style={styles.heroTitle}>Thưởng thức âm nhạc đỉnh cao không giới hạn</Text>
                  <Text style={styles.heroSub}>
                    Mở khóa âm thanh HD Lossless 320kbps, loại bỏ hoàn toàn quảng cáo và nghe nhạc thả ga
                  </Text>
                </View>

                {/* Packages Selection */}
                <Text style={styles.sectionTitle}>CHỌN GÓI CƯỚC PHÙ HỢP</Text>
                {packageError ? (
                  <View style={styles.packageErrorCard}>
                    <Text style={styles.packageErrorText}>{packageError}</Text>
                    <TouchableOpacity
                      style={styles.retryPackagesBtn}
                      onPress={() => setPackageReloadKey((current) => current + 1)}
                    >
                      <Text style={styles.retryPackagesText}>Tải lại</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View style={styles.packagesList}>
                      {packages.map((pkg) => {
                        const isSelected = selectedPackage?.id === pkg.id;
                        return (
                          <TouchableOpacity
                            key={pkg.id}
                            style={[styles.packageCard, isSelected && styles.packageCardSelected]}
                            activeOpacity={0.8}
                            onPress={() => {
                              selectedPackageIdRef.current = pkg.id;
                              setSelectedPackage(pkg);
                            }}
                          >
                            {pkg.badge && (
                              <View style={styles.badgeLabel}>
                                <Text style={styles.badgeText}>{pkg.badge}</Text>
                              </View>
                            )}

                            <View style={styles.pkgRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.pkgName}>{pkg.name}</Text>
                                <Text style={styles.pkgDesc}>{pkg.description}</Text>
                              </View>
                              <View style={styles.priceBox}>
                                <Text style={styles.priceNumber}>
                                  {pkg.priceVnd.toLocaleString('vi-VN')}
                                </Text>
                                <Text style={styles.priceUnit}>đ / {pkg.durationDays} ngày</Text>
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <TouchableOpacity
                      style={styles.upgradeBtn}
                      activeOpacity={0.85}
                      onPress={handleCheckout}
                      disabled={processing || !selectedPackage}
                    >
                      {processing ? (
                        <ActivityIndicator color="#000000" />
                      ) : (
                        <Text style={styles.upgradeBtnText}>
                          Nâng cấp ngay • {selectedPackage?.priceVnd.toLocaleString('vi-VN')} đ
                        </Text>
                      )}
                    </TouchableOpacity>

                    <Text style={styles.disclaimerText}>
                      Thông tin thanh toán và trạng thái giao dịch được cung cấp bởi máy chủ.
                    </Text>
                  </>
                )}
              </>
            )}
          </ScrollView>
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
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e28',
  },
  headerBtn: {
    padding: 6,
  },
  headerTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
  },
  content: {
    padding: 20,
    paddingBottom: 60,
  },
  centerLoading: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    color: '#9ca3af',
    marginTop: 12,
    fontSize: 14,
  },
  heroCard: {
    backgroundColor: '#3b0764',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#9333ea',
    marginBottom: 20,
  },
  heroPre: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fbbf24',
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    lineHeight: 28,
    marginBottom: 8,
  },
  heroSub: {
    fontSize: 13,
    color: '#e9d5ff',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9ca3af',
    letterSpacing: 1,
    marginBottom: 12,
  },
  packagesList: {
    gap: 12,
    marginBottom: 24,
  },
  packageErrorCard: {
    backgroundColor: '#161622',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3b3049',
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  packageErrorText: {
    color: '#d1d5db',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  retryPackagesBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#8b5cf6',
  },
  retryPackagesText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  packageCard: {
    backgroundColor: '#161622',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#262636',
    position: 'relative',
  },
  packageCardSelected: {
    borderColor: '#fbbf24',
    backgroundColor: '#1f1a2e',
  },
  badgeLabel: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '900',
  },
  pkgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pkgName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 3,
  },
  pkgDesc: {
    fontSize: 12,
    color: '#9ca3af',
  },
  priceBox: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  priceNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fbbf24',
  },
  priceUnit: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fbbf24',
    paddingVertical: 14,
    borderRadius: 30,
    gap: 8,
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  upgradeBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
  disclaimerText: {
    color: '#6b7280',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16,
  },
  qrCard: {
    backgroundColor: '#161622',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 4,
  },
  qrSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 16,
  },
  qrCountdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  qrCountdownText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  qrImageWrapper: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 16,
  },
  qrImage: {
    width: width * 0.65,
    height: width * 0.65,
  },
  bankDetailCard: {
    width: '100%',
    backgroundColor: '#1e1e28',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  bankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#262636',
  },
  bankLabel: {
    color: '#9ca3af',
    fontSize: 12,
  },
  bankValue: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  highlightValue: {
    color: '#38bdf8',
  },
  autoCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    marginBottom: 12,
  },
  autoCheckText: {
    color: '#38bdf8',
    fontSize: 12,
  },
  checkStatusBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34d399',
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
    marginBottom: 10,
  },
  checkStatusText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  cancelCheckoutBtn: {
    paddingVertical: 10,
  },
  cancelCheckoutText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
  },
  successCard: {
    backgroundColor: '#161622',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
  },
  successIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 2,
    borderColor: '#34d399',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  activatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34d399',
  },
  activatedBadgeText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 8,
  },
  successPackageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1e1e28',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 16,
    alignSelf: 'stretch',
  },
  successPackageName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 1,
  },
  successPackageMark: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
  },
  successDoneBtn: {
    alignSelf: 'stretch',
    backgroundColor: '#fbbf24',
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 20,
  },
  successDoneText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  expiredCard: {
    backgroundColor: '#161622',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
  },
  expiredIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 2,
    borderColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  expiredTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  expiredMessage: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 8,
  },
  retryCheckoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#8b5cf6',
    alignSelf: 'stretch',
    paddingVertical: 14,
    borderRadius: 24,
    marginTop: 20,
  },
  retryCheckoutText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
