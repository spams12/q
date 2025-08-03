import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import {
  arrayUnion,
  doc,
  updateDoc,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  AppState,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import 'react-native-get-random-values';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GlobalStatusDialog } from '../components/global/StatusDialog';
import { DialogProvider } from '../context/DialogContext';
import { PermissionsProvider, usePermissions } from '../context/PermissionsContext';
import { ThemeProvider, Themes, useTheme } from '../context/ThemeContext';
import { useProtectedRoute } from '../hooks/useProtectedRoute';
import { auth, db } from '../lib/firebase';
import { User as AppUser } from '../lib/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true
  }),
});

SplashScreen.preventAutoHideAsync();

// --- NEW & IMPROVED: Notification Permission Modal Component ---

// A factory function to create theme-aware styles
const getStyles = (theme: Themes['light']) =>
  StyleSheet.create({
    centeredView: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.55)', // A slightly darker backdrop for better focus
    },
    modalView: {
      margin: 20,
      backgroundColor: theme.card, // Use theme color for the background
      borderRadius: 14, // Softer, more modern corners
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 10,
      width: '85%',
      maxWidth: 320, // Set a max width for consistency on larger screens
      overflow: 'hidden', // Ensures child elements adhere to borderRadius
    },
    textContainer: {
      padding: 20,
      paddingBottom: 15,
      alignItems: 'center',
    },
    modalTitle: {
      fontSize: 18,
      fontFamily: 'Cairo',
      fontWeight: 'bold',
      color: theme.text, // Use theme color for text
      marginBottom: 8,
      textAlign: 'center',
    },
    modalText: {
      fontSize: 14,
      fontFamily: 'Cairo',
      lineHeight: 22,
      color: theme.textSecondary, // Use secondary text color for the body
      textAlign: 'center',
    },
    buttonContainer: {
      flexDirection: 'column',
      width: '100%',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.separator, // Use theme color for separators
    },
    button: {
      width: '100%',
      padding: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonSeparator: {
      width: '100%',
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.separator,
    },
    buttonText: {
      fontSize: 17,
      fontFamily: 'Cairo',
      color: theme.primary, // Use theme primary color for button text
      textAlign: 'center',
    },
    primaryButtonText: {
      fontWeight: 'bold', // Emphasize the primary action
    },
  });

type NotificationPermissionModalProps = {
  visible: boolean;
  onGoToSettings: () => void;
  onMaybeLater: () => void;
};

const NotificationPermissionModal = ({
  visible,
  onGoToSettings,
  onMaybeLater,
}: NotificationPermissionModalProps) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onMaybeLater}
      statusBarTranslucent={Platform.OS === 'android'}

    >
      <View style={styles.centeredView}>
        <View style={styles.modalView}>
          <View style={styles.textContainer}>
            <Text style={styles.modalTitle}>تفعيل الإشعارات</Text>
            <Text style={styles.modalText}>
              للحصول على التحديثات الفورية، يرجى تمكين الإشعارات من الإعدادات.
            </Text>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} onPress={onGoToSettings}>
              <Text style={[styles.buttonText]}>
                الانتقال إلى الإعدادات
              </Text>
            </TouchableOpacity>
            <View style={styles.buttonSeparator} />
            <TouchableOpacity style={styles.button} onPress={onMaybeLater}>
              <Text style={styles.buttonText}>لاحقاً</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// --- REFACTORED: This function now only handles token registration, assuming permission is granted. ---
async function registerPushToken(userDocId: string) {
  if (!userDocId) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('Expo Push Token:', token);

    if (token) {
      const userDocRef = doc(db, 'users', userDocId);
      await updateDoc(userDocRef, {
        "expoPushTokens.QTM": arrayUnion(token),
      });
      console.log(`Token successfully added for user with doc ID ${userDocId}`);
    }
  } catch (error) {
    console.error('Error registering push token:', error);
  }
}

// Pass userdoc from the context to the 'profile' prop
function RootLayoutNav({ user, profile, authLoaded }: { user: FirebaseUser | null; profile: AppUser | null; authLoaded: boolean }) {
  useProtectedRoute(user, profile, authLoaded)
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack
        initialRouteName='(tabs)'
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="tasks/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="announcements/[id]" options={{
          title: 'الاعلانات',
          headerTitleAlign: 'center',
          headerBackTitle: "رجوع",

        }} />

        <Stack.Screen
          name="create-request"
          options={{
            title: 'إنشاء تكت',
            headerTitleAlign: 'center',
            headerBackTitle: "رجوع",
          }}
        />
        <Stack.Screen name="notifications" options={{
          title: 'الاشعارات',
          headerTitleAlign: 'center',
          headerBackTitle: "رجوع",
        }} />
        <Stack.Screen name="+not-found" />
        <Stack.Screen name="family" options={{ headerBackTitle: "رجوع", title: "العائلة" }} />
        <Stack.Screen name="about" options={{ headerBackTitle: "رجوع", }} />
        <Stack.Screen name="invoices" options={{
          headerShown: false
        }} />
        <Stack.Screen name="complete-profile" options={{ headerBackTitle: "رجوع", headerTitle: "الملف الشخصي" }} />
      </Stack>
    </View>
  );
}

// FIX 1: The main logic is moved into this new component.
// This allows it to correctly consume the `userdoc` from the context
// provided by the parent `RootLayout` component.
function RootLayoutContent() {
  const [loaded, error] = useFonts({
    Cairo: require('../assets/fonts/Cairo.ttf'),
  });

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [isPermissionModalVisible, setIsPermissionModalVisible] = useState(false);
  const { userdoc } = usePermissions(); // Now this hook works correctly!
  const router = useRouter();

  // --- NEW: Permission handling logic ---
  const handleNotificationPermissions = async (userDocId: string) => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus === 'undetermined') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus === 'denied') {
      setIsPermissionModalVisible(true);
      return;
    }

    if (finalStatus === 'granted') {
      await registerPushToken(userDocId);
    }
  };

  useEffect(() => {
    if (error) throw error;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoaded(true);
    });
    return () => unsubscribe();
  }, [error]);

  useEffect(() => {
    if (user && userdoc?.id) {
      handleNotificationPermissions(userdoc.id);
    }
  }, [user, userdoc]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active' && userdoc?.id) {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'granted') {
          setIsPermissionModalVisible(false);
          await registerPushToken(userdoc.id);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [userdoc]);

  useEffect(() => {
    if (loaded && authLoaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded, authLoaded]);

  // --- MODIFIED: Notification listener now uses `userdoc`.
  useEffect(() => {
    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received while app is foregrounded:', notification);
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener(async (response) => {
      // FIX 2: Added `notificationId` to the type to match the data from your logs.
      const data = response.notification.request.content.data as {
        type?: 'serviceRequest' | 'announcement' | 'info';
        id?: string;
        docId?: string; // Kept for future compatibility
        notificationId?: string; // The actual key from your logs
      };

      console.log('User tapped notification. Data:', data);

      // FIX 2: Use the `notificationId` from the payload as a fallback for `docId`.
      const notificationDocId = data?.docId || data?.notificationId;

      // --- 1. Mark notification as read ---
      // This check will now work correctly with a valid `userdoc` and `notificationDocId`.
      if (userdoc?.id && notificationDocId) {
        const notificationRef = doc(db, "users", userdoc.id, "notifications", notificationDocId);
        try {
          await updateDoc(notificationRef, {
            isRead: true,
            readAt: new Date(),
          });
          console.log(`Notification ${notificationDocId} marked as read.`);
        } catch (error) {
          console.error("Error marking notification as read:", error);
        }
      } else {
        // Updated warning message for better debugging.
        console.warn(`Could not mark as read. Missing userdoc.id (${!!userdoc?.id}) or notificationDocId (${!!notificationDocId}).`);
      }

      // --- 2. Navigate to the appropriate screen ---
      if ((data?.type === 'serviceRequest' || data?.type === 'info') && data?.id) {
        const id = data.id;
        router.push({
          pathname: "/tasks/[id]",
          params: {
            id: id,
            showActions: 'true'
          }
        });
      } else if (data?.type === 'announcement' && data?.id) {
        router.push(`/announcements/${data.id}`);
      } else {
        console.warn(`No navigation route defined for notification type: ${data?.type}`);
        router.push('/notifications');
      }
    });

    return () => {
      notificationListener.remove();
      responseListener.remove();
    };
  }, [router, userdoc]); // Depend on userdoc from the context

  if (!loaded || !authLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <ThemeProvider>
          <DialogProvider>
            {/* Pass userdoc to the profile prop */}
            <RootLayoutNav user={user} profile={userdoc} authLoaded={authLoaded} />
            <GlobalStatusDialog />
            <NotificationPermissionModal
              visible={isPermissionModalVisible}
              onGoToSettings={() => {
                setIsPermissionModalVisible(false);
                Linking.openSettings();
              }}
              onMaybeLater={() => {
                setIsPermissionModalVisible(false);
              }}
            />
          </DialogProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}


export default function RootLayout() {
  return (
    <PermissionsProvider>
      <RootLayoutContent />
    </PermissionsProvider>
  );
}