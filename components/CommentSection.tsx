import { format, isSameDay, isToday, isYesterday } from 'date-fns'; // MODIFIED: Added isSameDay, isToday, isYesterday
import { enGB } from 'date-fns/locale';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../context/ThemeContext';
import { Comment, User } from '../lib/types';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Helper to get initials from a name for the avatar fallback
const getAvatarFallback = (name: string = 'مستخدم غير معروف') => {
  if (!name) return 'م م';
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

// Helper to reliably parse the timestamp
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

// NEW: Helper to format the date header in a WhatsApp-like style
const formatDateHeader = (date: Date): string => {
  if (isToday(date)) {
    return 'Today'; // أو 'اليوم' if you prefer Arabic
  }
  if (isYesterday(date)) {
    return 'Yesterday'; // أو 'الأمس'
  }
  // You can customize this format
  return format(date, 'MMMM d, yyyy', { locale: enGB });
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
    }
  }, [modalVisible]);

  const navigateImage = useCallback(
    (direction: 'next' | 'prev') => {
      if (!allImages.length) return;
      
      let newIndex = selectedImageIndex;
      
      if (direction === 'next' && selectedImageIndex < allImages.length - 1) {
        newIndex = selectedImageIndex + 1;
      } else if (direction === 'prev' && selectedImageIndex > 0) {
        newIndex = selectedImageIndex - 1;
      } else {
        return;
      }

      if (newIndex >= 0 && newIndex < allImages.length && allImages[newIndex]) {
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
          if (!modalVisible || !selectedImage || allImages.length <= 1) {
            return;
          }

          const threshold = 50;
          if (Math.abs(event.translationX) > threshold) {
            if (event.translationX < -threshold) {
              navigateImage('next');
            } else if (event.translationX > threshold) {
              navigateImage('prev');
            }
          }
        })
        .failOffsetY([-50, 50]),
    [modalVisible, selectedImage, allImages.length, navigateImage]
  );

  const getUser = (userId: string) => users.find(u => u.id === userId);
  
  const filteredAndSortedComments = useMemo(() => comments
    .filter(comment => {
      const content = comment.content || '';
      if (comment.isStatusChange || (content.startsWith('قام') && content.includes('بتغيير حالة التكت من'))) {
        return false;
      }
      const keywordsToHide = ['قبلت المهمة', 'رفضت المهمة', 'بتغيير عنوان التذكرة', 'بإلغاء إسناد التذكرة', 'بإسناد التذكرة إلى', 'قبل المستخدم', 'رفض المستخدم'];
      if (keywordsToHide.some(keyword => content.includes(keyword))) {
        return false;
      }
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

  return (
    <View style={styles.container}>
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
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
              <TouchableOpacity
                style={styles.modalButton}
                onPress={closeModal}
              >
                <Ionicons name="close" size={32} color="white" />
              </TouchableOpacity>
            </View>

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

      <View style={styles.commentsList}>
        {filteredAndSortedComments.length === 0 ? (
          <View style={styles.emptyCommentsContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.textSecondary} style={{ opacity: 0.5 }} />
            <Text style={styles.emptyCommentsText}>لا توجد تعليقات بعد</Text>
            <Text style={styles.emptyCommentsSubText}>
              كن أول من يضيف تعليقًا!
            </Text>
          </View>
        ) : (
          // MODIFIED: Entire map logic is updated to include the date header
          filteredAndSortedComments.map((comment, index) => {
            const user = getUser(comment.userId);
            const userName = user?.name || comment.userName || 'مستخدم غير معروف';
            const isCurrentUser = comment.userId === currentUserId;
            const commentDate = getCommentDate(comment.timestamp);

            // --- NEW LOGIC to decide if a date header should be shown ---
            let dateHeader = null;
            const previousComment = index > 0 ? filteredAndSortedComments[index - 1] : null;
            const previousCommentDate = previousComment ? getCommentDate(previousComment.timestamp) : null;

            if (!previousCommentDate || !isSameDay(commentDate, previousCommentDate)) {
              dateHeader = (
                <View style={styles.dateHeader}>
                  <Text style={styles.dateHeaderText}>
                    {formatDateHeader(commentDate)}
                  </Text>
                </View>
              );
            }
            // --- END OF NEW LOGIC ---

            const isImageOnlyComment =
              !comment.content?.trim() &&
              comment.attachments &&
              comment.attachments.length > 0 &&
              comment.attachments.every(att => {
                const isImage =
                  att.fileType === 'image' ||
                  (att.mimeType ? att.mimeType.startsWith('image/') : /\.(jpg|jpeg|png|gif|webp)$/i.test(att.fileName));
                return isImage;
              });

            const commentImages = comment.attachments?.filter(att => {
              const isImage = att.fileType === 'image' || (att.mimeType && att.mimeType.startsWith('image/'));
              return isImage || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.fileName);
            }).map(att => att.downloadURL).filter((url): url is string => !!url) || [];

            // Return a React Fragment to conditionally include the date header
            return (
              <React.Fragment key={comment.id}>
                {dateHeader}
                <View
                  style={[
                    styles.messageRow,
                    isCurrentUser ? styles.messageRowRight : styles.messageRowLeft
                  ]}
                >
                  {!isCurrentUser && (
                    <View style={styles.avatarContainer}>
                      {user?.photoURL ? (
                        <Image source={{ uri: user.photoURL }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarFallback]}>
                          <Text style={styles.avatarFallbackText}>
                            {getAvatarFallback(userName)}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  <View
                    style={[
                      styles.commentBubble,
                      isCurrentUser ? styles.currentUserBubble : styles.otherUserBubble,
                      isImageOnlyComment && styles.imageOnlyBubble,
                    ]}
                  >
                    {!isCurrentUser && (
                      <Text style={styles.userName}>{userName}</Text>
                    )}
                    
                    {comment.content ? (
                      <Text style={[
                        styles.messageText,
                        isCurrentUser ? styles.currentUserText : styles.otherUserText
                      ]}>
                        {comment.content}
                      </Text>
                    ) : null}

                    {comment.attachments && comment.attachments.length > 0 && (
                      <View style={[styles.attachmentsContainer, isImageOnlyComment && { marginTop: 0, gap: 2 }]}>
                        {comment.attachments.map((att, attIndex) => {
                          const isImage = att.fileType === 'image' || (att.mimeType ? att.mimeType.startsWith('image/') : /\.(jpg|jpeg|png|gif|webp)$/i.test(att.fileName));
                          const isVideo = att.fileType === 'video' || (att.mimeType ? att.mimeType.startsWith('video/') : /\.(mp4|mov|avi|mkv)$/i.test(att.fileName));
                          const mediaUrl = att.downloadURL;

                          return (
                            <TouchableOpacity
                              key={attIndex}
                              onPress={() => {
                                if (isImage && mediaUrl) {
                                  const currentImageIndex = commentImages.indexOf(mediaUrl);
                                  const validIndex = currentImageIndex >= 0 ? currentImageIndex : 0;
                                  handleImagePress(mediaUrl, commentImages, validIndex);
                                } else if (isVideo && mediaUrl) {
                                  handleVideoPress(mediaUrl);
                                } else if (mediaUrl) {
                                  Linking.openURL(mediaUrl);
                                }
                              }}
                              style={[styles.attachmentItem, isImageOnlyComment && { borderRadius: 12, overflow: 'hidden' }]}
                              activeOpacity={0.8}
                            >
                              {isImage && mediaUrl ? (
                                <View style={styles.imageAttachmentContainer}>
                                  {isImageOnlyComment ? (
                                    <AutoSizedImage
                                      uri={mediaUrl}
                                      style={styles.fullWidthImage}
                                      resizeMode="contain"
                                    />
                                  ) : (
                                    <>
                                      <Image
                                        source={{ uri: mediaUrl }}
                                        style={styles.attachmentImage}
                                        resizeMode="cover"
                                      />
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
                                  <View style={styles.fileIcon}>
                                    <Ionicons name="document-text-outline" size={24} color={theme.primary} />
                                  </View>
                                  <View style={styles.fileInfo}>
                                    <Text style={styles.fileName} numberOfLines={1}>
                                      {att.fileName}
                                    </Text>
                                    {(att.size) && (
                                      <Text style={styles.fileSize}>
                                        {((att.size) / 1024).toFixed(1)} كيلوبايت
                                      </Text>
                                    )}
                                  </View>
                                  <Ionicons name="download-outline" size={20} color={theme.primary} />
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    <View style={styles.timestampContainer}>
                      <Text style={[
                        styles.timestamp,
                        isCurrentUser ? styles.currentUserTimestamp : styles.otherUserTimestamp,
                        isImageOnlyComment && styles.imageOnlyTimestamp,
                      ]}>
                      {format(commentDate, 'h:mm aaa', { locale: enGB })}
                      </Text>
                    </View>
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

const getStyles = (theme: any) => StyleSheet.create({
  // NEW: Styles for the date header
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
  // --- Existing styles below ---
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
    marginBottom: 15, // This gives space between messages, date header margin handles its own space
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
  },
  imageOnlyBubble: {
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
  },
  fileIcon: {
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
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
  // Modal styles
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
    zIndex: 1,
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
});

export default CommentSection;