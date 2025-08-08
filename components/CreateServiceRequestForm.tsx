import { Ionicons } from '@expo/vector-icons';
import { format, formatDistanceToNowStrict, isSameDay, isToday, isYesterday } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { BlurView } from 'expo-blur';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { shareAsync } from 'expo-sharing';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Animated as RNAnimated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
// Import Gesture Handler and Reanimated
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { usePermissions } from '@/context/PermissionsContext';
import { useTheme } from '../context/ThemeContext';
import { Comment, User } from '../lib/types';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const calculatedWidth = screenWidth * 0.8;

// --- Helper functions (unchanged) ---
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
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { currentUserTeamId } = usePermissions()
  const [selectedCommentInfo, setSelectedCommentInfo] = useState<{
    userName: string;
    userPhoto?: string;
    formattedTimestamp: string;
  } | null>(null);

  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloadDialogVisible, setDownloadDialogVisible] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState({ fileName: '', totalSize: 0 });

  // Use RNAnimated for the existing modal animation
  const scaleAnim = useRef(new RNAnimated.Value(0)).current;

  // Reanimated shared values for pinch-to-zoom and pan
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Define the pinch gesture
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        // Animate back to original size and reset translation
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  // Define the pan gesture
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      // Only pan if zoomed in
      if (scale.value <= 1) {
        return;
      }
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        return;
      }

      // Calculate image dimensions based on styles (hardcoded aspect ratio for now)
      const imageWidth = calculatedWidth;
      const imageHeight = imageWidth / (9 / 16);

      const scaledWidth = imageWidth * scale.value;
      const scaledHeight = imageHeight * scale.value;

      // Calculate maximum translation boundaries to keep the image on screen
      const maxTx = scaledWidth > screenWidth ? (scaledWidth - screenWidth) / 2 : 0;
      const maxTy = scaledHeight > screenHeight ? (scaledHeight - screenHeight) / 2 : 0;

      // Clamp translation values to stay within boundaries
      let clampedX = Math.max(-maxTx, Math.min(maxTx, translateX.value));
      let clampedY = Math.max(-maxTy, Math.min(maxTy, translateY.value));

      // Animate to the clamped position
      translateX.value = withTiming(clampedX, { duration: 100 });
      translateY.value = withTiming(clampedY, { duration: 100 });

      // Save the final clamped position
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
    });

  // Define the double-tap gesture to toggle zoom
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onStart(() => {
      'worklet';
      if (scale.value > 1) {
        // If already zoomed, zoom out and reset position
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        // If not zoomed, zoom in to a fixed factor
        const zoomFactor = 2;
        scale.value = withTiming(zoomFactor);
        savedScale.value = zoomFactor;
      }
    });

  // Compose pinch and pan gestures to run simultaneously
  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  // Use Exclusive to prioritize the double-tap gesture.
  // If the double-tap fails, the pinch/pan gestures can activate.
  const imageGesture = Gesture.Exclusive(doubleTap, composedGesture);


  // Animated style for the image, including scale and translation
  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const modalPlayer = useVideoPlayer(selectedVideo || '', (player) => {
    if (selectedVideo) {
      player.play();
      player.loop = true;
    }
  });

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index;
      if (typeof newIndex === 'number') {
        setSelectedImageIndex(newIndex);
        if (allImages[newIndex]) {
          setSelectedImage(allImages[newIndex]);
        }
        // Reset scale and translation when swiping to a new image
        scale.value = 1;
        savedScale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    }
  }, [allImages, scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const viewabilityConfig = { viewAreaCoveragePercentThreshold: 50 };

  useEffect(() => {
    if (modalVisible) {
      RNAnimated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        useNativeDriver: true,
      }).start();
    }
  }, [modalVisible, scaleAnim]);

  useEffect(() => {
    if (!modalVisible) {
      setSelectedImage(null);
      setSelectedVideo(null);
      setAllImages([]);
      setSelectedImageIndex(0);
      setSelectedCommentInfo(null);
      modalPlayer.pause();
      scaleAnim.setValue(0);
      // Reset zoom and pan state when modal closes
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  }, [modalVisible, modalPlayer, scaleAnim, scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const saveToGallery = async (fileUri: string) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission required',
          'We need permission to save files to your photo gallery.'
        );
        return;
      }
      await MediaLibrary.createAssetAsync(fileUri);
      Alert.alert('تم الحفظ', 'تم حفظ الملف بنجاح في معرض الصور.');
    } catch (error) {
      console.error('Error saving to gallery:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء حفظ الملف في المعرض.');
      await shareAsync(fileUri, { dialogTitle: 'مشاركة أو حفظ هذا الملف' });
    }
  };

  const handleDownload = async (url?: string) => {
    const downloadUrl = url || selectedImage || selectedVideo;
    if (!downloadUrl) {
      Alert.alert('خطأ', 'لم يتم تحديد أي ملف للتحميل.');
      return;
    }

    const fileExtension = downloadUrl.split('.').pop()?.split('?')[0] || 'tmp';
    const fileName = `download-${Date.now()}.${fileExtension}`;
    const tempFileUri = FileSystem.cacheDirectory + fileName;

    setDownloadProgress(0);
    setDownloadInfo({ fileName, totalSize: 0 });
    setDownloadDialogVisible(true);

    const progressCallback: FileSystem.DownloadProgressCallback = (progress) => {
      const totalSize = progress.totalBytesExpectedToWrite;
      const percentage = progress.totalBytesWritten / totalSize;
      setDownloadProgress(percentage);
      if (downloadInfo.totalSize === 0) {
        setDownloadInfo({ fileName, totalSize });
      }
    };

    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      tempFileUri,
      {},
      progressCallback
    );

    try {
      const result = await downloadResumable.downloadAsync();
      if (result) {
        setDownloadDialogVisible(false);
        await saveToGallery(result.uri);
      } else {
        throw new Error('فشل التحميل: لم يتم إرجاع نتيجة.');
      }
    } catch (error) {
      console.error(`Download failed for user: ${selectedCommentInfo?.userName || 'Unknown'}`, error);
      setDownloadDialogVisible(false);
      Alert.alert('خطأ', 'لا يمكن تحميل الملف.');
    }
  };

  const handleShare = async () => {
    const url = selectedImage || selectedVideo;
    if (!url) return;
    try {
      const fileExtension = url.split('.').pop()?.split('?')[0] || 'tmp';
      const localUri = `${FileSystem.cacheDirectory}share-${Date.now()}.${fileExtension}`;
      const { uri } = await FileSystem.downloadAsync(url, localUri);
      await shareAsync(uri, { dialogTitle: 'مشاركة هذا الملف' });
    } catch (error) {
      console.error(`Share failed for user: ${selectedCommentInfo?.userName || 'Unknown'}`, error);
      Alert.alert('خطأ', 'تعذرت مشاركة الملف.');
    }
  };


  const getUser = (userId: string) => users.find(u => u.id === userId);

  const sortedComments = useMemo(() =>
    comments
      .slice()
      .sort((a, b) => getCommentDate(a.timestamp).getTime() - getCommentDate(b.timestamp).getTime()),
    [comments]
  );

  const openMediaModal = (comment: Comment) => {
    const user = getUser(comment.userId);
    const isCurrentUser = comment.userId === currentUserId;
    const commentDate = getCommentDate(comment.timestamp);

    let displayName = user?.name || 'مستخدم غير معروف';
    let displayPhoto = user?.photoURL;

    if (!isCurrentUser && user && user.teamId !== currentUserTeamId) {
      // Different team → use role instead of name, no photo
      displayName = user.role || 'عضو فريق';
      displayPhoto = undefined;
    }

    setSelectedCommentInfo({
      userName: isCurrentUser ? 'You' : displayName,
      userPhoto: displayPhoto,
      formattedTimestamp: formatDistanceToNowStrict(commentDate, { addSuffix: true, locale: arSA }),
    });

    setModalVisible(true);
  };

  const handleImagePress = (imageUrl: string, images: string[], index: number, comment: Comment) => {
    if (!imageUrl || !Array.isArray(images) || images.length === 0) return;
    const validIndex = Math.max(0, Math.min(index, images.length - 1));

    setSelectedImage(imageUrl);
    setSelectedVideo(null);
    setAllImages(images);
    setSelectedImageIndex(validIndex);
    openMediaModal(comment);
  };

  const handleVideoPress = (videoUrl: string, comment: Comment) => {
    if (!videoUrl) return;
    setSelectedVideo(videoUrl);
    setSelectedImage(null);
    setAllImages([]);
    setSelectedImageIndex(0);
    openMediaModal(comment);
  };

  const closeModal = () => {
    RNAnimated.timing(scaleAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setModalVisible(false);
    });
  };

  const handleLocationPress = (latitude: number, longitude: number, userName: string) => {
    const label = 'موقع تمت مشاركته';
    const url = Platform.select({
      ios: `maps://?q=${label}&ll=${latitude},${longitude}`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`,
    });
    if (url) Linking.openURL(url).catch(err => console.error(`Could not open map link for user '${userName}'. Error:`, err));
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <View style={styles.container}>
      <Modal
        animationType="fade"
        transparent={true}
        visible={isDownloadDialogVisible}
        statusBarTranslucent
        onRequestClose={() => { /* Prevent closing */ }}
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

      <Modal
        animationType="none"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <RNAnimated.View style={[styles.modalOverlay, {
            opacity: scaleAnim,
            transform: [{
              scale: scaleAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.9, 1]
              })
            }]
          }]}>
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            {selectedImage ? (
              <FlatList
                data={allImages}
                renderItem={({ item }) => (
                  <GestureDetector gesture={imageGesture}>
                    <View style={styles.fullscreenContainer}>
                      <Animated.Image
                        source={{ uri: item }}
                        style={[styles.mediaContent, animatedImageStyle]}
                        resizeMode="contain"
                      />
                    </View>
                  </GestureDetector>
                )}
                keyExtractor={(item, index) => `${item}_${index}`}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={selectedImageIndex}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                getItemLayout={(data, index) => ({
                  length: screenWidth,
                  offset: screenWidth * index,
                  index,
                })}
              />
            ) : selectedVideo ? (
              <View style={styles.fullscreenContainer}>
                <VideoView
                  player={modalPlayer}
                  style={styles.mediaContent}
                  allowsFullscreen={false}
                  allowsPictureInPicture={false}
                />
              </View>
            ) : null}

            <LinearGradient
              colors={['rgba(0,0,0,0.7)', 'transparent']}
              style={styles.headerGradient}
            />
            <View style={styles.storyHeader}>
              <View style={styles.storyHeaderLeft}>
                <TouchableOpacity onPress={closeModal} style={styles.storyCloseButton}>
                  <Ionicons name="close" size={32} color="white" />
                </TouchableOpacity>
                {selectedCommentInfo && (
                  <View style={styles.storyUserInfo}>
                    {selectedCommentInfo.userPhoto ? (
                      <Image source={{ uri: selectedCommentInfo.userPhoto }} style={styles.storyAvatar} />
                    ) : (
                      <View style={[styles.storyAvatar, styles.avatarFallback]}>
                        <Text style={styles.avatarFallbackText}>{getAvatarFallback(selectedCommentInfo.userName)}</Text>
                      </View>
                    )}
                    <View>
                      <Text style={styles.storyUserName}>{selectedCommentInfo.userName}</Text>
                      <Text style={styles.storyTimestamp}>{selectedCommentInfo.formattedTimestamp}</Text>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.storyHeaderRight}>
                <TouchableOpacity style={styles.storyActionButton} onPress={() => handleDownload()}>
                  <Ionicons name="download-outline" size={26} color="white" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.storyActionButton} onPress={handleShare}>
                  <Ionicons name="paper-plane-outline" size={26} color="white" />
                </TouchableOpacity>
              </View>
            </View>
            {allImages.length > 1 && (
              <View style={styles.progressContainer}>
                {allImages.map((_, index) => (
                  <View key={index} style={[styles.progressBar, index === selectedImageIndex && styles.progressBarActive]} />
                ))}
              </View>
            )}
          </RNAnimated.View>
        </GestureHandlerRootView>
      </Modal>

      <View style={styles.commentsList}>
        {sortedComments.length === 0 ? (
          <View style={styles.emptyCommentsContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.textSecondary} style={{ opacity: 0.5 }} />
            <Text style={styles.emptyCommentsText}>لا توجد تعليقات بعد</Text>
            <Text style={styles.emptyCommentsSubText}>كن أول من يضيف تعليقًا!</Text>
          </View>
        ) : (
          sortedComments.map((comment, index) => {
            const user = getUser(comment.userId);
            if (!user) {
              console.warn(`User data not found for userId: "${comment.userId}". Comment ID: ${comment.id}. Displaying fallback name.`);
            }
            let userName = user?.name || comment.userName || 'مستخدم غير معروف';
            let userPhoto = user?.photoURL;
            const isCurrentUser = comment.userId === currentUserId;

            if (!isCurrentUser && user && user.teamId !== currentUserTeamId) {

              userName = user.role || 'عضو فريق';
              userPhoto = undefined;
            }
            const commentDate = getCommentDate(comment.timestamp);

            let dateHeader = null;
            const previousComment = index > 0 ? sortedComments[index - 1] : null;
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
                {comment.isStatusChange ? (
                  <View style={styles.statusChangeContainer}>
                    <Ionicons name="swap-horizontal-outline" size={16} color={theme.textSecondary} />
                    <Text style={styles.statusChangeText}>
                      <Text style={{ fontWeight: '600', color: theme.text }}>{userName}: </Text>
                      {comment.content}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.messageRow, isCurrentUser ? styles.messageRowRight : styles.messageRowLeft]}>
                    {!isCurrentUser && (
                      <View style={styles.avatarContainer}>
                        {userPhoto ? (
                          <Image source={{ uri: userPhoto }} style={styles.avatar} />
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
                                    handleImagePress(mediaUrl, commentImages, currentImageIndex >= 0 ? currentImageIndex : 0, comment);
                                  } else if (isVideo && mediaUrl) {
                                    handleVideoPress(mediaUrl, comment);
                                  } else if (mediaUrl) {
                                    handleDownload(mediaUrl);
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
                          onPress={() => { if (comment.location) handleLocationPress(comment.location.latitude, comment.location.longitude, userName) }}
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
                )}
              </React.Fragment>
            );
          })
        )}
      </View>
    </View>
  );
};

const getStyles = (theme: any) => StyleSheet.create({
  // --- All styles are unchanged ---
  container: { flex: 1, backgroundColor: theme.background },
  commentsList: { paddingVertical: 10, paddingHorizontal: 10 },
  messageRow: { flexDirection: 'row', marginBottom: 15, maxWidth: '85%', alignItems: 'flex-end', gap: 8 },
  messageRowLeft: { alignSelf: 'flex-start' },
  messageRowRight: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatarContainer: { justifyContent: 'flex-end', height: 36 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { justifyContent: 'center', alignItems: 'center', backgroundColor: theme.primary },
  avatarFallbackText: { color: theme.white, fontWeight: '600', fontSize: 12 },
  commentBubble: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20, maxWidth: '100%', overflow: 'hidden' },
  unwrappedContentBubble: { padding: 0, backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0, borderRadius: 12 },
  currentUserBubble: { backgroundColor: theme.currentUserBubble, borderBottomRightRadius: 5 },
  otherUserBubble: { backgroundColor: theme.otherUserBubble, borderBottomLeftRadius: 5, borderWidth: theme.themeName === 'light' ? StyleSheet.hairlineWidth : 0, borderColor: theme.border },
  userName: { fontWeight: '600', fontSize: 13, color: theme.primary, marginBottom: 4, textAlign: 'left' },
  messageText: { fontSize: 16, lineHeight: 22 },
  currentUserText: { color: theme.currentUserText, textAlign: 'left' },
  otherUserText: { color: theme.otherUserText, textAlign: 'left' },
  attachmentsContainer: { marginTop: 8, gap: 8 },
  attachmentItem: { borderRadius: 12, overflow: 'hidden' },
  imageAttachmentContainer: { position: 'relative', justifyContent: 'center', alignItems: 'center' },
  attachmentImage: { width: screenWidth * 0.6, height: 250, borderRadius: 12, backgroundColor: theme.inputBackground },
  fullWidthImage: { width: screenWidth * 0.6, backgroundColor: 'transparent', borderRadius: 12 },
  imageOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  videoOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  fileAttachment: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.inputBackground, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border, width: screenWidth * 0.65 },
  fileIcon: { marginRight: 12 },
  fileInfo: { flex: 1, marginRight: 8 },
  fileName: { fontSize: 14, fontWeight: '500', color: theme.text, marginBottom: 2 },
  fileSize: { fontSize: 12, color: theme.textSecondary },
  locationAttachment: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.inputBackground, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border, marginTop: 8, gap: 12 },
  locationInfo: { flex: 1 },
  locationText: { fontSize: 14, fontWeight: '500', color: theme.text, marginBottom: 2 },
  locationCoords: { fontSize: 12, color: theme.textSecondary },
  timestampContainer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  timestamp: { fontSize: 11 },
  imageOnlyTimestamp: { position: 'absolute', bottom: 5, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, fontSize: 10, overflow: 'hidden', zIndex: 1 },
  currentUserTimestamp: { color: theme.currentUserTimestamp },
  otherUserTimestamp: { color: theme.otherUserTimestamp },
  emptyCommentsContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, minHeight: 200 },
  emptyCommentsText: { marginTop: 16, fontSize: 18, fontWeight: '600', color: theme.textSecondary, textAlign: 'center' },
  emptyCommentsSubText: { marginTop: 4, fontSize: 14, color: theme.placeholder, textAlign: 'center' },
  dialogOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  dialogContainer: { backgroundColor: theme.background, borderRadius: 15, padding: 20, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  dialogTitle: { fontSize: 18, fontWeight: 'bold', color: theme.text, textAlign: 'center', marginBottom: 8 },
  dialogFileName: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginBottom: 16 },
  progressBarContainer: { height: 8, backgroundColor: theme.border, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBarFill: { height: '100%', backgroundColor: theme.primary, borderRadius: 4 },
  progressTextContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressPercentage: { fontSize: 13, color: theme.text, fontWeight: '500' },
  progressSize: { fontSize: 12, color: theme.textSecondary },
  dateHeader: { alignSelf: 'center', backgroundColor: theme.themeName === 'dark' ? '#2c2c2e' : '#e5e5ea', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 15, marginVertical: 10, elevation: 1, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 1, shadowOffset: { width: 0, height: 1 } },
  dateHeaderText: { color: theme.textSecondary, fontSize: 12, fontWeight: '500' },
  statusChangeContainer: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.themeName === 'dark' ? '#2c2c2e' : '#f0f0f5', borderRadius: 15, paddingVertical: 8, paddingHorizontal: 14, marginVertical: 8, maxWidth: '90%', gap: 8 },
  statusChangeText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', flexShrink: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenContainer: {
    width: screenWidth,
    height: screenHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaContent: {
    width: calculatedWidth,
    height: 'auto',
    aspectRatio: 9 / 16,
    maxHeight: screenHeight * 0.9,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 1,
  },
  storyHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 10,
    right: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  storyHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  storyHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  storyCloseButton: {
    padding: 5,
  },
  storyActionButton: {
    padding: 5,
  },
  storyUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  storyAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  storyUserName: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  storyTimestamp: {
    color: '#E0E0E0',
    fontSize: 12,
  },
  progressContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 40 : 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    gap: 4,
    zIndex: 2,
  },
  progressBar: {
    flex: 1,
    height: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 2,
  },
  progressBarActive: {
    backgroundColor: 'white',
  },
});

export default CommentSection;