import { FontAwesome, FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { usePermissions } from '@/context/PermissionsContext';
import { useTheme } from '@/context/ThemeContext';
import { db } from '@/lib/firebase';

export default function TabLayout() {
  const { theme } = useTheme();
  const { userdoc } = usePermissions();

  // Temporary source of unread notifications; replace with real state/store when available
  const [unreadCount, setUnreadCount] = useState(0);

  // 4. Use an effect to listen for real-time updates from Firestore
  useEffect(() => {
    // Exit early if we don't have a user document or ID
    if (!userdoc?.id) {
      setUnreadCount(0); // Reset count if user is not available
      return;
    }

    // Define the reference to the user's notifications sub-collection
    const notificationsRef = db.collection("users").doc(userdoc.id).collection("notifications");

    // Create a query to fetch only the notifications where 'isRead' is false
    const q = notificationsRef.where("isRead", "==", false);

    // Set up the real-time listener
    const unsubscribe = q.onSnapshot((querySnapshot) => {
      // The number of documents in the result is our unread count
      const count = querySnapshot.size;
      setUnreadCount(count);
    }, (error) => {
      console.error("Error fetching unread notifications: ", error);
      // Handle potential errors, like permission denied
    });

    // Cleanup function: This will run when the component unmounts or userdoc.id changes,
    // preventing memory leaks by unsubscribing from the listener.
    return () => unsubscribe();

  }, [userdoc?.id]); // Dependency array: re-run the effect if the user ID changes

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        tabBarButton: (props) => {
          return (
            <HapticTab
              {...props}
              onPress={(e) => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                props.onPress?.(e);
              }}
            />
          );
        },

        // --- NATIVE HEADER CONFIGURATION ---
        headerStyle: {
          backgroundColor: theme.header,
          borderBottomColor: theme.border,
          borderBottomWidth: 1,
        },

        headerLeft: () => (
          <TouchableOpacity
            onPress={() => router.push('/notifications')}
            style={{ marginLeft: 15 }}
          >
            <View>
              <Ionicons name="notifications-outline" size={24} color={theme.icon} />
              {unreadCount > 0 && (
                <View style={styles.badgeContainer}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ),

        headerTitle: () => (
          <Image
            source={require('../../assets/images/LogoInvoice.png')}
            style={{ width: 120, height: 40, resizeMode: 'contain' }}
          />
        ),
        headerTitleAlign: 'center',

        headerRight: () => (
          <View style={{ marginRight: 15, width: 24 }} />
        ),

        // --- END HEADER CONFIGURATION ---

        tabBarActiveTintColor: theme.tabActive,
        tabBarInactiveTintColor: theme.tabInactive,
        tabBarStyle: {
          backgroundColor: theme.background,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'المهام',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="home" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="my-requests"
        options={{
          title: 'التكتات',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="list-alt" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="stock-management"
        options={{
          title: 'الحقيبة',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="backpack" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="TechnicianDashboardScreen"
        options={{
          title: 'الاحصائيات',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome5 name="clipboard-list" size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'المزيد',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badgeContainer: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: '#FF3B30',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});