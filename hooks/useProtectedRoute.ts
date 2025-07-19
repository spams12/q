// hooks/useProtectedRoute.ts
import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

// Assuming you create an AuthContext to provide these values
// For now, we'll pass them as arguments
export function useProtectedRoute(
  user: any,
  profile: any,
  authLoaded: boolean
) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Wait until authentication status is loaded
    if (!authLoaded) {
      return;
    }

    const inAuthGroup = segments[0] === "(auth)";

    if (user) {
      // If the user is authenticated but the profile is incomplete,
      // redirect them to the complete-profile screen.
      if (profile && (!profile.phone || !profile.photoURL)) {
        router.replace("/complete-profile");
      }
      // If the user is authenticated and is currently in the auth flow,
      // redirect them to the main app (tabs).
    } else {
      // If the user is not authenticated and is not in the auth flow,
      // redirect them to the login screen.
      if (!inAuthGroup) {
        router.replace("/login");
      }
    }
    // This effect should only run when auth state changes, not on every navigation.
    // Removing 'segments' and 'router' from the dependency array is key.
    // The logic inside only depends on the user's auth/profile state.
  }, [user, profile, authLoaded]);
}
