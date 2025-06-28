import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import 'react-native-get-random-values';
import { KeyboardProvider } from "react-native-keyboard-controller";
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PermissionsProvider } from '../context/PermissionsContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
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


async function registerForPushNotificationsAsync(userDocId: string) {
  // Ensure we have a document ID to work with
  if (!userDocId) return;

  // Set up Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  // Request notification permissions
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    console.log('Permission to receive notifications was denied.');
    return;
  }
  
  try {
    // Get the unique Expo push token for this device
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('Expo Push Token:', token);

    if (token) {
      // Use the provided user document ID to create a reference
      const userDocRef = doc(db, 'users', userDocId);
      
      // Update the document, adding the new token to the 'expoPushTokens' array.
      // arrayUnion is smart and won't add the token if it already exists.
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
export default function RootLayout() {
  const [loaded, error] = useFonts({
    Cairo: require('../assets/fonts/Cairo.ttf'),
  });

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setProfile(null);
      }
      setAuthLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const findUserAndSetup = async () => {
      try {
        const usersCollectionRef = collection(db, 'users');
        const q = query(usersCollectionRef, where("uid", "==", user.uid));
        
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          const userDocId = userDoc.id; // This is the unique Firestore document ID!

          await registerForPushNotificationsAsync(userDocId);

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
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user]); 

  useEffect(() => {
    if (loaded && authLoaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded, authLoaded]);

  useEffect(() => {
    const notificationListener =
      Notifications.addNotificationReceivedListener(async (notification) => {
        console.log('Notification received:', notification);
        try {
          const existingNotifications = await AsyncStorage.getItem('notifications');
          const notifications = existingNotifications ? JSON.parse(existingNotifications) : [];
          notifications.push(notification);
          await AsyncStorage.setItem('notifications', JSON.stringify(notifications));
        } catch (e) {
          console.error("Failed to save notification.", e);
        }
      });

    const responseListener =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log('Notification response received:', response);
        const data = response.notification.request.content.data;

        if (data && data.type === 'serviceRequest' && data.id) {
          router.push(`/tasks/${data.id}`);
        } else {
          router.push('/my-requests');
        }
      });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener);
      Notifications.removeNotificationSubscription(responseListener);
    };
  }, [router]);


  // While loading fonts or auth state, return nothing to show the splash screen.
  if (!loaded || !authLoaded) {
    return null;
  }

  // --- RENDER THE APP ---
  // Wrap everything in your custom providers.
  return (
    <PermissionsProvider>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ThemeProvider>
            <RootLayoutNav user={user} profile={profile} authLoaded={authLoaded} />
          </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </PermissionsProvider>
  );
}