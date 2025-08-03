import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { usePermissions } from '@/context/PermissionsContext';
import { Theme, useTheme } from '@/context/ThemeContext';
import { db } from '@/lib/firebase';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import { shareAsync } from 'expo-sharing';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch
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

// --- INTERFACE (UNCHANGED) ---
interface Notification {
  docId: string;
  id: string;
  title: string;
  body: string;
  timestamp: string;
  type: 'info' | 'warning' | 'success' | 'error' | 'announcement';
  source: 'announcement' | 'serviceRequest' | 'info';
  imageUrl?: string;
  isRead: boolean;
}

// --- HELPER FUNCTIONS (UNCHANGED) ---
const isVideoUrl = (url?: string): boolean => {
  if (!url) return false;
  return /\.(mp4|mov|mkv|webm)$/i.test(url);
};

const getNotificationIcon = (theme: Theme, type: Notification['type']) => {
  type NotificationIconName = React.ComponentProps<typeof Ionicons>['name'];
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


// --- NOTIFICATION ITEM COMPONENT (UNCHANGED) ---
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
  const isRead = item.isRead;
  const [imageAspectRatio, setImageAspectRatio] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (item.source === 'announcement' && item.imageUrl && !isVideo) {
      let isMounted = true;
      Image.getSize(item.imageUrl, (width, height) => {
        if (isMounted && height > 0) {
          setImageAspectRatio(width / height);
        }
      }, (error) => {
        console.error(`Could not get image size for ${item.imageUrl}:`, error);
        if (isMounted) {
          setImageAspectRatio(16 / 9);
        }
      });
      return () => { isMounted = false; };
    }
  }, [item.source, item.imageUrl, isVideo]);

  return (
    <View style={styles.notificationWrapper}>
      <TouchableOpacity
        style={[styles.notificationItem, isRead && styles.readNotificationItem]}
        onPress={() => onPress(item)}
        activeOpacity={0.7}>
        <View style={styles.notificationContent}>
          <View style={styles.iconContainer}>
            <Ionicons name={icon.name} size={24} color={icon.color} />
            {!isRead && <View style={styles.unreadBadge} />}
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
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={
                      item.source === 'announcement' && imageAspectRatio
                        ? [styles.announcementImage, { aspectRatio: imageAspectRatio }]
                        : styles.mediaPreview
                    }
                    resizeMode="cover"
                  />
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

// --- EMPTY STATE COMPONENT (UNCHANGED) ---
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

// --- MODIFIED MAIN SCREEN COMPONENT ---
export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // --- MODIFIED: Added new state for marking as read ---
  const [isMarkingAsRead, setIsMarkingAsRead] = useState(false);
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

  useEffect(() => {
    if (!userdoc?.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const notificationsRef = collection(db, "users", userdoc.id, "notifications");
    const q = query(notificationsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNotifications: Notification[] = snapshot.docs.map(doc => {
        const data = doc.data();
        const timestamp = data.createdAt?.toDate?.().toISOString() || new Date().toISOString();
        return {
          docId: doc.id,
          id: data.data.id,
          title: data.title || 'إشعار جديد',
          body: data.body || 'لا توجد تفاصيل.',
          timestamp: timestamp,
          type: data.type || 'info',
          source: data.data.type || 'info',
          imageUrl: (data.imageUrls && data.imageUrls[0]) || (data.fileAttachments && data.fileAttachments[0]),
          isRead: data.isRead || false,
        };
      });

      setNotifications(fetchedNotifications);

      if (loading) {
        setLoading(false);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }).start();
      }
    }, (error) => {
      console.error("Error fetching notifications snapshot:", error);
      Alert.alert("خطأ", "لا يمكن تحميل الإشعارات.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userdoc?.id]);

  const hasReadNotifications = useMemo(() => {
    return notifications.some(n => n.isRead);
  }, [notifications]);

  // --- MODIFIED: Added a memo to check for unread notifications ---
  const hasUnreadNotifications = useMemo(() => {
    return notifications.some(n => !n.isRead);
  }, [notifications]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const handleNotificationPress = useCallback(async (item: Notification) => {
    if (!item.isRead && userdoc?.id) {
      const notificationRef = doc(db, "users", userdoc.id, "notifications", item.docId);
      try {
        await updateDoc(notificationRef, {
          isRead: true,
          readAt: new Date(),
        });
      } catch (error) {
        console.error("Error marking notification as read:", error);
      }
    }

    if (item.source === 'serviceRequest' || item.source === 'info') {
      router.push(`/tasks/${item.id}`);
    } else if (item.source === 'announcement') {
      router.push(`/announcements/${item.id}`);
    } else {
      console.warn(`No navigation route defined for notification source: ${item.source}`);
    }
  }, [router, userdoc?.id]);

  const handleDeleteNotifications = async (type: 'all' | 'read') => {
    if (!userdoc?.id) return;

    // --- MODIFIED: Removed 'all' type logic from here as it's replaced ---
    const title = 'حذف الإشعارات المقروءة';
    const message = 'هل أنت متأكد أنك تريد حذف جميع الإشعارات المقروءة؟';

    Alert.alert(
      title,
      message,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              const notificationsRef = collection(db, "users", userdoc.id, "notifications");
              const q = query(notificationsRef, where('isRead', '==', true));

              const querySnapshot = await getDocs(q);

              if (querySnapshot.empty) {
                Alert.alert('لا يوجد شيء للحذف', 'لم يتم العثور على إشعارات مقروءة للحذف.');
                setIsDeleting(false);
                return;
              }

              const batch = writeBatch(db);
              querySnapshot.forEach((doc) => {
                batch.delete(doc.ref);
              });

              await batch.commit();

            } catch (error) {
              console.error(`Error deleting read notifications:`, error);
              Alert.alert('خطأ', 'حدث خطأ أثناء حذف الإشعارات.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // --- MODIFIED: New function to mark all notifications as read ---
  const handleMarkAllAsRead = async () => {
    if (!userdoc?.id || !hasUnreadNotifications) return;

    Alert.alert(
      'وضع علامة على الكل كمقروء',
      'هل أنت متأكد أنك تريد وضع علامة على جميع الإشعارات غير المقروءة كمقروءة؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تأكيد',
          style: 'default',
          onPress: async () => {
            setIsMarkingAsRead(true);
            try {
              const notificationsRef = collection(db, "users", userdoc.id, "notifications");
              const q = query(notificationsRef, where('isRead', '==', false));

              const querySnapshot = await getDocs(q);

              if (querySnapshot.empty) {
                setIsMarkingAsRead(false);
                return;
              }

              const batch = writeBatch(db);
              querySnapshot.forEach((doc) => {
                batch.update(doc.ref, { isRead: true, readAt: new Date() });
              });

              await batch.commit();
            } catch (error) {
              console.error(`Error marking all as read:`, error);
              Alert.alert('خطأ', 'حدث خطأ أثناء تحديث الإشعارات.');
            } finally {
              setIsMarkingAsRead(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleMediaPress = useCallback((url: string) => {
    setSelectedMediaUrl(url);
    setModalVisible(true);
  }, []);

  const closeMediaModal = () => {
    setModalVisible(false);
    setSelectedMediaUrl(null);
  };

  // --- Unchanged Media Functions (saveFile, handleDownload) ---
  const saveFile = async (fileUri: string, fileName: string, mimeType?: string) => {
    if (Platform.OS === 'android') {
      try {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
          await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, fileName, mimeType || 'application/octet-stream')
            .then(async (newFileUri) => {
              await FileSystem.writeAsStringAsync(newFileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
            })
            .catch((e) => {
              console.error(e);
              Alert.alert('خطأ', 'حدث خطأ أثناء إنشاء الملف.');
            });
        } else {
          await shareAsync(fileUri, { dialogTitle: 'مشاركة أو حفظ هذا الملف' });
        }
      } catch (e) {
        console.error(e);
        Alert.alert('خطأ', 'حدث خطأ أثناء حفظ الملف.');
        await shareAsync(fileUri, { dialogTitle: 'مشاركة أو حفظ هذا الملف' }).catch(shareError => console.error(shareError));
      }
    } else {
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
  // ---

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

  const keyExtractor = useCallback((item: Notification) => item.docId, []);

  if (loading && !refreshing) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {notifications.length > 0 && (
        // --- MODIFIED: Header buttons ---
        <View style={styles.headerContainer}>
          <TouchableOpacity
            style={[styles.deleteButton, !hasReadNotifications && styles.disabledButton]}
            onPress={() => handleDeleteNotifications('read')}
            disabled={!hasReadNotifications || isDeleting}
          >
            <Ionicons name="trash-bin-outline" size={18} color={!hasReadNotifications ? theme.textSecondary : theme.destructive} />
            <ThemedText style={[styles.deleteButtonText, { color: !hasReadNotifications ? theme.textSecondary : theme.destructive }]}>
              حذف المقروءة
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteButton, (!hasUnreadNotifications || isMarkingAsRead) && styles.disabledButton]}
            onPress={handleMarkAllAsRead}
            disabled={!hasUnreadNotifications || isMarkingAsRead}
          >
            <Ionicons name="checkmark-done-outline" size={18} color={!hasUnreadNotifications ? theme.textSecondary : theme.primary} />
            <ThemedText style={[styles.deleteButtonText, { color: !hasUnreadNotifications ? theme.textSecondary : theme.primary }]}>
              وضع علامة كمقروء
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}

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

      {/* --- MODIFIED: Loading modal for both deleting and marking as read --- */}
      <Modal visible={isDeleting || isMarkingAsRead} transparent={true} animationType="fade">
        <View style={styles.dialogContainer}>
          <View style={styles.dialogContent}>
            <ActivityIndicator size="large" color={theme.primary} />
            <ThemedText style={[styles.dialogTitle, { marginTop: 15 }]}>
              {isDeleting ? 'جاري الحذف...' : 'جاري التحديث...'}
            </ThemedText>
          </View>
        </View>
      </Modal>

    </ThemedView>
  );
}


// --- STYLES (UNCHANGED) ---
const getStyles = (theme: Theme, themeName: 'light' | 'dark') =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    headerContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.background,
    },
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 8,
    },
    deleteButtonText: {
      marginLeft: 6,
      fontSize: 14,
      fontWeight: '600',
    },
    disabledButton: {
      opacity: 0.5,
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
      flexDirection: 'row',
    },
    readNotificationItem: {
      opacity: 0.6,
    },
    unreadBadge: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.destructive,
      borderWidth: 1.5,
      borderColor: theme.card,
    },
    notificationContent: {
      flex: 1,
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
    announcementImage: {
      width: '100%',
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