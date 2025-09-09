import { Ionicons } from '@expo/vector-icons';
import { format, formatDistanceToNowStrict, isSameDay, isToday, isYesterday } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { BlurView } from 'expo-blur';
import * as FileSystem from 'expo-file-system';
import { Image, ImageLoadEventData } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { shareAsync } from 'expo-sharing';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  Platform,
  Animated as RNAnimated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../context/ThemeContext';
import { Comment, User } from '../lib/types';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

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

interface MediaItem {
  type: 'image' | 'video';
  url: string;
  comment: Comment;
}

// --- MODIFIED COMPONENT: MediaRenderer ---
const MediaRenderer = ({ item, index, activeIndex, modalPlayer, setScrollEnabled }: any) => {
  const PAN_SPEED_MULTIPLIER = 2.0;

  const { theme } = useTheme();
  const styles = getStyles(theme);
  const isActive = index === activeIndex;

  const [imageAspectRatio, setImageAspectRatio] = useState<number>(1);

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    if (!isActive) {
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedScale.value = 1;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      setImageAspectRatio(1);
    }
  }, [isActive, scale, translateX, translateY, savedScale, savedTranslateX, savedTranslateY]);

  useAnimatedReaction(
    () => scale.value,
    (currentScale, previousScale) => {
      if (currentScale > 1 && previousScale && previousScale <= 1) {
        runOnJS(setScrollEnabled)(false);
      } else if (currentScale <= 1 && previousScale && previousScale > 1) {
        runOnJS(setScrollEnabled)(true);
      }
    }
  );

  // --- THIS ANIMATED STYLE IS NOW APPLIED TO THE CONTAINER ---
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const getContainerDimensions = (aspectRatio: number) => {
    const maxWidth = screenWidth * 0.9;
    const maxHeight = screenHeight * 0.9;

    let width, height;

    if (aspectRatio > 1) {
      width = Math.min(maxWidth, maxHeight * aspectRatio);
      height = width / aspectRatio;
    } else {
      height = Math.min(maxHeight, maxWidth / aspectRatio);
      width = height * aspectRatio;
    }

    width = Math.max(width, 200);
    height = Math.max(height, 200);

    return { width, height };
  };

  const zoomGesture = useMemo(() => {
    const doubleTapGesture = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(250)
      .onEnd(() => {
        'worklet';
        const FILL_SCALE = 2.0;
        const MAX_SCALE = 3.5;
        const isAtBase = Math.abs(scale.value - 1) < 0.01;
        const isAtFill = Math.abs(scale.value - FILL_SCALE) < 0.01;

        if (isAtBase) {
          scale.value = withTiming(FILL_SCALE);
          savedScale.value = FILL_SCALE;
        } else if (isAtFill) {
          scale.value = withTiming(MAX_SCALE);
          savedScale.value = MAX_SCALE;
        } else {
          scale.value = withTiming(1);
          savedScale.value = 1;
          translateX.value = withTiming(0);
          translateY.value = withTiming(0);
          savedTranslateX.value = 0;
          savedTranslateY.value = 0;
        }
      });

    const pinchGesture = Gesture.Pinch()
      .onUpdate((event) => {
        const newScale = savedScale.value * event.scale;
        scale.value = Math.max(1, Math.min(newScale, 5));
      })
      .onEnd(() => {
        savedScale.value = scale.value;
      });

    const panGesture = Gesture.Pan()
      .averageTouches(true)
      .onUpdate((event) => {
        if (scale.value > 1) {
          translateX.value = savedTranslateX.value + event.translationX * PAN_SPEED_MULTIPLIER;
          translateY.value = savedTranslateY.value + event.translationY * PAN_SPEED_MULTIPLIER;
        }
      })
      .onEnd(() => {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      });

    const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);
    return Gesture.Exclusive(doubleTapGesture, composedGesture);
  }, [scale, savedScale, translateX, savedTranslateX, translateY, savedTranslateY]);

  if (item.type === 'image') {
    const containerDimensions = getContainerDimensions(imageAspectRatio);

    return (
      <View style={styles.fullscreenContainer}>
        <GestureDetector gesture={zoomGesture}>
          {/* --- MODIFICATION START --- */}
          {/* The animatedStyle is now applied here, to the container */}
          <Animated.View
            style={[
              styles.mediaViewerContainer,
              containerDimensions,
              { borderRadius: 30, overflow: 'hidden' },
              animatedStyle, // <-- MOVED THE STYLE HERE
            ]}
            collapsable={false}
          >
            {/* The Image component no longer needs to be animated directly */}
            <Image
              source={{ uri: item.url }}
              style={[
                styles.mediaViewerElement,
                { resizeMode: 'cover' }, // animatedStyle was removed from here
              ]}
              onLoad={(event) => {
                const { width, height } = event.nativeEvent.source;
                if (height > 0) {
                  setImageAspectRatio(width / height);
                }
              }}
            />
          </Animated.View>
          {/* --- MODIFICATION END --- */}
        </GestureDetector>
      </View>
    );
  }

  if (item.type === 'video') {
    return (
      <View style={styles.fullscreenContainer}>
        <View style={[styles.mediaViewerContainer, { borderRadius: 30, overflow: 'hidden' }]}>
          {isActive ? (
            <VideoView
              player={modalPlayer}
              style={styles.mediaViewerElement}

            />
          ) : (
            <View style={{ flex: 1, backgroundColor: 'black' }} />
          )}
        </View>
      </View>
    );
  }

  return null;
};


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
  const [isLoading, setIsLoading] = useState(true);

  const handleLoad = (event: ImageLoadEventData) => {
    const { width, height } = event.source;
    if (height > 0) {
      setAspectRatio(width / height);
    } else {
      setAspectRatio(1);
    }
  };

  return (
    <View
      style={[
        style,
        {
          backgroundColor: 'black',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
        },
        aspectRatio
          ? { aspectRatio }
          : { height: 250 },
      ]}
    >
      <Image
        source={{ uri }}
        style={{ width: '100%', height: '100%' }}
        resizeMode={resizeMode}
        onLoadStart={() => setIsLoading(true)}
        onLoad={handleLoad}
        onLoadEnd={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setAspectRatio(1);
        }}
        transition={250}
      />

      {isLoading && (
        <ActivityIndicator
          style={StyleSheet.absoluteFill}
          color="#ffffff"
          size="large"
        />
      )}
    </View>
  );
};


const CommentSection: React.FC<CommentSectionProps> = ({
  comments,
  users,
  currentUserId,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const { theme } = useTheme();
  const styles = getStyles(theme);

  const [selectedCommentInfo, setSelectedCommentInfo] = useState<{
    userName: string;
    userPhoto?: string;
    formattedTimestamp: string;
  } | null>(null);

  const [isModalScrolling, setIsModalScrolling] = useState(true);

  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloadDialogVisible, setDownloadDialogVisible] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState({ fileName: '', totalSize: 0 });

  const scaleAnim = useRef(new RNAnimated.Value(0)).current;

  const modalPlayer = useVideoPlayer(null, (player) => {
    player.loop = true;
  });

  const getUser = (userId: string) => users.find(u => u.id === userId);

  const sortedComments = useMemo(() =>
    comments
      .slice()
      .sort((a, b) => getCommentDate(a.timestamp).getTime() - getCommentDate(b.timestamp).getTime()),
    [comments]
  );

  const allMedia: MediaItem[] = useMemo(() => {
    const media: MediaItem[] = [];
    sortedComments.forEach(comment => {
      comment.attachments?.forEach(att => {
        const isImage = att.fileType === 'image' || (/\.(jpg|jpeg|png|gif|webp)$/i.test(att.fileName));
        const isVideo = att.fileType === 'video' || (/\.(mp4|mov|avi|mkv)$/i.test(att.fileName));
        if ((isImage || isVideo) && att.fileUrl) {
          media.push({
            type: isImage ? 'image' : 'video',
            url: att.fileUrl,
            comment: comment,
          });
        }
      });
    });
    return media;
  }, [sortedComments]);

  const selectedMediaIndexRef = useRef<number | null>(null);
  useEffect(() => {
    selectedMediaIndexRef.current = selectedMediaIndex;
  }, [selectedMediaIndex]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index;
      if (typeof newIndex === 'number' && newIndex !== selectedMediaIndexRef.current) {
        const currentItem = allMedia[newIndex];
        if (!currentItem) return;

        setSelectedMediaIndex(newIndex);
        setIsModalScrolling(true); // Re-enable scrolling when swiping

        const user = getUser(currentItem.comment.userId);
        const isCurrentUser = currentItem.comment.userId === currentUserId;
        const commentDate = getCommentDate(currentItem.comment.timestamp);
        setSelectedCommentInfo({
          userName: isCurrentUser ? 'You' : user?.name || 'مستخدم غير معروف',
          userPhoto: user?.photoURL,
          formattedTimestamp: formatDistanceToNowStrict(commentDate, { addSuffix: true, locale: arSA }),
        });

        if (currentItem.type === 'video') {
          modalPlayer.replaceAsync(currentItem.url);
          modalPlayer.play();
        } else {
          modalPlayer.pause();
        }
      }
    }
  }, [allMedia, getUser, currentUserId, modalPlayer]);

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
      modalPlayer.pause();
      modalPlayer.replaceAsync(null);
      setSelectedCommentInfo(null);
      scaleAnim.setValue(0);
      setIsModalScrolling(true);
    }
  }, [modalVisible, modalPlayer, scaleAnim]);

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
    const currentMediaItem = allMedia[selectedMediaIndex];
    const downloadUrl = url || currentMediaItem?.url;

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
    const currentMediaItem = allMedia[selectedMediaIndex];
    const url = currentMediaItem?.url;

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

  const handleMediaPress = (mediaUrl: string) => {
    const initialIndex = allMedia.findIndex(media => media.url === mediaUrl);
    if (initialIndex === -1) return;

    setSelectedMediaIndex(initialIndex);

    const initialMediaItem = allMedia[initialIndex];
    const user = getUser(initialMediaItem.comment.userId);
    const isCurrentUser = initialMediaItem.comment.userId === currentUserId;
    const commentDate = getCommentDate(initialMediaItem.comment.timestamp);

    setSelectedCommentInfo({
      userName: isCurrentUser ? 'You' : user?.name || 'مستخدم غير معروف',
      userPhoto: user?.photoURL,
      formattedTimestamp: formatDistanceToNowStrict(commentDate, { addSuffix: true, locale: arSA }),
    });

    if (initialMediaItem.type === 'video') {
      modalPlayer.replaceAsync(initialMediaItem.url);
      modalPlayer.play();
    }

    setModalVisible(true);
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
      {/* Download Dialog Modal */}
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

      {/* Main Media Viewer Modal */}
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
            {allMedia.length > 0 && (
              <FlatList
                data={allMedia}
                renderItem={({ item, index }) => (
                  <MediaRenderer
                    item={item}
                    index={index}
                    activeIndex={selectedMediaIndex}
                    modalPlayer={modalPlayer}
                    setScrollEnabled={setIsModalScrolling}
                  />
                )}
                keyExtractor={(item) => item.url}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={selectedMediaIndex}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                scrollEnabled={isModalScrolling}
                getItemLayout={(data, index) => ({
                  length: screenWidth,
                  offset: screenWidth * index,
                  index,
                })}
              />
            )}

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
            {allMedia.length > 1 && (
              <View style={styles.progressContainer}>
                {allMedia.map((_, index) => (
                  <View key={index} style={[styles.progressBar, index === selectedMediaIndex && styles.progressBarActive]} />
                ))}
              </View>
            )}
          </RNAnimated.View>
        </GestureHandlerRootView>
      </Modal>

      {/* Comment list */}
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
            const userName = user?.name || comment.userName || 'مستخدم غير معروف';
            const isCurrentUser = comment.userId === currentUserId;
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

            const isImageOnlyComment = !comment.content?.trim() && !comment.location && !!comment.attachments?.length &&
              comment.attachments?.every(att => att.fileType === 'image' || (/\.(jpg|jpeg|png|gif|webp)$/i.test(att.fileName))) || false;
            const isLocationOnlyComment = !comment.content?.trim() && !comment.attachments?.length && !!comment.location;


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
                                  if ((isImage || isVideo) && mediaUrl) {
                                    handleMediaPress(mediaUrl);
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
  container: { flex: 1, backgroundColor: theme.background },
  commentsList: { paddingVertical: 10, paddingHorizontal: 10 },
  messageRow: { flexDirection: 'row', marginBottom: 15, maxWidth: '85%', alignItems: 'flex-end', gap: 8 },
  messageRowLeft: { alignSelf: 'flex-start' },
  messageRowRight: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatarContainer: { justifyContent: 'flex-end', height: 36 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { justifyContent: 'center', alignItems: 'center', backgroundColor: theme.primary },
  avatarFallbackText: { color: theme.white, fontWeight: '600', fontSize: 12 },
  commentBubble: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 25, maxWidth: '100%', overflow: 'hidden' },
  unwrappedContentBubble: { padding: 0, backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0, borderRadius: 20 },
  currentUserBubble: { backgroundColor: theme.currentUserBubble, borderBottomRightRadius: 5 },
  otherUserBubble: { backgroundColor: theme.otherUserBubble, borderBottomLeftRadius: 5, borderWidth: theme.themeName === 'light' ? StyleSheet.hairlineWidth : 0, borderColor: theme.border },
  userName: { fontWeight: '600', fontSize: 13, color: theme.primary, marginBottom: 4, textAlign: 'left' },
  messageText: { fontSize: 16, lineHeight: 22 },
  currentUserText: { color: theme.currentUserText, textAlign: 'left' },
  otherUserText: { color: theme.otherUserText, textAlign: 'left' },
  attachmentsContainer: { marginTop: 8, gap: 8 },
  attachmentItem: { borderRadius: 12, overflow: 'hidden' },
  imageAttachmentContainer: { position: 'relative', justifyContent: 'center', alignItems: 'center' },
  attachmentImage: { width: screenWidth * 0.4, height: 250, borderRadius: 12, backgroundColor: theme.inputBackground },
  fullWidthImage: { width: screenWidth * 0.4, backgroundColor: 'transparent', borderRadius: 12 },
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
  mediaViewerContainer: {
    // NOTE: The width and height are now set dynamically in the component
    // based on aspect ratio, but we keep the other properties here.
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaViewerElement: {
    width: '100%',
    height: '100%',
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