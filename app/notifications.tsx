import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { usePermissions } from '@/context/PermissionsContext';
import { Theme, useTheme } from '@/context/ThemeContext';
import { db } from '@/lib/firebase'; // Make sure your firebase config is exported from here
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  collection,
  getDocs,
  orderBy,
  query,
  
  where
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';

// --- Type Definitions ---
type NotificationIconName =
  | 'checkmark-circle'
  | 'warning'
  | 'alert-circle'
  | 'notifications'
  | 'megaphone-outline';

interface Notification {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  type: 'info' | 'warning' | 'success' | 'error' | 'announcement';
  source: 'announcement' | 'serviceRequest';
}

// --- Helper Functions ---

const getNotificationIcon = (theme: Theme, type: Notification['type']) => {
  switch (type) {
    case 'success':
      return { name: 'checkmark-circle' as NotificationIconName, color: theme.success };
    case 'warning':
      return { name: 'warning' as NotificationIconName, color: theme.priorityHigh };
    case 'error':
      return { name: 'alert-circle' as NotificationIconName, color: theme.destructive };
    case 'announcement':
      return { name: 'megaphone-outline' as NotificationIconName, color: theme.primary };
    default:
      return { name: 'notifications' as NotificationIconName, color: theme.icon };
  }
};

const formatTimestamp = (timestamp?: string): string => {
  if (!timestamp) return 'منذ فترة';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';

  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${days} يوم`;
};

// --- Child Components (Unchanged) ---

interface NotificationItemProps {
  item: Notification;
  onPress: (item: Notification) => void;
}

const NotificationItem = React.memo(({ item, onPress }: NotificationItemProps) => {
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme, themeName);
  const icon = getNotificationIcon(theme, item.type);

  return (
    <View style={styles.notificationWrapper}>
      <TouchableOpacity
        style={styles.notificationItem}
        onPress={() => onPress(item)}
        activeOpacity={0.8}>
        <View style={styles.notificationContent}>
          <View style={styles.iconContainer}>
            <Ionicons name={icon.name} size={24} color={icon.color} />
          </View>
          <View style={styles.textContent}>
            <ThemedText type="defaultSemiBold" style={styles.notificationTitle}>
              {item.title}
            </ThemedText>
            <ThemedText style={styles.notificationBody} numberOfLines={20}>
              {item.body}
            </ThemedText>
            <ThemedText style={styles.timestamp}>{formatTimestamp(item.timestamp)}</ThemedText>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
});
NotificationItem.displayName = 'NotificationItem';

const EmptyState = React.memo(() => {
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme, themeName);

  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="notifications-off" size={80} color={theme.icon} />
      <ThemedText style={styles.emptyTitle}>لا توجد إشعارات</ThemedText>
      <ThemedText style={styles.emptySubtitle}>ستظهر إشعاراتك الجديدة هنا</ThemedText>
    </View>
  );
});
EmptyState.displayName = 'EmptyState';

// --- Main Screen Component ---

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useMemo(() => new Animated.Value(0), []);

  const router = useRouter();
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme, themeName);

  const {userdoc} = usePermissions()

  const fetchNotifications = useCallback(async () => {
    if (!userdoc) {
      console.warn("User ID is not available. Cannot fetch notifications.");
      setLoading(false);
      setRefreshing(false);
      setNotifications([]); // Clear notifications if no user
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch Announcements
      const announcementsQuery = query(
        collection(db, 'announcements'),
        where('assignedUsers', 'array-contains', userdoc.id),
        orderBy('createdAt', 'desc')
      );

      // 2. Fetch Service Requests
      const serviceRequestsQuery = query(
        collection(db, 'serviceRequests'),
        where('assignedUsers', 'array-contains', userdoc.id),
        orderBy('createdAt', 'desc')
      );

      const [announcementsSnapshot, serviceRequestsSnapshot] = await Promise.all([
        getDocs(announcementsQuery),
        getDocs(serviceRequestsQuery),
      ]);

      // 3. Map Announcements
      const announcementNotifications: Notification[] = announcementsSnapshot.docs.map(doc => {
        const data = doc.data();
        let timestamp;
        if (data.createdAt && typeof data.createdAt.toDate === 'function') {
          timestamp = data.createdAt.toDate().toISOString();
        } else {
          const d = new Date(data.createdAt);
          if (isNaN(d.getTime())) {
            timestamp = new Date().toISOString();
          } else {
            timestamp = d.toISOString();
          }
        }
        return {
          id: doc.id,
          title: data.head || 'إعلان جديد',
          body: data.body || 'تفاصيل الإعلان غير متوفرة.',
          timestamp: timestamp,
          type: 'announcement',
          source: 'announcement',
        };
      });

      // --- MODIFIED ---
      // 4. Map Service Requests with more detail from the schema
      const serviceRequestNotifications: Notification[] = serviceRequestsSnapshot.docs.map(doc => {
        const data = doc.data();
        const priority = data.priority || 'متوسط';
        const requestType = data.type || 'غير محدد'; // --- ADDED: Get request type
        const creator = data.creatorName || 'النظام'; // --- ADDED: Get creator name

        // --- MODIFIED: Create a more descriptive body
        const body = `النوع: ${requestType}. أنشأها: ${creator}. الأولوية: ${priority}.`;
        let timestamp;
        if (data.createdAt && typeof data.createdAt.toDate === 'function') {
          timestamp = data.createdAt.toDate().toISOString();
        } else {
          const d = new Date(data.createdAt);
          if (isNaN(d.getTime())) {
            timestamp = new Date().toISOString();
          } else {
            timestamp = d.toISOString();
          }
        }
        return {
          id: doc.id,
          title: `مهمة جديدة: ${data.title}`,
          body: body,
          timestamp: timestamp,
          type: priority === 'عاجل' || priority === 'مرتفع' ? 'warning' : 'success',
          source: 'serviceRequest',
        };
      });
       const allNotifications = [...announcementNotifications, ...serviceRequestNotifications];
      allNotifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setNotifications(allNotifications);
    } catch (e) {
      console.error('Failed to load notifications from Firestore:', e);
      alert('حدث خطأ أثناء تحميل الإشعارات.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userdoc]);

  useEffect(() => {
    fetchNotifications();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fetchNotifications, fadeAnim]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNotifications();
  }, [fetchNotifications]);

  const handleNotificationPress = useCallback(
    (item: Notification) => {
      if (item.source === 'serviceRequest') {
        router.push(`/tasks/${item.id}`);
      }
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => <NotificationItem item={item} onPress={handleNotificationPress} />,
    [handleNotificationPress]
  );

  const keyExtractor = useCallback((item: Notification) => item.id, []);
  
  // --- RENDER LOGIC ---

  if (loading && !refreshing) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

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
          contentContainerStyle={notifications.length === 0 ? styles.emptyListContainer : { paddingTop: 8 }}
        />
      </Animated.View>
    </ThemedView>
  );
}

// --- Styles (Unchanged) ---
const getStyles = (theme: Theme, themeName: 'light' | 'dark') =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.background,
    },
    notificationWrapper: {
      marginHorizontal: 16,
      marginVertical: 6,
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
    },
    notificationContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    iconContainer: {
      marginRight: 16,
      marginTop: 2,
    },
    textContent: {
      flex: 1,
    },
    notificationTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.text,
      marginBottom: 4,
    },
    notificationBody: {
      fontSize: 14,
      color: theme.textSecondary,
      lineHeight: 20,
      marginBottom: 8,
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