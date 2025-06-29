// src/components/InfoCard.tsx

import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Timestamp } from 'firebase/firestore';
import React, { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewToken } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { getStatusBadgeColor } from '../lib/styles';
import { ServiceRequest } from '../lib/types';

interface InfoCardProps {
  item: ServiceRequest;
  viewableItems?: Animated.SharedValue<ViewToken[]>;
  hasResponded?: boolean;
  showActions?: boolean;
  handleAcceptTask?: (ticketId: string) => void;
  handleRejectTask?: (ticketId: string) => void;
  isActionLoading?: boolean;
}

const InfoCard: React.FC<InfoCardProps> = React.memo(({
  item,
  viewableItems,
  hasResponded,
  handleAcceptTask,
  handleRejectTask,
  showActions = true,
  isActionLoading = false
}) => {
  const router = useRouter();
  const { theme } = useTheme();

  const handleNavigate = () => {
    console.log('Navigating to task details:', item.id);
    router.push({
      pathname: "/tasks/[id]",
      params: {
        id: item.id,
        showActions: showActions
      }
    });
  };

  const formatTimestamp = useCallback((timestamp: Timestamp | string | undefined) => {
    if (!timestamp) return 'N/A';
    const date = (timestamp as Timestamp).toDate ? (timestamp as Timestamp).toDate() : new Date(timestamp as string);
    return date.toLocaleString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }, []);

  const getTypePillStyle = useCallback((type: string) => {
    switch (type?.toLowerCase()) {
      case 'request':
      case 'طلب':
        return { backgroundColor: theme.statusDefault, borderColor: theme.primary };
      case 'complaint':
      case 'شكوى':
        return { backgroundColor: theme.redTint, borderWidth: 1, borderColor: theme.destructive };
      case 'suggestion':
      case 'اقتراح':
        return { backgroundColor: theme.lightGray, borderWidth: 1, borderColor: theme.success };
      default:
        return { backgroundColor: theme.statusDefault };
    }
  }, [theme]);

  const getTypePillTextStyle = useCallback((type: string) => {
    switch (type?.toLowerCase()) {
      case 'request':
      case 'طلب':
        return { color: theme.primary };
      case 'complaint':
      case 'شكوى':
        return { color: theme.destructive };
      case 'suggestion':
      case 'اقتراح':
        return { color: theme.success };
      default:
        return { color: theme.text };
    }
  }, [theme]);

  const rStyle = useAnimatedStyle(() => {
    if (!viewableItems) {
      return {};
    }
    const isVisible = Boolean(
      viewableItems.value
        .filter((viewableItem: ViewToken) => viewableItem.isViewable)
        .find((viewableItem) => viewableItem.item.id === item.id)
    );

    return {
      opacity: withTiming(isVisible ? 1 : 0.3, { duration: 300 }),
      transform: [{ scale: withTiming(isVisible ? 1 : 0.95, { duration: 300 }) }],
    };
  }, [item.id, viewableItems]);

  const acceptButtonStyle = {
    backgroundColor: theme.success,
  };
  const acceptButtonTextStyle = {
    color: theme.white,
  };
  const rejectButtonStyle = {
    backgroundColor: theme.destructive,
  };
  const rejectButtonTextStyle = {
    color: theme.white,
  };

  return (
    // CHANGED: The outer component is now a non-pressable Animated.View
    <Animated.View style={[
      styles.itemContainer,
      { backgroundColor: theme.header, shadowColor: theme.text },
      rStyle
    ]}>
      
      {/* ADDED: A new Pressable that only wraps the content you want to be clickable for navigation */}
      <Pressable onPress={handleNavigate} disabled={isActionLoading}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.pillsContainer}>
            <View style={[styles.pill, getTypePillStyle(item.type)]}>
              <Text style={[styles.pillText, getTypePillTextStyle(item.type)]}>
                {item.type}
              </Text>
            </View>
            <View style={[styles.pill, getStatusBadgeColor(item.status).view]}>
              <Text style={[styles.pillText, getStatusBadgeColor(item.status).text]}>{item.status}</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.detailsContainer}>
          <DetailRow label="العميل:" value={item.customerName || ''} theme={theme} />
          <DetailRow label="رقم الهاتف:" value={item.customerPhone || ''} theme={theme} />
          <DetailRow label="العنوان:" value={item.customerEmail || ''} theme={theme} />
          <DetailRow label="تاريخ الإنشاء:" value={formatTimestamp(item.createdAt)} theme={theme} />
          <View style={[styles.separator, { backgroundColor: theme.background }]} />
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.text }]}>الوصف:</Text>
          </View>
          <Text style={[styles.description, { color: theme.text }]} numberOfLines={3}>
            {item.description}
          </Text>
        </View>
      </Pressable>
      {/* END ADDED WRAPPER */}
      
      {/* The action buttons are now outside the navigation Pressable, so their own onPress will work correctly. */}
      {showActions && !hasResponded && (
        <View style={styles.actionButtonsContainer}>
          <Pressable
            style={[styles.actionButton, acceptButtonStyle]}
            onPress={() => handleAcceptTask?.(item.id)}
            disabled={isActionLoading}
          >
            {isActionLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
            )}
            <Text style={[styles.actionButtonText, acceptButtonTextStyle]}>قبول</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, rejectButtonStyle]}
            onPress={() => handleRejectTask?.(item.id)}
            disabled={isActionLoading}
          >
             {/* FIXED: Show loading indicator on reject button as well if needed, or just the icon */}
             {isActionLoading ? (
               <ActivityIndicator size="small" color="#fff" />
             ) : (
              <Ionicons name="close-circle" size={20} color="#fff" />
             )}
            <Text style={[styles.actionButtonText, rejectButtonTextStyle]}>رفض</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
});

// Helper component for detail rows
const DetailRow = React.memo(({ label, value, theme }: {
  label: string;
  value: string;
  theme: any;
}) => (
  <View style={styles.detailRow}>
    <Text style={[styles.detailLabel, { color: theme.text }]}>{label}</Text>
    <Text style={[styles.detailValue, { color: theme.text }]} numberOfLines={1}>
      {value}
    </Text>
  </View>
));

DetailRow.displayName = 'DetailRow';
InfoCard.displayName = 'InfoCard';

export default InfoCard;

// ...styles remain the same...
const styles = StyleSheet.create({
  itemContainer: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  header: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Cairo',
    fontWeight: 'bold',
    textAlign: 'right',
    marginBottom: 8,
  },
  pillsContainer: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 11,
    fontFamily: 'Cairo',
    fontWeight: 'bold',
    color: '#fff',
  },
  detailsContainer: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    fontFamily: 'Cairo',
    fontWeight: '600',
    opacity: 0.7,
  },
  detailValue: {
    fontSize: 14,
    fontFamily: 'Cairo',
    flexShrink: 1,
    textAlign: 'left',
  },
  separator: {
    height: 1,
    marginVertical: 12,
  },
  description: {
    fontSize: 14,
    fontFamily: 'Cairo',
    lineHeight: 22,
    textAlign: 'right',
    opacity: 0.8,
  },
  actionButtonsContainer: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-around',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row-reverse', // Changed to row-reverse
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginHorizontal: 6,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontFamily: 'Cairo',
    fontWeight: 'bold',
  },
});