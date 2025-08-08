// src/components/InfoCard.tsx

import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Timestamp } from 'firebase/firestore';
import { Hi          <Pressable
  style={[styles.actionButton, styles.processingButton]}
  onPress={() => handleAcceptTask?.(item.id)}
  disabled={isActionLoading}
>
  {isActionLoading && loadingItemId === item.id ? (
    <ActivityIndicator color="#fff" />
  ) : (
    <>
      <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
      <Text style={styles.processingButtonText} adjustsFontSizeToFit numberOfLines={1}>قبول</Text>
    </>
  )}
</Pressable>
  <Pressable
    style={[styles.actionButton, styles.rejectButton]}
    onPress={() => handleRejectTask?.(item.id)}
    disabled={isActionLoading}
  >
    {isActionLoading && loadingItemId === item.id ? (
      <ActivityIndicator color="#fff" />
    ) : (
      <>
        <Ionicons name="close-circle-outline" size={20} color="#fff" />
        <Text style={styles.rejectButtonText} adjustsFontSizeToFit numberOfLines={1}>رفض</Text>
      </>
    )}
  </Pressable>antsearch.js';
import { getHighlightedParts, getPropertyByPath } from 'instantsearch.js/es/lib/utils';
import React, { Fragment, useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewToken } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { getStatusBadgeColor } from '../lib/styles';
import { ServiceRequest } from '../lib/types';

// ====================================================================
// --- CORRECTED & REFINED HIGHLIGHT COMPONENT ---
// ====================================================================

const highlightStyles = StyleSheet.create({
  highlighted: {
    fontWeight: 'bold',
    backgroundColor: 'rgba(255, 243, 163, 0.7)', // A pleasant yellow highlight
    // Inherits color from parent <Text>
  },
});

function HighlightPart({ children, isHighlighted }: { children: React.ReactNode; isHighlighted: boolean }) {
  return <Text style={isHighlighted ? highlightStyles.highlighted : null}>{children}</Text>;
}

function Highlight({ hit, attribute, separator = ', ' }: { hit: Hit; attribute: string; separator?: string }) {
  const highlightResult = getPropertyByPath(hit._highlightResult, attribute);
  if (!highlightResult?.value) {
    const plainValue = getPropertyByPath(hit, attribute);
    return <>{typeof plainValue === 'string' ? plainValue : ''}</>;
  }

  const parts = getHighlightedParts(highlightResult.value);

  return (
    <>
      {parts.map((part, partIndex) => {
        if (Array.isArray(part)) {
          const isLastPart = partIndex === parts.length - 1;
          return (
            <Fragment key={partIndex}>
              {part.map((subPart, subPartIndex) => (
                <HighlightPart key={subPartIndex} isHighlighted={subPart.isHighlighted}>
                  {subPart.value}
                </HighlightPart>
              ))}
              {!isLastPart && separator}
            </Fragment>
          );
        }
        return (
          <HighlightPart key={partIndex} isHighlighted={part.isHighlighted}>
            {part.value}
          </HighlightPart>
        );
      })}
    </>
  );
}

// ====================================================================
// --- InfoCard & DetailRow Components ---
// ====================================================================

const DetailRow = React.memo(({ label, value, theme }: { label: string; value: React.ReactNode; theme: any; }) => (
  <View style={styles.detailRow}>
    <Text style={[styles.detailLabel, { color: theme.text }]}>{label}</Text>
    <View style={styles.detailValueContainer}>
      {value}
    </View>
  </View>
));
DetailRow.displayName = 'DetailRow';


interface User {
  id: string;
  name: string;
  uid: string;
}

interface InfoCardProps {
  item: ServiceRequest;
  hit?: Hit;
  viewableItems?: Animated.SharedValue<ViewToken[]>;
  hasResponded?: boolean;
  showActions?: boolean;
  handleAcceptTask?: (ticketId: string) => void;
  handleRejectTask?: (ticketId: string) => void;
  isActionLoading?: boolean;
  loadingItemId?: string | null;
  users?: User[];
}

const InfoCard: React.FC<InfoCardProps> = React.memo(({
  item,
  hit,
  viewableItems,
  hasResponded,
  handleAcceptTask,
  handleRejectTask,
  showActions = true,
  isActionLoading = false,
  loadingItemId = null,
  users = [],
}) => {
  const router = useRouter();
  const { theme } = useTheme();
  const typesToHideClientInfo = ['اقتراح', 'استفسار', 'طلب', 'مشكلة'];
  const shouldHideClientInfo = typesToHideClientInfo.includes(item.type);
  const handleNavigate = () => {
    router.push({
      pathname: "/tasks/[id]",
      params: { id: item.id, showActions: showActions.toString() },
    });
  };

  const formatTimestamp = useCallback((timestamp: Timestamp | string | undefined) => {
    if (!timestamp) return 'N/A';
    const date = (timestamp as Timestamp)?.toDate ? (timestamp as Timestamp).toDate() : new Date(timestamp as string);
    return date.toLocaleString('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  }, []);

  const getTypePillTextStyle = useCallback((type: string) => {
    switch (type?.toLowerCase()) {
      case 'request':
      case 'طلب':
        return { color: theme.text };
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
  const getTypePillStyle = useCallback((type: string) => {
    switch (type?.toLowerCase()) {
      case 'request':
      case 'طلب':
        return {
          backgroundColor: theme.statusDefault,
          borderColor: theme.primary,
        };
      case 'complaint':
      case 'شكوى':
        return {
          backgroundColor: theme.redTint,
          borderColor: theme.destructive,
        };
      case 'suggestion':
      case 'اقتراح':
        return {
          backgroundColor: theme.lightGray,
          borderColor: theme.success,
        };
      default:
        return { backgroundColor: theme.statusDefault };
    }
  }, [theme]);
  const rStyle = useAnimatedStyle(() => {
    if (!viewableItems) return {};
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

  const creatorName = users.find(u => u.uid === item.creatorId)?.name || 'غير معروف';
  const assignedUsersNames = item.assignedUsers?.map(uid => users.find(u => u.id === uid)?.name).filter(Boolean).join(', ') || 'لا يوجد';

  const isTicketClosedOrCompleted = item.status === 'مغلق' || item.status === 'مكتمل';

  // The creator of the ticket should not be able to process their own ticket.

  const shouldShowProcessingButton = showActions && !hasResponded && !isTicketClosedOrCompleted


  return (
    <Animated.View style={[styles.itemContainer, { backgroundColor: theme.header, shadowColor: theme.text }, rStyle]}>
      <Pressable onPress={handleNavigate} disabled={isActionLoading}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {hit ? <Highlight hit={hit} attribute="title" /> : item.title}
          </Text>
          <View style={styles.pillsContainer}>
            <View style={[styles.pill, getTypePillStyle(item.type)]}>
              <Text style={[styles.pillText, getTypePillTextStyle(item.type)]}>{item.type}</Text>
            </View>
            <View style={[styles.pill, getStatusBadgeColor(item.status).view]}>
              <Text style={[styles.pillText, getStatusBadgeColor(item.status).text]}>{item.status}</Text>
            </View>
          </View>
        </View>

        <View style={styles.detailsContainer}>
          {!shouldHideClientInfo && (
            <>
              <DetailRow
                label="العميل:"
                value={<Text style={[styles.detailValue, { color: theme.text }]} numberOfLines={1}>{hit ? <Highlight hit={hit} attribute="customerName" /> : (item.customerName || 'N/A')}</Text>}
                theme={theme}
              />
              <DetailRow label="رقم الهاتف:" value={<Text style={[styles.detailValue, { color: theme.text }]}>{item.customerPhone || 'N/A'}</Text>} theme={theme} />
              <DetailRow label="العنوان او رقم الزون:" value={<Text style={[styles.detailValue, { color: theme.text }]}>{item.customerEmail || 'N/A'}</Text>} theme={theme} />
              <View style={[styles.separator, { backgroundColor: theme.background }]} />
            </>
          )}

          <DetailRow
            label="رقم التذكرة:"
            value={<Text style={[styles.detailValue, { color: theme.text }]} numberOfLines={1}>{item.id}</Text>}
            theme={theme}
          />
          <DetailRow label="الجهة المسؤولة:" value={<Text style={[styles.detailValue, { color: theme.text }]}>{item.department || 'غير محددة'}</Text>} theme={theme} />
          <DetailRow label="تاريخ الإنشاء:" value={<Text style={[styles.detailValue, { color: theme.text }]}>{formatTimestamp(item.createdAt)}</Text>} theme={theme} />
        </View>
      </Pressable>

      {shouldShowProcessingButton && (
        <View style={styles.actionButtonsContainer}>
          <Pressable
            style={[styles.actionButton, styles.processingButton, isActionLoading && loadingItemId === item.id && { opacity: 0.7 }]}
            onPress={() => handleAcceptTask?.(item.id)}
            disabled={isActionLoading}
          >
            {isActionLoading && loadingItemId === item.id ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-circle-outline" size={20} color="#fff" /><Text style={styles.processingButtonText} adjustsFontSizeToFit numberOfLines={1}>قبول</Text></>}
          </Pressable>
          <Pressable
            style={[styles.actionButton, styles.rejectButton, isActionLoading && loadingItemId === item.id && { opacity: 0.7 }]}
            onPress={() => handleRejectTask?.(item.id)}
            disabled={isActionLoading}
          >
            {isActionLoading && loadingItemId === item.id ? <ActivityIndicator color="#fff" /> : <><Ionicons name="close-circle-outline" size={20} color="#fff" /><Text style={styles.rejectButtonText} adjustsFontSizeToFit numberOfLines={1}>رفض</Text></>}
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
});

InfoCard.displayName = 'InfoCard';
export default InfoCard;

const styles = StyleSheet.create({
  itemContainer: { padding: 16, marginBottom: 12, borderRadius: 16, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  header: { flexDirection: 'column', alignItems: 'flex-end', marginBottom: 12 },
  title: { fontSize: 18, fontFamily: 'Cairo', fontWeight: 'bold', textAlign: 'right', marginBottom: 8, width: '100%' },
  pillsContainer: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 11, fontFamily: 'Cairo', fontWeight: 'bold', color: '#fff' },
  detailsContainer: { marginBottom: 12 },
  detailRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  detailLabel: { fontSize: 14, fontFamily: 'Cairo', fontWeight: '600', opacity: 0.7 },
  detailValueContainer: { flexShrink: 1, alignItems: 'flex-start' }, // Allows text to wrap if needed but shrink
  detailValue: { fontSize: 14, fontFamily: 'Cairo', textAlign: 'left', paddingLeft: 8 },
  separator: { height: 1, marginVertical: 8 },
  actionButtonsContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 16, gap: 8 },
  actionButton: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, gap: 8 },
  processingButton: { backgroundColor: '#28a745' },
  processingButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', fontFamily: 'Cairo', flexShrink: 1 },
  rejectButton: { backgroundColor: '#dc3545' },
  rejectButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', fontFamily: 'Cairo', flexShrink: 1 },
});