import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import StyledTextInput from '@/components/ui/StyledTextInput';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db, storage } from '../lib/firebase';

export default function CompleteProfileScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const user = auth.currentUser;
  const { theme } = useTheme();

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const validatePhoneNumber = (num: string) => {
    if (!/^\d+$/.test(num)) {
      return 'رقم الهاتف يجب أن يحتوي على أرقام فقط.';
    }
    if (num.length !== 11) {
      return 'رقم الهاتف يجب أن يتكون من 11 رقمًا.';
    }
    if (!num.startsWith('07')) {
      return 'رقم الهاتف يجب أن يبدأ بـ "07".';
    }
    return '';
  };

  const handleCompleteProfile = async () => {
    if (!user) {
      Alert.alert('خطأ', 'يجب عليك تسجيل الدخول لإكمال ملفك الشخصي.');
      return;
    }

    const phoneValidationError = validatePhoneNumber(phoneNumber);
    if (phoneValidationError) {
      setPhoneError(phoneValidationError);
      return;
    } else {
      setPhoneError('');
    }

    if (!phoneNumber || !image) {
      Alert.alert('خطأ', 'يرجى تقديم رقم هاتف وصورة ملف شخصي.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(image);
      const blob = await response.blob();
      const storageRef = ref(storage, `profile-pictures/${user.uid}`);
      await uploadBytes(storageRef, blob);
      const photoURL = await getDownloadURL(storageRef);

      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        phoneNumber,
        photoURL,
      });

      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error completing profile:', error);
      Alert.alert(
        'خطأ',
        'حدث خطأ أثناء إكمال ملفك الشخصي. يرجى المحاولة مرة أخرى.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      writingDirection: 'ltr',
    },
    title: {
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      textAlign: 'center',
      marginBottom: 32,
      fontSize: 16,
      color: theme.textSecondary,
    },
    imagePicker: {
      alignItems: 'center',
      marginBottom: 32,
    },
    profileImage: {
      width: 120,
      height: 120,
      borderRadius: 60,
      borderWidth: 3,
      borderColor: theme.primary,
    },
    imagePlaceholder: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: theme.iconBackground,
      justifyContent: 'center',
      alignItems: 'center',
    },
    imagePickerText: {
      marginTop: 8,
      fontSize: 12,
      color: theme.textSecondary,
    },
    button: {
      paddingVertical: 16,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 16,
      backgroundColor: theme.primary,
    },
    buttonText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 16,
    },
  });

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        أكمل ملفك الشخصي
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        فقط بضع خطوات أخرى للبدء.
      </ThemedText>

      <TouchableOpacity onPress={pickImage} style={styles.imagePicker}>
        {image ? (
          <Image source={{ uri: image }} style={styles.profileImage} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons
              name="camera-outline"
              size={40}
              color={theme.icon}
            />
            <ThemedText style={styles.imagePickerText}>
              اختر صورة الملف الشخصي
            </ThemedText>
          </View>
        )}
      </TouchableOpacity>

      <StyledTextInput
        label="رقم الهاتف"
        value={phoneNumber}
        onChangeText={(text) => {
          setPhoneNumber(text);
          if (phoneError) {
            const validationError = validatePhoneNumber(text);
            setPhoneError(validationError);
          }
        }}
        keyboardType="phone-pad"
        placeholder="ادخل رقم هاتفك"
        error={phoneError}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleCompleteProfile}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.buttonText}>حفظ الملف الشخصي</ThemedText>
        )}
      </TouchableOpacity>
    </ThemedView>
  );
}