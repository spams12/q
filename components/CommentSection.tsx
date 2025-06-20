import { format } from 'date-fns';
import { enGB } from 'date-fns/locale';
import * as DocumentPicker from 'expo-document-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../context/ThemeContext';
import { storage } from '../lib/firebase';
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

interface CommentSectionProps {
  comments: Comment[];
  users: User[];
  currentUserId: string;
  ticketStatus: string;
  userHasAccepted: boolean;
  onAddComment: (comment: Partial<Comment>) => Promise<void>;
  ticketId: string;
}

const AttachmentVideoPreview: React.FC<{ mediaUrl: string; style: any }> = ({ mediaUrl, style }) => {
  const player = useVideoPlayer(mediaUrl, (p) => {
    p.muted = true;
  });
  return <VideoView player={player} style={style} />;
};

const CommentSection: React.FC<CommentSectionProps> = ({
  comments,
  users,
  currentUserId,
  ticketStatus,
  userHasAccepted,
  onAddComment,
  ticketId,
}) => {
  const [newComment, setNewComment] = useState('');
  const [attachments, setAttachments] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
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

  // Reset modal state when modal closes
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
      // Add bounds checking to prevent crashes
      if (!allImages.length) return;
      
      let newIndex = selectedImageIndex;
      
      if (direction === 'next' && selectedImageIndex < allImages.length - 1) {
        newIndex = selectedImageIndex + 1;
      } else if (direction === 'prev' && selectedImageIndex > 0) {
        newIndex = selectedImageIndex - 1;
      } else {
        // If at bounds, do nothing
        return;
      }

      // Ensure the new index is valid
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
          // Add checks to prevent crashes
          if (!modalVisible || !selectedImage || allImages.length <= 1) {
            return;
          }

          const threshold = 50;
          if (Math.abs(event.translationX) > threshold) {
            if (event.translationX < -threshold) {
              // Swipe left (next image)
              navigateImage('next');
            } else if (event.translationX > threshold) {
              // Swipe right (previous image)
              navigateImage('prev');
            }
          }
        })
        .failOffsetY([-50, 50]), // Prevent conflict with vertical scrolling
    [modalVisible, selectedImage, allImages.length, navigateImage]
  );

  const getUser = (userId: string) => users.find(u => u.id === userId);
  console.log('Current User ID:', currentUserId);
  
  // Filter and sort comments
  const filteredAndSortedComments = comments
    .filter(comment => {
      const content = comment.content || '';
      if (comment.isStatusChange || (content.startsWith('قام') && content.includes('بتغيير حالة التكت من'))) {
        return false;
      }
      const keywordsToHide = ['قبلت المهمة', 'رفضت المهمة', 'بتغيير عنوان التذكرة', 'بإلغاء إسناد التذكرة', 'بإسناد التذكرة إلى'];
      if (keywordsToHide.some(keyword => content.includes(keyword))) {
        return false;
      }
      return true;
    })
    .sort((a, b) => getCommentDate(a.timestamp).getTime() - getCommentDate(b.timestamp).getTime());

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        setAttachments(prev => [...prev, ...result.assets]);
      }
    } catch (err) {
      console.error('Error picking document:', err);
    }
  };

  const handleCommentSubmit = async () => {
    if (!newComment.trim() && attachments.length === 0) return;

    const uploadedAttachments: {
      downloadURL: string;
      fileName: string;
      mimeType?: string;
      size?: number;
    }[] = [];

    if (attachments.length > 0) {
      for (const asset of attachments) {
        try {
          const response = await fetch(asset.uri);
          const blob = await response.blob();
          const storageRef = ref(storage, `attachments/${ticketId}/${Date.now()}-${asset.name}`);

          await uploadBytes(storageRef, blob);
          const downloadURL = await getDownloadURL(storageRef);

          uploadedAttachments.push({
            downloadURL,
            fileName: asset.name,
            mimeType: asset.mimeType,
            size: asset.size,
          });
        } catch (error) {
          console.error(`Failed to upload ${asset.name}:`, error);
        }
      }
    }

    const newCommentData: Partial<Comment> = {
      id: `${Date.now()}`,
      content: newComment.trim(),
      userId: currentUserId,
      userName: users.find(u => u.uid === currentUserId)?.name || 'مستخدم غير معروف',
      timestamp: new Date().toISOString(),
      attachments: uploadedAttachments,
    };
    await onAddComment(newCommentData);
    setNewComment('');
    setAttachments([]);
  };

  const isDisabled = ticketStatus === 'مكتمل' || ticketStatus === 'مغلق' 

  const handleImagePress = (imageUrl: string, images: string[], index: number) => {
    // Validate inputs before setting state
    if (!imageUrl || !Array.isArray(images) || images.length === 0) {
      console.warn('Invalid image data provided to handleImagePress');
      return;
    }

    const validIndex = Math.max(0, Math.min(index, images.length - 1));
    
    setSelectedImage(imageUrl);
    setSelectedVideo(null);
    setAllImages(images);
    setSelectedImageIndex(validIndex);
    setModalVisible(true);
  };

  const handleVideoPress = (videoUrl: string) => {
    if (!videoUrl) {
      console.warn('Invalid video URL provided to handleVideoPress');
      return;
    }
    
    setSelectedVideo(videoUrl);
    setSelectedImage(null);
    setAllImages([]);
    setSelectedImageIndex(0);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    // Let useEffect handle the cleanup
  };

  return (
    <View style={styles.container}>
      
      {/* Enhanced Image Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <StatusBar barStyle="light-content" backgroundColor="black" />

            {selectedImage ? (
              <GestureDetector gesture={pan}>
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.fullscreenImage}
                  resizeMode="contain"
                  onError={() => {
                    console.warn('Failed to load image:', selectedImage);
                  }}
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

            {/* Header with close button */}
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={closeModal}
              >
                <Ionicons name="close" size={32} color="white" />
              </TouchableOpacity>
            </View>

            {/* Image navigation indicators */}
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
              {isDisabled ? 'المحادثة مغلقة.' : 'كن أول من يضيف تعليقًا!'}
            </Text>
          </View>
        ) : (
          filteredAndSortedComments.map(comment => {
          const user = getUser(comment.userId);
          const userName = user?.name || comment.userName || 'مستخدم غير معروف';
          const isCurrentUser = comment.userId === currentUserId;
          const commentDate = getCommentDate(comment.timestamp);

          // Collect all images in this comment for modal navigation
          const commentImages = comment.attachments?.filter(att => {
            const isImage = att.fileType === 'image' || (att.mimeType && att.mimeType.startsWith('image/'));
            return isImage || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.fileName);
          }).map(att => att.fileUrl || att.downloadURL).filter((url): url is string => !!url) || [];

          return (
            <View
              key={comment.id}
              style={[
                styles.messageRow,
                isCurrentUser ? styles.messageRowRight : styles.messageRowLeft,
              ]}
            >
              {/* Avatar for other users */}
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
                  <View style={[styles.avatarTail, !isCurrentUser && styles.avatarTailLeft]} />
                </View>
              )}

              {/* Message bubble */}
              <View
                style={[
                  styles.commentBubble,
                  isCurrentUser ? styles.currentUserBubble : styles.otherUserBubble,
                ]}
              >
                {/* User name (only for other users or in group chats) */}
                {!isCurrentUser && (
                  <Text style={styles.userName}>{userName}</Text>
                )}
                
                {/* Message content */}
                {comment.content ? (
                  <Text style={[
                    styles.messageText,
                    isCurrentUser ? styles.currentUserText : styles.otherUserText
                  ]}>
                    {comment.content}
                  </Text>
                ) : null}

                {/* Attachments */}
                {comment.attachments && comment.attachments.length > 0 && (
                  <View style={styles.attachmentsContainer}>
                    {comment.attachments.map((att, index) => {
                      const isImage = att.fileType === 'image' || (att.mimeType ? att.mimeType.startsWith('image/') : /\.(jpg|jpeg|png|gif|webp)$/i.test(att.fileName));
                      const isVideo = att.fileType === 'video' || (att.mimeType ? att.mimeType.startsWith('video/') : /\.(mp4|mov|avi|mkv)$/i.test(att.fileName));
                      const mediaUrl = att.fileUrl || att.downloadURL;

                      return (
                        <TouchableOpacity
                          key={index}
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
                          style={styles.attachmentItem}
                          activeOpacity={0.8}
                        >
                          {isImage && mediaUrl ? (
                            <View style={styles.imageAttachmentContainer}>
                              <Image
                                source={{ uri: mediaUrl }}
                                style={styles.attachmentImage}
                                resizeMode="contain"
                              />
                              <View style={styles.imageOverlay}>
                                <Ionicons name="expand-outline" size={20} color="white" />
                              </View>
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
                                {(att.fileSize || att.size) && (
                                  <Text style={styles.fileSize}>
                                    {(((att.fileSize || att.size) ?? 0) / 1024).toFixed(1)} كيلوبايت
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

                {/* Timestamp */}
                <Text style={[
                  styles.timestamp,
                  isCurrentUser ? styles.currentUserTimestamp : styles.otherUserTimestamp
                ]}>
                  {format(commentDate, 'yyyy/MM/dd hh:mm a', { locale: enGB })}
                </Text>
              </View>

              {/* Tail for current user */}
              {isCurrentUser && (
                <View style={styles.avatarContainer}>
                  <View style={[styles.avatarTail, styles.avatarTailRight]} />
                </View>
              )}
            </View>
          );
          })
        )}
      </View>

      {/* Input section */}
      <View style={styles.inputSection}>
        {/* Attachment preview */}
        {attachments.length > 0 && (
          <View style={styles.attachmentPreviewContainer}>
            <View>
              {attachments.map((file, index) => (
                <View key={index} style={styles.attachmentPill}>
                  <Ionicons 
                    name={file.mimeType?.startsWith('image/') ? 'image-outline' : 'document-outline'} 
                    size={16} 
                    color="white" 
                  />
                  <Text style={styles.attachmentText} numberOfLines={1}>
                    {file.name}
                  </Text>
                  <TouchableOpacity 
                    onPress={() => setAttachments(prev => prev.filter((_, i) => i !== index))}
                    style={styles.removeAttachment}
                  >
                    <Ionicons name="close" size={16} color="white" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Input container */}
        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.input, { textAlign: 'right' }]}
            value={newComment}
            onChangeText={setNewComment}
            placeholder="اكتب رسالتك هنا..."
            placeholderTextColor={theme.placeholder}
            multiline
            textAlignVertical="center"
          />
          
          <TouchableOpacity 
            onPress={handlePickDocument} 
            style={[styles.iconButton, isDisabled && styles.disabledButton]}
     
          >
            <Ionicons 
              name="attach" 
              size={24} 
              color={isDisabled ? theme.placeholder : theme.primary}
            />
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={handleCommentSubmit} 
            style={[
              styles.sendButton,
              isDisabled && styles.disabledSendButton,
              (newComment.trim() || attachments.length > 0) && !isDisabled && styles.activeSendButton
            ]}
          >
            <Ionicons 
              name="send" 
              size={20} 
              color={isDisabled ? theme.placeholder : theme.white}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const getStyles = (theme: any) => StyleSheet.create({
  container: {
    backgroundColor: theme.background,
    borderRadius: 12,
  },
  commentsList: {
    flexGrow: 1,
    paddingVertical: 12,
    paddingHorizontal:8,
    paddingBottom: 20,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
    maxWidth: '85%',
    alignItems: 'flex-end',
  },
  messageRowLeft: {
    alignSelf: 'flex-start',
  },
  messageRowRight: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginHorizontal: 8,
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
  avatarTail: {
    position: 'absolute',
    bottom: 0,
    width: 0,
    height: 0,
    borderStyle: 'solid',
  },
  avatarTailLeft: {
    left: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderRightColor: theme.card,
    borderBottomColor: 'transparent',
  },
  avatarTailRight: {
    right: 8,
    borderLeftWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: theme.blueTint,
    borderBottomColor: 'transparent',
  },
  commentBubble: {
    padding: 12,
    borderRadius: 18,
    maxWidth: '100%',
    shadowColor: theme.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  currentUserBubble: {
    backgroundColor: theme.blueTint,
    borderBottomRightRadius: 4,
  },
  otherUserBubble: {
    backgroundColor: theme.card,
    borderBottomLeftRadius: 4,
  },
  userName: {
    fontWeight: '600',
    fontSize: 12,
    color: theme.primary,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  currentUserText: {
    color: theme.primary,
  },
  otherUserText: {
    color: theme.text,
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
    height: 180,
    borderRadius: 12,
    backgroundColor: theme.inputBackground,
    objectFit: 'contain',
  },
  imageOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 16,
    padding: 6,
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
  timestamp: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  currentUserTimestamp: {
    color: theme.primary,
  },
  otherUserTimestamp: {
    color: theme.textSecondary,
  },
  inputSection: {
    backgroundColor: theme.card,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  attachmentPreviewContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  attachmentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.primary,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    maxWidth: 200,
  },
  attachmentText: {
    color: theme.white,
    fontSize: 12,
    marginHorizontal: 6,
    flex: 1,
  },
  removeAttachment: {
    padding: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: theme.inputBackground,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: theme.border,
  },
  iconButton: {
    padding: 8,
    borderRadius: 20,
  },
  sendButton: {
    backgroundColor: theme.primary,
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeSendButton: {
    backgroundColor: theme.primary,
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledSendButton: {
    backgroundColor: theme.border,
  },
  emptyCommentsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: 150,
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
    top: Platform.OS === 'ios' ? 40 : 20,
    left: 10,
    zIndex: 1,
  },
  modalButton: {
    padding: 8,
  },
  fullscreenImage: {
    width: screenWidth,
    height: screenHeight,
    objectFit: 'contain',
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