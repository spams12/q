import AsyncStorage from '@react-native-async-storage/async-storage'; // --- ADDED ---
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
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
import { PermissionsProvider } from '../context/PermissionsContext';
import { ThemeProvider, Themes, useTheme } from '../context/ThemeContext';
import { useProtectedRoute } from '../hooks/useProtectedRoute';
import { auth, db } from '../lib/firebase';
import { User as AppUser } from '../lib/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner : true,
    shouldShowList :true
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
      onRequestClose={onMaybeLater} // Allow closing on Android back press
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
              <Text style={[styles.buttonText, styles.primaryButtonText]}>
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
        expoPushTokens: arrayUnion(token),
      });
      console.log(`Token successfully added for user with doc ID ${userDocId}`);
    }
  } catch (error) {
    console.error('Error registering push token:', error);
  }
}

function RootLayoutNav({ user, profile, authLoaded }: { user: FirebaseUser | null; profile: AppUser | null; authLoaded: boolean }) {
  useProtectedRoute(user, profile, authLoaded)
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="tasks/[id]" options={{ headerShown: false }}/>
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
          }}/>
        <Stack.Screen name="+not-found" />
        <Stack.Screen name="family" options={{ headerBackTitle: "رجوع", }}/>
        <Stack.Screen name="about" options={{ headerBackTitle: "رجوع",}}/>
        <Stack.Screen name="invoices" options={{headerShown:false}}/>
        <Stack.Screen name="complete-profile" options={{ headerBackTitle: "رجوع",headerTitle:"الملف الشخصي"}}/>
      </Stack>
    </View>
  );
}

// --- MAIN ROOT LAYOUT COMPONENT ---

// --- ADDED: Constants and Type Definitions for Notification Handling ---
const ASYNC_STORAGE_KEY = 'notifications';

interface StoredNotification {
  id?: string;
  title: string;
  body: string;
  timestamp?: string;
  read?: boolean;
  type?: 'info' | 'warning' | 'success' | 'error';
  request?: {
    identifier: string; // The unique ID from the push notification system
    content: {
      data?: { id?: string; type?: string; [key: string]: any };
      dataString?: string; // Fallback: payload as a stringified JSON
      title?: string;
      body?: string;
    };
  };
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Cairo: require('../assets/fonts/Cairo.ttf'),
  });

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [isPermissionModalVisible, setIsPermissionModalVisible] = useState(false);
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
      if (!currentUser) {
        setProfile(null);
      }
      setAuthLoaded(true);
    });
    return () => unsubscribe();
  }, [error]);
  
  useEffect(() => {
    if (!user) return;

    const findUserAndSetup = async () => {
      try {
        const usersCollectionRef = collection(db, 'users');
        const q = query(usersCollectionRef, where("uid", "==", user.uid));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          const userDocId = userDoc.id;

          await handleNotificationPermissions(userDocId);

          const userDocRef = doc(db, 'users', userDocId);
          const unsubscribeSnapshot = onSnapshot(userDocRef, (doc) => {
            setProfile({ id: doc.id, ...doc.data() } as AppUser);
          });
          return unsubscribeSnapshot;
        } else {
          console.warn("Firestore document not found for user UID:", user.uid);
          setProfile(null); 
        }
      } catch (e) {
        console.error("Error finding user document or setting up listeners:", e);
      }
    };

    let unsubscribe: (() => void) | undefined;
    findUserAndSetup().then(unsub => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active' && profile) {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'granted') {
          setIsPermissionModalVisible(false);
          await registerPushToken(profile.id);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [profile]); 

  useEffect(() => {
    if (loaded && authLoaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded, authLoaded]);

  // --- MODIFIED: This useEffect now handles storing notifications locally ---
  useEffect(() => {
    const notificationListener = Notifications.addNotificationReceivedListener(async (notification) => {
      console.log('Notification received, saving to local storage:', notification);

      // Create a notification object matching the format used by NotificationsScreen
      const newNotification: StoredNotification = {
          title: notification.request.content.title || 'إشعار جديد',
          body: notification.request.content.body || 'لا يوجد محتوى',
          timestamp: new Date(notification.date).toISOString(),
          read: false,
          type: (notification.request.content.data?.type as any) || 'info',
          request: {
              identifier: notification.request.identifier,
              content: {
                  title: notification.request.content.title || undefined,
                  body: notification.request.content.body || undefined,
                  data: notification.request.content.data || undefined,
                  dataString: notification.request.content.data 
                    ? JSON.stringify(notification.request.content.data) 
                    : undefined,
              },
          },
      };

      try {
        // 1. Get current notifications from storage
        const storedNotificationsJSON = await AsyncStorage.getItem(ASYNC_STORAGE_KEY);
        const currentNotifications: StoredNotification[] = storedNotificationsJSON ? JSON.parse(storedNotificationsJSON) : [];

        // 2. Add the new notification to the top of the list
        const updatedNotifications = [newNotification, ...currentNotifications];

        // 3. Save the updated list back to storage
        await AsyncStorage.setItem(ASYNC_STORAGE_KEY, JSON.stringify(updatedNotifications));
        console.log('Successfully saved new notification to AsyncStorage.');

      } catch (e) {
        console.error('Failed to save notification to AsyncStorage:', e);
      }
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response received:', response);
      const data = response.notification.request.content.data;

      // Handle navigation when user taps on the notification
      if (data && data.type === 'serviceRequest' && data.id) {
        router.push(`/tasks/${data.id}`);
      } else {
        router.push('/notifications'); // Fallback to notifications screen
      }
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener);
      Notifications.removeNotificationSubscription(responseListener);
    };
  }, [router]);


  if (!loaded || !authLoaded) {
    return null;
  }

  return (
    <PermissionsProvider>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ThemeProvider>
            <RootLayoutNav user={user} profile={profile} authLoaded={authLoaded} />
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
          </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </PermissionsProvider>
  );
}