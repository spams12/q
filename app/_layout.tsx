import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import 'react-native-get-random-values';
import 'react-native-reanimated';
import { PermissionsProvider } from '../context/PermissionsContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { auth, db } from '../lib/firebase';
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();


function RootLayoutNav() {
  const { theme } = useTheme();
    useEffect(() => {
    console.log(I18nManager.isRTL ? 'RTL mode enabled' : 'LTR mode enabled');
  }, []);
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
        <Stack.Screen name="invoices" options={{ headerBackTitle: "رجوع",}}/>
      </Stack>
    </View>

  );
}

const styles = StyleSheet.create({
  backButton: {
  },
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Cairo: require('../assets/fonts/Cairo.ttf'),
  });

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const userDocRef = doc(db, 'users', user.uid);
      const unsubscribe = onSnapshot(userDocRef, (doc) => {
        setProfile(doc.data());
      });
      return () => unsubscribe();
    }
  }, [user]);

  useEffect(() => {
    if (!authLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (user) {
      if (profile && (!profile.phoneNumber || !profile.photoURL)) {
        router.replace('/complete-profile');
      } else if (inAuthGroup) {
        router.replace('/(tabs)');
      }
    } else if (!inAuthGroup) {
      router.replace('/login');
    }
  }, [user, profile, authLoaded, segments, router]);

  useEffect(() => {
    if (loaded && authLoaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded, authLoaded]);

  useEffect(() => {
    const notificationListener =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log('Notification received:', notification);
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

  if (!loaded || !authLoaded) {
    return null;
  }

  return (
    <PermissionsProvider>
      <ThemeProvider>
        <RootLayoutNav />
      </ThemeProvider>
    </PermissionsProvider>
  );
}
