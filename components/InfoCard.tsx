import { useTheme } from '@/context/ThemeContext';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Timestamp } from 'firebase/firestore';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View, ViewToken } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { ServiceRequest } from '../lib/types';

// Optimized AnimatedTaskItem component
interface InfoCardProps {
  item: ServiceRequest;
  viewableItems?: Animated.SharedValue<ViewToken[]>;
  handleAcceptTask: (ticketId: string) => void;
  handleRejectTask: (ticketId: string) => void;
  hasResponded: boolean;
}

const InfoCard: React.FC<InfoCardProps> = React.memo(({ item, viewableItems, handleAcceptTask, handleRejectTask, hasResponded }) => {
  const { theme } = useTheme();
  const router = useRouter();

  const handleNavigate = () => {
    console.log('Navigating to task details:', item.id);
   router.push({
pathname: "/tasks/[id]",
params: {
id: item.id,
}
})

  };

  const formatTimestamp = useCallback((timestamp: Timestamp | string | undefined) => {
    if (!timestamp) return 'N/A';
    const date = (timestamp as Timestamp).toDate ? (timestamp as Timestamp).toDate() : new Date(timestamp as string);
    return date.toLocaleString('ar-SA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }, []);

  const getStatusPillStyle = useCallback((status: string) => {
    switch (status?.toLowerCase()) {
      case 'open':
      case 'مفتوح':
        return { backgroundColor: '#007bff' };
      case 'accepted':
      case 'قيد المعالجة':
        return { backgroundColor: '#28a745' };
      case 'done':
      case 'مكتمل':
        return { backgroundColor: '#6c757d' };
      default:
        return { backgroundColor: '#6c757d' };
    }
  }, []);

  const getPriorityPillStyle = useCallback((priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high':
      case 'عالية':
        return { backgroundColor: '#dc3545' };
      case 'medium':
      case 'متوسطة':
        return { backgroundColor: '#ffc107' };
      case 'low':
      case 'منخفضة':
        return { backgroundColor: '#28a745' };
      default:
        return { backgroundColor: '#6c757d' };
    }
  }, []);

  const getTypePillStyle = useCallback((type: string) => {
    switch (type?.toLowerCase()) {
      case 'request':
      case 'طلب':
        return { 
          backgroundColor: '#e3f2fd',
          borderWidth: 1,
          borderColor: '#2196f3',
        };
      case 'complaint':
      case 'شكوى':
        return { 
          backgroundColor: '#ffebee',
          borderWidth: 1,
          borderColor: '#f44336',
        };
      case 'suggestion':
      case 'اقتراح':
        return { 
          backgroundColor: '#e8f5e8',
          borderWidth: 1,
          borderColor: '#4caf50',
        };
      default:
        return { backgroundColor: '#6c757d' };
    }
  }, []);

  const getTypePillTextStyle = useCallback((type: string) => {
    switch (type?.toLowerCase()) {
      case 'request':
      case 'طلب':
        return { color: '#2196f3' };
      case 'complaint':
      case 'شكوى':
        return { color: '#f44336' };
      case 'suggestion':
      case 'اقتراح':
        return { color: '#4caf50' };
      default:
        return { color: '#fff' };
    }
  }, []);

  const handleAccept = useCallback(() => {
    handleAcceptTask(item.id);
  }, [item.id, handleAcceptTask]);

  const handleReject = useCallback(() => {
    handleRejectTask(item.id);
  }, [item.id, handleRejectTask]);

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
      transform: [
        {
          scale: withTiming(isVisible ? 1 : 0.95, { duration: 300 }),
        },
      ],
    };
  }, [item.id, viewableItems]);

  return (

         <Pressable onPress={() => {
          handleNavigate();
     
        }}>
      <Animated.View style={[
        styles.itemContainer,
        { backgroundColor: theme.header, shadowColor: theme.text },
        rStyle
      ]}>
        
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
            <View style={[styles.pill, getPriorityPillStyle(item.priority)]}>
              <Text style={styles.pillText}>{item.priority}</Text>
            </View>
            <View style={[styles.pill, getStatusPillStyle(item.status)]}>
              <Text style={styles.pillText}>{item.status}</Text>
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
        
        {item.status === 'مفتوح' && !hasResponded && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.button, styles.denyButton]}
              onPress={handleReject}
              activeOpacity={0.8}
            >
              <Feather name="x" size={18} color="#fff" />
              <Text style={styles.buttonText}>رفض</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.acceptButton]}
              onPress={handleAccept}
              activeOpacity={0.8}
            >
              <Feather name="check" size={18} color="#fff" />
              <Text style={styles.buttonText}>قبول</Text>
            </TouchableOpacity>
          </View>
        )}
        

      </Animated.View>
    </Pressable>
    
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
  footer: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Cairo',
    fontWeight: 'bold',
  },
  acceptButton: {
    backgroundColor: '#28a745',
  },
  denyButton: {
    backgroundColor: '#dc3545',
  },
});