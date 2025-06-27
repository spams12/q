import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Animated,
  FlatList,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';


interface Notification {
  id?: string;
  title: string;
  body: string;
  timestamp?: string;
  read?: boolean;
  type?: 'info' | 'warning' | 'success' | 'error';
}


export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const router = useRouter()
  useEffect(() => {
    fetchNotifications();
    
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  const fetchNotifications = async () => {
    try {
      const storedNotifications = await AsyncStorage.getItem('notifications');
      if (storedNotifications !== null) {
        const parsedNotifications = JSON.parse(storedNotifications);
        if (Array.isArray(parsedNotifications)) {
          setNotifications(parsedNotifications);
        }
      }
    } catch (e) {
      console.error('Failed to load or parse notifications from async storage', e);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };
  
  const getNotificationIcon = (type?: string) => {
    switch (type) {
      case 'success':
        return { name: 'checkmark-circle', color: '#4CAF50' };
      case 'warning':
        return { name: 'warning', color: '#FF9800' };
      case 'error':
        return { name: 'alert-circle', color: '#F44336' };
      default:
        return { name: 'notifications', color: '#2196F3' };
    }
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${days} يوم`;
  };

  const renderNotificationItem = ({ item, index }: { item: Notification; index: number }) => {
    const icon = getNotificationIcon(item.type);
    console.log('Item:', JSON.stringify(item, null, 2));

    const handlePress = (item) => {
      router.push(`/tasks/${item.request.content.data.id}`);

     
    };

    return (
      <View style={styles.notificationWrapper}>
        <TouchableOpacity
          style={[
            styles.notificationItem,
            !item.read && styles.unreadNotification
          ]}
      onPress={() => handlePress(item)} 
          activeOpacity={0.8}
        >
          <View style={styles.notificationContent}>
            <View style={styles.iconContainer}>
              <Ionicons 
                name={icon.name as any} 
                size={24} 
                color={icon.color} 
              />
              {!item.read && <View style={styles.unreadDot} />}
            </View>
            
            <View style={styles.textContent}>
              <ThemedText 
                type="defaultSemiBold" 
                style={[
                  styles.notificationTitle,
                  !item.read && styles.unreadTitle
                ]}
              >
                {item.request?.content?.title || item.title}
              </ThemedText>
              <ThemedText 
                style={[
                  styles.notificationBody,
                  !item.read && styles.unreadBody
                ]}
                numberOfLines={20}
              >
                {item.request?.content?.body || item.body}

              </ThemedText>
              {item.timestamp && (
                <ThemedText style={styles.timestamp}>
                  {formatTimestamp(item.timestamp)}
                </ThemedText>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const EmptyComponent = () => (
    <Animated.View 
      style={[styles.emptyContainer, { opacity: fadeAnim }]}
    >
      <Ionicons name="notifications-off" size={80} color="#ccc" />
      <ThemedText style={styles.emptyTitle}>لا توجد إشعارات</ThemedText>
      <ThemedText style={styles.emptySubtitle}>
        ستظهر إشعاراتك هنا عند وصولها
      </ThemedText>
    </Animated.View>
  );

  return (
    <ThemedView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
   
      <Animated.View style={[styles.listContainer, { opacity: fadeAnim }]}>
        <FlatList
          data={notifications}
          renderItem={renderNotificationItem}
          keyExtractor={(item, index) => item.id || index.toString()}
          ListEmptyComponent={EmptyComponent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#2196F3']}
              tintColor="#2196F3"
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={notifications.length === 0 ? styles.emptyListContainer : undefined}
        />
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2c3e50',
  },
  badge: {
    backgroundColor: '#FF5722',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
  },
  notificationWrapper: {
    marginHorizontal: 16,
    marginVertical: 4,
  },
  notificationItem: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#e9ecef',
  },
  unreadNotification: {
    borderLeftColor: '#2196F3',
    backgroundColor: '#f8f9ff',
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    marginRight: 12,
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5722',
  },
  textContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 4,
    lineHeight: 22,
  },
  unreadTitle: {
    color: '#1a202c',
  },
  notificationBody: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 20,
    marginBottom: 8,
  },
  unreadBody: {
    color: '#4a5568',
  },
  timestamp: {
    fontSize: 12,
    color: '#adb5bd',
    fontStyle: 'italic',
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
    fontSize: 24,
    fontWeight: '600',
    color: '#6c757d',
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#adb5bd',
    textAlign: 'center',
    lineHeight: 24,
  },
});