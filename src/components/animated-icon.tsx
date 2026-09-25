import React, { useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const DURATION = 600;

export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: {
      opacity: 1,
      transform: [{ scale: 1 }],
    },
    70: {
      opacity: 0.9,
      transform: [{ scale: 1.04 }],
      easing: Easing.out(Easing.cubic),
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1.08 }],
      easing: Easing.out(Easing.cubic),
    },
  });

  const splashContent = (
    <View style={styles.contentContainer}>
      {/* Vòng hào quang tím neon phía sau logo */}
      <View style={styles.logoWrapper}>
        <View style={styles.glowOuter} />
        <View style={styles.glowInner} />
        <Image
          style={styles.logo}
          source={require('@/assets/images/moodify-logo.png')}
          contentFit="contain"
        />
      </View>

      {/* Chữ Moodify cực to và sang trọng */}
      <Text style={styles.title}>Moodify</Text>
      <Text style={styles.subtitle}>ÂM NHẠC THEO CẢM XÚC CỦA BẠN</Text>

      {/* Loading Dot Indicator */}
      <View style={styles.dotRow}>
        <View style={[styles.dot, { opacity: 0.4 }]} />
        <View style={[styles.dot, { opacity: 0.8 }]} />
        <View style={styles.dot} />
      </View>
    </View>
  );

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splashOverlay}
    >
      {splashContent}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        // Giữ splash screen hiển thị thêm 1.2s để người dùng chiêm ngưỡng logo trước khi vào dashboard
        setTimeout(() => {
          SplashScreen.hideAsync().finally(() => {
            setAnimate(true);
          });
        }, 1200);
      }}
      style={styles.splashOverlay}
    >
      {splashContent}
    </View>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a0f',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  logoWrapper: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  glowOuter: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  glowInner: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(236, 72, 153, 0.25)',
  },
  logo: {
    width: 115,
    height: 115,
  },
  title: {
    fontSize: 46,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2,
    marginBottom: 8,
    textShadowColor: 'rgba(139, 92, 246, 0.6)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 16,
  },
  subtitle: {
    fontSize: 12,
    color: '#a1a1aa',
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 28,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8b5cf6',
  },
});
