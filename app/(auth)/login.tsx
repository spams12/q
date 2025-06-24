import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

const { width } = Dimensions.get('window');

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('خطأ', 'الرجاء إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }
    
    setIsLoading(true);
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Navigation will be handled by the auth state listener in the root layout
    } catch (error: any) {
      let errorMessage = 'فشل تسجيل الدخول. الرجاء المحاولة مرة أخرى.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
      }
      Alert.alert('فشل تسجيل الدخول', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ flex: 1 }}
    >
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <View style={styles.headerContainer}>
          <Text style={styles.title}>تسجيل الدخول</Text>
          <Text style={styles.subtitle}>تطبيق تركيب الألياف الضوئية</Text>
        </View>

        <View style={styles.imageContainer}>
          {/* Placeholder for illustration */}
            <Image source={require('@/assets/images/logo.png')} style={styles.image} /> 
         
        </View>

        <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            placeholder="البريد الإلكتروني"
            placeholderTextColor="#A0AEC0"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textAlign="right"
          />
          <TextInput
            style={styles.input}
            placeholder="كلمة المرور"
            placeholderTextColor="#A0AEC0"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textAlign="right"
          />
          <TouchableOpacity>
            <Text style={styles.forgotPasswordText}>نسيت كلمة المرور؟</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.loginButton} 
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>تسجيل الدخول</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1A202C',
    marginBottom: 8,
    fontFamily: 'Cairo',
  },
  subtitle: {
    fontSize: 18,
    color: '#718096',
    fontFamily: 'Cairo',
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  imagePlaceholder: {
    width: width * 0.6,
    height: width * 0.6,
    backgroundColor: '#E2E8F0',
    borderRadius: (width * 0.6) / 2,
  },
  image: {
    width: width * 0.7,
    height: width * 0.7,
    resizeMode: 'contain',
  },
  formContainer: {
    width: '100%',
  },
  input: {
    backgroundColor: '#F7FAFC',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    color: '#1A202C',
    textAlign: 'right',
    fontFamily: 'Cairo',
  },
  forgotPasswordText: {
    textAlign: 'right',
    color: '#718096',
    marginBottom: 25,
    fontSize: 14,
    fontFamily: 'Cairo',
  },
  loginButton: {
    backgroundColor: '#2D3748',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Cairo',
  },
});