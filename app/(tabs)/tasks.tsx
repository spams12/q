import { ThemedView } from '@/components/ThemedView';
import { useTheme } from '@/context/ThemeContext';
import { Feather, Ionicons } from '@expo/vector-icons';
import { collection, getDocs, limit, query, Timestamp } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, ViewToken } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { db } from '../../lib/firebase';
import { ServiceRequest } from '../../lib/types';


export default function TasksScreen() {
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('Open');
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const viewableItems = useSharedValue<ViewToken[]>([]);
  const { theme } = useTheme();
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const filterPopupY = useSharedValue(Dimensions.get('window').height);


  useEffect(() => {
    const fetchServiceRequests = async () => {
      try {
        const querySnapshot = await getDocs(query(collection(db, 'serviceRequests'), limit(100)));
        const requests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRequest));
        setServiceRequests(requests);
      } catch (error) {
        console.error("Error fetching service requests: ", error);
      } finally {
        setLoading(false);
      }
    };

    fetchServiceRequests();
  }, []);

  const filteredServiceRequests = useMemo(() => {
    return serviceRequests
      .filter(req => {
        if (activeTab === 'Open') return req.status === 'مفتوح';
        if (activeTab === 'Accepted') return req.status === 'قيد المعالجة';
        if (activeTab === 'Done') return req.status === 'مكتمل';
        return true;
      })
      .filter(req =>
        (req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          req.customerName.toLowerCase().includes(searchQuery.toLowerCase())) &&
        (!selectedPriority || req.priority === selectedPriority) &&
        (!selectedType || req.type === selectedType)
      );
  }, [serviceRequests, searchQuery, activeTab, selectedPriority, selectedType]);

  const handleResponse = useCallback(async (id: string, response: 'accepted' | 'rejected') => {
    try {
      setServiceRequests(prevRequests => prevRequests.map(req => req.id === id ? { ...req, status: response } : req));
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems: vItems }: { viewableItems: ViewToken[] }) => {
    viewableItems.value = vItems;
  }, []);

  const renderItem = useCallback(({ item }: { item: ServiceRequest }) => {
    return <AnimatedTaskItem item={item} viewableItems={viewableItems} handleResponse={handleResponse} />;
  }, [handleResponse]);

  const toggleFilterPopup = () => {
    setIsFilterVisible(!isFilterVisible);
    filterPopupY.value = withTiming(isFilterVisible ? Dimensions.get('window').height : Dimensions.get('window').height - 400);
  };

  const animatedFilterStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: filterPopupY.value }],
    };
  });

  const clearFilters = () => {
    setSelectedPriority(null);
    setSelectedType(null);
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.headerContainer}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>التذاكر المسندة إليك</Text>
        <Text style={[styles.headerSubtitle, { color: theme.text }]}>قائمة التذاكر المسندة إليك من قبل المدير.</Text>
      </View>

      <View style={styles.controlsContainer}>
        <View style={[styles.searchContainer, {backgroundColor: theme.header}]}>
          <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="بحث عن تكت..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity style={[styles.iconButton, {backgroundColor: theme.header}]} onPress={toggleFilterPopup}>
          <Ionicons name="filter" size={22} color={theme.icon} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.iconButton, {backgroundColor: theme.header}]}>
          <Ionicons name="swap-vertical" size={22} color={theme.icon} />
        </TouchableOpacity>
      </View>

      <View style={[styles.tabsContainer, {backgroundColor: theme.header}]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'Open' && styles.activeTab, activeTab === 'Open' && {backgroundColor: theme.background}]}
          onPress={() => setActiveTab('Open')}
        >
          <Text style={[styles.tabText, activeTab === 'Open' ? {color: theme.tabActive} : {color: theme.tabInactive}]}>مفتوح </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'Accepted' && styles.activeTab, activeTab === 'Accepted' && {backgroundColor: theme.background}]}
          onPress={() => setActiveTab('Accepted')}
        >
          <Text style={[styles.tabText, activeTab === 'Accepted' ? {color: theme.tabActive} : {color: theme.tabInactive}]}>مقبولة </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'Done' && styles.activeTab, activeTab === 'Done' && {backgroundColor: theme.background}]}
          onPress={() => setActiveTab('Done')}
        >
          <Text style={[styles.tabText, activeTab === 'Done' ? {color: theme.tabActive} : {color: theme.tabInactive}]}>منجزة </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredServiceRequests}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={{ color: theme.text, textAlign: 'center', marginTop: 20 }}>لا توجد تذاكر جديدة.</Text>}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50,
        }}
        contentContainerStyle={{ paddingBottom: 16 }}
      />
      {isFilterVisible && (
        <Pressable style={styles.backdrop} onPress={toggleFilterPopup} />
      )}
      <Animated.View style={[styles.filterPopup, { backgroundColor: theme.header }, animatedFilterStyle]}>
        <View style={styles.filterContent}>
          <Text style={[styles.filterTitle, { color: theme.text }]}>Filter Options</Text>
          
          <Text style={[styles.filterSectionTitle, { color: theme.text }]}>Priority</Text>
          <View style={styles.filterOptionsContainer}>
            {['عالية', 'متوسطة', 'منخفضة'].map(priority => (
              <TouchableOpacity
                key={priority}
                style={[
                  styles.filterButton,
                  selectedPriority === priority && { backgroundColor: theme.tabActive, borderColor: theme.tabActive },
                  {borderColor: theme.text}
                ]}
                onPress={() => setSelectedPriority(priority)}
              >
                <Text style={[styles.filterButtonText, selectedPriority === priority && { color: '#fff' }, {color: theme.text}]}>{priority}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.filterSectionTitle, { color: theme.text }]}>Type</Text>
          <View style={styles.filterOptionsContainer}>
            {['طلب', 'شكوى', 'اقتراح'].map(type => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterButton,
                  selectedType === type && { backgroundColor: theme.tabActive, borderColor: theme.tabActive },
                  {borderColor: theme.text}
                ]}
                onPress={() => setSelectedType(type)}
              >
                <Text style={[styles.filterButtonText, selectedType === type && { color: '#fff' }, {color: theme.text}]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
            <Text style={styles.clearButtonText}>Clear Filters</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </ThemedView>
  );
}

type AnimatedTaskItemProps = {
  item: ServiceRequest;
  viewableItems: Animated.SharedValue<ViewToken[]>;
  handleResponse: (id: string, response: 'accepted' | 'rejected') => void;
};

const AnimatedTaskItem: React.FC<AnimatedTaskItemProps> = React.memo(({ item, viewableItems, handleResponse }) => {
  const { theme } = useTheme();

  const formatTimestamp = (timestamp: Timestamp | string | undefined) => {
    if (!timestamp) return 'N/A';
    const date = (timestamp as Timestamp).toDate ? (timestamp as Timestamp).toDate() : new Date(timestamp as string);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).replace(',', ' ');
  };

  const getStatusPillStyle = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'open':
      case 'مفتوح':
        return { backgroundColor: '#007bff' }; // Blue
      default:
        return { backgroundColor: '#6c757d' }; // Grey
    }
  };

  const getPriorityPillStyle = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'medium':
      case 'متوسطة':
        return { backgroundColor: '#ffc107' }; // Yellow
      default:
        return { backgroundColor: '#6c757d' }; // Grey
    }
  };

  const getTypePillStyle = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'request':
      case 'طلب':
        return { 
          backgroundColor: '#e0e0e0',
          borderWidth: 1,
          borderColor: '#ccc',
         };
      default:
        return { backgroundColor: '#6c757d' };
    }
  };
  const getTypePillTextStyle = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'request':
      case 'طلب':
        return { color: '#333' };
      default:
        return { color: '#fff' };
    }
  };

  const rStyle = useAnimatedStyle(() => {
    const isVisible = Boolean(
      viewableItems.value
        .filter((item) => item.isViewable)
        .find((viewableItem) => viewableItem.item.id === item.id)
    );

    return {
      opacity: withTiming(isVisible ? 1 : 0),
      transform: [
        {
          translateY: withTiming(isVisible ? 0 : 20),
        },
      ],
    };
  }, []);

  return (
    <Animated.View style={[styles.itemContainer, { backgroundColor: theme.header, shadowColor: theme.text }, rStyle]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
        <View style={styles.pillsContainer}>
          <View style={[styles.pill, getTypePillStyle(item.type)]}><Text style={[styles.pillText, getTypePillTextStyle(item.type)]}>{item.type}</Text></View>
          <View style={[styles.pill, getPriorityPillStyle(item.priority)]}><Text style={styles.pillText}>{item.priority}</Text></View>
          <View style={[styles.pill, getStatusPillStyle(item.status)]}><Text style={styles.pillText}>{item.status}</Text></View>
        </View>
      </View>
      <View style={styles.detailsContainer}>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: theme.text }]}>العميل:</Text>
          <Text style={[styles.detailValue, { color: theme.text }]}>{item.customerName}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: theme.text }]}>رقم الهاتف:</Text>
          <Text style={[styles.detailValue, { color: theme.text }]}>{item.customerPhone}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: theme.text }]}>العنوان:</Text>
          <Text style={[styles.detailValue, { color: theme.text }]}>{item.address}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: theme.text }]}>تاريخ الإنشاء:</Text>
          <Text style={[styles.detailValue, { color: theme.text }]}>{formatTimestamp(item.createdAt)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: theme.text }]}>آخر تحديث:</Text>
          <Text style={[styles.detailValue, { color: theme.text }]}>{formatTimestamp(item.lastUpdated)}</Text>
        </View>
        <View style={[styles.separator, {backgroundColor: theme.background}]} />
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: theme.text }]}>الوصف:</Text>
        </View>
        <Text style={[styles.description, { color: theme.text }]}>{item.description}</Text>
      </View>
      <View style={styles.footer}>
        <TouchableOpacity style={[styles.button, styles.denyButton]} onPress={() => handleResponse(item.id, 'rejected')}>
          <Feather name="x" size={18} color="#fff" />
          <Text style={styles.buttonText}>رفض</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.acceptButton]} onPress={() => handleResponse(item.id, 'accepted')}>
          <Feather name="check" size={18} color="#fff" />
          <Text style={styles.buttonText}>قبول</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

AnimatedTaskItem.displayName = 'AnimatedTaskItem';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerContainer: {
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'right',
    fontFamily: 'Cairo',
  },
  headerSubtitle: {
    fontSize: 16,
    textAlign: 'right',
    marginTop: 4,
    fontFamily: 'Cairo',
  },
  controlsContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    marginLeft: 8,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    textAlign: 'right',
    fontSize: 16,
    fontFamily: 'Cairo',
  },
  iconButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tabsContainer: {
    flexDirection: 'row-reverse',
    marginBottom: 16,
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeTab: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  tabText: {
    fontWeight: 'bold',
    fontFamily: 'Cairo',
  },
  activeTabText: {
    // color is now handled inline
  },
  itemContainer: {
    padding: 12,
    marginBottom: 16,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Cairo',
  },
  pillsContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  pillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'Cairo',
  },
  detailsContainer: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    marginBottom: 10,
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
    fontFamily: 'Cairo',
  },
  detailValue: {
    fontSize: 14,
    fontFamily: 'Cairo',
  },
  separator: {
    height: 1,
    marginVertical: 12,
  },
  description: {
    fontSize: 14,
    textAlign: 'right',
    marginTop: 4,
    lineHeight: 20,
    fontFamily: 'Cairo',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  acceptButton: {
    backgroundColor: '#27ae60',
  },
  denyButton: {
    backgroundColor: '#e74c3c',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    fontFamily: 'Cairo',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1,
  },
  filterPopup: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 400,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
  },
  filterContent: {
    width: '100%',
    alignItems: 'center',
  },
  filterTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
    alignSelf: 'flex-start'
  },
  filterOptionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  clearButton: {
    marginTop: 20,
    backgroundColor: '#e74c3c',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});