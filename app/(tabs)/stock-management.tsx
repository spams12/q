import { usePermissions } from '@/context/PermissionsContext'; // Assumes you have a PermissionsContext
import { useTheme } from '@/context/ThemeContext'; // Assumes you have a ThemeContext
// --- Firebase Native SDK Imports ---
import firestore from '@react-native-firebase/firestore';
// --- End Firebase Imports ---
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNowStrict } from 'date-fns';
import { arSA } from 'date-fns/locale';
// --- Expo AV, FileSystem, and MediaLibrary Imports ---
import * as FileSystem from 'expo-file-system';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { shareAsync } from 'expo-sharing';
// --- NEW: Expo Video Imports ---
import { VideoView, useVideoPlayer } from 'expo-video';
// --- Expo Router and React Native Imports ---
import { router } from 'expo-router';
// --- MODIFICATION START ---
// 1. Import useRef from React and useScrollToTop from @react-navigation/native
import { useScrollToTop } from '@react-navigation/native';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
// --- MODIFICATION END ---
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import 'react-native-get-random-values';
// --- MODIFICATION: Removed useSafeAreaInsets since insets are not used in the code ---
import { SafeAreaView } from 'react-native-safe-area-context';



// --- Constants ---
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const POSTS_PER_PAGE = 5; // Define the number of posts to fetch per page

// --- Helper Functions ---
const getMediaDate = (timestamp) => {
  if (!timestamp) return new Date();
  return typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
};


// --- COMPONENT: ImageWithLoader ---
const ImageWithLoader = ({ style, ...props }) => {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <View style={[style, styles.imageLoaderContainer]}>
      <Image
        {...props}
        style={StyleSheet.absoluteFill}
        onLoadEnd={() => setIsLoading(false)}
        transition={0}
      />
      {isLoading && (
        <ActivityIndicator
          style={StyleSheet.absoluteFill}
          color="#ffffff"
        />
      )}
    </View>
  );
};

// --- NEW COMPONENT: VideoWithLoader ---
const VideoWithLoader = ({ style, source, isMuted = false, resizeMode = 'cover' }) => {
  const [isLoading, setIsLoading] = useState(true);
  // Player for grid videos - should be muted and looping. Autoplay is disabled.
  // Enable video caching for better performance
  const videoSource = typeof source === 'string' ? { uri: source, useCaching: true } : { ...source, useCaching: true };
  const player = useVideoPlayer(videoSource, player => {
    player.muted = isMuted;
    player.loop = true;
    // player.play(); // AUTOPLAY DISABLED: User will not see videos play in the grid.
  });

  return (
    <View style={[style, styles.imageLoaderContainer]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={resizeMode}
        onFirstFrameRender={() => setIsLoading(false)} // Hide loader when video is ready
        nativeControls={false}
      />
      {isLoading && (
        <ActivityIndicator
          style={StyleSheet.absoluteFill}
          color="#ffffff"
        />
      )}
    </View>
  );
};


// --- Child Component: PostMediaGrid (UPDATED) ---
const PostMediaGrid = ({ media, onMediaPress }) => {
  if (!media || media.length === 0) return null;

  const renderMediaItem = (item, index, style) => (
    <TouchableOpacity key={index} style={style} onPress={() => onMediaPress(item)}>
      {item.type === 'video' ? (
        <>
          {/* --- FIX: Use VideoWithLoader --- */}
          <VideoWithLoader
            source={{ uri: item.url }}
            style={styles.gridImage}
            resizeMode="cover"
            isMuted={true}
          />
          <View style={styles.playIconOverlay}>
            <Ionicons name="play" size={48} color="rgba(255,255,255,0.8)" />
          </View>
        </>
      ) : (
        <ImageWithLoader source={{ uri: item.url }} style={styles.gridImage} contentFit="cover" />
      )}
    </TouchableOpacity>
  );

  const count = media.length;
  if (count === 1) return renderMediaItem(media[0], 0, styles.gridImageSingle);
  if (count === 2) return (
    <View style={styles.gridRow}>
      {renderMediaItem(media[0], 0, { width: '49.8%', height: 250 })}
      {renderMediaItem(media[1], 1, { width: '49.8%', height: 250 })}
    </View>
  );
  if (count === 3) return (
    <View style={[styles.gridRow, { height: 300 }]}>
      {renderMediaItem(media[0], 0, { width: '66.5%', height: '100%' })}
      <View style={{ width: '33%', flexDirection: 'column', justifyContent: 'space-between' }}>
        {renderMediaItem(media[1], 1, { height: '49.5%', width: '100%' })}
        {renderMediaItem(media[2], 2, { height: '49.5%', width: '100%' })}
      </View>
    </View>
  );

  const visibleMedia = media.slice(0, 4);
  const extraCount = count - 4;
  return (
    <View style={styles.gridFourContainer}>
      {visibleMedia.map((item, index) => (
        <TouchableOpacity key={index} style={styles.gridImageFour} onPress={() => onMediaPress(item)}>
          {item.type === 'video' ? (
            <>
              {/* --- FIX: Use VideoWithLoader --- */}
              <VideoWithLoader source={{ uri: item.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" isMuted={true} />
              <View style={styles.playIconOverlay}><Ionicons name="play" size={32} color="rgba(255,255,255,0.8)" /></View>
            </>
          ) : (
            <ImageWithLoader source={{ uri: item.url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          )}
          {index === 3 && extraCount > 0 && (
            <View style={styles.gridOverlay}><Text style={styles.gridOverlayText}>+{extraCount}</Text></View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
};


// --- Child Component: PostItem (MODIFIED) ---
const PostItem = memo(({ post, currentUser, toggleLike, onOpenPostDetail, onOpenOptionsModal, onMediaPress }) => {
  const { theme } = useTheme();
  const themeStyles = dynamicStyles(theme);
  const isOwner = currentUser?.id === post.userId;

  return (
    <View style={[styles.postContainer, themeStyles.postContainer]}>
      {/* This Pressable wraps the header and content, allowing navigation from these areas */}
      <Pressable onPress={() => onOpenPostDetail(post)}>
        <View style={styles.postHeader}>
          {isOwner && (
            // This button will capture the press and prevent the parent Pressable's onPress from firing.
            <TouchableOpacity style={styles.optionsButton} onPress={() => onOpenOptionsModal(post)}>
              <Ionicons name="ellipsis-vertical" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
          <View style={styles.userInfo}>
            <Text style={[styles.userName, themeStyles.userName]}>{post.user.name}</Text>
            <Text style={[styles.timestamp, themeStyles.timestamp]}>{post.formattedTimestamp}</Text>
          </View>
          <ImageWithLoader source={{ uri: post.user.avatar }} style={styles.avatar} />
        </View>

        {post.content && <Text style={[styles.postContent, themeStyles.postContent]}>{post.content}</Text>}
      </Pressable>

      {/* Media grid is separate, with its own press handler */}
      <PostMediaGrid media={post.media} onMediaPress={onMediaPress} />

      {/* Action buttons are separate, with their own press handlers */}
      <View style={[styles.postActions, themeStyles.postActions]}>
        <TouchableOpacity style={styles.actionButton} onPress={() => toggleLike(post.id)}>
          <Ionicons name={post.likedByUser ? "heart" : "heart-outline"} size={20} color={post.likedByUser ? "#f43f5e" : theme.textSecondary} />
          <Text style={[styles.actionText, themeStyles.actionText, post.likedByUser && styles.likedText]}>{post.likes || 0} إعجاب</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => onOpenPostDetail(post)}>
          <Ionicons name="chatbubble-outline" size={20} color={theme.textSecondary} />
          <Text style={[styles.actionText, themeStyles.actionText]}>{post.comments.length} تعليق</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});


// --- REFACTORED COMPONENT: MediaViewerRenderer for Images and Videos ---
// Removed: zoom in/zoom out and all gestures
const MediaViewerRenderer = ({ item, isActive, styles }) => {
  const [isLoading, setIsLoading] = useState(true);

  // --- Video specific player ---
  const source = item.type === 'video' ? { uri: item.url, useCaching: true } : null;
  const player = useVideoPlayer(source, player => {
    player.loop = true;
  });

  // --- Effects ---
  useEffect(() => {
    setIsLoading(true); // Show loader for new item
  }, [item.url]);

  // Effect to control video playback based on active state
  useEffect(() => {
    if (item.type === 'video' && player) {
      if (isActive) {
        // player.play(); // AUTOPLAY DISABLED: User will use native controls to play the video.
      } else {
        player.pause();
        // player.seekTo(0); // Rewind video when swiping away
      }
    }
  }, [isActive, player, item.type]);

  // --- Conditional Rendering ---
  if (item.type === 'video') {
    return (
      <View style={styles.fullscreenContainer}>
        <VideoView
          player={player}
          style={styles.zoomableMediaContent}
          contentFit="contain"
          nativeControls // Allow user control in fullscreen
          onFirstFrameRender={() => setIsLoading(false)}
        />
        {isLoading && (
          <ActivityIndicator style={StyleSheet.absoluteFill} color="#ffffff" size="large" />
        )}
      </View>
    );
  }

  return (
    <View style={styles.fullscreenContainer}>
      <Image
        source={{ uri: item.url }}
        style={styles.zoomableMediaContent}
        contentFit="contain"
        transition={0}
        onLoadEnd={() => setIsLoading(false)}
      />
      {isLoading && (
        <ActivityIndicator style={StyleSheet.absoluteFill} color="#ffffff" size="large" />
      )}
    </View>
  );
};


// --- Main Screen Component: FacebookClone ---
const FacebookClone = () => {
  // --- Hooks ---
  const { theme } = useTheme();
  const { userdoc } = usePermissions();

  // --- MODIFICATION START ---
  // 2. Create a ref for the FlatList.
  const flatListRef = useRef(null);
  // 3. Apply the useScrollToTop hook to the ref.
  useScrollToTop(flatListRef);
  // --- MODIFICATION END ---


  // --- Themed Styles ---
  const themeStyles = dynamicStyles(theme);
  const viewerStyles = viewerDynamicStyles(theme);

  // --- State Management ---
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState({});
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // --- NEW: Pagination State ---
  const [lastVisible, setLastVisible] = useState(null); // Stores the last fetched document
  const [loadingMore, setLoadingMore] = useState(false); // True when fetching more posts
  const [allPostsLoaded, setAllPostsLoaded] = useState(false); // True if no more posts to fetch

  // Modals and Viewers
  const [isOptionsModalVisible, setIsOptionsModalVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [isMediaViewerVisible, setIsMediaViewerVisible] = useState(false);
  const [mediaViewerItems, setMediaViewerItems] = useState([]);
  const [mediaViewerStartIndex, setMediaViewerStartIndex] = useState(0);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [selectedMediaInfo, setSelectedMediaInfo] = useState(null);

  // Download State
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadInfo, setDownloadInfo] = useState({ fileName: '', totalSize: 0 });
  const [downloadDialogVisible, setDownloadDialogVisible] = useState(false);

  // --- Functions ---
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return formatDistanceToNowStrict(date, { addSuffix: true, locale: arSA });
  };

  const processPosts = (snapshot, existingUsers) => {
    return snapshot.docs.map(doc => {
      const postData = doc.data();
      const postUser = existingUsers[postData.userId] || { name: 'مستخدم', avatar: 'https://via.placeholder.com/100' };
      return {
        id: doc.id,
        ...postData,
        user: { name: postUser.name, avatar: postUser.photoURL },
        media: postData.media || [],
        likedByUser: postData.likedBy?.includes(currentUser?.id),
        formattedTimestamp: formatTimestamp(postData.timestamp),
        comments: postData.comments || []
      };
    });
  };

  // --- NEW: Function to fetch more posts ---
  const fetchMorePosts = async () => {
    if (loadingMore || allPostsLoaded || !lastVisible) return;

    setLoadingMore(true);
    try {
      const postsQuery = firestore()
        .collection('posts')
        .orderBy('timestamp', 'desc')
        .startAfter(lastVisible)
        .limit(POSTS_PER_PAGE);

      const documentSnapshots = await postsQuery.get();

      if (!documentSnapshots.empty) {
        const newPosts = processPosts(documentSnapshots, users);
        setPosts(prevPosts => [...prevPosts, ...newPosts]);
        const lastVisibleDoc = documentSnapshots.docs[documentSnapshots.docs.length - 1];
        setLastVisible(lastVisibleDoc);
        if (documentSnapshots.docs.length < POSTS_PER_PAGE) {
          setAllPostsLoaded(true);
        }
      } else {
        setAllPostsLoaded(true);
      }
    } catch (error) {
      console.error("Error fetching more posts: ", error);
    } finally {
      setLoadingMore(false);
    }
  };


  // --- Media Viewer Logic ---
  const openMediaViewer = (post, initialMediaItem) => {
    const allMedia = post.media.map(item => ({
      ...item,
      user: post.user,
      timestamp: post.timestamp,
    }));
    const startIndex = allMedia.findIndex(media => media.url === initialMediaItem.url);
    if (startIndex === -1) return;
    setMediaViewerItems(allMedia);
    setMediaViewerStartIndex(startIndex);
    setActiveMediaIndex(startIndex);
    setIsMediaViewerVisible(true);
  };

  const closeMediaViewer = () => {
    setIsMediaViewerVisible(false);
  };

  // --- Download and Save Logic (Unchanged) ---
  const saveToGallery = async (fileUri) => {
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
      Alert.alert('خطأ', 'حدث خطأ أثناء حفظ الملف في المعرض.');
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

    const progressCallback = (progress) => {
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


  // --- Effects ---
  useEffect(() => {
    if (isMediaViewerVisible) {
      const currentItem = mediaViewerItems[activeMediaIndex];
      if (currentItem) {
        const mediaDate = getMediaDate(currentItem.timestamp);
        setSelectedMediaInfo({
          userName: currentItem.user.name || 'مستخدم',
          userAvatar: currentItem.user.avatar,
          formattedTimestamp: formatDistanceToNowStrict(mediaDate, { addSuffix: true, locale: arSA }),
        });
      }
    } else {
      setSelectedMediaInfo(null);
    }
  }, [isMediaViewerVisible, activeMediaIndex, mediaViewerItems]);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index;
      setActiveMediaIndex(newIndex);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setAllPostsLoaded(false); // Reset pagination on refresh
    try {
      const usersSnapshot = await firestore().collection('users').get();
      const usersData = {};
      usersSnapshot.forEach(doc => {
        usersData[doc.data().uid] = doc.data();
      });
      setUsers(usersData);

      // Fetch first page of posts again
      const postsQuery = firestore()
        .collection('posts')
        .orderBy('timestamp', 'desc')
        .limit(POSTS_PER_PAGE);
      const documentSnapshots = await postsQuery.get();

      if (!documentSnapshots.empty) {
        const newPosts = processPosts(documentSnapshots, usersData);
        setPosts(newPosts);
        const lastVisibleDoc = documentSnapshots.docs[documentSnapshots.docs.length - 1];
        setLastVisible(lastVisibleDoc);
      } else {
        setPosts([]);
        setAllPostsLoaded(true);
      }

    } catch (error) {
      console.error("Error on refresh:", error);
    } finally {
      setRefreshing(false);
    }
  }, []);


  useEffect(() => {
    if (userdoc) {
      setCurrentUser({ id: userdoc.uid, name: userdoc.name || 'مستخدم', avatar: userdoc.photoURL || 'https://via.placeholder.com/100' });
    }
  }, [userdoc]);

  useEffect(() => {
    const fetchInitialData = async () => {
      if (!currentUser) return;

      setLoading(true);
      try {
        // Fetch users first
        const usersSnapshot = await firestore().collection('users').get();
        const usersData = {};
        usersSnapshot.forEach(doc => {
          usersData[doc.data().uid] = doc.data();
        });
        setUsers(usersData);

        // Then fetch the first page of posts
        const postsQuery = firestore()
          .collection('posts')
          .orderBy('timestamp', 'desc')
          .limit(POSTS_PER_PAGE);

        const documentSnapshots = await postsQuery.get();

        if (!documentSnapshots.empty) {
          const initialPosts = processPosts(documentSnapshots, usersData);
          setPosts(initialPosts);
          const lastVisibleDoc = documentSnapshots.docs[documentSnapshots.docs.length - 1];
          setLastVisible(lastVisibleDoc);
          if (documentSnapshots.docs.length < POSTS_PER_PAGE) {
            setAllPostsLoaded(true);
          }
        } else {
          setAllPostsLoaded(true);
        }
      } catch (error) {
        console.error('Error fetching initial posts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [currentUser]);


  // --- Actions and Handlers (Unchanged) ---
  const toggleLike = useCallback(async (postId) => {
    if (!currentUser?.id || !postId) {
      console.log('User or Post ID is missing.');
      return;
    }

    // Optimistically update UI
    setPosts(prevPosts =>
      prevPosts.map(p => {
        if (p.id === postId) {
          return {
            ...p,
            likedByUser: !p.likedByUser,
            likes: p.likedByUser ? p.likes - 1 : p.likes + 1,
          };
        }
        return p;
      })
    );


    const postRef = firestore().collection('posts').doc(postId);

    try {
      const post = posts.find(p => p.id === postId);
      if (post.likedByUser) { // This is the state BEFORE the optimistic update
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
    } catch (error) {
      console.error("Error toggling like in Firestore:", error);
      Alert.alert('خطأ', 'لم نتمكن من تحديث الإعجاب. حاول مرة أخرى.');
      // Revert optimistic update on error
      setPosts(prevPosts =>
        prevPosts.map(p => {
          if (p.id === postId) {
            return {
              ...p,
              likedByUser: !p.likedByUser,
              likes: p.likedByUser ? p.likes + 1 : p.likes - 1,
            };
          }
          return p;
        })
      );
    }
  }, [currentUser, posts]);


  const handleOpenOptions = (post) => {
    setSelectedPost(post);
    setIsOptionsModalVisible(true);
  };

  const handleDeletePost = () => {
    if (!selectedPost) return;
    Alert.alert("حذف المنشور", "هل أنت متأكد أنك تريد حذف هذا المنشور؟", [
      { text: "إلغاء", style: "cancel", onPress: () => setIsOptionsModalVisible(false) },
      {
        text: "حذف", style: "destructive", onPress: async () => {
          try {
            await firestore().collection('posts').doc(selectedPost.id).delete();
            setPosts(posts.filter(p => p.id !== selectedPost.id)); // Remove from UI
            setIsOptionsModalVisible(false);
            setSelectedPost(null);
          } catch (error) {
            console.error("Error deleting post: ", error);
            Alert.alert('خطأ', 'فشل في حذف المنشور.');
          }
        },
      },
    ]);
  };

  const handleEditPost = () => {
    if (!selectedPost) return;
    setIsOptionsModalVisible(false);
    router.push({ pathname: '/post-detail', params: { postId: selectedPost.id, editing: 'true' } });
  };

  const handleNavigateToCreatePost = () => router.push('/create-post');
  const handleNavigateToPostDetail = (post) => router.push({ pathname: '/post-detail', params: { postId: post.id } });

  // --- NEW: Render Functions for FlatList ---
  const renderPost = ({ item }) => (
    <PostItem
      post={item}
      currentUser={currentUser}
      toggleLike={toggleLike}
      onOpenPostDetail={handleNavigateToPostDetail}
      onOpenOptionsModal={handleOpenOptions}
      onMediaPress={(mediaItem) => openMediaViewer(item, mediaItem)}
    />
  );

  const ListHeader = () => (
    <View style={[styles.createPostContainer, themeStyles.createPostContainer]}>
      <View style={styles.createPostHeader}>
        <ImageWithLoader source={{ uri: currentUser.avatar }} style={styles.avatar} />
        <TouchableOpacity style={[styles.createPostInput, themeStyles.createPostInput]} onPress={handleNavigateToCreatePost}>
          <Text style={[styles.createPostPlaceholder, themeStyles.createPostPlaceholder]}>بماذا تفكر يا {currentUser.name}؟</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.createPostActions, themeStyles.createPostActions]}>
        <TouchableOpacity style={styles.createAction} onPress={handleNavigateToCreatePost} >
          <Ionicons name="images" size={20} color="#45bd62" />
          <Text style={[styles.createActionText, themeStyles.createActionText]}>صورة/فيديو</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const ListFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={{ paddingVertical: 20 }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  };

  // --- Render ---
  if (loading) {
    return (
      <SafeAreaView edges={[]} style={[styles.loadingContainer, themeStyles.loadingContainer]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={[]} style={[styles.container, themeStyles.container]}>
      {/* --- Main Feed --- */}
      <FlatList
        // --- MODIFICATION START ---
        // 4. Assign the ref to the FlatList.
        ref={flatListRef}
        // --- MODIFICATION END ---
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        style={styles.content}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        onEndReached={fetchMorePosts}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} tintColor={theme.primary} />}
      />


      {/* --- Media Viewer Modal --- */}
      {isMediaViewerVisible && (
        <Modal visible={isMediaViewerVisible} transparent={true} animationType="none" onRequestClose={closeMediaViewer}>
          <View style={{ flex: 1 }}>
            <View style={[viewerStyles.modalOverlay, { backgroundColor: 'black' }]}>
              <View style={{ flex: 1 }}>
                <LinearGradient colors={['rgba(0,0,0,0.8)', 'transparent']} style={viewerStyles.headerGradient} />
                <View style={viewerStyles.storyHeader}>
                  {selectedMediaInfo && (
                    <View style={viewerStyles.storyUserInfo}>
                      <ImageWithLoader source={{ uri: selectedMediaInfo.userAvatar }} style={viewerStyles.storyAvatar} />
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
                  snapToInterval={screenWidth}
                  snapToAlignment="start"
                  decelerationRate="fast"
                  renderItem={({ item, index }) => (
                    <MediaViewerRenderer
                      item={item}
                      isActive={index === activeMediaIndex}
                      styles={viewerStyles}
                    />
                  )}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* --- Download Progress Modal --- */}
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


      {/* --- Post Options Modal --- */}
      <Modal animationType="slide" transparent={true} visible={isOptionsModalVisible} onRequestClose={() => setIsOptionsModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsOptionsModalVisible(false)}>
          <SafeAreaView edges={[]} style={styles.optionsModalSafeArea}>
            <View style={[styles.optionsModalContainer, themeStyles.optionsModalContainer]}>
              <TouchableOpacity style={styles.optionButton} onPress={handleEditPost}>
                <Ionicons name="create-outline" size={24} color={theme.text} />
                <Text style={[styles.optionButtonText, { color: theme.text }]}>تعديل المنشور</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.optionButton, { borderTopWidth: 1, borderTopColor: theme.separator }]} onPress={handleDeletePost}>
                <Ionicons name="trash-outline" size={24} color={'#f43f5e'} />
                <Text style={[styles.optionButtonText, { color: '#f43f5e' }]}>حذف المنشور</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.optionsModalContainer, { marginTop: 8, backgroundColor: theme.card }]}>
              <TouchableOpacity style={styles.optionButton} onPress={() => setIsOptionsModalVisible(false)}>
                <Text style={[styles.optionButtonText, { color: theme.text, fontWeight: 'bold', textAlign: 'center' }]}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Pressable>
      </Modal>
    </SafeAreaView >
  );
};

export default FacebookClone;

// --- STYLES ---

// Dynamic styles that change with the app's theme
const dynamicStyles = (theme) => StyleSheet.create({
  container: { backgroundColor: theme.background },
  loadingContainer: { backgroundColor: theme.background },
  createPostContainer: { backgroundColor: theme.card, shadowColor: theme.shadow },
  createPostInput: { backgroundColor: theme.inputBackground },
  createPostPlaceholder: { color: theme.placeholder },
  createPostActions: { borderTopColor: theme.separator },
  createActionText: { color: theme.textSecondary },
  postContainer: { backgroundColor: theme.card, shadowColor: theme.shadow },
  userName: { color: theme.text },
  timestamp: { color: theme.textSecondary },
  postContent: { color: theme.text },
  postActions: { borderTopColor: theme.separator },
  actionText: { color: theme.textSecondary },
  optionsModalContainer: { backgroundColor: theme.card },
});

// Static styles that do not depend on the theme
const styles = StyleSheet.create({
  container: { flex: 1, writingDirection: 'rtl' },
  content: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  createPostContainer: { margin: 8, borderRadius: 8, padding: 12, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  createPostHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  createPostInput: { flex: 1, marginRight: 8, padding: 12, borderRadius: 24 },
  createPostPlaceholder: { fontSize: 16, textAlign: 'right' },
  createPostActions: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 12, borderTopWidth: 1 },
  createAction: { flexDirection: 'row', alignItems: 'center' },
  createActionText: { marginRight: 4, fontWeight: '500' },
  postContainer: { marginHorizontal: 8, marginTop: 8, borderRadius: 8, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2, paddingBottom: 0 },
  postHeader: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  userInfo: { marginRight: 8, flex: 1 },
  userName: { fontWeight: 'bold', fontSize: 15, textAlign: 'right' },
  timestamp: { fontSize: 12, marginTop: 2, textAlign: 'right' },
  optionsButton: { padding: 8, marginRight: -8 },
  postContent: { paddingHorizontal: 12, paddingBottom: 12, fontSize: 15, lineHeight: 22, textAlign: 'right' },
  postActions: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4, paddingHorizontal: 12, borderTopWidth: 1, marginTop: 8 },
  actionButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  actionText: { marginRight: 4, fontWeight: '500' },
  likedText: { color: '#f43f5e' },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  optionsModalSafeArea: { marginHorizontal: 8, paddingBottom: 8 },
  optionsModalContainer: { borderRadius: 12, overflow: 'hidden' },
  optionButton: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, justifyContent: 'flex-start' },
  optionButtonText: { fontSize: 16, marginRight: 16, textAlign: 'right', flex: 1 },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between', overflow: 'hidden' },
  gridImage: { height: '100%', width: '100%', backgroundColor: 'black' },
  gridImageSingle: { width: '100%', aspectRatio: 1.2, alignSelf: 'center', backgroundColor: 'black' },
  gridFourContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridImageFour: { width: '49.8%', height: Dimensions.get('window').width / 2.05, marginBottom: '0.4%', backgroundColor: 'black' },
  gridOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  gridOverlayText: { color: 'white', fontSize: 28, fontWeight: 'bold' },
  playIconOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  downloadModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  downloadModalContainer: { width: '80%', borderRadius: 12, padding: 20, alignItems: 'center' },
  downloadTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  downloadFileName: { fontSize: 14, marginBottom: 16, textAlign: 'center' },
  progressBarContainer: { height: 8, width: '100%', backgroundColor: '#e0e0e0', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBar: { height: '100%', backgroundColor: '#1e90ff', borderRadius: 4 },
  downloadProgressText: { fontSize: 16, fontWeight: 'bold' },
  imageLoaderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
    overflow: 'hidden',
  },
});

// Dynamic styles for the media viewer modal
const viewerDynamicStyles = (theme) => StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fullscreenContainer: { width: screenWidth, height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: 'black' },
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