import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient'; // Import LinearGradient
import { signInWithEmailAndPassword } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  I18nManager,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { auth } from '../../lib/firebase';

// RTL layout is already enabled, which is great.
I18nManager.forceRTL(true);
I18nManager.allowRTL(true);

// Your FiberOptic animation is cool, let's keep it!
const FiberOpticStrand = () => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(Math.random() * 200 + 100);

  useEffect(() => {
    const duration = Math.random() * 3000 + 2000;
    opacity.value = withRepeat(
      withTiming(Math.random() * 0.5 + 0.2, { duration, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    translateY.value = withRepeat(
      withTiming(Math.random() * -200 - 100, { duration: 10000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.strand,
        {
          left: `${Math.random() * 100}%`,
          height: Math.random() * 150 + 50,
          width: Math.random() * 2 + 1,
        },
        animatedStyle,
      ]}
    />
  );
};

const FiberOpticAnimation = () => (
  <View style={styles.fiberContainer}>
    {Array.from({ length: 50 }).map((_, i) => (
      <FiberOpticStrand key={i} />
    ))}
  </View>
);

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { theme } = useTheme(); // You can use this for more advanced theming if needed

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('خطأ', 'الرجاء إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // On a real app, you would navigate to the home screen instead of an alert.
      Alert.alert('نجاح', 'تم تسجيل الدخول بنجاح!');
    } catch (error: any) {
      const friendlyMessage =
        error.code === 'auth/invalid-credential'
          ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
          : error.message;
      Alert.alert('فشل تسجيل الدخول', friendlyMessage);
    }
  };

  return (
    <LinearGradient colors={['#1a2a44', '#3c1a44']} style={styles.container}>
      <FiberOpticAnimation />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}>
        <View style={styles.content}>
          {/* Animated Glassmorphism Container */}
          <Animated.View entering={FadeInUp.duration(1000).delay(200)} style={styles.glassContainer}>
            {/* USE YOUR NEW MODERN LOGO HERE */}
            <Image
              source={require('../../assets/images/login.webp')} // Replace with your new sleek logo
              style={styles.logo}
            />

            <ThemedText type="title" style={styles.title}>
              أهلاً بعودتك
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              سجّل الدخول للمتابعة
            </ThemedText>

            {/* Modern Inputs */}
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={22} color="#ccc" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="البريد الإلكتروني"
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                selectionColor="#00E0FF"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={22} color="#ccc" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="كلمة المرور"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                selectionColor="#00E0FF"
              />
            </View>

            <TouchableOpacity style={styles.forgotPasswordContainer}>
              <ThemedText style={styles.forgotPasswordText}>هل نسيت كلمة المرور؟</ThemedText>
            </TouchableOpacity>

            {/* Modern Gradient Button */}
            <TouchableOpacity onPress={handleLogin} activeOpacity={0.8}>
              <LinearGradient
                colors={['#00E0FF', '#B026FF']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.gradientButton}>
                <ThemedText style={styles.buttonText}>تسجيل الدخول</ThemedText>
              </LinearGradient>
            </TouchableOpacity>

            {/* Sign up link */}
            <View style={styles.signupContainer}>
              <ThemedText style={styles.signupText}>ليس لديك حساب؟ </ThemedText>
              <Pressable>
                <ThemedText style={styles.signupLink}>أنشئ حساباً</ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  fiberContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  strand: {
    position: 'absolute',
    backgroundColor: 'rgba(74, 144, 226, 0.5)', // Kept this as it works well
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'transparent',
  },
  // --- Glassmorphism Container ---
  glassContainer: {
    width: '100%',
    padding: 25,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden', // Ensures the inner elements don't spill out
  },
  logo: {
    width: 100, // Slightly smaller for a sleeker look
    height: 100,
    alignSelf: 'center',
    marginBottom: 20,
    // borderRadius: 50, // Might not need this if your logo is abstract
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 30,
    color: '#ccc',
    fontSize: 16,
  },
  // --- Modernized Inputs ---
  inputContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)', // Semi-transparent dark background
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  inputIcon: {
    marginLeft: 10,
  },
  input: {
    flex: 1,
    height: 55, // Increased height for better touch target
    fontSize: 16,
    color: '#fff',
    textAlign: 'right',
  },
  // --- Forgot Password ---
  forgotPasswordContainer: {
    alignSelf: 'flex-start', // Aligns to the left in RTL
    marginBottom: 20,
  },
  forgotPasswordText: {
    color: '#00E0FF',
    fontSize: 14,
  },
  // --- Modern Gradient Button ---
  gradientButton: {
    height: 55,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00E0FF', // Shadow matches the gradient
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // --- Sign Up Link ---
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 30,
  },
  signupText: {
    color: '#ccc',
    fontSize: 14,
  },
  signupLink: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});