import { Ionicons } from '@expo/vector-icons';
import { signInWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { UseDialog } from '@/context/DialogContext';
import { auth } from '@/lib/firebase';

// Simplified theme for a clean look
const theme = {
  background: '#0f1419',
  primary: '#00bfff', // Tech blue
  error: '#ff4757', // Error red
  text: '#ffffff',
  placeholder: 'rgba(255, 255, 255, 0.5)',
  inputBackground: 'rgba(255, 255, 255, 0.08)',
  borderColor: 'rgba(0, 191, 255, 0.3)',
} as const;

// Helper function to translate Firebase error codes to Arabic
const firebaseErrorToArabic = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    case 'auth/invalid-email':
      return 'صيغة البريد الإلكتروني المدخلة غير صحيحة.';
    case 'auth/too-many-requests':
      return 'تم حظر الوصول مؤقتًا بسبب كثرة المحاولات. يرجى المحاولة لاحقًا.';
    case 'auth/network-request-failed':
      return 'فشل الاتصال بالشبكة. يرجى التحقق من اتصالك بالإنترنت.';
    default:
      console.error('Unhandled Firebase Auth Error:', errorCode);
      return 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.';
  }
};


// --- MAIN LOGIN SCREEN COMPONENT ---

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { showDialog } = UseDialog();

  const handleLogin = async () => {
    Keyboard.dismiss();
    if (!email || !password) {
      showDialog({
        status: 'error',
        message: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور.',
      });
      return;
    }

    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      showDialog({
        status: 'success',
        message: 'تم تسجيل الدخول بنجاح!',
        duration: 1500,
      });
      // Assuming successful login unmounts the screen.
      // If not, you might need to add navigation logic here.
    } catch (error: any) {
      const errorMessage = firebaseErrorToArabic(error.code);
      showDialog({
        status: 'error',
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <View style={styles.content}>
          {/* --- Header --- */}
          <View style={styles.header}>
            <Ionicons name="logo-electron" size={80} color={theme.primary} />
            <Text style={styles.title}>نظام الصيانة التقنية</Text>
            <Text style={styles.subtitle}>الرجاء تسجيل الدخول للمتابعة</Text>
          </View>

          {/* --- Input Fields --- */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={22} color={theme.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="البريد الإلكتروني"
                placeholderTextColor={theme.placeholder}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                onSubmitEditing={handleLogin} // Allow submitting from keyboard
              />
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="shield-checkmark-outline" size={22} color={theme.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="كلمة المرور"
                placeholderTextColor={theme.placeholder}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                onSubmitEditing={handleLogin} // Allow submitting from keyboard
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={22} color={theme.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* --- Login Button --- */}
          <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={isLoading} activeOpacity={0.8}>
            {isLoading ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <Text style={styles.buttonText}>دخول النظام</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.text,
    textAlign: 'center',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: theme.placeholder,
    textAlign: 'center',
    marginTop: 8,
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
  },
  inputIcon: {
    marginHorizontal: 15,
  },
  input: {
    flex: 1,
    height: 55,
    fontSize: 16,
    color: theme.text,
    textAlign: 'right', // For Arabic input
    paddingHorizontal: 10,
  },
  eyeIcon: {
    padding: 15,
  },
  loginButton: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: theme.background, // Text color contrasts with button background
    fontSize: 18,
    fontWeight: 'bold',
  },
});