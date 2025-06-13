import { useTheme } from '@/context/ThemeContext';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, ViewToken } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { db } from '../../lib/firebase';
import { ServiceRequest } from '../../lib/types';

type TabKey = 'Open' | 'Accepted' | 'Done';

interface CachedData {
  Open: ServiceRequest[];
  Accepted: ServiceRequest[];
  Done: ServiceRequest[];
}

interface LoadingStates {
  Open: boolean;
  Accepted: boolean;
  Done: boolean;
}

const TasksScreen: React.FC = () => {
  // Data caching states
  const [cachedData, setCachedData] = useState<CachedData>({
    Open: [],
    Accepted: [],
    Done: []
  });
  
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({
    Open: true,
    Accepted: false,
    Done: false
  });

  // UI states
  const [activeTab, setActiveTab] = useState<TabKey>('Open');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  
  // Animation values
  const viewableItems = useSharedValue<ViewToken[]>([]);
  const filterPopupY = useSharedValue(Dimensions.get('window').height);
  const tabIndicatorX = useSharedValue(0);
  
  const { theme } = useTheme();
  
  // Refs for optimization
  const dataCache = useRef<Map<TabKey, { data: ServiceRequest[]; timestamp: number }>>(new Map());
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

  // Status mapping
  const getStatusFilter = useCallback((tab: TabKey): string => {
    const statusMap = {
      'Open': 'مفتوح',
      'Accepted': 'قيد المعالجة',
      'Done': 'مكتمل'
    };
    return statusMap[tab];
  }, []);

  // Optimized data fetching with caching
  const fetchTabData = useCallback(async (tab: TabKey, forceRefresh = false) => {
    // Check cache first
    const cached = dataCache.current.get(tab);
    const now = Date.now();
    
    if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_DURATION) {
      setCachedData(prev => ({ ...prev, [tab]: cached.data }));
      return;
    }

    setLoadingStates(prev => ({ ...prev, [tab]: true }));
    
    try {
      const statusFilter = getStatusFilter(tab);
      const q = query(
        collection(db, 'serviceRequests'), 
        where('status', '==', statusFilter),
        orderBy('createdAt', 'desc'), // Better performance with index
        limit(50) // Reduced limit for faster loading
      );
      
      const querySnapshot = await getDocs(q);
      const requests = querySnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as ServiceRequest));
      
      // Update cache
      dataCache.current.set(tab, { data: requests, timestamp: now });
      setCachedData(prev => ({ ...prev, [tab]: requests }));
      
    } catch (error) {
      console.error(`Error fetching ${tab} requests:`, error);
      setCachedData(prev => ({ ...prev, [tab]: [] }));
    } finally {
      setLoadingStates(prev => ({ ...prev, [tab]: false }));
    }
  }, [getStatusFilter, CACHE_DURATION]);

  // Initial data loading with smart preloading
  useEffect(() => {
    const loadInitialData = async () => {
      // Load active tab immediately
      await fetchTabData('Open');
      
      // Preload other tabs with staggered timing
      const preloadTabs = async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        await fetchTabData('Accepted');
        
        await new Promise(resolve => setTimeout(resolve, 300));
        await fetchTabData('Done');
      };
      
      preloadTabs();
    };
    
    loadInitialData();
  }, [fetchTabData]);

  // Optimized tab switching with haptic feedback
  const handleTabPress = useCallback(async (tab: TabKey) => {
    if (tab === activeTab) return;

    // Haptic feedback for better UX
    try {
      await Haptics.selectionAsync();
    } catch {
      // Haptics not available, continue without it
    }

    // Immediate visual feedback
    setActiveTab(tab);
    
    // Animate tab indicator
    const tabIndex = ['Open', 'Accepted', 'Done'].indexOf(tab);
    tabIndicatorX.value = withSpring(tabIndex * (Dimensions.get('window').width / 3 - 32));
    
    // Load data if not cached or outdated
    const cached = dataCache.current.get(tab);
    const now = Date.now();
    
    if (!cached || (now - cached.timestamp) > CACHE_DURATION) {
      fetchTabData(tab);
    }
  }, [activeTab, fetchTabData, CACHE_DURATION, tabIndicatorX]);

  // Memoized filtered data
  const filteredServiceRequests = useMemo(() => {
    const currentData = cachedData[activeTab] || [];
    
    if (!searchQuery && !selectedPriority && !selectedType) {
      return currentData;
    }
    
    return currentData.filter(req => {
      const matchesSearch = !searchQuery || 
        req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.customerName.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesPriority = !selectedPriority || req.priority === selectedPriority;
      const matchesType = !selectedType || req.type === selectedType;
      
      return matchesSearch && matchesPriority && matchesType;
    });
  }, [cachedData, activeTab, searchQuery, selectedPriority, selectedType]);

  // Optimized response handler
  const handleResponse = useCallback(async (id: string, response: 'accepted' | 'rejected') => {
    try {
      // Optimistic update
      const newStatus = response === 'accepted' ? 'قيد المعالجة' : 'مرفوض';
      
      setCachedData(prevCached => {
        const updatedCached = { ...prevCached };
        
        // Remove from current tab
        updatedCached[activeTab] = updatedCached[activeTab].filter(req => req.id !== id);
        
        // Add to appropriate tab if accepted
        if (response === 'accepted') {
          const item = prevCached[activeTab].find(req => req.id === id);
          if (item) {
            updatedCached.Accepted = [
              { ...item, status: newStatus },
              ...updatedCached.Accepted
            ];
          }
        }
        
        return updatedCached;
      });

      // Clear relevant cache entries
      dataCache.current.delete(activeTab);
      if (response === 'accepted') {
        dataCache.current.delete('Accepted');
      }

    } catch (error) {
      console.error("Error updating document: ", error);
      // Revert optimistic update by refetching
      fetchTabData(activeTab, true);
    }
  }, [activeTab, fetchTabData]);

  // Memoized callbacks for FlatList
  const onViewableItemsChanged = useCallback(({ viewableItems: vItems }: { viewableItems: ViewToken[] }) => {
    viewableItems.value = vItems;
  }, [viewableItems]);

  const renderItem = useCallback(({ item }: { item: ServiceRequest }) => {
    return <AnimatedTaskItem item={item} viewableItems={viewableItems} handleResponse={handleResponse} />;
  }, [handleResponse, viewableItems]);

  const keyExtractor = useCallback((item: ServiceRequest) => item.id, []);

  // Filter popup animations
  const toggleFilterPopup = useCallback(() => {
    const newVisibility = !isFilterVisible;
    setIsFilterVisible(newVisibility);
    
    filterPopupY.value = withTiming(
      newVisibility ? Dimensions.get('window').height - 400 : Dimensions.get('window').height,
      { duration: 300 }
    );
  }, [isFilterVisible, filterPopupY]);

  const animatedFilterStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: filterPopupY.value }],
    };
  });

  const clearFilters = useCallback(() => {
    setSelectedPriority(null);
    setSelectedType(null);
  }, []);

  // Memoized components
  const TabButton = React.memo(({ tabKey, label }: { tabKey: TabKey; label: string }) => {
    const isActive = activeTab === tabKey;
    const isLoading = loadingStates[tabKey];
    
    return (
      <TouchableOpacity
        style={[
          styles.tab, 
          isActive && styles.activeTab, 
          isActive && { backgroundColor: theme.background }
        ]}
        onPress={() => handleTabPress(tabKey)}
        activeOpacity={0.7}
      >
        <View style={styles.tabContent}>
          <Text style={[
            styles.tabText, 
            { color: isActive ? theme.tabActive : theme.tabInactive }
          ]}>
            {label}
          </Text>
          {isLoading && (
            <ActivityIndicator 
              size="small" 
              color={theme.tabActive} 
              style={styles.tabLoader} 
            />
          )}
        </View>
      </TouchableOpacity>
    );
  });

  TabButton.displayName = 'TabButton';

  const SearchInput = React.memo(() => (
    <View style={[styles.searchContainer, { backgroundColor: theme.header }]}>
      <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
      <TextInput
        style={[styles.searchInput, { color: theme.text }]}
        placeholder="بحث عن تكت..."
        placeholderTextColor="#888"
        value={searchQuery}
        onChangeText={setSearchQuery}
        returnKeyType="search"
      />
    </View>
  ));

  SearchInput.displayName = 'SearchInput';

  const FilterButton = React.memo(({ onPress }: { onPress: () => void }) => (
    <TouchableOpacity 
      style={[styles.iconButton, { backgroundColor: theme.header }]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name="filter" size={22} color={theme.icon} />
    </TouchableOpacity>
  ));

  FilterButton.displayName = 'FilterButton';

  const SortButton = React.memo(() => (
    <TouchableOpacity 
      style={[styles.iconButton, { backgroundColor: theme.header }]}
      activeOpacity={0.7}
    >
      <Ionicons name="swap-vertical" size={22} color={theme.icon} />
    </TouchableOpacity>
  ));

  SortButton.displayName = 'SortButton';

  // Pull to refresh
  const onRefresh = useCallback(() => {
    fetchTabData(activeTab, true);
  }, [activeTab, fetchTabData]);

  const isCurrentTabLoading = loadingStates[activeTab];
  const hasActiveFilters = selectedPriority || selectedType;

  const ListHeader = React.memo(() => (
    <>
      <View style={styles.headerContainer}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>التذاكر المسندة إليك</Text>
        <Text style={[styles.headerSubtitle, { color: theme.text }]}>
          قائمة التذاكر المسندة إليك من قبل المدير.
        </Text>
      </View>

      <View style={styles.controlsContainer}>
        <SearchInput />
        <FilterButton onPress={toggleFilterPopup} />
        <SortButton />
      </View>

      <View style={[styles.tabsContainer, { backgroundColor: theme.header }]}>
        <TabButton tabKey="Open" label="مفتوح" />
        <TabButton tabKey="Accepted" label="مقبولة" />
        <TabButton tabKey="Done" label="منجزة" />
      </View>

      {hasActiveFilters && (
        <View style={styles.activeFiltersContainer}>
          <Text style={[styles.activeFiltersText, { color: theme.text }]}>
            المرشحات النشطة:
            {selectedPriority && ` الأولوية: ${selectedPriority}`}
            {selectedType && ` النوع: ${selectedType}`}
          </Text>
          <TouchableOpacity onPress={clearFilters}>
            <Text style={styles.clearFiltersText}>مسح</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  ));
  ListHeader.displayName = 'ListHeader';

  const renderListEmpty = useCallback(() => {
    if (isCurrentTabLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.tabActive} />
          <Text style={[styles.loadingText, { color: theme.text }]}>جاري التحميل...</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="document-outline" size={48} color="#ccc" />
        <Text style={[styles.emptyText, { color: theme.text }]}>
          لا توجد تذاكر في هذا القسم
        </Text>
      </View>
    );
  }, [isCurrentTabLoading, theme]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={filteredServiceRequests}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={renderListEmpty}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={10}
        refreshing={isCurrentTabLoading && cachedData[activeTab].length > 0}
        onRefresh={onRefresh}
      />

      {/* Filter Popup */}
      {isFilterVisible && (
        <Pressable style={styles.backdrop} onPress={toggleFilterPopup} />
      )}
      
      <Animated.View style={[styles.filterPopup, { backgroundColor: theme.header }, animatedFilterStyle]}>
        <View style={styles.filterContent}>
          <View style={styles.filterHeader}>
            <Text style={[styles.filterTitle, { color: theme.text }]}>خيارات التصفية</Text>
            <TouchableOpacity onPress={toggleFilterPopup}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>
          
          <Text style={[styles.filterSectionTitle, { color: theme.text }]}>الأولوية</Text>
          <View style={styles.filterOptionsContainer}>
            {['عالية', 'متوسطة', 'منخفضة'].map(priority => (
              <TouchableOpacity
                key={priority}
                style={[
                  styles.filterButton,
                  selectedPriority === priority && {
                    backgroundColor: theme.tabActive,
                    borderColor: theme.tabActive
                  },
                  { borderColor: theme.text }
                ]}
                onPress={() => setSelectedPriority(
                  selectedPriority === priority ? null : priority
                )}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.filterButtonText,
                  selectedPriority === priority && { color: '#fff' },
                  { color: theme.text }
                ]}>
                  {priority}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.filterSectionTitle, { color: theme.text }]}>النوع</Text>
          <View style={styles.filterOptionsContainer}>
            {['طلب', 'شكوى', 'اقتراح'].map(type => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterButton,
                  selectedType === type && {
                    backgroundColor: theme.tabActive,
                    borderColor: theme.tabActive
                  },
                  { borderColor: theme.text }
                ]}
                onPress={() => setSelectedType(
                  selectedType === type ? null : type
                )}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.filterButtonText,
                  selectedType === type && { color: '#fff' },
                  { color: theme.text }
                ]}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.filterActions}>
            <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
              <Text style={styles.clearButtonText}>مسح المرشحات</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: theme.tabActive }]}
              onPress={toggleFilterPopup}
            >
              <Text style={styles.applyButtonText}>تطبيق</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

export default TasksScreen;

// Optimized AnimatedTaskItem component
interface AnimatedTaskItemProps {
  item: ServiceRequest;
  viewableItems: Animated.SharedValue<ViewToken[]>;
  handleResponse: (id: string, response: 'accepted' | 'rejected') => void;
}

const AnimatedTaskItem: React.FC<AnimatedTaskItemProps> = React.memo(({ item, viewableItems, handleResponse }) => {
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

  const handleAccept = useCallback(() => handleResponse(item.id, 'accepted'), [item.id, handleResponse]);
  const handleReject = useCallback(() => handleResponse(item.id, 'rejected'), [item.id, handleResponse]);

  const rStyle = useAnimatedStyle(() => {
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
  }, [item.id]);

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
          <DetailRow label="العنوان:" value={item.address || ''} theme={theme} />
          <DetailRow label="تاريخ الإنشاء:" value={formatTimestamp(item.createdAt)} theme={theme} />
          <DetailRow label="آخر تحديث:" value={formatTimestamp(item.lastUpdated)} theme={theme} />
          
          <View style={[styles.separator, { backgroundColor: theme.background }]} />
          
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.text }]}>الوصف:</Text>
          </View>
          <Text style={[styles.description, { color: theme.text }]} numberOfLines={3}>
            {item.description}
          </Text>
        </View>
        
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
    textAlign: 'right',
    fontFamily: 'Cairo',
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 16,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 4,
    fontFamily: 'Cairo',
    opacity: 0.7,
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
    borderRadius: 12,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tabsContainer: {
    flexDirection: 'row-reverse',
    marginBottom: 16,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeTab: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabText: {
    fontWeight: 'bold',
    fontFamily: 'Cairo',
    fontSize: 14,
  },
  tabLoader: {
    marginLeft: 4,
  },
  activeFiltersContainer: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    backgroundColor: 'rgba(0, 123, 255, 0.1)',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007bff',
  },
  activeFiltersText: {
    fontSize: 12,
    fontFamily: 'Cairo',
  },
  clearFiltersText: {
    color: '#007bff',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'Cairo',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Cairo',
  },
  listContainer: {
    paddingBottom: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    fontFamily: 'Cairo',
    opacity: 0.6,
  },
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
  // Filter Popup Styles
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 5,
  },
  filterPopup: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 400,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
    zIndex: 10,
  },
  filterContent: {
    flex: 1,
  },
  filterHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  filterTitle: {
    fontSize: 22,
    fontFamily: 'Cairo',
    fontWeight: 'bold',
  },
  filterSectionTitle: {
    fontSize: 16,
    fontFamily: 'Cairo',
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'right',
  },
  filterOptionsContainer: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterButtonText: {
    fontSize: 14,
    fontFamily: 'Cairo',
  },
  filterActions: {
    flexDirection: 'row-reverse',
    marginTop: 'auto',
    gap: 12,
  },
  clearButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  clearButtonText: {
    fontSize: 16,
    fontFamily: 'Cairo',
    fontWeight: 'bold',
    color: '#333',
  },
  applyButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  applyButtonText: {
    fontSize: 16,
    fontFamily: 'Cairo',
    fontWeight: 'bold',
    color: '#fff',
  },
});
