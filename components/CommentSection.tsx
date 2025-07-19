import { Ionicons } from '@expo/vector-icons';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { arSA } from 'date-fns/locale';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { shareAsync } from 'expo-sharing';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

import { useTheme } from '../context/ThemeContext';
import { Comment, User } from '../lib/types';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// --- All your helper functions remain the same ---
// getAvatarFallback, getCommentDate, formatDateHeader
const getAvatarFallback = (name: string = 'مستخدم غير معروف') => {
  if (!name) return 'م م';
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

const getCommentDate = (timestamp: any): Date => {
  if (!timestamp) return new Date();
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  if (timestamp instanceof Date) {
    return timestamp;
  }
  if (typeof timestamp === 'string') {
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  if (typeof timestamp === 'number') {
    return new Date(timestamp);
  }
  return new Date();
};

const formatDateHeader = (date: Date): string => {
  if (isToday(date)) {
    return 'اليوم';
  }
  if (isYesterday(date)) {
    return 'أمس';
  }
  return format(date, 'd MMMM yyyy', { locale: arSA });
};


interface CommentSectionProps {
  comments: Comment[];
  users: User[];
  currentUserId: string;
}

const AttachmentVideoPreview: React.FC<{ mediaUrl: string; style: any }> = ({ mediaUrl, style }) => {
  const player = useVideoPlayer(mediaUrl, (p) => {
    p.muted = true;
  });
  return <VideoView player={player} style={style} />;
};

const AutoSizedImage: React.FC<{
  uri: string;
  style?: any;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
}> = ({ uri, style, resizeMode = 'contain' }) => {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    if (uri) {
      Image.getSize(
        uri,
        (width, height) => {
          if (height > 0) {
            setAspectRatio(width / height);
          } else {
            setAspectRatio(1);
          }
        },
        () => {
          setAspectRatio(1); // Fallback to square on error
        }
      );
    }
  }, [uri]);

  if (aspectRatio === null) {
    return <View style={[style, { height: 250, backgroundColor: '#f0f0f0', borderRadius: 12 }]} />;
  }

  return (
    <Image
      source={{ uri }}
      style={[style, { aspectRatio }]}
      resizeMode={resizeMode}
    />
  );
};


const CommentSection: React.FC<CommentSectionProps> = ({
  comments,
  users,
  currentUserId,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [allImages, setAllImages] = useState<string[]>([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const { theme } = useTheme();
  const styles = getStyles(theme);

  // --- NEW STATE for download progress dialog ---
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloadDialogVisible, setDownloadDialogVisible] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState({ fileName: '', totalSize: 0 });

  const modalPlayer = useVideoPlayer(selectedVideo || '', (player) => {
    if (selectedVideo) {
      player.play();
      player.loop = true;
    }
  });

  useEffect(() => {
    if (!modalVisible) {
      setSelectedImage(null);
      setSelectedVideo(null);
      setAllImages([]);
      setSelectedImageIndex(0);
      setMenuVisible(false);
    }
  }, [modalVisible]);

  const saveFile = async (fileUri: string, fileName: string, mimeType?: string) => {
    if (Platform.OS === 'android') {
      try {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
          const newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, fileName, mimeType || 'application/octet-stream');
          await FileSystem.writeAsStringAsync(newFileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
          Alert.alert('نجاح', 'تم حفظ الملف بنجاح في المجلد الذي اخترته!');
        } else {
          await shareAsync(fileUri, { dialogTitle: 'مشاركة أو حفظ هذا الملف' });
        }
      } catch (e) {
        console.error(e);
        Alert.alert('خطأ', 'حدث خطأ أثناء حفظ الملف.');
      }
    } else {
      await shareAsync(fileUri, { dialogTitle: 'مشاركة أو حفظ هذا الملف' });
    }
  };

  // --- UPDATED download handler ---
  const handleDownload = async (url?: string, providedFileName?: string) => {
    const downloadUrl = url || selectedImage || selectedVideo;

    if (!downloadUrl) {
      Alert.alert('خطأ', 'لم يتم تحديد أي ملف للتحميل.');
      return;
    }
    setMenuVisible(false); // Close the options menu if it's open

    const fileName = `download-${Date.now()}`;
    const tempFileUri = FileSystem.cacheDirectory + fileName;

    // Reset progress and show dialog
    setDownloadProgress(0);
    setDownloadInfo({ fileName, totalSize: 0 }); // Set filename, size will be updated
    setDownloadDialogVisible(true);


    // Create a progress callback
    const progressCallback: FileSystem.DownloadProgressCallback = (progress) => {
      const totalSize = progress.totalBytesExpectedToWrite;
      const percentage = progress.totalBytesWritten / totalSize;
      setDownloadProgress(percentage);
      // Update total size on first callback
      if (downloadInfo.totalSize === 0) {
        setDownloadInfo({ fileName, totalSize });
      }
    };

    // Create a resumable download object
    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      tempFileUri,
      {},
      progressCallback
    );

    try {
      const result = await downloadResumable.downloadAsync();
      if (result) {
        console.log('اكتمل التنزيل إلى:', result.uri);
        // Hide dialog before showing save options
        setDownloadDialogVisible(false);
        await saveFile(result.uri, fileName, result.mimeType);
      } else {
        throw new Error('فشل التحميل: لم يتم إرجاع نتيجة.');
      }
    } catch (error) {
      console.error(error);
      setDownloadDialogVisible(false); // Hide dialog on error
      Alert.alert('خطأ', 'لا يمكن تحميل الملف.');
    }
  };


  const navigateImage = useCallback(
    (direction: 'next' | 'prev') => {
      if (!allImages.length) return;
      const newIndex = direction === 'next'
        ? (selectedImageIndex + 1) % allImages.length
        : (selectedImageIndex - 1 + allImages.length) % allImages.length;

      if (allImages[newIndex]) {
        setSelectedImageIndex(newIndex);
        setSelectedImage(allImages[newIndex]);
      }
    },
    [allImages, selectedImageIndex]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onEnd(event => {
          if (!modalVisible || !selectedImage || allImages.length <= 1) return;
          const threshold = 50;
          if (event.translationX < -threshold) navigateImage('next');
          if (event.translationX > threshold) navigateImage('prev');
        })
        .failOffsetY([-50, 50]),
    [modalVisible, selectedImage, allImages.length, navigateImage]
  );

  const getUser = (userId: string) => users.find(u => u.id === userId);

  const filteredAndSortedComments = useMemo(() => comments
    .filter(comment => {
      const content = comment.content || '';
      if ((content.startsWith('قام') && content.includes('بتغيير حالة التكت من'))) return false;
      const keywordsToHide = ['بتغيير عنوان التذكرة', 'بإلغاء إسناد التذكرة', 'بإسناد التذكرة إلى'];
      if (keywordsToHide.some(keyword => content.includes(keyword))) return false;
      return true;
    })
    .sort((a, b) => getCommentDate(a.timestamp).getTime() - getCommentDate(b.timestamp).getTime()),
    [comments]
  );

  const handleImagePress = (imageUrl: string, images: string[], index: number) => {
    if (!imageUrl || !Array.isArray(images) || images.length === 0) return;
    const validIndex = Math.max(0, Math.min(index, images.length - 1));

    setSelectedImage(imageUrl);
    setSelectedVideo(null);
    setAllImages(images);
    setSelectedImageIndex(validIndex);
    setModalVisible(true);
  };

  const handleVideoPress = (videoUrl: string) => {
    if (!videoUrl) return;
    setSelectedVideo(videoUrl);
    setSelectedImage(null);
    setAllImages([]);
    setSelectedImageIndex(0);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
  };

  const handleLocationPress = (latitude: number, longitude: number) => {
    const label = 'موقع تمت مشاركته';
    const url = Platform.select({
      ios: `maps://?q=${label}&ll=${latitude},${longitude}`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`,
    });
    if (url) Linking.openURL(url).catch(err => console.error("تعذر تحميل الصفحة", err));
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }


  return (
    <View style={styles.container}>
      {/* --- NEW Download Progress Dialog --- */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isDownloadDialogVisible}
        onRequestClose={() => { /* Prevent closing by back button */ }}
      >
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogContainer}>
            <Text style={styles.dialogTitle}>جاري تحميل الملف...</Text>
            <Text style={styles.dialogFileName} numberOfLines={1}>{downloadInfo.fileName}</Text>

            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${downloadProgress * 100}%` }]} />
            </View>

            <View style={styles.progressTextContainer}>
              <Text style={styles.progressPercentage}>{`${Math.round(downloadProgress * 100)}%`}</Text>
              <Text style={styles.progressSize}>
                {`${formatBytes(downloadProgress * downloadInfo.totalSize)} / ${formatBytes(downloadInfo.totalSize)}`}
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Existing Image/Video Viewer Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
        statusBarTranslucent={Platform.OS === 'android'}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            {menuVisible && (
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                onPress={() => setMenuVisible(false)}
                activeOpacity={1}
              />
            )}

            {selectedImage ? (
              <GestureDetector gesture={pan}>
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.fullscreenImage}
                  resizeMode="contain"
                />
              </GestureDetector>
            ) : selectedVideo ? (
              <VideoView
                player={modalPlayer}
                style={styles.fullscreenImage}
                allowsFullscreen
                allowsPictureInPicture
              />
            ) : null}

            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalButton} onPress={closeModal}>
                <Ionicons name="close" size={32} color="white" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalButton} onPress={() => setMenuVisible(true)}>
                <Ionicons name="ellipsis-vertical" size={28} color="white" />
              </TouchableOpacity>
            </View>

            {menuVisible && (
              <View style={styles.menuContainer}>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleDownload(selectedImage || selectedVideo)}
                >
                  <Text style={styles.menuItemText}>تحميل</Text>
                  <Ionicons name="download-outline" size={20} color={theme.text} />
                </TouchableOpacity>
              </View>
            )}

            {selectedImage && allImages.length > 1 && (
              <View style={styles.imageCounter}>
                <Text style={styles.imageCounterText}>
                  {selectedImageIndex + 1} / {allImages.length}
                </Text>
              </View>
            )}
          </View>
        </GestureHandlerRootView>
      </Modal>

      {/* --- Main Component JSX (unchanged) --- */}
      <View style={styles.commentsList}>
        {filteredAndSortedComments.length === 0 ? (
          <View style={styles.emptyCommentsContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.textSecondary} style={{ opacity: 0.5 }} />
            <Text style={styles.emptyCommentsText}>لا توجد تعليقات بعد</Text>
            <Text style={styles.emptyCommentsSubText}>كن أول من يضيف تعليقًا!</Text>
          </View>
        ) : (
          filteredAndSortedComments.map((comment, index) => {
            const user = getUser(comment.userId);
            const userName = user?.name || comment.userName || 'مستخدم غير معروف';
            const isCurrentUser = comment.userId === currentUserId;
            const commentDate = getCommentDate(comment.timestamp);

            let dateHeader = null;
            const previousComment = index > 0 ? filteredAndSortedComments[index - 1] : null;
            const previousCommentDate = previousComment ? getCommentDate(previousComment.timestamp) : null;

            if (!previousCommentDate || !isSameDay(commentDate, previousCommentDate)) {
              dateHeader = (
                <View style={styles.dateHeader}>
                  <Text style={styles.dateHeaderText}>{formatDateHeader(commentDate)}</Text>
                </View>
              );
            }

            const isImageOnlyComment = !comment.content?.trim() && !comment.location && comment.attachments?.length > 0 &&
              comment.attachments.every(att => att.fileType === 'image' || (/\.(jpg|jpeg|png|gif|webp)$/i.test(att.fileName)));

            const isLocationOnlyComment = !comment.content?.trim() && !comment.attachments?.length && !!comment.location;

            const commentImages = comment.attachments?.filter(att => att.fileType === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.fileName))
              .map(att => att.fileUrl).filter((url): url is string => !!url) || [];

            return (
              <React.Fragment key={comment.id}>
                {dateHeader}
                <View style={[styles.messageRow, isCurrentUser ? styles.messageRowRight : styles.messageRowLeft]}>
                  {!isCurrentUser && (
                    <View style={styles.avatarContainer}>
                      {user?.photoURL ? (
                        <Image source={{ uri: user.photoURL }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarFallback]}>
                          <Text style={styles.avatarFallbackText}>{getAvatarFallback(userName)}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  <View style={[
                    styles.commentBubble,
                    isCurrentUser ? styles.currentUserBubble : styles.otherUserBubble,
                    (isImageOnlyComment || isLocationOnlyComment) && styles.unwrappedContentBubble,
                    isCurrentUser && theme.themeName === 'dark' && !isImageOnlyComment && !isLocationOnlyComment && { backgroundColor: 'transparent' },
                  ]}>
                    {isCurrentUser && theme.themeName === 'dark' && !isImageOnlyComment && !isLocationOnlyComment ? (
                      <LinearGradient colors={theme.currentUserBubbleGradient as any} style={StyleSheet.absoluteFill} />
                    ) : null}

                    {!isCurrentUser && (<Text style={styles.userName}>{userName}</Text>)}
                    {comment.content ? (<Text style={[styles.messageText, isCurrentUser ? styles.currentUserText : styles.otherUserText]}>{comment.content}</Text>) : null}

                    {comment.attachments && comment.attachments.length > 0 && (
                      <View style={[styles.attachmentsContainer, isImageOnlyComment && { marginTop: 0, gap: 2 }]}>
                        {comment.attachments.map((att, attIndex) => {
                          const isImage = att.fileType === 'image' || (/\.(jpg|jpeg|png|gif|webp)$/i.test(att.fileName));
                          const isVideo = att.fileType === 'video' || (/\.(mp4|mov|avi|mkv)$/i.test(att.fileName));
                          const mediaUrl = att.fileUrl;

                          return (
                            <TouchableOpacity
                              key={att.id || attIndex}
                              onPress={() => {
                                if (isImage && mediaUrl) {
                                  const currentImageIndex = commentImages.indexOf(mediaUrl);
                                  handleImagePress(mediaUrl, commentImages, currentImageIndex >= 0 ? currentImageIndex : 0);
                                } else if (isVideo && mediaUrl) {
                                  handleVideoPress(mediaUrl);
                                } else if (mediaUrl) {
                                  // This now calls the updated handler
                                  handleDownload(mediaUrl, att.fileName);
                                }
                              }}
                              style={[styles.attachmentItem, isImageOnlyComment && { borderRadius: 12, overflow: 'hidden' }]}
                              activeOpacity={0.8}
                            >
                              {isImage && mediaUrl ? (
                                <View style={styles.imageAttachmentContainer}>
                                  {isImageOnlyComment ? (
                                    <AutoSizedImage uri={mediaUrl} style={styles.fullWidthImage} resizeMode="contain" />
                                  ) : (
                                    <>
                                      <Image source={{ uri: mediaUrl }} style={styles.attachmentImage} resizeMode="cover" />
                                      <View style={styles.imageOverlay}>
                                        <Ionicons name="expand-outline" size={20} color="white" />
                                      </View>
                                    </>
                                  )}
                                </View>
                              ) : isVideo && mediaUrl ? (
                                <View style={styles.imageAttachmentContainer}>
                                  <AttachmentVideoPreview mediaUrl={mediaUrl} style={styles.attachmentImage} />
                                  <View style={styles.videoOverlay}>
                                    <Ionicons name="play-circle-outline" size={40} color="white" />
                                  </View>
                                </View>
                              ) : (
                                <View style={styles.fileAttachment}>
                                  <View style={styles.fileIcon}><Ionicons name="document-text-outline" size={24} color={theme.primary} /></View>
                                  <View style={styles.fileInfo}>
                                    <Text style={styles.fileName} numberOfLines={1}>{att.fileName}</Text>
                                    {att.fileSize && (<Text style={styles.fileSize}>{(att.fileSize / 1024).toFixed(1)} كيلوبايت</Text>)}
                                  </View>
                                  <Ionicons name="download-outline" size={20} color={theme.primary} />
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {comment.location && (
                      <TouchableOpacity
                        onPress={() => { if (comment.location) handleLocationPress(comment.location.latitude, comment.location.longitude) }}
                        style={[styles.locationAttachment, isLocationOnlyComment && { marginTop: 0, width: screenWidth * 0.65 }]}
                      >
                        <Ionicons name="map-outline" size={24} color={theme.primary} />
                        <View style={styles.locationInfo}>
                          <Text style={styles.locationText}>تمت مشاركة الموقع</Text>
                          <Text style={styles.locationCoords}>{comment.location.latitude.toFixed(4)}, {comment.location.longitude.toFixed(4)}</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {!isLocationOnlyComment && (
                      <View style={styles.timestampContainer}>
                        <Text style={[
                          styles.timestamp,
                          isCurrentUser ? styles.currentUserTimestamp : styles.otherUserTimestamp,
                          isImageOnlyComment && styles.imageOnlyTimestamp,
                        ]}>
                          {format(commentDate, 'h:mm aaa', { locale: arSA })}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </React.Fragment>
            );
          })
        )}
      </View>
    </View>
  );
};

// --- Add NEW styles for the dialog ---
const getStyles = (theme: any) => StyleSheet.create({
  // ... (all your existing styles)
  // --- NEW DIALOG STYLES ---
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  dialogContainer: {
    backgroundColor: theme.background,
    borderRadius: 15,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  dialogFileName: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: theme.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.primary,
    borderRadius: 4,
  },
  progressTextContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPercentage: {
    fontSize: 13,
    color: theme.text,
    fontWeight: '500',
  },
  progressSize: {
    fontSize: 12,
    color: theme.textSecondary,
  },

  // --- EXISTING STYLES (unchanged) ---
  dateHeader: {
    alignSelf: 'center',
    backgroundColor: theme.themeName === 'dark' ? '#2c2c2e' : '#e5e5ea',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 15,
    marginVertical: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
  },
  dateHeaderText: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  commentsList: {
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 15,
    maxWidth: '85%',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowLeft: {
    alignSelf: 'flex-start',
  },
  messageRowRight: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  avatarContainer: {
    justifyContent: 'flex-end',
    height: 36,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.primary,
  },
  avatarFallbackText: {
    color: theme.white,
    fontWeight: '600',
    fontSize: 12,
  },
  commentBubble: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  unwrappedContentBubble: {
    padding: 0,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
    borderRadius: 12,
  },
  currentUserBubble: {
    backgroundColor: theme.currentUserBubble,
    borderBottomRightRadius: 5,
  },
  otherUserBubble: {
    backgroundColor: theme.otherUserBubble,
    borderBottomLeftRadius: 5,
    borderWidth: theme.themeName === 'light' ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.border,
  },
  userName: {
    fontWeight: '600',
    fontSize: 13,
    color: theme.primary,
    marginBottom: 4,
    textAlign: 'left',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  currentUserText: {
    color: theme.currentUserText,
    textAlign: 'left',
  },
  otherUserText: {
    color: theme.otherUserText,
    textAlign: 'left',
  },
  attachmentsContainer: {
    marginTop: 8,
    gap: 8,
  },
  attachmentItem: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageAttachmentContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentImage: {
    width: screenWidth * 0.6,
    height: 250,
    borderRadius: 12,
    backgroundColor: theme.inputBackground,
  },
  fullWidthImage: {
    width: screenWidth * 0.6,
    backgroundColor: 'transparent',
    borderRadius: 12,
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  fileAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.inputBackground,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    width: screenWidth * 0.65,
  },
  fileIcon: {
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
    marginRight: 8,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.text,
    marginBottom: 2,
  },
  fileSize: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  locationAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.inputBackground,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    marginTop: 8,
    gap: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.text,
    marginBottom: 2,
  },
  locationCoords: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  timestampContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  timestamp: {
    fontSize: 11,
  },
  imageOnlyTimestamp: {
    position: 'absolute',
    bottom: 5,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: 'white',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    fontSize: 10,
    overflow: 'hidden',
    zIndex: 1,
  },
  currentUserTimestamp: {
    color: theme.currentUserTimestamp,
  },
  otherUserTimestamp: {
    color: theme.otherUserTimestamp,
  },
  emptyCommentsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: 200,
  },
  emptyCommentsText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: theme.textSecondary,
    textAlign: 'center',
  },
  emptyCommentsSubText: {
    marginTop: 4,
    fontSize: 14,
    color: theme.placeholder,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  modalButton: {
    padding: 8,
  },
  fullscreenImage: {
    width: screenWidth,
    height: screenHeight,
  },
  imageCounter: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 50 : 30,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  imageCounterText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  menuContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 70,
    right: 15,
    backgroundColor: theme.themeName === 'dark' ? '#2c2c2e' : 'white',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
    zIndex: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    gap: 10,
  },
  menuItemText: {
    color: theme.text,
    fontSize: 16,
  },
});

export default CommentSection;