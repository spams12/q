import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { signInWithEmailAndPassword } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  I18nManager,
  Image,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions, // Import useWindowDimensions hook
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  SlideInRight,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
// Import SafeAreaProvider and SafeAreaView
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { auth } from '../../lib/firebase';

// Enable RTL layout
I18nManager.forceRTL(true);
I18nManager.allowRTL(true);

// --- Helper Components with Responsiveness ---

const FiberOpticLine = ({
  delay,
  direction,
  startY,
  width, // Receive width and height as props
  height,
}: {
  delay: number;
  direction: 'horizontal' | 'vertical' | 'diagonal';
  startY: number;
  width: number;
  height: number;
}) => {
  const translateX = useSharedValue(direction === 'horizontal' ? -100 : direction === 'diagonal' ? -100 : Math.random() * width);
  const translateY = useSharedValue(direction === 'vertical' ? -100 : direction === 'diagonal' ? -100 : startY);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // This effect now depends on width and height, so it will recalculate if the screen size changes.
    const startAnimation = () => {
      if (direction === 'horizontal') {
        translateX.value = withRepeat(withTiming(width + 100, { duration: 4000 + Math.random() * 2000, easing: Easing.linear }), -1, false);
      } else if (direction === 'vertical') {
        translateY.value = withRepeat(withTiming(height + 100, { duration: 5000 + Math.random() * 2000, easing: Easing.linear }), -1, false);
      } else {
        translateX.value = withRepeat(withTiming(width + 100, { duration: 6000 + Math.random() * 2000, easing: Easing.linear }), -1, false);
        translateY.value = withRepeat(withTiming(height + 100, { duration: 6000 + Math.random() * 2000, easing: Easing.linear }), -1, false);
      }
      opacity.value = withRepeat(withTiming(0.4, { duration: 2000 }), -1, true);
    };

    const timer = setTimeout(startAnimation, delay);
    return () => clearTimeout(timer);
  }, [delay, direction, width, height]); // Add width and height to dependency array

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[
      direction === 'horizontal' ? styles.fiberLineHorizontal :
      direction === 'vertical' ? styles.fiberLineVertical :
      styles.fiberLineDiagonal,
      animatedStyle,
    ]} />;
};

const NetworkNode = ({ color, size, left, top }: { color: string; size: number; left: number; top: number }) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withRepeat(withTiming(1.3, { duration: 2000, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }), -1, true);
    opacity.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[ styles.networkNode, { backgroundColor: color, width: size, height: size, borderRadius: size / 2, left, top }, animatedStyle, ]} />;
};

// --- Main Login Screen Component ---

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions(); // Use hook for responsive dimensions

  const buttonScale = useSharedValue(1);
  const logoScale = useSharedValue(1);
  const logoGlowOpacity = useSharedValue(0.05);

  useEffect(() => {
    logoScale.value = withRepeat(withTiming(1.2, { duration: 2500, easing: Easing.bezier(0.4, 0, 0.6, 1) }), -1, true);
    logoGlowOpacity.value = withRepeat(withTiming(0.2, { duration: 2500, easing: Easing.bezier(0.4, 0, 0.6, 1) }), -1, true);
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('خطأ', 'الرجاء إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }
    setIsLoading(true);
    buttonScale.value = withSpring(0.95);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      Alert.alert('نجاح', 'تم تسجيل الدخول بنجاح!');
    } catch (error: any) {
      Alert.alert('فشل تسجيل الدخول', error.message);
    } finally {
      setIsLoading(false);
      buttonScale.value = withSpring(1);
    }
  };

  // --- Animated Styles ---
  const buttonAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: buttonScale.value }] }));
  const logoAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }] }));
  const logoGlowAnimatedStyle = useAnimatedStyle(() => ({ opacity: logoGlowOpacity.value }));
  
  // --- Responsive Styles ---
  const logoWrapperStyle = {
    width: width * 0.2,
    height: width * 0.2,
    maxWidth: 180,
    maxHeight: 180,
    borderRadius: width * 0.2, // Fully responsive radius
  };
  const logoGlowStyle = {
    width: logoWrapperStyle.width * 1.1,
    height: logoWrapperStyle.height * 1.1,
    borderRadius: logoWrapperStyle.borderRadius * 1.1,
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        
        <LinearGradient colors={[ theme.icon ? '#0a0e1a' : '#1e3c72', theme.icon ? '#1a1f2e' : '#2a5298', theme.icon ? '#0f1419' : '#1e3c72' ]} style={StyleSheet.absoluteFillObject} />

        <Animated.View style={styles.background}>
          {/* Pass responsive dimensions to background animations */}
          {Array.from({ length: 8 }).map((_, i) => ( <FiberOpticLine key={`h-${i}`} delay={i * 600} direction="horizontal" startY={50 + (i * (height / 8))} width={width} height={height} /> ))}
          {Array.from({ length: 6 }).map((_, i) => ( <FiberOpticLine key={`v-${i}`} delay={i * 800 + 300} direction="vertical" startY={-50} width={width} height={height} /> ))}
          {Array.from({ length: 4 }).map((_, i) => ( <FiberOpticLine key={`d-${i}`} delay={i * 1000 + 600} direction="diagonal" startY={-50} width={width} height={height} /> ))}
          
          <NetworkNode color="rgba(0, 255, 127, 0.15)" size={12} left={50} top={150} />
          <NetworkNode color="rgba(0, 191, 255, 0.15)" size={8} left={width - 80} top={250} />
          <NetworkNode color="rgba(255, 215, 0, 0.15)" size={10} left={width / 2} top={100} />
          <NetworkNode color="rgba(0, 255, 127, 0.15)" size={14} left={width - 120} top={height - 300} />
          <NetworkNode color="rgba(0, 191, 255, 0.15)" size={9} left={80} top={height - 200} />
        </Animated.View>

        <Animated.View style={styles.content} entering={FadeInUp.delay(300).duration(800)}>
          <Animated.View style={styles.logoContainer} entering={FadeInDown.delay(100).duration(600)}>
            {/* Apply responsive styles to the logo wrapper */}
            <Animated.View style={[styles.logoWrapper, logoAnimatedStyle, logoWrapperStyle]}>
              <Image source={require('@/assets/images/logo.png')} style={styles.logoImage} /> 
              {/* Apply responsive styles to the glow effect */}
              <Animated.View style={[styles.logoGlow, logoGlowAnimatedStyle, logoGlowStyle]} />
            </Animated.View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(400).duration(600)}>
            <ThemedText type="title" style={[styles.title, { fontSize: width > 400 ? 24 : 20 }]}>
              تطبيق الصيانة التقنية لمشتركين شبكة الالياف البصرية          
            </ThemedText>
          </Animated.View>

          <Animated.View style={styles.inputContainer} entering={SlideInRight.delay(600).duration(600)}>
            <BlurView intensity={15} tint="dark" style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={22} color="#00bfff" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="اسم المستخدم أو البريد الإلكتروني" placeholderTextColor="rgba(255, 255, 255, 0.6)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            </BlurView>

            <BlurView intensity={15} tint="dark" style={styles.inputWrapper}>
              <Ionicons name="shield-checkmark-outline" size={22} color="#00bfff" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="كلمة المرور" placeholderTextColor="rgba(255, 255, 255, 0.6)" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#00bfff" />
              </TouchableOpacity>
            </BlurView>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(800).duration(600)} style={buttonAnimatedStyle}>
            <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={isLoading}>
              <LinearGradient colors={['#00ff7f', '#00bfff', '#1e90ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.buttonGradient}>
                {isLoading ? (
                  <Animated.View style={styles.loadingContainer} entering={FadeInDown.duration(300)}>
                    <Ionicons name="sync" size={24} color="#ffffff" />
                    <ThemedText style={styles.buttonText}>جاري الاتصال...</ThemedText>
                  </Animated.View>
                ) : (
                  <Animated.View style={styles.buttonContent}>
                    <Ionicons name="log-in-outline" size={24} color="#ffffff" style={styles.buttonIcon} />
                    <ThemedText style={styles.buttonText}>دخول النظام</ThemedText>
                  </Animated.View>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={[styles.techInfo, { marginTop: height > 700 ? 40 : 20 }]} entering={FadeInUp.delay(1000).duration(600)}>
            <Animated.View style={styles.statusIndicator}>
              <Animated.View style={styles.statusDot} />
              <ThemedText style={styles.statusText}>متصل بالخادم الرئيسي</ThemedText>

            </Animated.View>
                              <ThemedText adjustsFontSizeToFit style={{color:"#00ff7f" ,fontFamily:"Cario"}}>القبس تكنولجي</ThemedText>
                  <ThemedText adjustsFontSizeToFit style={{color:"#00ff7f"}}>لمقاولات البنى التحتيةالتكنلوجيا و للانترنت </ThemedText>

            <ThemedView style={styles.divider} />
            <TouchableOpacity style={styles.supportButton}>
              <Ionicons name="headset-outline" size={15} color="#00bfff" />
              <ThemedText adjustsFontSizeToFit style={styles.supportText}>الدعم التقني</ThemedText>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0e1a', // Fallback background color
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: -1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    width: '90%', // Use percentage for horizontal spacing
    maxWidth: 500, // Add max width for tablet support
    alignSelf: 'center', // Center the content block
    zIndex: 1,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 10, // Base margin, can be adjusted dynamically
  },
  logoWrapper: {
    // Responsive dimensions are now applied inline
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 127, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 127, 0.3)',
  },
  logoImage: {
    // Use percentages to scale image within its container
    width: '85%',
    height: '85%',
    resizeMode: 'contain',
  },
  logoGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 255, 127, 0.05)',
    shadowColor: '#00ff7f',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 25,
  },
  title: {
    textAlign: 'center',
    color: '#ffffff',
    marginBottom: 24, // Consistent spacing
  },
  inputContainer: {
    marginBottom: 24, // Consistent spacing
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    marginBottom: 15,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(0, 191, 255, 0.3)',
    overflow: 'hidden',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 16,
    textAlign: 'right',
    color: '#ffffff',
  },
  eyeIcon: {
    padding: 8,
  },
  loginButton: {
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#00ff7f',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    marginBottom: 0,
  },
  buttonGradient: {
    paddingVertical: 18,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    marginLeft: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  techInfo: {
    alignItems: 'center',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00ff7f',
    marginLeft: 8,
    shadowColor: '#00ff7f',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  statusText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },
  divider: {
    width: 60,
    height: 1,
    backgroundColor: 'rgba(0, 191, 255, 0.3)',
    marginVertical: 12,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 191, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 191, 255, 0.3)',
  },
  supportText: {
    color: '#00bfff',
    fontSize: 14,
    marginRight: 8,
  },
  // Fiber line styles remain the same
  fiberLineHorizontal: { position: 'absolute', width: 120, height: 1.5, backgroundColor: 'rgba(0, 255, 127, 0.2)', shadowColor: '#00ff7f', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 2, },
  fiberLineVertical: { position: 'absolute', width: 1.5, height: 80, backgroundColor: 'rgba(0, 191, 255, 0.2)', shadowColor: '#00bfff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 2, },
  fiberLineDiagonal: { position: 'absolute', width: 100, height: 1.5, backgroundColor: 'rgba(255, 215, 0, 0.15)', transform: [{ rotate: '45deg' }], shadowColor: '#ffd700', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 2, },
  networkNode: { position: 'absolute', shadowColor: '#00ff7f', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6, },
});