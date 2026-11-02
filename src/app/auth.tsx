import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import { makeRedirectUri } from 'expo-auth-session';
import { AuthApi } from '@/services/api';
import { GOOGLE_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, FACEBOOK_APP_ID } from '@/constants/config';
import { RegisterPayload } from '@/types';

// Gu âm nhạc tùy chọn khi đăng ký — backend lưu vào profile để gợi ý playlist
const GENRE_OPTIONS = ['V-Pop', 'Pop', 'Ballad', 'R&B', 'Hip-Hop', 'Indie', 'EDM', 'Rock'];

type AuthMode = 'login' | 'register';

const extractErrorMessage = (err: any): string => {
  const data = err?.response?.data;
  return data?.message || data?.error || 'Không thể kết nối máy chủ. Vui lòng thử lại.';
};

export default function AuthScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<AuthMode>(params.mode === 'register' ? 'register' : 'login');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'facebook' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Register fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  // Redirect URI dùng cho OAuth social (đăng ký trên Google Cloud / Facebook App)
  const redirectUri = useMemo(() => makeRedirectUri(), []);

  // Google Sign-In: Authorization Code + PKCE (Google đã chặn implicit flow với client mới).
  // Trên bản build APK/dev build dùng client native Android/iOS (redirect scheme
  // com.googleusercontent.apps.*). Trong Expo Go Google không chạy được (Google không
  // cho client Web đăng ký scheme exp://) — bấm nút sẽ hiện hướng dẫn thay vì mở browser.
  const isExpoGo = Constants.appOwnership === 'expo';
  const nativeGoogleClientId = Platform.OS === 'android' ? GOOGLE_ANDROID_CLIENT_ID : GOOGLE_IOS_CLIENT_ID;
  const googleRedirectUri = nativeGoogleClientId
    ? `com.googleusercontent.apps.${nativeGoogleClientId}:/oauthredirect`
    : makeRedirectUri();

  const [gRequest, gResponse, gPromptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    scopes: ['openid', 'profile', 'email'],
    responseType: 'code',
    usePKCE: true,
    redirectUri: googleRedirectUri,
  });

  const handleGooglePress = () => {
    if (isExpoGo || !nativeGoogleClientId) {
      Alert.alert(
        'Cần bản build APK / Dev build',
        'Google đã chặn đăng nhập Google trong Expo Go (không cho phép redirect URI dạng exp://).\n\n' +
          'Cách khắc phục:\n' +
          '1. Google Cloud Console > Credentials > Create Credentials > OAuth client ID > Android\n' +
          '   - Package name: com.khanhduykl12steam.moodify\n' +
          '   - SHA-1: lấy bằng lệnh "npx eas-cli credentials"\n' +
          '2. Dán Client ID vào GOOGLE_ANDROID_CLIENT_ID trong src/constants/config.ts\n' +
          '3. Thêm intentFilter vào app.json (xem hướng dẫn tại config.ts)\n' +
          '4. Build lại APK bằng build-apk.bat và đăng nhập trên bản APK.'
      );
      return;
    }
    gPromptAsync();
  };

  // Facebook Login (implicit flow → access_token, backend xác minh qua Graph API)
  const [fbRequest, fbResponse, fbPromptAsync] = Facebook.useAuthRequest({
    clientId: FACEBOOK_APP_ID,
    scopes: ['public_profile', 'email'],
    redirectUri,
  });

  const socialSetupHint = (provider: string, detail?: string) =>
    provider === 'Google'
      ? `Google đăng nhập thất bại. ${detail || ''}\n\n` +
        `Kiểm tra: OAuth client "Android" đã tạo trên Google Cloud Console (package com.khanhduykl12steam.moodify + SHA-1 đúng của keystore), GOOGLE_ANDROID_CLIENT_ID đã điền trong src/constants/config.ts, và intentFilter scheme đã thêm trong app.json trước khi build APK.`
      : `${provider} đăng nhập thất bại. ${detail || ''}\n\n` +
        `Hướng dẫn: đăng ký Redirect URI sau trong Facebook App > Facebook Login > Valid OAuth Redirect URIs:\n${redirectUri}`;

  const handleSocialLogin = async (provider: 'google' | 'facebook', token: string, codeVerifier?: string) => {
    setSocialLoading(provider);
    setError(null);
    try {
      const res =
        provider === 'google'
          ? await AuthApi.loginWithGoogleCode(token, codeVerifier || '', googleRedirectUri, nativeGoogleClientId)
          : await AuthApi.loginWithFacebook(token);
      Alert.alert('Thành công', `Chào mừng đến với Moodify, ${res.fullName || res.username || 'bạn'}!`);
      router.back();
    } catch (err: any) {
      setError(extractErrorMessage(err));
    } finally {
      setSocialLoading(null);
    }
  };

  useEffect(() => {
    if (gResponse?.type === 'success') {
      const code = gResponse.params?.['code'];
      const codeVerifier = gRequest?.codeVerifier || '';
      if (code && codeVerifier) {
        handleSocialLogin('google', code, codeVerifier);
      } else {
        setError('Google không trả về mã đăng nhập hợp lệ. Vui lòng thử lại.');
      }
    } else if (gResponse?.type === 'error') {
      setError(socialSetupHint('Google', (gResponse.error as any)?.message));
    } else if (gResponse?.type === 'dismiss') {
      setSocialLoading(null);
    }
  }, [gResponse]);

  useEffect(() => {
    if (fbResponse?.type === 'success') {
      const accessToken = fbResponse.params?.['access_token'];
      if (accessToken) {
        handleSocialLogin('facebook', accessToken);
      } else {
        setError('Facebook không trả về token đăng nhập. Vui lòng thử lại.');
      }
    } else if (fbResponse?.type === 'error') {
      setError(socialSetupHint('Facebook', (fbResponse.error as any)?.message));
    } else if (fbResponse?.type === 'dismiss') {
      setSocialLoading(null);
    }
  }, [fbResponse]);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const validateLogin = (): string | null => {
    if (!identifier.trim()) return 'Vui lòng nhập email hoặc tên tài khoản.';
    if (!password) return 'Vui lòng nhập mật khẩu.';
    return null;
  };

  const validateRegister = (): string | null => {
    if (!fullName.trim()) return 'Vui lòng nhập họ và tên.';
    if (!phone.trim()) return 'Vui lòng nhập số điện thoại.';
    if (!/^[0-9+\-()\s]{8,20}$/.test(phone.trim())) return 'Số điện thoại không hợp lệ (8-20 ký tự số).';
    if (!email.trim()) return 'Vui lòng nhập địa chỉ email.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Định dạng email không hợp lệ.';
    if (username.trim().length < 4 || username.trim().length > 50) return 'Tên đăng nhập phải từ 4 đến 50 ký tự.';
    if (password.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự.';
    if (confirmPassword !== password) return 'Mật khẩu xác nhận không khớp.';
    return null;
  };

  const handleLogin = async () => {
    const validationError = validateLogin();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await AuthApi.login({ identifier: identifier.trim(), password });
      Alert.alert('Thành công', `Chào mừng trở lại, ${res.fullName || res.username || 'bạn'}!`);
      router.back();
    } catch (err: any) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    const validationError = validateRegister();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload: RegisterPayload = {
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        username: username.trim(),
        password,
        confirmPassword,
      };
      if (selectedGenres.length > 0) {
        payload.genres = selectedGenres;
      }

      const res = await AuthApi.register(payload);
      Alert.alert('Thành công', `Chào mừng đến với Moodify, ${res.fullName || res.username || 'bạn'}!`);
      router.back();
    } catch (err: any) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Bar với nút quay lại */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</Text>
          <View style={{ width: 38 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Hero Brand */}
            <View style={styles.hero}>
              <View style={styles.brandKickerRow}>
                <View style={styles.brandDot} />
                <Text style={styles.brandKicker}>MOODIFY PASS</Text>
              </View>
              <Text style={styles.brandTitle}>
                <Text style={styles.brandPink}>MOOD</Text>
                <Text style={styles.brandPurple}>IFY</Text>
              </Text>
              <Text style={styles.heroTagline}>
                Đăng ký tài khoản người nghe để khám phá kho nhạc theo tâm trạng và sở thích riêng của bạn.
              </Text>
            </View>

            {/* Social Login */}
            <View style={styles.socialRow}>
              <TouchableOpacity
                style={[styles.socialBtn, styles.googleBtn]}
                onPress={handleGooglePress}
                disabled={!!socialLoading || !gRequest}
                activeOpacity={0.8}
              >
                {socialLoading === 'google' ? (
                  <ActivityIndicator size="small" color="#121212" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={18} color="#EA4335" />
                    <Text style={styles.googleText}>Google</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.socialBtn, styles.facebookBtn]}
                onPress={() => fbPromptAsync()}
                disabled={!!socialLoading || !fbRequest}
                activeOpacity={0.8}
              >
                {socialLoading === 'facebook' ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="logo-facebook" size={18} color="#ffffff" />
                    <Text style={styles.facebookText}>Facebook</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>HOẶC ĐĂNG NHẬP BẰNG EMAIL</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Error Banner */}
            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color="#f87171" />
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}

            {mode === 'login' ? (
              <View>
                <Text style={styles.fieldLabel}>Tài khoản</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="person-outline" size={16} color="#6b7280" />
                  <TextInput
                    style={styles.input}
                    placeholder="Nhập email hoặc tên tài khoản"
                    placeholderTextColor="#6b7280"
                    value={identifier}
                    onChangeText={setIdentifier}
                    autoCapitalize="none"
                  />
                </View>

                <Text style={styles.fieldLabel}>Mật khẩu</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={16} color="#6b7280" />
                  <TextInput
                    style={styles.input}
                    placeholder="Nhập mật khẩu"
                    placeholderTextColor="#6b7280"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={17} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.submitBtn} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
                  {loading ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.submitText}>Đăng nhập</Text>}
                </TouchableOpacity>

                <Text style={styles.switchRow}>
                  Chưa có tài khoản?{' '}
                  <Text style={styles.switchLink} onPress={() => switchMode('register')}>
                    Đăng ký ngay
                  </Text>
                </Text>
              </View>
            ) : (
              <View>
                <Text style={styles.fieldLabel}>Họ và tên *</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="id-card-outline" size={16} color="#6b7280" />
                  <TextInput
                    style={styles.input}
                    placeholder="Nguyễn Văn A"
                    placeholderTextColor="#6b7280"
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>

                <Text style={styles.fieldLabel}>Số điện thoại *</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="call-outline" size={16} color="#6b7280" />
                  <TextInput
                    style={styles.input}
                    placeholder="0987654321"
                    placeholderTextColor="#6b7280"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                </View>

                <Text style={styles.fieldLabel}>Địa chỉ Email *</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="mail-outline" size={16} color="#6b7280" />
                  <TextInput
                    style={styles.input}
                    placeholder="ban@example.com"
                    placeholderTextColor="#6b7280"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <Text style={styles.fieldLabel}>Tên đăng nhập * (từ 4 ký tự)</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="at-outline" size={16} color="#6b7280" />
                  <TextInput
                    style={styles.input}
                    placeholder="moodify_user"
                    placeholderTextColor="#6b7280"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                  />
                </View>

                <Text style={styles.fieldLabel}>Mật khẩu * (tối thiểu 6 ký tự)</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={16} color="#6b7280" />
                  <TextInput
                    style={styles.input}
                    placeholder="Tạo mật khẩu"
                    placeholderTextColor="#6b7280"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={17} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>Xác nhận mật khẩu *</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="shield-checkmark-outline" size={16} color="#6b7280" />
                  <TextInput
                    style={styles.input}
                    placeholder="Nhập lại mật khẩu"
                    placeholderTextColor="#6b7280"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                  />
                </View>

                <Text style={styles.fieldLabel}>Gu âm nhạc yêu thích (Tùy chọn)</Text>
                <View style={styles.chipWrap}>
                  {GENRE_OPTIONS.map((genre) => {
                    const active = selectedGenres.includes(genre);
                    return (
                      <TouchableOpacity
                        key={genre}
                        style={[styles.genreChip, active && styles.genreChipActive]}
                        onPress={() => toggleGenre(genre)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.genreChipText, active && styles.genreChipTextActive]}>
                          {genre}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity style={styles.submitBtn} onPress={handleRegister} disabled={loading} activeOpacity={0.8}>
                  {loading ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.submitText}>Tạo tài khoản</Text>}
                </TouchableOpacity>

                <Text style={styles.switchRow}>
                  Đã có tài khoản?{' '}
                  <Text style={styles.switchLink} onPress={() => switchMode('login')}>
                    Đăng nhập
                  </Text>
                </Text>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1f1f2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  hero: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  brandKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ec4899',
  },
  brandKicker: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  brandTitle: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 10,
  },
  brandPink: {
    color: '#ec4899',
  },
  brandPurple: {
    color: '#8b5cf6',
  },
  heroTagline: {
    color: '#9ca3af',
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    gap: 8,
  },
  googleBtn: {
    backgroundColor: '#ffffff',
  },
  googleText: {
    color: '#121212',
    fontSize: 14,
    fontWeight: '800',
  },
  facebookBtn: {
    backgroundColor: '#1877F2',
  },
  facebookText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#26263a',
  },
  dividerText: {
    color: '#6b7280',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  errorBannerText: {
    color: '#f87171',
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
  },
  fieldLabel: {
    color: '#d1d5db',
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 4,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0c0c12',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e2e42',
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    paddingVertical: 0,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  genreChip: {
    backgroundColor: '#1f1f2e',
    borderColor: '#2e2e42',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  genreChipActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  genreChipText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
  },
  genreChipTextActive: {
    color: '#ffffff',
  },
  submitBtn: {
    backgroundColor: '#8b5cf6',
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 14,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  switchRow: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
  },
  switchLink: {
    color: '#a78bfa',
    fontWeight: '800',
  },
});
