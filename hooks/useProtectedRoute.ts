// hooks/useProtectedRoute.ts
import { auth } from "@/lib/firebase";
import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

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
    const inCompleteProfile = segments.includes("complete-profile");

    if (user) {
      // Check if user has app access permission
      const hasAppAccess = profile?.permissions?.appTasksAccess === true;

      // If user doesn't have permission, sign them out and redirect to login
      if (profile && !hasAppAccess && !inAuthGroup) {
        auth().signOut().catch(console.error);
        router.replace("/login");
        return;
      }

      // If the user is authenticated but the profile is incomplete,
      // redirect them to the complete-profile screen.
      if (
        profile &&
        (!profile.phone || !profile.photoURL) &&
        !inCompleteProfile
      ) {
        router.replace("/complete-profile");
      }
      // If the user is authenticated, has app access, and has completed profile,
      // and is in auth flow, redirect them to the main app (tabs).
      else if (
        profile &&
        profile.phone &&
        profile.photoURL &&
        hasAppAccess &&
        inAuthGroup
      ) {
        router.replace("/(tabs)");
      }
    } else {
      // If the user is not authenticated and is not in the auth flow,
      // redirect them to the login screen.
      if (!inAuthGroup && !inCompleteProfile) {
        router.replace("/login");
      }
    }
  }, [user, profile, authLoaded]);
}
