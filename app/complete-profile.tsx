import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import StyledTextInput from '@/components/ui/StyledTextInput';
import { usePermissions } from '@/context/PermissionsContext'; // Already imported
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { auth, db, storage } from '../lib/firebase';

export default function CompleteProfileScreen() {
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [displayImage, setDisplayImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();
  const user = auth.currentUser;
  const { theme } = useTheme();

  // --- Use userdoc from context instead of fetching ---
  // This hook now provides the user document.
  const { userdoc } = usePermissions();

  // --- Populate form data from the context ---
  // This effect runs whenever `userdoc` from the context changes.
  useEffect(() => {
    // If the user document from the context is available, populate the form fields.
    if (userdoc) {
      setPhone(userdoc.phone || '');
      // Set the image from the userdoc if it exists
      if (userdoc.photoURL) {
        setDisplayImage(userdoc.photoURL);
      }
    }
  }, [userdoc]);

  const pickImage = async () => {
    // This function will now only be called if there's no image yet.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setDisplayImage(result.assets[0].uri);
    }
  };

  const validatephone = (num: string) => {
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

    const phoneValidationError = validatephone(phone);
    if (phoneValidationError) {
      setPhoneError(phoneValidationError);
      return;
    } else {
      setPhoneError('');
    }

    if (!phone || !displayImage) {
      Alert.alert('خطأ', 'يرجى تقديم رقم هاتف وصورة ملف شخصي.');
      return;
    }

    setIsSaving(true);
    try {
      const dataToUpdate: { phone: string; photoURL?: string } = { phone };

      if (displayImage && !displayImage.startsWith('http')) {
        const response = await fetch(displayImage);
        const blob = await response.blob();
        const storageRef = ref(storage, `profile-pictures/${userdoc.id}`);
        await uploadBytes(storageRef, blob);
        const newPhotoURL = await getDownloadURL(storageRef);
        dataToUpdate.photoURL = newPhotoURL;
      }

      const userDocRef = doc(db, 'users', userdoc.id);
      await updateDoc(userDocRef, dataToUpdate);

      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error completing profile:', error);
      Alert.alert(
        'خطأ',
        'حدث خطأ أثناء إكمال ملفك الشخصي. يرجى المحاولة مرة أخرى.'
      );
    } finally {
      setIsSaving(false);
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
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

  // --- Display a loading indicator until the userdoc is available from the context ---
  if (!userdoc) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
       <KeyboardAvoidingView
      behavior='padding'
      keyboardVerticalOffset={50}
      >
      <ThemedText type="title" style={styles.title}>
        أكمل ملفك الشخصي
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        فقط بضع خطوات أخرى للبدء.
      </ThemedText>

      <TouchableOpacity
        onPress={pickImage}
        style={styles.imagePicker}
        disabled={!!displayImage}
      >
        {displayImage ? (
          <Image source={{ uri: displayImage }} style={styles.profileImage} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="camera-outline" size={40} color={theme.icon} />
            <ThemedText style={styles.imagePickerText}>
              اختر صورة الملف الشخصي
            </ThemedText>
          </View>
        )}
      </TouchableOpacity>
     

    
      <StyledTextInput
        label="رقم الهاتف"
        value={phone}
        onChangeText={(text) => {
          setPhone(text);
          if (phoneError) {
            const validationError = validatephone(text);
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
        disabled={isSaving}
      >
        {isSaving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.buttonText}>حفظ الملف الشخصي</ThemedText>
        )}
      </TouchableOpacity>
        </KeyboardAvoidingView>
    </ThemedView>
  );
}