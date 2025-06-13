import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';
import { PermissionsProvider } from '../context/PermissionsContext';
import { ThemeProvider } from '../context/ThemeContext';
import { auth } from '../lib/firebase';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <PermissionsProvider>
      <ThemeProvider>
        <View style={{ flex: 1 }}>
          <Stack>
            <Stack.Screen name="(tabs)/index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
        </View>
      </ThemeProvider>
    </PermissionsProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Cairo: require('../assets/fonts/Cairo.ttf'),
  });

  const [user, setUser] = useState<User | null>(null);
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

  // useEffect(() => {
  //   if (!authLoaded) return;

  //   const inAuthGroup = segments[0] === '(auth)';

  //   if (!user && !inAuthGroup) {
  //     // router.replace('/login');
  //     router.replace('/(tabs)/hello');
  //   } else if (user && inAuthGroup) {
  //     router.replace('/(tabs)/hello');
  //   }
  // }, [user, authLoaded, segments, router]);

  useEffect(() => {
    if (loaded && authLoaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded, authLoaded]);

  if (!loaded || !authLoaded) {
    return null;
  }

  return <RootLayoutNav />;
}
