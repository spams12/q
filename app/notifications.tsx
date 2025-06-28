import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Theme, useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';

// --- Constants ---
const ASYNC_STORAGE_KEY = 'notifications';

// --- Type Definitions ---
type NotificationIconName =
  | 'checkmark-circle'
  | 'warning'
  | 'alert-circle'
  | 'notifications'
  | 'notifications-off';

/**
 * Represents a notification object, combining data from the push notification
 * payload and local state (e.g., 'read' status).
 */
interface Notification {
  id?: string;
  title: string;
  body: string;
  timestamp?: string;
  read?: boolean;
  type?: 'info' | 'warning' | 'success' | 'error';
  request?: {
    identifier: string; // The unique ID from the push notification system
    content: {
      data?: { id?: string };
      dataString?: string; // Fallback: payload as a stringified JSON
      title?: string;
      body?: string;
    };
  };
}

// --- Helper Functions ---

/**
 * Returns the appropriate icon and color based on the notification type.
 */
const getNotificationIcon = (theme: Theme, type?: string) => {
  switch (type) {
    case 'success':
      return { name: 'checkmark-circle' as NotificationIconName, color: theme.success };
    case 'warning':
      return { name: 'warning' as NotificationIconName, color: theme.priorityHigh };
    case 'error':
      return { name: 'alert-circle' as NotificationIconName, color: theme.destructive };
    default:
      return { name: 'notifications' as NotificationIconName, color: theme.primary };
  }
};

/**
 * Formats a timestamp into a human-readable "time ago" string.
 */
const formatTimestamp = (timestamp?: string): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return ''; // Invalid date check

  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${days} يوم`;
};

// --- Child Components ---

interface NotificationItemProps {
  item: Notification;
  onPress: (item: Notification) => void;
}

/**
 * Renders a single notification item.
 * Memoized to prevent re-renders unless its props change.
 */
const NotificationItem = React.memo(({ item, onPress }: NotificationItemProps) => {
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme, themeName);
  const icon = getNotificationIcon(theme, item.type);

  return (
    <View style={styles.notificationWrapper}>
      <TouchableOpacity
        style={[styles.notificationItem, !item.read && styles.unreadNotification]}
        onPress={() => onPress(item)}
        activeOpacity={0.8}>
        <View style={styles.notificationContent}>
          <View style={styles.iconContainer}>
            <Ionicons name={icon.name} size={24} color={icon.color} />
            {!item.read && <View style={styles.unreadDot} />}
          </View>

          <View style={styles.textContent}>
            <ThemedText
              type="defaultSemiBold"
              style={[styles.notificationTitle, !item.read && styles.unreadTitle]}>
              {item.request?.content?.title || item.title}
            </ThemedText>
            <ThemedText style={[styles.notificationBody, !item.read && styles.unreadBody]} numberOfLines={20}>
              {item.request?.content?.body || item.body}
            </ThemedText>
            <ThemedText style={styles.timestamp}>{formatTimestamp(item.timestamp)}</ThemedText>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
});

/**
 * Renders the empty state for the notification list.
 * Memoized for performance.
 */
const EmptyState = React.memo(() => {
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme, themeName);

  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="notifications-off" size={80} color={theme.icon} />
      <ThemedText style={styles.emptyTitle}>لا توجد إشعارات</ThemedText>
      <ThemedText style={styles.emptySubtitle}>ستظهر إشعاراتك هنا عند وصولها</ThemedText>
    </View>
  );
});

// --- Main Screen Component ---

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useMemo(() => new Animated.Value(0), []);

  const router = useRouter();
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme, themeName);

  const fetchNotifications = useCallback(async () => {
    try {
      const storedNotifications = await AsyncStorage.getItem(ASYNC_STORAGE_KEY);
      if (storedNotifications) {
        const parsed = JSON.parse(storedNotifications) as Notification[];
        // Sort notifications to show unread first, then by timestamp
        const sorted = parsed.sort((a, b) => {
          if (a.read !== b.read) return a.read ? 1 : -1;
          return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
        });
        setNotifications(sorted);
      }
    } catch (e) {
      console.error('Failed to load notifications:', e);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fetchNotifications, fadeAnim]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  }, [fetchNotifications]);

  /**
   * Marks a notification as read and persists the change.
   */
  const markAsRead = useCallback(async (identifierToMark: string) => {
    const updatedNotifications = notifications.map(n =>
      n.request?.identifier === identifierToMark ? { ...n, read: true } : n
    );
    setNotifications(updatedNotifications);
    await AsyncStorage.setItem(ASYNC_STORAGE_KEY, JSON.stringify(updatedNotifications));
  }, [notifications]);

  /**
   * Handles notification press, marking it as read and navigating if applicable.
   */
  const handleNotificationPress = useCallback(async (item: Notification) => {
    const uniqueIdentifier = item.request?.identifier;
    if (!item.read && uniqueIdentifier) {
      await markAsRead(uniqueIdentifier);
    }

    // Robustly extract serviceRequestId for navigation
    let serviceRequestId: string | null = null;
    if (item.request?.content?.data?.id) {
      serviceRequestId = item.request.content.data.id;
    } else if (item.request?.content?.dataString) {
      try {
        const parsedData = JSON.parse(item.request.content.dataString);
        serviceRequestId = parsedData.id || null;
      } catch (e) {
        console.error('Failed to parse notification dataString:', e);
      }
    }

    if (serviceRequestId) {
      router.push(`/tasks/${serviceRequestId}`);
    }
  }, [markAsRead, router]);

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => <NotificationItem item={item} onPress={handleNotificationPress} />,
    [handleNotificationPress]
  );

  const keyExtractor = useCallback(
    (item: Notification) => item.request?.identifier || item.id || `fallback-${item.timestamp}`,
    []
  );

  return (
    <ThemedView style={styles.container}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListEmptyComponent={EmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={notifications.length === 0 ? styles.emptyListContainer : undefined}
        />
      </Animated.View>
    </ThemedView>
  );
}

// --- Styles ---
const getStyles = (theme: Theme, themeName: 'light' | 'dark') =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    listContainer: {
      flex: 1,
    },
    notificationWrapper: {
      marginHorizontal: 16,
      marginVertical: 4,
    },
    notificationItem: {
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: themeName === 'light' ? theme.black : theme.black,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: themeName === 'light' ? 0.08 : 0.2,
      shadowRadius: 4,
      elevation: 3,
      borderLeftWidth: 4,
      borderLeftColor: 'transparent',
    },
    unreadNotification: {
      borderLeftColor: theme.primary,
      backgroundColor: theme.blueTint,
    },
    notificationContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    iconContainer: {
      marginRight: 16,
      marginTop: 2,
      position: 'relative',
    },
    unreadDot: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.destructive,
      borderWidth: 1,
      borderColor: theme.card,
    },
    textContent: {
      flex: 1,
    },
    notificationTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 4,
    },
    unreadTitle: {
      fontWeight: 'bold',
    },
    notificationBody: {
      fontSize: 14,
      color: theme.textSecondary,
      lineHeight: 20,
      marginBottom: 8,
    },
    unreadBody: {
      color: theme.text,
    },
    timestamp: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    emptyListContainer: {
      flexGrow: 1,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
    },
    emptyTitle: {
      fontSize: 22,
      fontWeight: '600',
      color: theme.textSecondary,
      marginTop: 20,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 16,
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
    },
  });