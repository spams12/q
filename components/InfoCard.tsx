import { useTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { Timestamp } from 'firebase/firestore';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, ViewToken } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { ServiceRequest } from '../lib/types';

// Optimized AnimatedTaskItem component
interface InfoCardProps {
  item: ServiceRequest;
  viewableItems?: Animated.SharedValue<ViewToken[]>;
  hasResponded?: boolean;
  handleAcceptTask: (ticketId: string) => void;
  handleRejectTask: (ticketId: string) => void;
}

const InfoCard: React.FC<InfoCardProps> = React.memo(({ item, viewableItems, hasResponded, handleAcceptTask, handleRejectTask }) => {
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
    return date.toLocaleString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }, []);

  const getStatusPillStyle = useCallback((status: string) => {
    switch (status) {
      case "مفتوح": return { backgroundColor: '#3b82f6' }; // bg-blue-500
      case "قيد المعالجة": return { backgroundColor: '#eab308' }; // bg-yellow-500
      case "معلق": return { backgroundColor: '#8b5cf6' }; // bg-purple-500
      case "مكتمل": return { backgroundColor: '#22c55e' }; // bg-green-500
      case "مغلق": return { backgroundColor: '#6b7280' }; // bg-gray-500
      default: return { backgroundColor: '#6b7280' };
    }
  }, []);

  const getStatusPillTextStyle = useCallback((status: string) => {
    switch (status) {
      case "قيد المعالجة":
        return { color: '#000' }; // text-black
      default:
        return { color: '#fff' }; // text-white
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
         
            <View style={[styles.pill, getStatusPillStyle(item.status)]}>
              <Text style={[styles.pillText, getStatusPillTextStyle(item.status)]}>{item.status}</Text>
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
        
        

        {!hasResponded && (
          <View style={styles.actionButtonsContainer}>
            <Pressable
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => handleAcceptTask(item.id)}
            >
              <Text style={[styles.actionButtonText, styles.acceptButtonText]}>قبول</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => handleRejectTask(item.id)}
            >
              <Text style={[styles.actionButtonText, styles.rejectButtonText]}>رفض</Text>
            </Pressable>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginHorizontal: 6,
  },
  actionButtonText: {
    fontSize: 16,
    fontFamily: 'Cairo',
    fontWeight: 'bold',
  },
  acceptButton: {
    backgroundColor: '#e8f5e8',
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  acceptButtonText: {
    color: '#4caf50',
  },
  rejectButton: {
    backgroundColor: '#ffebee',
    borderWidth: 1,
    borderColor: '#f44336',
  },
  rejectButtonText: {
    color: '#f44336',
  },
});