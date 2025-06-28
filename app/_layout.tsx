import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import 'react-native-get-random-values';
import { KeyboardProvider } from "react-native-keyboard-controller";
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PermissionsProvider } from '../context/PermissionsContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { useProtectedRoute } from '../hooks/useProtectedRoute';
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

SplashScreen.preventAutoHideAsync();


function RootLayoutNav({ user, profile, authLoaded }: { user: User | null; profile: any; authLoaded: boolean }) {
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
        <Stack.Screen name="invoices" options={{ headerShown:false}}/>
      </Stack>
    </View>

  );
}



export default function RootLayout() {
  const [loaded, error] = useFonts({
    Cairo: require('../assets/fonts/Cairo.ttf'),
  });

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
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

  if (!loaded || !authLoaded) {
    return null;
  }

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
