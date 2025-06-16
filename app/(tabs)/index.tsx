import { usePermissions } from '@/context/PermissionsContext';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { arrayUnion, collection, doc, getDocs, limit, orderBy, query, updateDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, ViewToken } from 'react-native';
import { useSharedValue, withSpring } from 'react-native-reanimated';
import FilterDialog from '../../components/FilterDialog';
import InfoCard from '../../components/InfoCard';
import useFirebaseAuth from '../../hooks/use-firebase-auth';
import { db } from '../../lib/firebase';
import { Comment, ServiceRequest, UserResponse } from '../../lib/types';

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
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const { userUid } = usePermissions();
  const { user } = useFirebaseAuth();
  const router = useRouter();
  // Animation values
  const viewableItems = useSharedValue<ViewToken[]>([]);
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
        where("assignedUsers", "array-contains", userUid),
        orderBy('createdAt', 'desc'),
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
  }, [getStatusFilter, CACHE_DURATION, userUid]);

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

    const filteredData = currentData.filter(req => {
      const matchesSearch = !searchQuery ||
        req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesPriority = !selectedPriority || req.priority === selectedPriority;
      const matchesType = !selectedType || req.type === selectedType;

      return matchesSearch && matchesPriority && matchesType;
    });

    return [...filteredData].sort((a, b) => {
      const dateA = (a.createdAt as any)?.toMillis() || 0;
      const dateB = (b.createdAt as any)?.toMillis() || 0;
      if (sortOrder === 'asc') {
        return dateA - dateB;
      }
      return dateB - dateA;
    });
  }, [cachedData, activeTab, searchQuery, selectedPriority, selectedType, sortOrder]);

  const handleAcceptTask = async (ticketId: string) => {
    if (!userUid) return;
    try {
      const requestRef = doc(db, "serviceRequests", ticketId);
      // Find the ticket in the 'notAccepted' tab specifically
      const currentTicket = cachedData.Open.find(t => t.id === ticketId);
      if (!currentTicket) return;

      const userResponse: UserResponse = {
        userId: userUid,
        userName: user?.displayName || user?.email?.split("@")[0] || "مستخدم",
        response: "accepted",
        timestamp: new Date().toISOString()
      };
      
      // Update Firestore document
      await updateDoc(requestRef, {
        userResponses: arrayUnion(userResponse),
        lastUpdated: new Date().toISOString(),
        status :"قيد المعالجة"
      });
      
      const acceptanceComment: Comment = {
        id: `comment_${Date.now()}`,
        userId: userUid,
        userName: user?.displayName || user?.email?.split("@")[0] || "مستخدم",
        content: "قبلت المهمة وسأعمل عليها.",
        timestamp: new Date().toISOString()
      };
      await updateDoc(requestRef, { comments: arrayUnion(acceptanceComment) });
      
      fetchTabData('Open', true);
      fetchTabData('Accepted', true);

      router.push(`/tasks/${ticketId}`);
    } catch (error) {
      console.error("Error accepting task:", error);
      Alert.alert("حدث خطأ أثناء قبول المهمة");
    }
  }

  const handleRejectTask = async (ticketId: string) => {
    if (!userUid) return;
    try {
      const requestRef = doc(db, "serviceRequests", ticketId);
      // Find the ticket in its current tab
      const currentTicket = cachedData[activeTab].find(t => t.id === ticketId);
      if (!currentTicket) return;

      const userResponse: UserResponse = {
        userId: userUid,
        userName: user?.displayName || user?.email?.split("@")[0] || "مستخدم",
        response: "rejected",
        timestamp: new Date().toISOString()
      };

      await updateDoc(requestRef, {
        userResponses: arrayUnion(userResponse),
        lastUpdated: new Date().toISOString(),
      });
      
      const rejectionComment: Comment = {
        id: `comment_${Date.now()}`,
        userId: userUid,
        userName: user?.displayName || user?.email?.split("@")[0] || "مستخدم",
        content: "رفضت المهمة. يرجى مراجعة التفاصيل معي.",
        timestamp: new Date().toISOString()
      };
      await updateDoc(requestRef, { comments: arrayUnion(rejectionComment) });

      fetchTabData(activeTab, true);
      Alert.alert("تم رفض المهمة بنجاح");
    } catch (error) {
      console.error("Error rejecting task:", error);
      Alert.alert("حدث خطأ أثناء رفض المهمة");
    }
  }

  // Memoized callbacks for FlatList
  const onViewableItemsChanged = useCallback(({ viewableItems: vItems }: { viewableItems: ViewToken[] }) => {
    viewableItems.value = vItems;
  }, [viewableItems]);

  const renderItem = useCallback(({ item }: { item: ServiceRequest }) => {
    const hasResponded = item.userResponses?.some(res => res.userId === userUid);
    return <InfoCard item={item} viewableItems={viewableItems} handleAcceptTask={handleAcceptTask} handleRejectTask={handleRejectTask} hasResponded={!!hasResponded} />;
  }, [handleAcceptTask, handleRejectTask, viewableItems, userUid]);

  const keyExtractor = useCallback((item: ServiceRequest) => item.id, []);

  // Filter popup animations
  const toggleFilterPopup = useCallback(() => {
   setIsFilterVisible(prev => !prev);
 }, []);

  const clearFilters = useCallback(() => {
    setSelectedPriority(null);
    setSelectedType(null);
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
  }, []);

  // Memoized components
  const TabButton = React.memo(({ tabKey, label }: { tabKey: TabKey; label: string }) => {
    const isActive = activeTab === tabKey;
    const isLoading = loadingStates[tabKey];
    
    return (
      <Pressable
        style={[
          styles.tab, 
          isActive && styles.activeTab, 
          isActive && { backgroundColor: theme.background }
        ]}
        onPressIn={() => handleTabPress(tabKey)}
  
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
      </Pressable>
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

  const SortButton = React.memo(({ onPress }: { onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.iconButton, { backgroundColor: theme.header }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons
        name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
        size={22}
        color={theme.icon}
      />
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
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>التذاكر المسندة إليك</Text>

        </View>
        <Text style={[styles.headerSubtitle, { color: theme.text }]}>
          قائمة التذاكر المسندة إليك من قبل المدير.
        </Text>
      </View>

      <View style={styles.controlsContainer}>
        <SearchInput />
        <FilterButton onPress={toggleFilterPopup} />
        <SortButton onPress={toggleSortOrder} />
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

     <FilterDialog
       isVisible={isFilterVisible}
       onClose={toggleFilterPopup}
       selectedPriority={selectedPriority}
       setSelectedPriority={setSelectedPriority}
       selectedType={selectedType}
       setSelectedType={setSelectedType}
       clearFilters={clearFilters}
       availableTypes={['طلب', 'شكوى', 'اقتراح']}
     />
    </View>
  );
};

export default TasksScreen;

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
  headerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontFamily: 'Cairo',
    fontWeight: 'bold',
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
  // Filter Popup Styles
});
