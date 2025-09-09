import { usePermissions } from '@/context/PermissionsContext';
import { useTheme } from '@/context/ThemeContext';
// --- Firebase Native SDK Imports ---
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
// --- End Firebase Imports ---
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    LayoutAnimation,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- Enable LayoutAnimation on Android ---
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// --- CONSTANTS for consistent design (8pt grid system) ---
const CONSTANTS = {
    SPACING_S: 8,
    SPACING_M: 16,
    SPACING_L: 24,
    BORDER_RADIUS_S: 8,
    BORDER_RADIUS_M: 16,
    TOUCH_TARGET_SIZE: 44,
    FONT_SIZE_BODY: 16,
    FONT_SIZE_TITLE: 20,
    FONT_SIZE_INPUT: 18,
};

// --- Define the shape of our media state object ---
interface MediaAsset {
    id: string;
    localUri: string;
    type: 'image' | 'video';
    remoteUrl?: string;
    status: 'uploading' | 'success' | 'error' | 'queued';
    progress: number;
}

// --- Main Component ---
export default function CreatePostScreen() {
    const { theme } = useTheme();
    const { userdoc } = usePermissions();
    const currentUser = {
        id: userdoc?.uid,
        name: userdoc?.name || 'مستخدم',
        avatar: userdoc?.photoURL || 'https://via.placeholder.com/100',
    };

    const themeStyles = dynamicStyles(theme);

    const [postContent, setPostContent] = useState('');
    const [selectedMedia, setSelectedMedia] = useState<MediaAsset[]>([]);
    const [isPosting, setIsPosting] = useState(false);
    const [isMediaPickerVisible, setIsMediaPickerVisible] = useState(false);
    const [isInputFocused, setIsInputFocused] = useState(true);

    const isUploading = selectedMedia.some(media => media.status === 'uploading');
    const canPost = (postContent.trim().length > 0 || selectedMedia.some(media => media.status === 'success')) && !isUploading && !isPosting;

    // --- Upload Logic with Progress Tracking ---
    const uploadToFirebase = async (mediaAsset: MediaAsset) => {
        const { localUri, id } = mediaAsset;

        // 1. Get the file extension from the localUri
        const fileExtension = localUri.split('.').pop();

        // 2. Create a unique filename with the extension
        const filename = `posts/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;

        const storageRef = storage().ref(filename);
        const task = storageRef.putFile(localUri);

        task.on('state_changed', snapshot => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            updateMediaState(id, { progress, status: 'uploading' });
        });

        try {
            await task;
            const downloadURL = await storageRef.getDownloadURL();
            updateMediaState(id, { remoteUrl: downloadURL, status: 'success', progress: 100 });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // Now this will work as expected
            const extractedExtension = downloadURL.split('.').pop()?.split('?')[0] || 'tmp';
            console.log('Successfully extracted extension:', extractedExtension); // e.g., 'jpg', 'mp4'

        } catch (error) {
            console.error('Upload Error:', error);
            updateMediaState(id, { status: 'error', progress: 0 });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    };

    // --- State update helper for immutability ---
    const updateMediaState = (id: string, updates: Partial<MediaAsset>) => {
        setSelectedMedia(currentMedia =>
            currentMedia.map(media => (media.id === id ? { ...media, ...updates } : media))
        );
    };

    // --- Effect to trigger uploads for queued media ---
    useEffect(() => {
        const queuedMedia = selectedMedia.filter(media => media.status === 'queued');
        if (queuedMedia.length > 0) {
            queuedMedia.forEach(uploadToFirebase);
        }
    }, [selectedMedia]);

    const handleMediaSelection = (result: ImagePicker.ImagePickerResult) => {
        if (!result.canceled && result.assets) {
            const newAssets: MediaAsset[] = result.assets.map(asset => ({
                id: asset.assetId || `${Date.now()}-${Math.random()}`,
                localUri: asset.uri,
                type: asset.type === 'video' ? 'video' : 'image',
                status: 'queued',
                progress: 0,
            }));
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setSelectedMedia(prev => [...prev, ...newAssets]);
        }
    };

    const pickMedia = async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('الإذن مطلوب', 'مطلوب إذن للوصول إلى مكتبة الوسائط!');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            allowsMultipleSelection: true,
            quality: 0.8,
            videoQuality: Platform.OS === 'ios' ? ImagePicker.UIImagePickerControllerQualityType.Medium : undefined,
        });
        handleMediaSelection(result);
    };

    const takeMedia = async (type: 'photo' | 'video') => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('الإذن مطلوب', 'مطلوب إذن للوصول إلى الكاميرا!');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: type === 'photo' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
            quality: 0.8,
        });
        handleMediaSelection(result);
    };


    const removeMedia = (id: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSelectedMedia(prev => prev.filter(media => media.id !== id));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    const retryUpload = (id: string) => {
        const mediaToRetry = selectedMedia.find(media => media.id === id);
        if (mediaToRetry) {
            updateMediaState(id, { status: 'queued', progress: 0 });
        }
    };

    const createPost = async () => {
        if (!canPost || !currentUser?.id) return;

        setIsPosting(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        const successfulMedia = selectedMedia
            .filter(media => media.status === 'success' && media.remoteUrl)
            .map(media => ({
                url: media.remoteUrl!,
                type: media.type,
            }));

        try {
            await firestore().collection('posts').add({
                userId: currentUser.id,
                content: postContent,
                media: successfulMedia,
                timestamp: firestore.FieldValue.serverTimestamp(),
                likes: 0,
                likedBy: [],
                comments: [],
            });
            router.back();
        } catch (error) {
            console.error("Error creating post: ", error);
            Alert.alert('خطأ', 'لم يتمكن من إنشاء المنشور. الرجاء المحاولة مرة أخرى.');
        } finally {
            setIsPosting(false);
        }
    };

    // --- UI Handlers ---
    const handleAction = (action: () => void) => {
        setIsMediaPickerVisible(false);
        setTimeout(action, 300); // Allow modal to close smoothly
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const renderMediaThumbnail = useCallback(({ item }: { item: MediaAsset }) => (
        <MediaThumbnail
            asset={item}
            onRemove={() => removeMedia(item.id)}
            onRetry={() => retryUpload(item.id)}
        />
    ), []);

    return (
        <SafeAreaView style={[styles.container, themeStyles.container]}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -50}
            >
                {/* --- HEADER --- */}
                <View style={[styles.header, themeStyles.header]}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={styles.closeButton}
                        accessibilityLabel="Close post creator"
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="close" size={28} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, themeStyles.headerTitle]}>إنشاء منشور</Text>
                    <TouchableOpacity
                        onPress={createPost}
                        style={[styles.postButton, { backgroundColor: theme.primary }, !canPost && styles.disabledButton]}
                        disabled={!canPost}
                        accessibilityLabel="Publish post"
                    >
                        {isPosting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.postButtonText}>نشر</Text>}
                    </TouchableOpacity>
                </View>

                {/* --- CONTENT --- */}
                <View style={styles.content}>
                    <View style={styles.userInfo}>
                        <Image source={{ uri: currentUser.avatar }} style={styles.avatar} />
                        <Text style={[styles.userName, themeStyles.userName]}>{currentUser.name}</Text>
                    </View>
                    <TextInput
                        style={[
                            styles.textInput,
                            themeStyles.textInput,
                            isInputFocused && { borderColor: theme.primary },
                        ]}
                        placeholder={`بماذا تفكر يا ${currentUser.name}؟`}
                        placeholderTextColor={theme.placeholder}
                        multiline
                        value={postContent}
                        onChangeText={setPostContent}
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={() => setIsInputFocused(false)}
                        autoFocus={true}
                    />

                    {/* --- ACTIONS --- */}
                    <View style={[styles.actionsContainer, themeStyles.actionsContainer]}>
                        <TouchableOpacity
                            style={[styles.mediaButton, themeStyles.mediaButton]}
                            onPress={() => {
                                setIsMediaPickerVisible(true);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            }}
                            accessibilityLabel="Add photos or videos"
                        >
                            <Ionicons name="images" size={24} color="#45bd62" />
                            <Text style={[styles.mediaButtonText, themeStyles.mediaButtonText]}>صورة/فيديو</Text>
                        </TouchableOpacity>
                    </View>


                    {/* --- MEDIA GRID --- */}
                    <FlatList
                        data={selectedMedia}
                        renderItem={renderMediaThumbnail}
                        keyExtractor={item => item.id}
                        numColumns={3}
                        contentContainerStyle={styles.gridContainer}
                        showsVerticalScrollIndicator={false}
                    />
                </View>

            </KeyboardAvoidingView>

            {/* --- MEDIA PICKER MODAL (Bottom Sheet Style) --- */}
            <Modal visible={isMediaPickerVisible} animationType="fade" transparent={true} onRequestClose={() => setIsMediaPickerVisible(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setIsMediaPickerVisible(false)}>
                    <View style={[styles.bottomSheetContainer, themeStyles.bottomSheetContainer]}>
                        <TouchableOpacity style={styles.optionButton} onPress={() => handleAction(() => takeMedia('photo'))}>
                            <Ionicons name="camera-outline" size={24} color={theme.text} />
                            <Text style={[styles.optionText, { color: theme.text }]}>التقط صورة</Text>
                        </TouchableOpacity>
                        <View style={[styles.separator, { backgroundColor: theme.separator }]} />
                        <TouchableOpacity style={styles.optionButton} onPress={() => handleAction(() => takeMedia('video'))}>
                            <Ionicons name="videocam-outline" size={24} color={theme.text} />
                            <Text style={[styles.optionText, { color: theme.text }]}>تسجيل فيديو</Text>
                        </TouchableOpacity>
                        <View style={[styles.separator, { backgroundColor: theme.separator }]} />
                        <TouchableOpacity style={styles.optionButton} onPress={() => handleAction(pickMedia)}>
                            <Ionicons name="images-outline" size={24} color={theme.text} />
                            <Text style={[styles.optionText, { color: theme.text }]}>اختر من المكتبة</Text>
                        </TouchableOpacity>
                        <View style={[styles.separator, { backgroundColor: theme.separator }]} />
                        <TouchableOpacity style={[styles.optionButton, { marginTop: CONSTANTS.SPACING_S }]} onPress={() => setIsMediaPickerVisible(false)}>
                            <Text style={[styles.optionText, { color: "red", flex: 1, textAlign: 'center' }]}>إلغاء</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

// --- Sub-components for better organization ---
const MediaThumbnail = ({ asset, onRemove, onRetry }: { asset: MediaAsset, onRemove: () => void, onRetry: () => void }) => {
    const { theme } = useTheme();
    return (
        <View style={styles.imageWrapper}>
            <Image source={{ uri: asset.localUri }} style={styles.image} contentFit="cover" />

            {asset.type === 'video' && (
                <View style={styles.videoIconOverlay}>
                    <Ionicons name="play" size={24} color="white" />
                </View>
            )}

            {(asset.status === 'uploading' || asset.status === 'error') && (
                <View style={styles.imageOverlay}>
                    {asset.status === 'uploading' && (
                        <View>
                            <ActivityIndicator color="#fff" />
                            <Text style={styles.progressText}>{`${Math.round(asset.progress)}%`}</Text>
                        </View>
                    )}
                    {asset.status === 'error' && (
                        <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
                            <Ionicons name="refresh" size={24} color="#fff" />
                            <Text style={styles.progressText}>فشل</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            <TouchableOpacity onPress={onRemove} style={styles.removeButton} accessibilityLabel="Remove image">
                <Ionicons name="close-circle" size={24} color={theme.background} style={styles.removeIcon} />
            </TouchableOpacity>
        </View>
    );
};

// --- STYLES ---
const dynamicStyles = (theme: any) => StyleSheet.create({
    container: { backgroundColor: theme.background },
    header: { borderBottomColor: theme.separator },
    headerTitle: { color: theme.text },
    userName: { color: theme.text },
    textInput: { color: theme.text, borderColor: theme.separator },
    actionsContainer: { backgroundColor: theme.background },
    mediaButton: { backgroundColor: theme.inputBackground },
    mediaButtonText: { color: theme.text },
    bottomSheetContainer: { backgroundColor: theme.card },
});

const styles = StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1 },
    header: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: CONSTANTS.SPACING_M,
        paddingVertical: CONSTANTS.SPACING_S,
        borderBottomWidth: 1,
    },
    headerTitle: { fontSize: CONSTANTS.FONT_SIZE_TITLE, fontWeight: 'bold' },
    closeButton: {
        width: CONSTANTS.TOUCH_TARGET_SIZE,
        height: CONSTANTS.TOUCH_TARGET_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
    },
    postButton: { paddingHorizontal: CONSTANTS.SPACING_M, paddingVertical: CONSTANTS.SPACING_S, borderRadius: CONSTANTS.BORDER_RADIUS_M },
    disabledButton: { opacity: 0.5 },
    postButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    content: { flex: 1, padding: CONSTANTS.SPACING_M },
    userInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: CONSTANTS.SPACING_M, gap: 8 },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    userName: { marginRight: CONSTANTS.SPACING_S, fontWeight: 'bold', fontSize: CONSTANTS.FONT_SIZE_BODY },
    textInput: {
        fontSize: CONSTANTS.FONT_SIZE_INPUT,
        textAlignVertical: 'top',
        minHeight: 120,
        textAlign: 'right',
        padding: CONSTANTS.SPACING_S,
        borderWidth: 1,
        borderRadius: CONSTANTS.BORDER_RADIUS_S,
    },
    gridContainer: { paddingTop: CONSTANTS.SPACING_M },
    imageWrapper: {
        position: 'relative',
        width: '32%',
        margin: '0.66%',
        aspectRatio: 1,
        borderRadius: CONSTANTS.BORDER_RADIUS_S,
        overflow: 'hidden',
        backgroundColor: '#e0e0e0',
    },
    image: { width: '100%', height: '100%' },
    removeButton: {
        position: 'absolute',
        top: 4,
        left: 4,
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    removeIcon: { opacity: 0.9 },
    imageOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoIconOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)'
    },
    progressText: {
        color: '#fff',
        fontWeight: 'bold',
        marginTop: 4,
        fontSize: 12,
    },
    retryButton: { justifyContent: 'center', alignItems: 'center' },
    actionsContainer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingVertical: CONSTANTS.SPACING_S,
        marginTop: CONSTANTS.SPACING_S,
    },
    mediaButton: { flexDirection: 'row', alignItems: 'center', padding: CONSTANTS.SPACING_S, borderRadius: CONSTANTS.BORDER_RADIUS_S },
    mediaButtonText: { marginRight: CONSTANTS.SPACING_S, fontWeight: '500' },
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
        borderRadius: CONSTANTS.BORDER_RADIUS_S,
    },
    optionText: {
        fontSize: CONSTANTS.FONT_SIZE_BODY,
        marginRight: CONSTANTS.SPACING_M,
        fontWeight: '500',
    },
    separator: { height: 1, width: '100%' },
});