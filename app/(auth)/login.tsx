import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
// --- MODIFIED: Import signInWithCustomToken and signOut for the new flow ---
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { memo, useEffect, useState } from 'react';
import {
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
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated';

import { UseDialog } from '@/context/DialogContext';
import { auth, db } from '@/lib/firebase';

// Define the roles that are allowed to access this app.
const ALLOWED_ROLES = ['فني', 'تسويق', 'Developer', 'مدير'];

const theme = {
  background: ['#0a0e1a', '#1a1f2e', '#0f1419'],
  primary: '#00ff7f', // Hacker green
  secondary: '#00bfff', // Tech blue
  error: '#ff4757', // Error red
  text: '#ffffff',
  textMuted: '#00ff7f',
  placeholder: 'rgba(255, 255, 255, 0.5)',
  inputBackground: 'rgba(255, 255, 255, 0.08)',
  borderColor: 'rgba(0, 191, 255, 0.3)',
} as const;

// This helper component remains unchanged
const ThemedText = (props: Text['props'] & { type?: 'title' | 'default' | 'subtitle' }) => {
  const { style, type, ...rest } = props;
  return (
    <Text
      style={[type === 'title' ? styles.title : type === 'subtitle' ? styles.subtitle : styles.defaultText, style]}
      {...rest}
    />
  );
};

// This animation component remains unchanged
const FiberOpticLine = memo(
  ({
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
      opacity: opacity.value,
    }));

    const lineStyle =
      direction === 'horizontal' ? styles.fiberLineHorizontal
        : direction === 'vertical' ? styles.fiberLineVertical
          : styles.fiberLineDiagonal;

    return <Animated.View style={[lineStyle, animatedStyle]} />;
  }
);
FiberOpticLine.displayName = 'FiberOpticLine';

// This animation component remains unchanged
const NetworkNode = memo(
  ({ size, left, top }: { size: number; left: DimensionValue; top: DimensionValue }) => {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(0.6);

    useEffect(() => {
      const duration = 2000 + Math.random() * 1000;
      scale.value = withRepeat(withTiming(1.3, { duration, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }), -1, true);
      opacity.value = withRepeat(withTiming(1, { duration: duration * 0.75, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }), -1, true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    }));

    return (
      <Animated.View
        style={[styles.networkNode, { width: size, height: size, borderRadius: size / 2, left, top }, animatedStyle]}
      />
    );
  }
);
NetworkNode.displayName = 'NetworkNode';


// --- MAIN LOGIN SCREEN COMPONENT ---
const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { width, height } = useWindowDimensions();
  const { showDialog } = UseDialog();
  const router = useRouter();

  // --- NEW: State for the secure 2-Factor Authentication flow ---
  const [loginStep, setLoginStep] = useState<'credentials' | 'f2a'>('credentials');
  const [f2aCode, setF2aCode] = useState('');
  // We only store the UID between steps, not the full login credential
  const [tempUid, setTempUid] = useState<string | null>(null);

  // --- Animations ---
  const logoScale = useSharedValue(1);
  const emailInputScale = useSharedValue(1);
  const passwordInputScale = useSharedValue(1);

  useEffect(() => {
    logoScale.value = withRepeat(withTiming(1.05, { duration: 2500, easing: Easing.bezier(0.4, 0, 0.6, 1) }), -1, true);
  }, [logoScale]);

  // --- MODIFIED: Function to go back to the credentials screen ---
  // This is simpler now because the user is never logged in during the process.
  const handleBackToCredentials = () => {
    setLoginStep('credentials');
    setTempUid(null);
    setF2aCode('');
    setPassword(''); // Optional: clear password for security
  };

  // --- MODIFIED: Step 1 - Send credentials to backend for validation ---
  const handleCredentialsSubmit = async () => {
    Keyboard.dismiss();
    if (!email || !password) {
      showDialog({ status: 'error', message: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور.' });
      return;
    }
    setIsLoading(true);

    try {
      // Call your backend to validate password and generate a code
      const backendUrl = 'https://www.alqabas-ftth.com/api/auth';
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Display the specific error message from the backend
        showDialog({ status: 'error', message: data.message || 'فشلت المصادقة.' });
        return;
      }

      setTempUid(data.uid);
      setLoginStep('f2a');

    } catch (error) {
      console.error('Credential Submission Error:', error);
      showDialog({ status: 'error', message: 'فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.' });
    } finally {
      setIsLoading(false);
    }
  };

  // --- MODIFIED: Step 2 - Verify code and perform FINAL login with custom token ---
  const handleF2aCodeSubmit = async () => {
    Keyboard.dismiss();
    if (!f2aCode || !tempUid) {
      showDialog({ status: 'error', message: 'حدث خطأ غير متوقع، يرجى إعادة المحاولة.' });
      handleBackToCredentials();
      return;
    }

    setIsLoading(true);

    try {
      // Call backend to verify the code and get a custom login token
      const backendUrl = 'https://www.alqabas-ftth.com/api/auth/verify-and-login';
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: tempUid, code: f2aCode }),
      });

      const data = await response.json();

      // If code is wrong/expired, the backend will tell us.
      if (!response.ok || !data.success || !data.token) {
        showDialog({
          status: 'error',
          message: data.message || 'الكود غير صحيح أو انتهت صلاحيته.',
        });
        setF2aCode(''); // Clear the incorrect code from the input
        return;
      }

      const userCredential = await signInWithCustomToken(auth, data.token);

      const usersCollectionRef = collection(db, 'users');
      const q = query(usersCollectionRef, where('uid', '==', userCredential.user.uid));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        await signOut(auth);
        showDialog({ status: 'error', message: 'لم يتم العثور على بيانات المستخدم. يرجى الاتصال بالدعم.' });
        handleBackToCredentials();
        return;
      }

      const userData = querySnapshot.docs[0].data();
      if (ALLOWED_ROLES.includes(userData.role)) {
        showDialog({
          status: 'success',
          message: 'تم تسجيل الدخول بنجاح! جاري التوجيه...',
          duration: 1500,
        });
        router.replace('/(tabs)/');
      } else {
        await signOut(auth); // Log out if role is not allowed
        showDialog({ status: 'error', message: 'ليس لديك الصلاحية للوصول إلى هذا التطبيق.' });
        handleBackToCredentials();
      }

    } catch (error) {
      console.error('2FA Verification/Login Error:', error);
      showDialog({ status: 'error', message: 'حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.' });
    } finally {
      setIsLoading(false);
    }
  };

  const logoAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }] }));
  const emailInputAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: emailInputScale.value }] }));
  const passwordInputAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: passwordInputScale.value }] }));

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={theme.background} style={StyleSheet.absoluteFill} />

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 5 }).map((_, i) => (
          <FiberOpticLine key={`h-${i}`} delay={i * 900} direction="horizontal" startY={50 + (i * (height / 5))} />
        ))}
        {Array.from({ length: 4 }).map((_, i) => (
          <FiberOpticLine key={`v-${i}`} delay={i * 1200} direction="vertical" startY={-50} />
        ))}
        <NetworkNode size={12} left="15%" top="20%" />
        <NetworkNode size={8} left="85%" top="30%" />
        <NetworkNode size={10} left="50%" top="10%" />
        <NetworkNode size={14} left="80%" top="75%" />
        <NetworkNode size={9} left="20%" top="85%" />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContentContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Animated.View style={[styles.logoContainer, logoAnimatedStyle]} entering={FadeInDown.delay(200).duration(800)}>
              <Ionicons name="logo-electron" size={width * 0.18} color={theme.primary} />
            </Animated.View>

            {/* --- The conditional UI rendering logic is unchanged and works perfectly --- */}
            {loginStep === 'credentials' ? (
              <>
                {/* --- CREDENTIALS INPUT VIEW --- */}
                <Animated.View entering={FadeInDown.delay(400).duration(800)}>
                  <ThemedText type="title">تطبيق الصيانة التقنية</ThemedText>
                  <ThemedText type="subtitle">لشبكة الألياف البصرية</ThemedText>
                </Animated.View>

                <Animated.View style={styles.inputContainer} entering={FadeInDown.delay(600).duration(800)}>
                  <Animated.View style={emailInputAnimatedStyle}>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="person-outline" size={22} color={theme.secondary} style={styles.inputIcon} />
                      <TextInput style={styles.input} placeholder="البريد الإلكتروني" placeholderTextColor={theme.placeholder} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" onFocus={() => emailInputScale.value = withSpring(1.03)} onBlur={() => emailInputScale.value = withSpring(1)} />
                    </View>
                  </Animated.View>
                  <Animated.View style={passwordInputAnimatedStyle}>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="shield-checkmark-outline" size={22} color={theme.secondary} style={styles.inputIcon} />
                      <TextInput style={styles.input} placeholder="كلمة المرور" placeholderTextColor={theme.placeholder} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} onFocus={() => passwordInputScale.value = withSpring(1.03)} onBlur={() => passwordInputScale.value = withSpring(1)} />
                      <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                        <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={22} color={theme.secondary} />
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(800).duration(800)}>
                  <TouchableOpacity style={styles.loginButton} onPress={handleCredentialsSubmit} disabled={isLoading} activeOpacity={0.8}>
                    <View style={styles.buttonGradient}>
                      {isLoading ? (
                        <View style={styles.buttonContent}>
                          <Ionicons name="sync" size={24} color="black" />
                          <ThemedText style={styles.buttonText}>جاري الاتصال...</ThemedText>
                        </View>
                      ) : (
                        <View style={styles.buttonContent}>
                          <Ionicons name="arrow-forward-outline" size={24} color="black" style={styles.buttonIcon} />
                          <ThemedText style={styles.buttonText}>التالي</ThemedText>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              </>
            ) : (
              <>
                {/* --- 2FA CODE INPUT VIEW --- */}
                <Animated.View entering={FadeInDown.delay(200).duration(800)}>
                  <ThemedText type="title">التحقق بخطوتين</ThemedText>
                  <ThemedText type="subtitle">الرجاء إدخال الكود الذي تم تزويدك به</ThemedText>
                </Animated.View>

                <Animated.View style={styles.inputContainer} entering={FadeInDown.delay(400).duration(800)}>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="keypad-outline" size={22} color={theme.secondary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="ادخل الكود هنا" placeholderTextColor={theme.placeholder} value={f2aCode} onChangeText={setF2aCode} keyboardType="number-pad" maxLength={6} />
                  </View>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(600).duration(800)}>
                  <TouchableOpacity style={styles.loginButton} onPress={handleF2aCodeSubmit} disabled={isLoading} activeOpacity={0.8}>
                    <View style={styles.buttonGradient}>
                      {isLoading ? (
                        <View style={styles.buttonContent}>
                          <Ionicons name="sync" size={24} color="black" />
                          <ThemedText style={styles.buttonText}>جاري التحقق...</ThemedText>
                        </View>
                      ) : (
                        <View style={styles.buttonContent}>
                          <Ionicons name="checkmark-done-outline" size={24} color="black" style={styles.buttonIcon} />
                          <ThemedText style={styles.buttonText}>تأكيد الدخول</ThemedText>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.backButton} onPress={handleBackToCredentials} disabled={isLoading}>
                    <ThemedText style={styles.backButtonText}>العودة</ThemedText>
                  </TouchableOpacity>
                </Animated.View>
              </>
            )}

            <Animated.View style={styles.footer} entering={FadeInUp.delay(1000).duration(800)}>
              <View style={styles.statusIndicator}>
                <ThemedText style={styles.statusText}>القبس تكنلوجي</ThemedText>
                <ThemedText style={styles.statusText}>لمقاولات البنى التحتية التكنلوجية والانترنت</ThemedText>
              </View>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.supportButton}>
                <Ionicons name="headset-outline" size={16} color={theme.secondary} />
                <ThemedText style={styles.supportText}>الدعم الفني</ThemedText>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen;

// All styles from your original file are preserved
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background[0] },
  scrollContentContainer: { flexGrow: 1, justifyContent: 'center' },
  content: { paddingHorizontal: '5%', paddingBottom: 20 },
  logoContainer: { alignItems: 'center', marginBottom: 20, width: 150, height: 150, borderRadius: 75, justifyContent: 'center', alignSelf: 'center', backgroundColor: 'rgba(0, 255, 127, 0.1)', borderWidth: 2, borderColor: 'rgba(0, 255, 127, 0.2)' },
  title: { fontSize: 28, fontWeight: 'bold', color: theme.text, textAlign: 'center' },
  subtitle: { fontSize: 18, color: theme.textMuted, textAlign: 'center', marginTop: 4, marginBottom: 30 },
  defaultText: { fontSize: 16, color: theme.text },
  inputContainer: { marginBottom: 20 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.inputBackground, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: theme.borderColor },
  inputIcon: { marginHorizontal: 15 },
  input: { flex: 1, height: 55, fontSize: 16, color: theme.text, textAlign: 'right', paddingHorizontal: 10 },
  eyeIcon: { padding: 15 },
  loginButton: { borderRadius: 12, overflow: 'hidden', backgroundColor: theme.primary },
  buttonGradient: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buttonIcon: { marginRight: 0, color: 'black' },
  buttonText: { color: 'black', fontSize: 18, fontWeight: 'bold' },
  footer: { alignItems: 'center', marginTop: 40 },
  statusIndicator: { flexDirection: 'column', alignItems: 'center', paddingHorizontal: 10 },
  statusText: { color: theme.textMuted, fontSize: 14, fontFamily: 'Cairo', textAlign: 'center' },
  divider: { width: 60, height: 1, backgroundColor: theme.borderColor, marginVertical: 15 },
  supportButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: 'rgba(0, 191, 255, 0.1)', borderWidth: 1, borderColor: theme.borderColor },
  supportText: { color: theme.secondary, fontSize: 14, fontWeight: '600', marginLeft: 8 },
  fiberLineHorizontal: { position: 'absolute', width: 150, height: 1, backgroundColor: 'rgba(0, 255, 127, 0.3)' },
  fiberLineVertical: { position: 'absolute', width: 1, height: 150, backgroundColor: 'rgba(0, 191, 255, 0.3)' },
  fiberLineDiagonal: { position: 'absolute', width: 180, height: 1, backgroundColor: 'rgba(255, 215, 0, 0.2)', transform: [{ rotate: '45deg' }] },
  networkNode: { position: 'absolute', backgroundColor: 'rgba(0, 255, 127, 0.2)', shadowColor: theme.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 10 },
  backButton: { marginTop: 20, padding: 10, alignItems: 'center' },
  backButtonText: { color: theme.secondary, fontSize: 16, fontWeight: '500' },
})