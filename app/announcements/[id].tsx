'use client';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Theme, useTheme } from '@/context/ThemeContext';
import { db } from '@/lib/firebase';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  I18nManager,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

interface Announcement {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  imageUrls?: string[];
  fileAttachments?: { name: string; url: string; type: string }[];
}

const isVideoUrl = (url?: string): boolean => {
  if (!url) return false;
  return /\.(mp4|mov|mkv|webm)$/i.test(url);
};

const { width, height } = Dimensions.get('window');
const CAROUSEL_HEIGHT = 280;

export default function AnnouncementDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = getStyles(theme);

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<any>>(null);

  const hasMedia = announcement?.imageUrls && announcement.imageUrls.length > 0;

  const onScroll = useCallback((event: any) => {
    // We use contentOffset.x and layoutMeasurement.width to calculate the current index
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    const roundedIndex = Math.round(index);
    if (roundedIndex !== currentIndex) {
      setCurrentIndex(roundedIndex);
    }
  }, [currentIndex]); // Only re-create this function if currentIndex changes.

  useEffect(() => {
    const fetchAnnouncement = async () => {
      if (typeof id !== 'string') return;

      try {
        const docRef = doc(db, 'announcements', id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          const timestamp = data.createdAt?.toDate?.().toISOString() || new Date().toISOString();
          setAnnouncement({
            id: docSnap.id,
            title: data.head || 'No Title',
            body: data.body || 'No Content',
            timestamp,
            imageUrls: data.imageUrls || [],
            fileAttachments: data.fileAttachments || [],
          });
        } else {
          Alert.alert('Error', 'Announcement not found.');
          router.back();
        }
      } catch (error) {
        console.error('Error fetching announcement:', error);
        Alert.alert('Error', 'Failed to fetch announcement details.');
      } finally {
        setLoading(false);
      }
    };

    fetchAnnouncement();
  }, [id, router]);

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  if (!announcement) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Announcement not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.outerContainer}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Media Carousel - Now part of the scrollable content */}
        {hasMedia && (
          <View style={styles.carouselContainer}>
            <FlatList
              ref={flatListRef}
              data={announcement.imageUrls}
              renderItem={({ item }) => (
                <View style={styles.slide}>
                  {isVideoUrl(item) ? (
                    <Video source={{ uri: item }} style={styles.media} resizeMode="contain" useNativeControls />
                  ) : (
                    <Image source={{ uri: item }} style={styles.media} resizeMode="contain" />
                  )}
                </View>
              )}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, index) => index.toString()}
              onScroll={onScroll}
              scrollEventThrottle={16} // Important for smooth index tracking
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            />
            {/* Pagination Dots */}
            {announcement.imageUrls && announcement.imageUrls.length > 1 && (
              <View style={styles.paginationContainer}>
                {announcement.imageUrls.map((_, index) => (
                  <View
                    key={index}
                    style={[styles.dot, currentIndex === index ? styles.activeDot : null]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Content Card */}
        <View style={[styles.contentCard, hasMedia && styles.contentCardWithMedia]}>
          <View style={styles.dateContainer}>
            <ThemedText style={styles.date}>
              {new Date(announcement.timestamp).toLocaleDateString('ar-EG-u-nu-latn', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </ThemedText>
            <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
          </View>

          <ThemedText style={styles.title}>{announcement.title}</ThemedText>
          <ThemedText style={styles.body}>{announcement.body}</ThemedText>

          {announcement.fileAttachments && announcement.fileAttachments.length > 0 && (
            <View style={styles.attachmentsContainer}>
              <ThemedText style={styles.attachmentsTitle}>اضغط على الملف ادناه للمشاهده</ThemedText>
              {announcement.fileAttachments.map((file, index) => (
                <TouchableOpacity key={index} style={styles.attachmentCard} onPress={() => Linking.openURL(file.url)}>
                  <Ionicons name="document-text-outline" size={32} color={theme.primary} />
                  <View style={styles.attachmentInfo}>
                    <ThemedText style={styles.attachmentName} numberOfLines={1}>{file.name}</ThemedText>
                    <ThemedText style={styles.attachmentType}>{file.type}</ThemedText>
                  </View>
                  <Ionicons name="download-outline" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    outerContainer: {
      flex: 1,
      backgroundColor: theme.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.background,
    },
    scrollView: {
      flex: 1,
    },
    carouselContainer: {
      height: CAROUSEL_HEIGHT,
      width: '100%',
      // Changed background to be less intrusive for letterboxing
      backgroundColor: '#000',
    },
    slide: {
      width: width,
      height: CAROUSEL_HEIGHT,
      justifyContent: 'center',
      alignItems: 'center',
    },
    media: {
      width: '100%',
      height: '100%',
    },
    paginationContainer: {
      position: 'absolute',
      bottom: 30,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: 'rgba(255, 255, 255, 0.5)',
      marginHorizontal: 4,
    },
    activeDot: {
      backgroundColor: 'white',
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    contentCard: {
      backgroundColor: theme.background,
      padding: 24,
      minHeight: height / 2,
    },
    contentCardWithMedia: {
      borderTopLeftRadius: 25,
      borderTopRightRadius: 25,
      marginTop: -20,
    },
    dateContainer: {
      flexDirection: I18nManager.isRTL ? 'row' : 'row-reverse',
      alignItems: 'center',
      alignSelf: 'flex-end',
      marginBottom: 16,
    },
    date: {
      fontSize: 14,
      color: theme.textSecondary,
      marginHorizontal: 8,
    },
    title: {
      fontSize: 30,
      fontWeight: 'bold',
      color: theme.textSecondary,
      textAlign: 'right',
      writingDirection: 'rtl',
      lineHeight: 40, // <-- MODIFIED: Ensures consistent line spacing for multi-line titles
      marginBottom: 12, // <-- MODIFIED: Increased margin for better spacing
    },
    body: {
      fontSize: 16,
      lineHeight: 28,
      color: theme.text,
      textAlign: 'right',
      writingDirection: 'rtl',
    },
    attachmentsContainer: {
      marginTop: 32,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 24,
    },
    attachmentsTitle: {
      fontSize: 20,
      fontWeight: '600',
      marginBottom: 16,
      color: theme.text,
      textAlign: 'right',
      writingDirection: 'rtl',
    },
    attachmentCard: {
      flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.card,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    attachmentInfo: {
      flex: 1,
      marginHorizontal: 12,
      alignItems: I18nManager.isRTL ? 'flex-end' : 'flex-start',
    },
    attachmentName: {
      fontSize: 16,
      fontWeight: '500',
      color: theme.text,
      textAlign: 'right',
      writingDirection: 'rtl',
    },
    attachmentType: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 2,
    },
  });