import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import StyledTextInput from '@/components/ui/StyledTextInput';
import { UseDialog } from '@/context/DialogContext';
import { usePermissions } from '@/context/PermissionsContext';
import { Theme, useTheme } from '@/context/ThemeContext'; // ✨ Import Theme type
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient'; // ✨ Import LinearGradient
import { useRouter } from 'expo-router';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import { default as React, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image, // ✨ Import ScrollView
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { auth, db, storage } from '../lib/firebase';

// ✨ Moved styles outside the component for performance and organization
//    It's a function that takes the theme and returns the styles object.
const getStyles = (theme: Theme) =>
  StyleSheet.create({
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.background, // Use theme background
    },
    container: {
      flex: 1,
    },
    // ✨ Added a ScrollView for better handling on small screens
    scrollViewContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 24,
    },
    // ✨ Added a container for the main content for better structure
    contentContainer: {
      gap: 24, // Adds space between all direct children
    },
    headerContainer: {
      alignItems: 'center',
    },
    title: {
      textAlign: 'center',
    },
    subtitle: {
      textAlign: 'center',
      marginTop: 8,
      fontSize: 16,
      color: theme.textSecondary,
    },
    imagePickerContainer: {
      alignItems: 'center',
    },
    // ✨ Enhanced the image picker placeholder
    imagePlaceholder: {
      width: 140,
      height: 140,
      borderRadius: 70, // Make it a perfect circle
      backgroundColor: theme.iconBackground,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: theme.border,
      borderStyle: 'dashed',
    },
    profileImageContainer: {
      position: 'relative', // Needed for the edit icon overlay
    },
    profileImage: {
      width: 140,
      height: 140,
      borderRadius: 70,
      borderWidth: 4,
      borderColor: theme.primary,
    },
    // ✨ New style for the edit icon on top of the profile picture
    editIconOverlay: {
      position: 'absolute',
      bottom: 5,
      right: 5,
      backgroundColor: theme.card,
      borderRadius: 15,
      padding: 6,
      // Add a subtle shadow to lift the icon
      shadowColor: theme.black,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 4,
    },
    // ✨ New style for the button, using a gradient
    button: {
      paddingVertical: 16,
      borderRadius: 12, // More rounded corners
      alignItems: 'center',
      marginTop: 16,
      // Shadow for iOS
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      // Shadow for Android
      elevation: 8,
    },
    buttonText: {
      color: theme.white, // Use theme color
      fontWeight: 'bold',
      fontSize: 18,
    },
  });

export default function CompleteProfileScreen() {
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [displayImage, setDisplayImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();
  const user = auth.currentUser;
  const { theme } = useTheme();
  const { showDialog } = UseDialog();
  const { userdoc } = usePermissions();

  const styles = getStyles(theme); // ✨ Get styles based on the current theme

  useEffect(() => {
    if (userdoc) {
      setPhone(userdoc.phone || '');
      if (userdoc.photoURL) {
        setDisplayImage(userdoc.photoURL);
      }
    }
  }, [userdoc]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8, // Slightly lower quality for faster uploads
    });

    if (!result.canceled) {
      setDisplayImage(result.assets[0].uri);
    }
  };

  const validatephone = (num: string) => {
    if (!/^\d+$/.test(num)) return 'رقم الهاتف يجب أن يحتوي على أرقام فقط.';
    if (num.length !== 11) return 'رقم الهاتف يجب أن يتكون من 11 رقمًا.';
    if (!num.startsWith('07')) return 'رقم الهاتف يجب أن يبدأ بـ "07".';
    return '';
  };

  const handleCompleteProfile = async () => {
    // ... (your existing logic is great, no changes needed here)
    if (!user) {
      showDialog({
        status: 'error',
        message: 'يجب عليك تسجيل الدخول اولا`',
      });
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
      showDialog({
        status: 'error',
        message: 'يرجى تقديم رقم هاتف وصورة شخصية',
      });
      return;
    }

    setIsSaving(true);
    try {
      const dataToUpdate: { phone: string; photoURL?: string } = { phone };
      if (displayImage && !displayImage.startsWith('http')) {
        const storageRef = storage().ref(`profile-pictures/${userdoc.id}`);
        await storageRef.putFile(displayImage);
        const newPhotoURL = await storageRef.getDownloadURL();
        dataToUpdate.photoURL = newPhotoURL;
      }
      const userDocRef = db.collection('users').doc(userdoc.id);
      await userDocRef.update(dataToUpdate);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error completing profile:', error);
      showDialog({
        status: 'error',
        message: 'حدث خطأ أثناء إكمال ملفك الشخصي. يرجى المحاولة مرة أخرى.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!userdoc) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={60}
      >
        <ScrollView contentContainerStyle={styles.scrollViewContent}>
          <View style={styles.contentContainer}>
            <View style={styles.headerContainer}>
              <ThemedText type="title" style={styles.title}>
                أكمل ملفك الشخصي
              </ThemedText>
              <ThemedText style={styles.subtitle}>
                فقط بضع خطوات أخرى للبدء.
              </ThemedText>
            </View>

            <View style={styles.imagePickerContainer}>
              <TouchableOpacity onPress={pickImage} disabled={isSaving}>
                {displayImage ? (
                  <View style={styles.profileImageContainer}>
                    <Image
                      source={{ uri: displayImage }}
                      style={styles.profileImage}
                    />
                    {/* ✨ Edit icon overlay */}
                    <View style={styles.editIconOverlay}>
                      <Ionicons
                        name="camera-outline"
                        size={20}
                        color={theme.primary}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons
                      name="person-add-outline"
                      size={50}
                      color={theme.textSecondary}
                    />
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <StyledTextInput
              label="رقم الهاتف"
              value={phone}
              onChangeText={text => {
                setPhone(text);
                if (phoneError) setPhoneError(validatephone(text));
              }}
              keyboardType="phone-pad"
              placeholder="ادخل رقم هاتفك"
              error={phoneError}
            />

            <TouchableOpacity
              style={styles.button}
              onPress={handleCompleteProfile}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              {/* ✨ Gradient background for the button */}
              <LinearGradient
                colors={[theme.gradientStart, theme.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {isSaving ? (
                <ActivityIndicator color={theme.white} />
              ) : (
                <ThemedText style={styles.buttonText}>حفظ ومتابعة</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}