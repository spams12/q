import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  DimensionValue,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { auth } from '@/lib/firebase';
import { router } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';

const theme = {
  background: ['#0a0e1a', '#1a1f2e', '#0f1419'],
  primary: '#00ff7f', // Hacker green
  secondary: '#00bfff', // Tech blue
  text: '#ffffff',
  textMuted: 'rgba(255, 255, 255, 0.7)',
  placeholder: 'rgba(255, 255, 255, 0.5)',
  inputBackground: 'rgba(255, 255, 255, 0.08)',
  borderColor: 'rgba(0, 191, 255, 0.3)',
} as const;

// Replaces the external ThemedText component for a single-file solution.
const ThemedText = (props: Text['props'] & { type?: 'title' | 'default' | 'subtitle' }) => {
  const { style, type, ...rest } = props;
  return (
    <Text
      style={[
        type === 'title' ? styles.title : type === 'subtitle' ? styles.subtitle : styles.defaultText,
        style,
      ]}
      {...rest}
    />
  );
};

// --- BACKGROUND ANIMATION COMPONENTS ---

const FiberOpticLine = ({
  delay,
  direction,
  startY,
}: {
  delay: number;
  direction: 'horizontal' | 'vertical' | 'diagonal';
  startY: number;
}) => {
  const { width, height } = useWindowDimensions();
  const translateX = useSharedValue(direction === 'horizontal' ? -150 : direction === 'diagonal' ? -150 : Math.random() * width);
  const translateY = useSharedValue(direction === 'vertical' ? -150 : direction === 'diagonal' ? -150 : startY);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const duration = 4000 + Math.random() * 3000;
    const animate = () => {
      opacity.value = withSequence(
        withTiming(0.4, { duration: 1000 }),
        withTiming(0, { duration: duration - 1000 })
      );
      if (direction === 'horizontal') {
        translateX.value = -150;
        translateX.value = withTiming(width + 150, { duration, easing: Easing.linear });
      } else if (direction === 'vertical') {
        translateY.value = -150;
        translateY.value = withTiming(height + 150, { duration, easing: Easing.linear });
      } else { // Diagonal
        translateX.value = -150;
        translateY.value = startY - 150;
        translateX.value = withTiming(width + 150, { duration, easing: Easing.linear });
        translateY.value = withTiming(startY + width + 150, { duration, easing: Easing.linear });
      }
    };
    const interval = setInterval(animate, duration + 200);
    const timer = setTimeout(animate, delay);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [delay, direction, width, height, startY, opacity, translateX, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const lineStyle =
    direction === 'horizontal' ? styles.fiberLineHorizontal
    : direction === 'vertical' ? styles.fiberLineVertical
    : styles.fiberLineDiagonal;

  return <Animated.View style={[lineStyle, animatedStyle]} />;
};

const NetworkNode = ({ size, left, top }: { size: number; left: DimensionValue; top: DimensionValue }) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    const duration = 2000 + Math.random() * 1000;
    scale.value = withRepeat(withTiming(1.3, { duration, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }), -1, true);
    opacity.value = withRepeat(withTiming(1, { duration: duration * 0.75, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }), -1, true);
  }, [opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.networkNode, { width: size, height: size, borderRadius: size / 2, left, top }, animatedStyle]} />;
};


// --- MAIN LOGIN SCREEN COMPONENT ---

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { width, height } = useWindowDimensions();

  // --- Animations ---
  const logoScale = useSharedValue(1);
  const statusDotScale = useSharedValue(1);
  const loadingIconRotation = useSharedValue(0);
  const emailInputScale = useSharedValue(1);
  const passwordInputScale = useSharedValue(1);

  useEffect(() => {
    logoScale.value = withRepeat(withTiming(1.05, { duration: 2500, easing: Easing.bezier(0.4, 0, 0.6, 1) }), -1, true);
    statusDotScale.value = withRepeat(withTiming(1.5, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [logoScale, statusDotScale]);

  const handleLogin = async () => {
    Keyboard.dismiss(); // Hide keyboard
    if (!email || !password) {
      Alert.alert('خطأ', 'الرجاء إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }
    setIsLoading(true);
    // Start loading animation
    loadingIconRotation.value = withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1, false);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      Alert.alert('نجاح', 'تم تسجيل الدخول بنجاح!');
        router.navigate('/');
    } catch (error: any) {
      // Handle Firebase authentication errors
      let errorMessage = 'فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.';
      console.error('Firebase Auth Error:', error.code, error.message); // Log full error for debugging

      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMessage = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'صيغة البريد الإلكتروني غير صحيحة.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'تم حظر الوصول مؤقتًا بسبب عدد كبير جدًا من المحاولات الفاشلة. يرجى المحاولة لاحقًا.';
      } else {
        errorMessage = error.message; // Fallback for other Firebase errors
      }
      Alert.alert('فشل تسجيل الدخول', errorMessage);
    } finally {
      setIsLoading(false);
      // Stop and reset loading animation
      loadingIconRotation.value = withTiming(0, { duration: 300 });
    }
  };

  // --- Animated Styles ---
  const logoAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }] }));
  const statusDotAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: statusDotScale.value }] }));
  const loadingIconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${loadingIconRotation.value}deg` }],
  }));
  const emailInputAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: emailInputScale.value }] }));
  const passwordInputAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: passwordInputScale.value }] }));

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={theme.background} style={StyleSheet.absoluteFill} />

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 7 }).map((_, i) => (
          <FiberOpticLine key={`h-${i}`} delay={i * 700} direction="horizontal" startY={50 + (i * (height / 7))} />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <FiberOpticLine key={`v-${i}`} delay={i * 900} direction="vertical" startY={-50} />
        ))}
        <NetworkNode size={12} left="15%" top="20%" />
        <NetworkNode size={8} left="85%" top="30%" />
        <NetworkNode size={10} left="50%" top="10%" />
        <NetworkNode size={14} left="80%" top="75%" />
        <NetworkNode size={9} left="20%" top="85%" />
      </View>
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContentContainer}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={styles.content}>
            <Animated.View style={[styles.logoContainer, logoAnimatedStyle]} entering={FadeInDown.delay(200).duration(800)}>
                <Ionicons name="logo-electron" size={width * 0.18} color={theme.primary} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(400).duration(800)}>
              <ThemedText type="title">نظام الصيانة التقنية</ThemedText>
              <ThemedText type="subtitle">لشبكة الألياف البصرية</ThemedText>
            </Animated.View>

            <Animated.View style={styles.inputContainer} entering={FadeInDown.delay(600).duration(800)}>
              <Animated.View style={emailInputAnimatedStyle}>
                <BlurView intensity={15} tint="dark" style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={22} color={theme.secondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="البريد الإلكتروني"
                    placeholderTextColor={theme.placeholder}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onFocus={() => emailInputScale.value = withSpring(1.03)}
                    onBlur={() => emailInputScale.value = withSpring(1)}
                  />
                </BlurView>
              </Animated.View>

              <Animated.View style={passwordInputAnimatedStyle}>
                <BlurView intensity={15} tint="dark" style={styles.inputWrapper}>
                  <Ionicons name="shield-checkmark-outline" size={22} color={theme.secondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="كلمة المرور"
                    placeholderTextColor={theme.placeholder}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    onFocus={() => passwordInputScale.value = withSpring(1.03)}
                    onBlur={() => passwordInputScale.value = withSpring(1)}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                    <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={22} color={theme.secondary} />
                  </TouchableOpacity>
                </BlurView>
              </Animated.View>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(800).duration(800)}>
              <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={isLoading} activeOpacity={0.8}>
                <LinearGradient colors={[theme.primary, theme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.buttonGradient}>
                  {isLoading ? (
                    <View style={styles.buttonContent}>
                      <Animated.View style={loadingIconAnimatedStyle}>
                        <Ionicons name="sync" size={24} color={theme.text} />
                      </Animated.View>
                      <ThemedText style={styles.buttonText}>جاري الاتصال...</ThemedText>
                    </View>
                  ) : (
                    <Animated.View style={styles.buttonContent} entering={FadeIn.duration(300)}>
                      <Ionicons name="log-in-outline" size={24} color={theme.text} style={styles.buttonIcon} />
                      <ThemedText style={styles.buttonText}>دخول النظام</ThemedText>
                    </Animated.View>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View style={styles.footer} entering={FadeInUp.delay(1000).duration(800)}>
              <View style={styles.statusIndicator}>
                <Animated.View style={[styles.statusDot, statusDotAnimatedStyle]} />
                <ThemedText style={styles.statusText}>متصل بالخادم الرئيسي</ThemedText>
              </View>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.supportButton}>
                <Ionicons name="headset-outline" size={16} color={theme.secondary} />
                <ThemedText style={styles.supportText}>الدعم الفني</ThemedText>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.background[0],
  },
  scrollContentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: '5%',
    paddingBottom: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
    width: 150,
    height: 150,
    borderRadius: 75,
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 255, 127, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 127, 0.2)',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 30,
  },
  defaultText: {
    fontSize: 16,
    color: theme.text,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.inputBackground,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.borderColor,
    overflow: 'hidden', // Necessary for BlurView borderRadius
  },
  inputIcon: {
    marginHorizontal: 15,
  },
  input: {
    flex: 1,
    height: 55,
    fontSize: 16,
    color: theme.text,
    textAlign: 'right', // For RTL (Arabic) input
    paddingHorizontal: 10,
    // Add this if you have an Arabic font like 'Cairo' in your project
    // fontFamily: 'Cairo-Regular', 
  },
  eyeIcon: {
    padding: 15,
  },
  loginButton: {
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    marginRight: 10,
  },
  buttonText: {
    color: theme.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  footer: {
    alignItems: 'center',
    marginTop: 40,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.primary,
    marginRight: 10,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  statusText: {
    color: theme.textMuted,
    fontSize: 14,
  },
  divider: {
    width: 60,
    height: 1,
    backgroundColor: theme.borderColor,
    marginVertical: 15,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 191, 255, 0.1)',
    borderWidth: 1,
    borderColor: theme.borderColor,
  },
  supportText: {
    color: theme.secondary,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  fiberLineHorizontal: { position: 'absolute', width: 150, height: 1, backgroundColor: 'rgba(0, 255, 127, 0.3)' },
  fiberLineVertical: { position: 'absolute', width: 1, height: 150, backgroundColor: 'rgba(0, 191, 255, 0.3)' },
  fiberLineDiagonal: { position: 'absolute', width: 180, height: 1, backgroundColor: 'rgba(255, 215, 0, 0.2)', transform: [{ rotate: '45deg' }] },
  networkNode: { position: 'absolute', backgroundColor: 'rgba(0, 255, 127, 0.2)', shadowColor: theme.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 10 },
});