import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { usePermissions } from '@/context/PermissionsContext';
import { Theme, useTheme } from '@/context/ThemeContext';
import { db } from '@/lib/firebase'; // Make sure your firebase config is exported from here
import { Ionicons } from '@expo/vector-icons';
// --- NEW/MODIFIED IMPORTS ---
import { Video } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import { shareAsync } from 'expo-sharing'; // Added for the new save function
import {
  collection,
  onSnapshot, // MODIFIED: Using onSnapshot for real-time updates
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
// If you use a progress bar library, import it here
// import * as Progress from 'react-native-progress';


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
  imageUrl?: string;
}

// --- Helper Functions (Unchanged) ---
const isVideoUrl = (url?: string): boolean => {
  if (!url) return false;
  return /\.(mp4|mov|mkv|webm)$/i.test(url);
};

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
  onMediaPress: (url: string) => void;
}

const NotificationItem = React.memo(({ item, onPress, onMediaPress }: NotificationItemProps) => {
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme, themeName);
  const icon = getNotificationIcon(theme, item.type);
  const isVideo = isVideoUrl(item.imageUrl);

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
            {item.imageUrl && (
              <TouchableOpacity onPress={() => onMediaPress(item.imageUrl!)} style={styles.mediaContainer}>
                {isVideo ? (
                  <View>
                    <Video
                      source={{ uri: item.imageUrl }}
                      style={styles.mediaPreview}
                      resizeMode="cover"
                      isMuted
                    />
                    <View style={styles.playIconOverlay}>
                      <Ionicons name="play-circle" size={48} color="rgba(255, 255, 255, 0.8)" />
                    </View>
                  </View>
                ) : (
                  <Image source={{ uri: item.imageUrl }} style={styles.mediaPreview} resizeMode="cover" />
                )}
              </TouchableOpacity>
            )}
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

// --- MAIN SCREEN COMPONENT (HEAVILY MODIFIED) ---

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // State for each data source to handle real-time merging
  const [announcementNotifs, setAnnouncementNotifs] = useState<Notification[]>([]);
  const [serviceRequestNotifs, setServiceRequestNotifs] = useState<Notification[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useMemo(() => new Animated.Value(0), []);

  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string | null>(null);
  const [downloadDialogVisible, setDownloadDialogVisible] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadInfo, setDownloadInfo] = useState<{ fileName: string; totalSize: number } | null>(null);

  const router = useRouter();
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme, themeName);
  const { userdoc } = usePermissions();

  // --- EFFECT 1: Set up real-time Firestore listeners ---
  useEffect(() => {
    if (!userdoc?.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const announcementsQuery = query(
      collection(db, 'announcements'),
      where('assignedUsers', 'array-contains', userdoc.id),
      orderBy('createdAt', 'desc')
    );

    const serviceRequestsQuery = query(
      collection(db, 'serviceRequests'),
      where('assignedUsers', 'array-contains', userdoc.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeAnnouncements = onSnapshot(announcementsQuery, (snapshot) => {
      const announcementData: Notification[] = snapshot.docs.map(doc => {
        const data = doc.data();
        const timestamp = data.createdAt?.toDate?.().toISOString() || new Date().toISOString();
        return {
          id: doc.id,
          title: data.head || 'إعلان جديد',
          body: data.body || 'تفاصيل الإعلان غير متوفرة.',
          timestamp,
          type: 'announcement',
          source: 'announcement',
          imageUrl: data.imageUrl,
        };
      });
      setAnnouncementNotifs(announcementData);
    }, (error) => {
      console.error("Error fetching announcements snapshot:", error);
      Alert.alert("خطأ", "لا يمكن تحميل الإعلانات.");
    });

    const unsubscribeServiceRequests = onSnapshot(serviceRequestsQuery, (snapshot) => {
      const serviceRequestData: Notification[] = snapshot.docs.map(doc => {
        const data = doc.data();
        const priority = data.priority || 'متوسط';
        const timestamp = data.createdAt?.toDate?.().toISOString() || new Date().toISOString();
        return {
          id: doc.id,
          title: `مهمة جديدة: ${data.title}`,
          body: `النوع: ${data.type || 'غير محدد'}. أنشأها: ${data.creatorName || 'النظام'}. الأولوية: ${priority}.`,
          timestamp,
          type: priority === 'عاجل' || priority === 'مرتفع' ? 'warning' : 'success',
          source: 'serviceRequest',
        };
      });
      setServiceRequestNotifs(serviceRequestData);
    }, (error) => {
      console.error("Error fetching service requests snapshot:", error);
      Alert.alert("خطأ", "لا يمكن تحميل المهام.");
    });

    // Cleanup function to unsubscribe when the component unmounts
    return () => {
      unsubscribeAnnouncements();
      unsubscribeServiceRequests();
    };
  }, [userdoc?.id]); // Rerun if user changes

  // --- EFFECT 2: Merge and sort data from both listeners ---
  useEffect(() => {
    const allNotifications = [...announcementNotifs, ...serviceRequestNotifs];
    allNotifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setNotifications(allNotifications);

    // Stop loading indicator once we have processed data
    if (loading) {
      setLoading(false);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }
  }, [announcementNotifs, serviceRequestNotifs, fadeAnim]);

  // --- MODIFIED: onRefresh is now just for UX feedback, as data is live ---
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Data updates automatically, so just show the spinner for a short time
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const handleNotificationPress = useCallback((item: Notification) => {
    if (item.source === 'serviceRequest') {
      router.push(`/tasks/${item.id}`);
    }
  }, [router]);

  const handleMediaPress = useCallback((url: string) => {
    setSelectedMediaUrl(url);
    setModalVisible(true);
  }, []);

  const closeMediaModal = () => {
    setModalVisible(false);
    setSelectedMediaUrl(null);
  };

  // --- NEW: Modern, permission-friendly saveFile function ---
  const saveFile = async (fileUri: string, fileName: string, mimeType?: string) => {
    if (Platform.OS === 'android') {
      try {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
          await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, fileName, mimeType || 'application/octet-stream')
            .then(async (newFileUri) => {
              await FileSystem.writeAsStringAsync(newFileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
              Alert.alert('نجاح', 'تم حفظ الملف بنجاح في المجلد الذي اخترته!');
            })
            .catch((e) => {
              console.error(e);
              Alert.alert('خطأ', 'حدث خطأ أثناء إنشاء الملف.');
            });
        } else {
          // Fallback to share sheet if user denies permission
          await shareAsync(fileUri, { dialogTitle: 'مشاركة أو حفظ هذا الملف' });
        }
      } catch (e) {
        console.error(e);
        Alert.alert('خطأ', 'حدث خطأ أثناء حفظ الملف.');
        // Fallback to share sheet on any other error
        await shareAsync(fileUri, { dialogTitle: 'مشاركة أو حفظ هذا الملف' }).catch(shareError => console.error(shareError));
      }
    } else {
      // iOS and other platforms use the share sheet
      await shareAsync(fileUri, { dialogTitle: 'مشاركة أو حفظ هذا الملف' });
    }
  };

  const handleDownload = async (url?: string) => {
    const downloadUrl = url || selectedMediaUrl;
    if (!downloadUrl) return;

    closeMediaModal();

    const fileExtension = downloadUrl.split('.').pop()?.split('?')[0] || 'tmp';
    const fileName = `download-${Date.now()}.${fileExtension}`;
    const tempFileUri = FileSystem.cacheDirectory + fileName;

    setDownloadProgress(0);
    setDownloadInfo({ fileName, totalSize: 0 });
    setDownloadDialogVisible(true);

    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      tempFileUri,
      {},
      (progress) => {
        const percentage = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
        setDownloadProgress(percentage);
      }
    );

    try {
      const result = await downloadResumable.downloadAsync();
      if (result) {
        setDownloadDialogVisible(false);
        await saveFile(result.uri, fileName, result.mimeType);
      } else {
        throw new Error('فشل التحميل: لم يتم إرجاع نتيجة.');
      }
    } catch (error) {
      console.error(error);
      setDownloadDialogVisible(false);
      Alert.alert('خطأ', 'لا يمكن تحميل الملف.');
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => (
      <NotificationItem
        item={item}
        onPress={handleNotificationPress}
        onMediaPress={handleMediaPress}
      />
    ),
    [handleNotificationPress, handleMediaPress]
  );

  const keyExtractor = useCallback((item: Notification) => item.id, []);

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

      {/* Media Viewer Modal */}
      <Modal visible={isModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.modalCloseButton} onPress={closeMediaModal}>
            <Ionicons name="close-circle" size={32} color={theme.white} />
          </TouchableOpacity>
          {selectedMediaUrl && (
            isVideoUrl(selectedMediaUrl) ? (
              <Video
                source={{ uri: selectedMediaUrl }}
                style={styles.modalMedia}
                resizeMode="contain"
                useNativeControls
                shouldPlay
              />
            ) : (
              <Image source={{ uri: selectedMediaUrl }} style={styles.modalMedia} resizeMode="contain" />
            )
          )}
          <TouchableOpacity style={styles.modalDownloadButton} onPress={() => handleDownload()}>
            <Ionicons name="download-outline" size={24} color={theme.white} style={{ marginRight: 8 }} />
            <ThemedText style={{ color: theme.white, fontWeight: 'bold' }}>تحميل</ThemedText>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Download Progress Dialog */}
      <Modal visible={downloadDialogVisible} transparent={true} animationType="fade">
        <View style={styles.dialogContainer}>
          <View style={styles.dialogContent}>
            <ThemedText style={styles.dialogTitle}>جاري التحميل...</ThemedText>
            {downloadInfo && <ThemedText style={styles.dialogText}>{downloadInfo.fileName}</ThemedText>}
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${downloadProgress * 100}%` }]} />
            </View>
            <ThemedText style={styles.dialogText}>{`${Math.round(downloadProgress * 100)}%`}</ThemedText>
          </View>
        </View>
      </Modal>
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
      marginTop: 8,
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
    mediaContainer: {
      marginTop: 8,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: theme.border,
    },
    mediaPreview: {
      width: '100%',
      height: 180,
    },
    playIconOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContainer: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalMedia: {
      width: '100%',
      height: '80%',
    },
    modalCloseButton: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 60 : 40,
      right: 20,
      zIndex: 1,
    },
    modalDownloadButton: {
      position: 'absolute',
      bottom: Platform.OS === 'ios' ? 60 : 40,
      backgroundColor: theme.primary,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 30,
      flexDirection: 'row',
      alignItems: 'center',
    },
    dialogContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    dialogContent: {
      width: '80%',
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 20,
      alignItems: 'center',
    },
    dialogTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 10,
    },
    dialogText: {
      fontSize: 14,
      color: theme.textSecondary,
      marginBottom: 15,
    },
    progressBarContainer: {
      height: 10,
      width: '100%',
      backgroundColor: theme.border,
      borderRadius: 5,
      overflow: 'hidden',
      marginBottom: 10,
    },
    progressBar: {
      height: '100%',
      backgroundColor: theme.primary,
      borderRadius: 5,
    },
  });