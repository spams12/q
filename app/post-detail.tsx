import { usePermissions } from '@/context/PermissionsContext';
import { useTheme } from '@/context/ThemeContext';
// --- Firebase Native SDK Imports ---
import firestore, { Timestamp } from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
// --- End Firebase Imports ---
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNowStrict } from 'date-fns';
import { arSA } from 'date-fns/locale';
// --- Expo AV, FileSystem, and MediaLibrary Imports ---
import * as FileSystem from 'expo-file-system';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { shareAsync } from 'expo-sharing';
// --- Expo Router and React Native Imports ---
import { router, useLocalSearchParams } from 'expo-router';
// --- NEW: Import expo-video components ---
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
// --- Gesture Handler and Reanimated Imports ---
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, {
    runOnJS,
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    withTiming
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';


// Create an animatable version of the Expo Image component
const AnimatedImage = Animated.createAnimatedComponent(ExpoImage);
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// --- CONSTANTS for consistent design ---
const CONSTANTS = {
    SPACING_S: 8,
    SPACING_M: 16,
    SPACING_L: 24,
    BORDER_RADIUS_M: 16,
    FONT_SIZE_BODY: 16,
};

interface Post {
    id: string;
    userId: string;
    content?: string;
    images?: string[];
    media?: { url: string; type: string }[];
    timestamp: Timestamp;
    likes: number;
    likedBy: string[];
    comments: Comment[];
    user: {
        name: string;
        avatar: string;
    };
    likedByUser: boolean;
    formattedTimestamp: string;
}

interface Comment {
    id: string;
    userId: string;
    content?: string;
    image?: string;
    timestamp: Timestamp;
    user: {
        name: string;
        avatar: string;
    };
    formattedTimestamp: string;
}

const getMediaDate = (timestamp: any) => {
    if (!timestamp) return new Date();
    return typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
};

const formatTimestamp = (timestamp: Timestamp | null | undefined): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return formatDistanceToNowStrict(date, { addSuffix: true, locale: arSA });
};


const uploadToFirebase = async (uri: string, folder = 'comments'): Promise<string | null> => {
    try {
        const fileExtension = uri.split('.').pop();
        const filename = `${folder}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExtension}`;
        const storageRef = storage().ref(filename);
        await storageRef.putFile(uri);
        const downloadURL = await storageRef.getDownloadURL();
        return downloadURL;
    } catch (error) {
        console.error('Upload Error:', error as Error);
        Alert.alert('خطأ', 'فشل في رفع الملف.');
        return null;
    }
};

const useKeyboardSpacer = (insets: any) => {
    const screenHeight = Dimensions.get('window').height;
    const threshold = screenHeight * 0.02;
    const effectiveBottomInset = insets.bottom > threshold ? insets.bottom : 0;
    const height = useSharedValue(effectiveBottomInset);
    useKeyboardHandler({
        onMove: (e) => {
            "worklet";
            height.value = Math.max(e.height, effectiveBottomInset);
        },
    }, [effectiveBottomInset]);

    const animatedStyle = useAnimatedStyle(() => ({ height: height.value }), []);
    return animatedStyle;
};

// --- UPDATED COMPONENT: MediaViewerRenderer with expo-video ---
const MediaViewerRenderer = ({ item, isActive, setScrollEnabled, styles }) => {
    const PAN_SPEED_MULTIPLIER = 4;

    // A single loading state for both images and videos
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);

    // --- Video Player Setup (using expo-video) ---
    // This hook will run for every item, but it's lightweight.
    // We only connect its player to a VideoView if the item type is 'video'.
    // Enable video caching for better performance
    const source = item.type === 'video' ? { uri: item.url, useCaching: true } : null;
    const player = useVideoPlayer(source, p => {
        p.loop = true;
    });

    // Effect to control video play/pause based on `isActive`
    useEffect(() => {
        if (item.type === 'video') {
            if (isActive) {
                player.play();
            } else {
                player.pause();
            }
        }
    }, [isActive, player, item.type]);


    // --- Image Animation & Gesture Setup ---
    const scale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedScale = useSharedValue(1);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);

    // Reset state when this item is no longer the active one or when item changes
    useEffect(() => {
        if (!isActive) {
            scale.value = withTiming(1);
            translateX.value = withTiming(0);
            translateY.value = withTiming(0);
            savedScale.value = 1;
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
        }
        // Set loading based on whether item is loaded and active
        setIsLoading(!hasLoaded && isActive);
    }, [isActive, item.url, hasLoaded]);


    // Disable FlatList scrolling when the image is zoomed in
    useAnimatedReaction(
        () => scale.value,
        (currentScale, previousScale) => {
            if (currentScale > 1 && (!previousScale || previousScale <= 1)) {
                runOnJS(setScrollEnabled)(false);
            } else if (currentScale <= 1 && previousScale && previousScale > 1) {
                runOnJS(setScrollEnabled)(true);
            }
        },
        [setScrollEnabled]
    );

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
    }));

    // --- Gestures (for images only) ---
    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(250)
        .onEnd(() => {
            'worklet';
            if (scale.value !== 1) {
                scale.value = withTiming(1);
                translateX.value = withTiming(0);
                translateY.value = withTiming(0);
            } else {
                scale.value = withTiming(2.5);
            }
            savedScale.value = scale.value;
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
        });

    const pinchGesture = Gesture.Pinch()
        .onUpdate((event) => {
            scale.value = Math.max(1, Math.min(savedScale.value * event.scale, 4));
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
    const zoomGesture = Gesture.Exclusive(doubleTapGesture, composedGesture);


    // --- Conditional Rendering for Video vs. Image ---

    if (item.type === 'video') {
        return (
            <View style={styles.fullscreenContainer}>
                <VideoView
                    player={player}
                    style={styles.zoomableMediaContent}
                    contentFit="contain"
                    nativeControls={true} // Enable native controls for better UX
                    onFirstFrameRender={() => { setHasLoaded(true); setIsLoading(false); }} // Hide loader when video is ready
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
    }

    // Default to rendering an image
    if (item.isPostMedia) {
        // Post images: no zoom/pan gestures
        return (
            <View style={styles.fullscreenContainer}>
                <AnimatedImage
                    source={{ uri: item.url }}
                    style={[styles.zoomableMediaContent, animatedStyle]}
                    contentFit="contain"
                    transition={0}
                    onLoadEnd={() => { setHasLoaded(true); setIsLoading(false); }} // Hide loader when image is loaded
                    onError={() => setIsLoading(false)} // Hide loader on error
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
    } else {
        // Comment images: enable zoom/pan gestures
        return (
            <GestureDetector gesture={zoomGesture}>
                <View style={styles.fullscreenContainer}>
                    <AnimatedImage
                        source={{ uri: item.url }}
                        style={[styles.zoomableMediaContent, animatedStyle]}
                        contentFit="contain"
                        transition={0}
                        onLoadEnd={() => { setHasLoaded(true); setIsLoading(false); }}
                        onError={() => setIsLoading(false)}
                    />
                    {isLoading && (
                        <ActivityIndicator
                            style={StyleSheet.absoluteFill}
                            color="#ffffff"
                            size="large"
                        />
                    )}
                </View>
            </GestureDetector>
        );
    }
};


export default function PostDetailScreen() {
    const { postId, editing } = useLocalSearchParams();
    const { theme } = useTheme();
    const { userdoc } = usePermissions();
    const currentUser = { id: userdoc?.uid, name: userdoc?.name || 'مستخدم', avatar: userdoc?.photoURL || 'https://via.placeholder.com/100' };

    const insets = useSafeAreaInsets();
    const themeStyles = dynamicStyles(theme);
    const viewerStyles = viewerDynamicStyles(theme, insets);
    const keyboardSpacerStyle = useKeyboardSpacer(insets);

    const [post, setPost] = useState<Post | null>(null);
    const [loading, setLoading] = useState(true);
    const [newComment, setNewComment] = useState('');
    const [selectedCommentImage, setSelectedCommentImage] = useState<string | null>(null);
    const [isMediaPickerVisible, setIsMediaPickerVisible] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [imageRatios, setImageRatios] = useState<{ [uri: string]: number }>({});

    const [isEditing, setIsEditing] = useState(false);
    const [editableContent, setEditableContent] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    // --- Media Viewer State ---
    const [isMediaViewerVisible, setIsMediaViewerVisible] = useState(false);
    const [mediaViewerItems, setMediaViewerItems] = useState<any[]>([]);
    const [mediaViewerStartIndex, setMediaViewerStartIndex] = useState(0);
    const [activeMediaIndex, setActiveMediaIndex] = useState(0);
    const [selectedMediaInfo, setSelectedMediaInfo] = useState<any>(null);
    const [isScrollEnabled, setScrollEnabled] = useState(true); // State for FlatList scrolling

    // --- Download State ---
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadInfo, setDownloadInfo] = useState({ fileName: '', totalSize: 0 });
    const [downloadDialogVisible, setDownloadDialogVisible] = useState(false);

    const postIdString = Array.isArray(postId) ? postId[0] : postId;

    // --- Download and Save Logic ---
    const saveToGallery = async (fileUri: string) => {
        try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission required', 'We need permission to save files to your photo gallery.');
                return;
            }
            await MediaLibrary.createAssetAsync(fileUri);
            Alert.alert('تم الحفظ', 'تم حفظ الملف بنجاح في معرض الصور.');
        } catch (error) {
            console.error('Error saving to gallery:', error);
            Alert.alert('خطأ', 'حدث خطأ أثناء حفظ الملف في المعرض. Trying to share instead...');
            await shareAsync(fileUri, { dialogTitle: 'مشاركة أو حفظ هذا الملف' });
        }
    };

    const handleDownload = async () => {
        const currentMediaItem = mediaViewerItems[activeMediaIndex];
        const downloadUrl = currentMediaItem?.url;

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
            const percentage = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
            setDownloadProgress(percentage);
            if (downloadInfo.totalSize === 0) {
                setDownloadInfo({ fileName, totalSize: progress.totalBytesExpectedToWrite });
            }
        };

        const downloadResumable = FileSystem.createDownloadResumable(downloadUrl, tempFileUri, {}, progressCallback);

        try {
            const result = await downloadResumable.downloadAsync();
            if (result) {
                setDownloadDialogVisible(false);
                await saveToGallery(result.uri);
            } else {
                throw new Error('فشل التحميل: لم يتم إرجاع نتيجة.');
            }
        } catch (error) {
            console.error(`Download failed for URL: ${downloadUrl}`, error);
            setDownloadDialogVisible(false);
            Alert.alert('خطأ', 'لا يمكن تحميل الملف.');
        }
    };


    useEffect(() => {
        if (!postIdString) return;
        const unsubscribe = firestore().collection('posts').doc(postIdString)
            .onSnapshot(async (doc) => {
                if (doc.exists()) {
                    const postData = doc.data();
                    if (!postData) { setLoading(false); return; }

                    const postUserSnapshot = await firestore().collection('users').where('uid', '==', postData.userId).get();
                    const postUser = postUserSnapshot.docs[0]?.data() ?? { name: 'مستخدم', photoURL: 'https://via.placeholder.com/100' };

                    const commentsWithUsers = await Promise.all(
                        (postData.comments || []).map(async (comment: any) => {
                            const commentUserSnapshot = await firestore().collection('users').where('uid', '==', comment.userId).get();
                            const commentUser = commentUserSnapshot.docs[0]?.data() ?? { name: 'مستخدم', photoURL: 'https://via.placeholder.com/100' };
                            return {
                                ...comment,
                                user: { name: commentUser.name, avatar: commentUser.photoURL },
                                formattedTimestamp: formatTimestamp(comment.timestamp),
                            };
                        })
                    );

                    const fetchedPost = {
                        id: doc.id,
                        userId: postData.userId,
                        content: postData.content,
                        media: postData.media || [],
                        timestamp: postData.timestamp,
                        likes: postData.likes || 0,
                        likedBy: postData.likedBy || [],
                        comments: commentsWithUsers.sort((a, b) => a.timestamp?.toMillis() - b.timestamp?.toMillis()),
                        user: { name: postUser.name, avatar: postUser.photoURL },
                        likedByUser: postData.likedBy?.includes(currentUser?.id) || false,
                        formattedTimestamp: formatTimestamp(postData.timestamp),
                    };
                    setPost(fetchedPost);

                    if (editing === 'true' && fetchedPost.userId === currentUser.id) {
                        setIsEditing(true);
                        setEditableContent(fetchedPost.content || '');
                    }

                } else {
                    Alert.alert("خطأ", "لم يتم العثور على المنشور.");
                    router.back();
                }
                setLoading(false);
            }, (error) => {
                console.error("Error fetching post details: ", error);
                setLoading(false);
            });
        return () => unsubscribe();
    }, [postIdString, currentUser?.id, editing]);

    const handleUpdatePost = async () => {
        if (!postIdString || !post) return;
        if (editableContent.trim() === (post.content || '').trim()) {
            setIsEditing(false);
            return;
        }

        setIsUpdating(true);
        try {
            const postRef = firestore().collection('posts').doc(postIdString);
            await postRef.update({ content: editableContent });
            setIsEditing(false);
        } catch (error) {
            console.error("Error updating post: ", error);
            Alert.alert('خطأ', 'فشل في تحديث المنشور.');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleCancelEdit = () => {
        setEditableContent(post?.content || '');
        setIsEditing(false);
    };

    const toggleLike = async () => {
        if (!currentUser?.id || !post || !postIdString) return;
        const postRef = firestore().collection('posts').doc(postIdString);
        if (post.likedByUser) {
            await postRef.update({
                likes: firestore.FieldValue.increment(-1),
                likedBy: firestore.FieldValue.arrayRemove(currentUser.id),
            });
        } else {
            await postRef.update({
                likes: firestore.FieldValue.increment(1),
                likedBy: firestore.FieldValue.arrayUnion(currentUser.id),
            });
        }
    };

    const handleCommentSubmit = async () => {
        if ((!newComment.trim() && !selectedCommentImage) || !postIdString) return;
        const postRef = firestore().collection('posts').doc(postIdString);
        const newCommentData = {
            id: `${currentUser?.id}_${Date.now()}`,
            userId: currentUser?.id,
            content: newComment || null,
            image: selectedCommentImage || null,
            timestamp: firestore.Timestamp.now(),
        };
        try {
            await postRef.update({ comments: firestore.FieldValue.arrayUnion(newCommentData) });
            setNewComment('');
            setSelectedCommentImage(null);
        } catch (error) {
            Alert.alert('خطأ', 'فشل في إضافة التعليق');
        }
    };

    const openMediaViewer = (mediaItems: any[], initialUrl: string) => {
        const startIndex = mediaItems.findIndex(media => media.url === initialUrl);
        if (startIndex === -1) return;

        setMediaViewerItems(mediaItems);
        setMediaViewerStartIndex(startIndex);
        setActiveMediaIndex(startIndex);
        setIsMediaViewerVisible(true);
    };

    const closeMediaViewer = () => {
        setIsMediaViewerVisible(false);
        setScrollEnabled(true); // Reset scroll enabled state
    };

    useEffect(() => {
        if (isMediaViewerVisible) {
            const initialItem = mediaViewerItems[activeMediaIndex];
            if (initialItem) {
                const mediaDate = getMediaDate(initialItem.timestamp);
                setSelectedMediaInfo({
                    userName: initialItem.user.name || 'مستخدم',
                    userAvatar: initialItem.user.avatar,
                    formattedTimestamp: formatDistanceToNowStrict(mediaDate, { addSuffix: true, locale: arSA }),
                });
            }
        } else {
            setSelectedMediaInfo(null);
        }
    }, [isMediaViewerVisible, activeMediaIndex, mediaViewerItems]);

    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
        if (viewableItems.length > 0) {
            setActiveMediaIndex(viewableItems[0].index);
        }
    }, []);

    const pickMedia = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
            Alert.alert('الإذن مطلوب', 'مطلوب إذن للوصول إلى مكتبة الوسائط!');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: false,
            quality: 0.8,
        });
        if (!result.canceled && result.assets && result.assets[0]) {
            setUploadingImage(true);
            const uploadedUrl = await uploadToFirebase(result.assets[0].uri);
            setUploadingImage(false);
            if (uploadedUrl) {
                setSelectedCommentImage(uploadedUrl);
            }
        }
    };

    const takePhoto = async () => {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert('الإذن مطلوب', 'مطلوب إذن للوصول إلى الكاميرا!');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
        if (!result.canceled && result.assets && result.assets[0]) {
            setUploadingImage(true);
            const uploadedUrl = await uploadToFirebase(result.assets[0].uri);
            setUploadingImage(false);
            if (uploadedUrl) {
                setSelectedCommentImage(uploadedUrl);
            }
        }
    };

    const handleAction = (action: () => void) => {
        setIsMediaPickerVisible(false);
        setTimeout(action, 300); // Allow modal to close smoothly
    };

    if (loading || !post) {
        return <SafeAreaView style={[styles.loadingContainer, themeStyles.loadingContainer]}><ActivityIndicator size="large" color={theme.primary} /></SafeAreaView>;
    }

    return (
        <SafeAreaView style={[styles.modalContainer, themeStyles.container]}>
            <View style={[styles.modalHeader, themeStyles.modalHeader]}>
                {isEditing ? (
                    <TouchableOpacity onPress={handleCancelEdit}>
                        <Text style={{ color: theme.text, fontSize: 16 }}>إلغاء</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity onPress={() => router.back()}>
                        <Ionicons name="arrow-forward-outline" size={28} color={theme.text} />
                    </TouchableOpacity>
                )}
                <Text style={[styles.modalTitle, themeStyles.modalTitle]}>
                    {isEditing ? 'تعديل المنشور' : `منشور ${post?.user?.name || ''}`}
                </Text>
                {isEditing ? (
                    <TouchableOpacity onPress={handleUpdatePost} disabled={isUpdating}>
                        {isUpdating ? <ActivityIndicator color={theme.primary} /> : <Text style={{ color: theme.primary, fontSize: 16, fontWeight: 'bold' }}>حفظ</Text>}
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 28 }} />
                )}
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
                <View style={styles.postHeader}>
                    <View style={styles.userInfo}>
                        <Text style={[styles.userName, themeStyles.userName]}>{post.user.name}</Text>
                        <Text style={[styles.timestamp, themeStyles.timestamp]}>{post.formattedTimestamp}</Text>
                    </View>
                    <ExpoImage source={{ uri: post.user.avatar }} style={styles.avatar} />
                </View>

                {isEditing ? (
                    <TextInput
                        value={editableContent}
                        onChangeText={setEditableContent}
                        style={[themeStyles.postContent, styles.editInput]}
                        multiline
                        autoFocus
                        placeholder="اكتب شيئًا..."
                        placeholderTextColor={theme.placeholder}
                    />
                ) : (
                    post.content && <Text style={[styles.postContent, themeStyles.postContent]}>{post.content}</Text>
                )}


                {post.media && post.media.length > 0 && (
                    <PostMediaGrid
                        media={post.media}
                        onMediaPress={(mediaItem) => {
                            const mediaWithContext = post.media.map(m => ({
                                ...m,
                                user: post.user,
                                timestamp: post.timestamp,
                                isPostMedia: true
                            }));
                            openMediaViewer(mediaWithContext, mediaItem.url)
                        }}
                    />
                )}

                <View pointerEvents={isEditing ? 'none' : 'auto'} style={{ opacity: isEditing ? 0.5 : 1 }}>
                    <View style={[styles.postActions, themeStyles.postActions, { marginTop: post.media && post.media.length > 0 ? 8 : 0 }]}>
                        <TouchableOpacity style={styles.actionButton} onPress={toggleLike}>
                            <Ionicons name={post.likedByUser ? "heart" : "heart-outline"} size={20} color={post.likedByUser ? "#f43f5e" : theme.textSecondary} />
                            <Text style={[styles.actionText, themeStyles.actionText, post.likedByUser && styles.likedText]}>{post.likes || 0} إعجاب</Text>
                        </TouchableOpacity>
                        <View style={[styles.actionButton, { opacity: 0.7 }]}>
                            <Ionicons name="chatbubble-outline" size={20} color={theme.textSecondary} />
                            <Text style={[styles.actionText, themeStyles.actionText]}>{post.comments.length} تعليق</Text>
                        </View>
                    </View>
                    <View style={{ height: 10, backgroundColor: theme.background }} />

                    {post.comments.map((comment: Comment) => {
                        const imageUri = comment.image;
                        const aspectRatio = imageUri ? imageRatios[imageUri] : 1;

                        return (
                            <View key={comment.id} style={styles.commentItem}>
                                <ExpoImage source={{ uri: comment.user.avatar }} style={styles.commentAvatar} />
                                <View style={styles.commentContent}>
                                    {comment.content && (
                                        <View style={[styles.commentBubble, themeStyles.commentBubble]}>
                                            <Text style={[styles.commentUserName, themeStyles.commentUserName]}>{comment.user.name}</Text>
                                            <Text style={[styles.commentText, themeStyles.commentText]}>{comment.content}</Text>
                                        </View>
                                    )}

                                    {imageUri && (
                                        <View style={{ marginTop: comment.content ? 8 : 0 }}>
                                            {!comment.content && (
                                                <Text style={[styles.commentUserName, themeStyles.commentUserName, { marginBottom: 4 }]}>{comment.user.name}</Text>
                                            )}
                                            <TouchableOpacity onPress={() => {
                                                const commentMedia = [{ type: 'image', url: imageUri, user: comment.user, timestamp: comment.timestamp, isPostMedia: false }];
                                                openMediaViewer(commentMedia, imageUri);
                                            }}>
                                                <ExpoImage
                                                    source={{ uri: imageUri }}
                                                    style={[styles.commentMedia, { aspectRatio: aspectRatio || 1 }]}
                                                    contentFit="cover"
                                                    transition={100}
                                                    onLoad={({ source }) => {
                                                        if (source.width && source.height) {
                                                            setImageRatios(prev => ({ ...prev, [imageUri]: source.width / source.height }));
                                                        }
                                                    }}
                                                />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    <Text style={[styles.commentTimestamp, themeStyles.commentTimestamp]}>{comment.formattedTimestamp}</Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            </ScrollView>

            {!isEditing && (
                <View style={{ borderTopColor: theme.separator, borderTopWidth: 1 }}>
                    <View style={styles.addCommentContainer}>
                        <View style={[styles.commentInputContainer, themeStyles.commentInputContainer]}>
                            <View style={styles.textInputWrapper}>
                                <TextInput
                                    style={[styles.commentInput, themeStyles.commentInput]}
                                    placeholder={"اكتب تعليقاً..."}
                                    placeholderTextColor={theme.placeholder}
                                    value={newComment}
                                    onChangeText={setNewComment}
                                    multiline
                                />
                                {selectedCommentImage && (
                                    <View style={styles.selectedImagePreview}>
                                        <ExpoImage source={{ uri: selectedCommentImage }} style={styles.previewImage} />
                                        <TouchableOpacity style={styles.removePreviewButton} onPress={() => setSelectedCommentImage(null)}>
                                            <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                            <TouchableOpacity style={styles.commentAccessoryButton} onPress={() => setIsMediaPickerVisible(true)} disabled={uploadingImage}>
                                {uploadingImage ? <ActivityIndicator size="small" color={theme.textSecondary} /> : <Ionicons name="camera-outline" size={24} color={theme.textSecondary} />}
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={handleCommentSubmit} style={styles.sendButton} disabled={!newComment.trim() && !selectedCommentImage}>
                            <Ionicons name="send" size={22} color={(!newComment.trim() && !selectedCommentImage) ? theme.textSecondary : theme.primary} />
                        </TouchableOpacity>
                    </View>
                    <Animated.View style={keyboardSpacerStyle} />
                </View>
            )}

            <Modal
                visible={isMediaPickerVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setIsMediaPickerVisible(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setIsMediaPickerVisible(false)}>
                    <View style={[styles.bottomSheetContainer, themeStyles.optionsModalContainer]}>
                        <TouchableOpacity style={styles.optionButton} onPress={() => handleAction(takePhoto)}>
                            <Ionicons name="camera-outline" size={24} color={theme.text} />
                            <Text style={[styles.optionText, { color: theme.text }]}>التقط صورة</Text>
                        </TouchableOpacity>
                        <View style={[styles.separator, { backgroundColor: theme.separator }]} />
                        <TouchableOpacity style={styles.optionButton} onPress={() => handleAction(pickMedia)}>
                            <Ionicons name="images-outline" size={24} color={theme.text} />
                            <Text style={[styles.optionText, { color: theme.text }]}>اختر من المعرض</Text>
                        </TouchableOpacity>
                        <View style={[styles.separator, { backgroundColor: theme.separator }]} />
                        <TouchableOpacity
                            style={[styles.optionButton, { marginTop: CONSTANTS.SPACING_S }]}
                            onPress={() => setIsMediaPickerVisible(false)}
                        >
                            <Text style={[styles.optionText, { color: "red", flex: 1, textAlign: 'center' }]}>إلغاء</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            {isMediaViewerVisible && (
                <Modal visible={isMediaViewerVisible} transparent={true} animationType="none" onRequestClose={closeMediaViewer}>
                    <GestureHandlerRootView style={{ flex: 1 }}>
                        <View style={[viewerStyles.modalOverlay, { backgroundColor: 'black' }]}>
                            <LinearGradient colors={['rgba(0,0,0,0.8)', 'transparent']} style={viewerStyles.headerGradient} />
                            <View style={viewerStyles.storyHeader}>
                                {selectedMediaInfo && (
                                    <View style={viewerStyles.storyUserInfo}>
                                        <ExpoImage source={{ uri: selectedMediaInfo.userAvatar }} style={viewerStyles.storyAvatar} />
                                        <View>
                                            <Text style={viewerStyles.storyUserName}>{selectedMediaInfo.userName}</Text>
                                            <Text style={viewerStyles.storyTimestamp}>{selectedMediaInfo.formattedTimestamp}</Text>
                                        </View>
                                    </View>
                                )}
                                <View style={viewerStyles.storyHeaderRight}>
                                    <TouchableOpacity onPress={handleDownload} style={viewerStyles.storyActionButton}>
                                        <Ionicons name="download-outline" size={28} color="white" />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={closeMediaViewer} style={viewerStyles.storyActionButton}>
                                        <Ionicons name="close" size={32} color="white" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <FlatList
                                data={mediaViewerItems}
                                keyExtractor={(item) => item.url}
                                horizontal
                                pagingEnabled
                                showsHorizontalScrollIndicator={false}
                                initialScrollIndex={mediaViewerStartIndex}
                                getItemLayout={(data, index) => ({ length: screenWidth, offset: screenWidth * index, index })}
                                onViewableItemsChanged={onViewableItemsChanged}
                                viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
                                scrollEnabled={isScrollEnabled}
                                renderItem={({ item, index }) => (
                                    <MediaViewerRenderer
                                        item={item}
                                        isActive={index === activeMediaIndex}
                                        setScrollEnabled={setScrollEnabled}
                                        styles={viewerStyles}
                                    />
                                )}
                            />
                        </View>
                    </GestureHandlerRootView>
                </Modal>
            )}


            <Modal transparent={true} animationType="fade" visible={downloadDialogVisible}>
                <View style={styles.downloadModalOverlay}>
                    <View style={[styles.downloadModalContainer, themeStyles.optionsModalContainer]}>
                        <Text style={[styles.downloadTitle, themeStyles.userName]}>جاري تحميل الملف...</Text>
                        <Text style={[styles.downloadFileName, themeStyles.timestamp]} numberOfLines={1}>{downloadInfo.fileName}</Text>
                        <View style={styles.progressBarContainer}>
                            <View style={[styles.progressBar, { width: `${downloadProgress * 100}%` }]} />
                        </View>
                        <Text style={[styles.downloadProgressText, themeStyles.userName]}>{`${Math.round(downloadProgress * 100)}%`}</Text>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// --- NEW HELPER COMPONENT FOR GRID ITEMS ---
const GridMediaItem = ({ item, style, onPress, children }: any) => {
    const [isLoading, setIsLoading] = useState(true);
    return (
        <TouchableOpacity style={style} onPress={() => onPress(item)}>
            <View style={styles.gridItemContainer}>
                <ExpoImage
                    source={{ uri: item.url }}
                    style={styles.gridImage}
                    contentFit="cover"
                    transition={150} // Smooth fade-in
                    onLoadStart={() => setIsLoading(true)}
                    onLoadEnd={() => setIsLoading(false)}
                />
                {isLoading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator color="#FFFFFF" size="small" />
                    </View>
                )}
                {/* Render children (like the +extraCount overlay) only when not loading */}
                {!isLoading && children}
            </View>
        </TouchableOpacity>
    );
};


// --- UPDATED POST MEDIA GRID COMPONENT ---
const PostMediaGrid = ({ media, onMediaPress }: any) => {
    if (!media || media.length === 0) return null;

    const count = media.length;

    if (count === 1) {
        return <GridMediaItem item={media[0]} style={styles.gridImageSingle} onPress={onMediaPress} />;
    }

    if (count === 2) {
        return (
            <View style={styles.gridRow}>
                <GridMediaItem item={media[0]} style={{ width: '49.8%', height: 250 }} onPress={onMediaPress} />
                <GridMediaItem item={media[1]} style={{ width: '49.8%', height: 250 }} onPress={onMediaPress} />
            </View>
        );
    }

    if (count === 3) {
        return (
            <View style={[styles.gridRow, { height: 300 }]}>
                <GridMediaItem item={media[0]} style={{ width: '66.5%', height: '100%' }} onPress={onMediaPress} />
                <View style={{ width: '33%', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <GridMediaItem item={media[1]} style={{ height: '49.5%', width: '100%' }} onPress={onMediaPress} />
                    <GridMediaItem item={media[2]} style={{ height: '49.5%', width: '100%' }} onPress={onMediaPress} />
                </View>
            </View>
        );
    }

    const visibleMedia = media.slice(0, 4);
    const extraCount = count - 4;

    return (
        <View style={styles.gridFourContainer}>
            {visibleMedia.map((item, index) => (
                <GridMediaItem key={index} item={item} style={styles.gridImageFour} onPress={onMediaPress}>
                    {index === 3 && extraCount > 0 && (
                        <View style={styles.gridOverlay}>
                            <Text style={styles.gridOverlayText}>+{extraCount}</Text>
                        </View>
                    )}
                </GridMediaItem>
            ))}
        </View>
    );
};


// --- STYLES ---
const dynamicStyles = (theme: any) => StyleSheet.create({
    container: { backgroundColor: theme.background },
    loadingContainer: { backgroundColor: theme.background, flex: 1, justifyContent: 'center', alignItems: 'center' },
    userName: { color: theme.text },
    timestamp: { color: theme.textSecondary },
    postContent: {
        color: theme.text,
    },
    postActions: { borderTopColor: theme.separator },
    actionText: { color: theme.textSecondary },
    commentBubble: { backgroundColor: theme.inputBackground },
    commentUserName: { color: theme.text },
    commentText: { color: theme.text },
    commentTimestamp: { color: theme.textSecondary },
    commentInputContainer: { backgroundColor: theme.inputBackground },
    commentInput: { color: theme.text },
    modalContainer: { backgroundColor: theme.card },
    modalHeader: { borderBottomColor: theme.separator },
    modalTitle: { color: theme.text },
    optionsModalContainer: { backgroundColor: theme.card },
});

const viewerDynamicStyles = (theme: any, insets: any) => StyleSheet.create({
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    fullscreenContainer: { width: screenWidth, height: '100%', justifyContent: 'center', alignItems: 'center' },
    zoomableMediaContent: { width: screenWidth, height: '100%' },
    headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 120, zIndex: 1 },
    storyHeader: { position: 'absolute', top: 50, left: 15, right: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 },
    storyHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    storyActionButton: { padding: 5 },
    storyUserInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, flex: 1 },
    storyAvatar: { width: 38, height: 38, borderRadius: 19 },
    storyUserName: { color: 'white', fontSize: 16, fontWeight: 'bold' },
    storyTimestamp: { color: '#E0E0E0', fontSize: 12 },
});

const styles = StyleSheet.create({
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    modalContainer: { flex: 1, writingDirection: 'rtl' },
    modalHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    postHeader: { flexDirection: 'row', alignItems: 'center', padding: 12 },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    userInfo: { marginRight: 8, flex: 1 },
    userName: { fontWeight: 'bold', fontSize: 15, textAlign: 'right' },
    timestamp: { fontSize: 12, marginTop: 2, textAlign: 'right' },
    postContent: { paddingHorizontal: 12, paddingBottom: 12, fontSize: 15, lineHeight: 22, textAlign: 'right' },
    editInput: {
        minHeight: 120,
        marginHorizontal: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#cccccc',
        borderRadius: 8,
        padding: 10,
        fontSize: 15,
        textAlignVertical: 'top',
        textAlign: 'right'
    },
    postActions: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4, paddingHorizontal: 12, borderTopWidth: 1 },
    actionButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
    actionText: { marginRight: 4, fontWeight: '500' },
    likedText: { color: '#f43f5e' },
    commentItem: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, alignItems: 'flex-start' },
    commentAvatar: { width: 32, height: 32, borderRadius: 16 },
    commentContent: { marginRight: 8, flex: 1 },
    commentBubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'flex-start' },
    commentUserName: { fontWeight: 'bold', fontSize: 13, textAlign: 'right' },
    commentText: { fontSize: 14, marginTop: 2, textAlign: 'right', lineHeight: 20 },
    commentMedia: { width: '100%', maxHeight: 300, borderRadius: 16, overflow: 'hidden' },
    commentTimestamp: { fontSize: 12, marginTop: 4, marginRight: 12, textAlign: 'right' },
    addCommentContainer: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', backgroundColor: 'transparent' },
    commentInputContainer: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', borderRadius: 22, paddingHorizontal: 8, paddingVertical: 4 },
    commentInput: { flex: 1, fontSize: 15, maxHeight: 90, paddingVertical: 4, textAlign: 'right' },
    commentAccessoryButton: { paddingHorizontal: 4 },
    sendButton: { padding: 8 },
    textInputWrapper: { flex: 1 },
    selectedImagePreview: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    previewImage: { width: 60, height: 60, borderRadius: 8 },
    removePreviewButton: { marginLeft: 8 },
    gridRow: { flexDirection: 'row', justifyContent: 'space-between', overflow: 'hidden' },
    // --- UPDATED & NEW STYLES FOR MEDIA GRID ---
    gridItemContainer: {
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.1)', // Placeholder color
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    gridImage: { height: '100%', width: '100%' },
    gridImageSingle: { width: '100%', aspectRatio: 1.2, alignSelf: 'center' },
    gridFourContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    gridImageFour: { width: '49.8%', height: Dimensions.get('window').width / 2.05, marginBottom: '0.4%' },
    // --- END UPDATED STYLES ---
    gridOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    gridOverlayText: { color: 'white', fontSize: 28, fontWeight: 'bold' },
    downloadModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
    downloadModalContainer: { width: '80%', borderRadius: 12, padding: 20, alignItems: 'center' },
    downloadTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
    downloadFileName: { fontSize: 14, marginBottom: 16, textAlign: 'center' },
    progressBarContainer: { height: 8, width: '100%', backgroundColor: '#e0e0e0', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
    progressBar: { height: '100%', backgroundColor: '#1e90ff', borderRadius: 4 },
    downloadProgressText: { fontSize: 16, fontWeight: 'bold' },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    bottomSheetContainer: {
        borderTopLeftRadius: CONSTANTS.BORDER_RADIUS_M,
        borderTopRightRadius: CONSTANTS.BORDER_RADIUS_M,
        padding: CONSTANTS.SPACING_S,
        paddingBottom: Platform.OS === 'ios' ? CONSTANTS.SPACING_L : CONSTANTS.SPACING_M,
    },
    optionButton: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        padding: CONSTANTS.SPACING_M,
        borderRadius: CONSTANTS.SPACING_S,
    },
    optionText: {
        fontSize: CONSTANTS.FONT_SIZE_BODY,
        marginRight: CONSTANTS.SPACING_M,
        fontWeight: '500',
    },
    separator: { height: 1, width: '100%' },
});