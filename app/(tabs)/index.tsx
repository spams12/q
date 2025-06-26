import { usePermissions } from '@/context/PermissionsContext';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { arrayUnion, collection, doc, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, ViewToken } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import FilterDialog from '../../components/FilterDialog';
import InfoCard from '../../components/InfoCard';
import useFirebaseAuth from '../../hooks/use-firebase-auth';
import { db } from '../../lib/firebase';
import { Comment, ServiceRequest, UserResponse } from '../../lib/types';


// --- Constants for Filter Options ---
const AVAILABLE_TYPES = ['طلب', 'شكوى', 'اقتراح', 'مشكلة'];
const AVAILABLE_STATUSES = ['جديدة', 'قيد المعالجة', 'تم حلها', 'مغلقة'];
const AVAILABLE_PRIORITIES = ['عالية', 'متوسطة', 'منخفضة'];

type TabKey = 'New' | 'Accepted' | 'Completed';
const LOCATION_TASK_NAME = 'background-location-task';

interface CachedData {
  New: ServiceRequest[];
  Accepted: ServiceRequest[];
  Completed: ServiceRequest[];
}

interface LoadingStates {
  New: boolean;
  Accepted: boolean;
  Completed: boolean;
}

// --- Extracted & Upgraded Components ---

const FilterPill = React.memo(({ label, onRemove }: { label: string; onRemove: () => void }) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.filterPill, { backgroundColor: 'rgba(0, 123, 255, 0.1)' }]}>
      <Text style={[styles.filterPillText, { color: theme.tabActive }]}>{label}</Text>
      <TouchableOpacity onPress={onRemove} style={styles.filterPillRemove}>
        <Ionicons name="close" size={16} color={theme.tabActive} />
      </TouchableOpacity>
    </View>
  );
});
FilterPill.displayName = 'FilterPill';

const ActiveFilters = React.memo(({ filters, onClearFilter, onClearAll }: {
  filters: { priority: string | null; type: string | null; status: string | null; };
  onClearFilter: (key: 'priority' | 'type' | 'status') => void;
  onClearAll: () => void;
}) => {
  const hasFilters = Object.values(filters).some(v => v);
  if (!hasFilters) {
    return null;
  }

  return (
    <View style={styles.activeFiltersWrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsScrollView}>
        {filters.priority && (
          <FilterPill label={`الأولوية: ${filters.priority}`} onRemove={() => onClearFilter('priority')} />
        )}
        {filters.type && (
          <FilterPill label={`النوع: ${filters.type}`} onRemove={() => onClearFilter('type')} />
        )}
        {filters.status && (
          <FilterPill label={`الحالة: ${filters.status}`} onRemove={() => onClearFilter('status')} />
        )}
      </ScrollView>
      <TouchableOpacity onPress={onClearAll}>
        <Text style={styles.clearAllText}>مسح الكل</Text>
      </TouchableOpacity>
    </View>
  );
});
ActiveFilters.displayName = 'ActiveFilters';

const TabButton = React.memo(({ tabKey, label, isActive, isLoading, onPress, theme }: {
  tabKey: TabKey;
  label: string;
  isActive: boolean;
  isLoading: boolean;
  onPress: (tabKey: TabKey) => void;
  theme: any;
}) => (
  <Pressable
    style={[styles.tab, isActive && styles.activeTab, isActive && { backgroundColor: theme.background }]}
    onPress={() => onPress(tabKey)}
  >
    <View style={styles.tabContent}>
      <Text style={[styles.tabText, { color: isActive ? theme.tabActive : theme.tabInactive }]}>{label}</Text>
      {isLoading && <ActivityIndicator size="small" color={theme.tabActive} style={styles.tabLoader} />}
    </View>
  </Pressable>
));
TabButton.displayName = 'TabButton';

const SearchInput = React.memo(({ value, onChangeText, theme }: { value: string; onChangeText: (text: string) => void; theme: any; }) => (
  <View style={[styles.searchContainer, { backgroundColor: theme.header }]}>
    <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
    <TextInput
      style={[styles.searchInput, { color: theme.text }]}
      placeholder="بحث عن تكت..."
      placeholderTextColor="#888"
      value={value}
      onChangeText={onChangeText}
      returnKeyType="search"
    />
  </View>
));
SearchInput.displayName = 'SearchInput';

const FilterButton = React.memo(({ onPress, theme, hasActiveFilters }: { onPress: () => void; theme: any; hasActiveFilters: boolean; }) => (
  <TouchableOpacity
    style={[styles.iconButton, { backgroundColor: theme.header }]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Ionicons name="filter" size={22} color={hasActiveFilters ? theme.tabActive : theme.icon} />
    {hasActiveFilters && <View style={[styles.filterDot, { backgroundColor: theme.tabActive }]} />}
  </TouchableOpacity>
));
FilterButton.displayName = 'FilterButton';

const SortButton = React.memo(({ onPress, sortOrder, theme }: { onPress: () => void; sortOrder: 'asc' | 'desc'; theme: any; }) => (
  <TouchableOpacity
    style={[styles.iconButton, { backgroundColor: theme.header }]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Ionicons name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'} size={22} color={theme.icon} />
  </TouchableOpacity>
));
SortButton.displayName = 'SortButton';

interface ListHeaderProps {
  theme: any;
  searchQuery: string;
  setSearchQuery: (text: string) => void;
  toggleFilterPopup: () => void;
  toggleSortOrder: () => void;
  sortOrder: 'asc' | 'desc';
  activeTab: TabKey;
  loadingStates: LoadingStates;
  handleTabPress: (tab: TabKey) => void;
  hasActiveFilters: boolean;
  filters: { priority: string | null; type: string | null; status: string | null; };
  handleClearFilter: (key: 'priority' | 'type' | 'status') => void;
  clearFilters: () => void;
}

const ListHeader = React.memo(({
  theme,
  searchQuery,
  setSearchQuery,
  toggleFilterPopup,
  toggleSortOrder,
  sortOrder,
  activeTab,
  loadingStates,
  handleTabPress,
  hasActiveFilters,
  filters,
  handleClearFilter,
  clearFilters,
}: ListHeaderProps) => (
  <>
    <View style={styles.headerContainer}>
      <Text style={[styles.headerTitle, { color: theme.text }]}>المهام</Text>
      <Text style={[styles.headerSubtitle, { color: theme.text }]}>قائمة المهام المسندة إليك من قبل المدير.</Text>
    </View>

    <View style={styles.controlsContainer}>
      <SearchInput value={searchQuery} onChangeText={setSearchQuery} theme={theme} />
      <FilterButton onPress={toggleFilterPopup} theme={theme} hasActiveFilters={hasActiveFilters} />
      <SortButton onPress={toggleSortOrder} sortOrder={sortOrder} theme={theme} />
    </View>

    <View style={[styles.tabsContainer, { backgroundColor: theme.header }]}>
      <TabButton tabKey="New" label="جديدة" isActive={activeTab === 'New'} isLoading={loadingStates.New} onPress={handleTabPress} theme={theme} />
      <TabButton tabKey="Accepted" label="مقبولة" isActive={activeTab === 'Accepted'} isLoading={loadingStates.Accepted} onPress={handleTabPress} theme={theme} />
      <TabButton tabKey="Completed" label="مكتمله" isActive={activeTab === 'Completed'} isLoading={loadingStates.Completed} onPress={handleTabPress} theme={theme} />
    </View>
    
    <ActiveFilters filters={filters} onClearFilter={handleClearFilter} onClearAll={clearFilters} />
  </>
));
ListHeader.displayName = 'ListHeader';

const ListEmptyComponent = React.memo(({ isLoading, theme, hasActiveFilters }: { isLoading: boolean; theme: any; hasActiveFilters: boolean; }) => {
    if (isLoading) {
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
                {hasActiveFilters ? "لا توجد نتائج تطابق بحثك" : "لا توجد تذاكر في هذا القسم"}
            </Text>
        </View>
    );
});
ListEmptyComponent.displayName = 'ListEmptyComponent';

const getMillis = (timestamp: any): number => {
    if (!timestamp) return 0;
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
    if (typeof timestamp === 'string') {
        const date = new Date(timestamp);
        return isNaN(date.getTime()) ? 0 : date.getTime();
    }
    if (typeof timestamp === 'number') return timestamp;
    if (timestamp.seconds && typeof timestamp.seconds === 'number') return timestamp.seconds * 1000;
    return 0;
};

const TasksScreen: React.FC = () => {
  const [cachedData, setCachedData] = useState<CachedData>({ New: [], Accepted: [], Completed: [] });
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({ New: true, Accepted: true, Completed: true });
  const [activeTab, setActiveTab] = useState<TabKey>('New');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  console.log("renderd index")
  // Filter States
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  const { userUid } = usePermissions(); // From new context
  const { user } = useFirebaseAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const viewableItems = useSharedValue<ViewToken[]>([]);
  const isFocused = useIsFocused();
  
useEffect(() => {
  if (!userUid) {
    setCachedData({ New: [], Accepted: [], Completed: [] });
    setLoadingStates({ New: false, Accepted: false, Completed: false });
    return;
  }

  // If the screen is not focused, we don't want to fetch data.
  // The cleanup function from the previous render will handle unsubscribing.
  if (!isFocused) {
    return;
  }

  setLoadingStates({ New: true, Accepted: true, Completed: true });

  const q = query(
    collection(db, 'serviceRequests'),
    where("assignedUsers", "array-contains", userUid),
    orderBy('createdAt', 'desc')
  );

  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const allRequests = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ServiceRequest));

    const newData: CachedData = { New: [], Accepted: [], Completed: [] };
    
    allRequests.forEach(req => {
      // Skip tickets with status 'معلق'
      if (req.status === 'معلق') {
        return;
      }

      // First check if the ticket itself is completed/closed - this takes priority
      if (req.status === 'مكتمل' || req.status === 'مغلق') {
        newData.Completed.push(req);
      } else {
        // Check user response
        const userResponse = req.userResponses?.find(res => res.userId === userUid);
        if (userResponse?.response === 'rejected') {
          return;
        }
        if (userResponse?.response === 'completed') {
          newData.Completed.push(req);
        } else if (userResponse?.response === 'accepted') {
          newData.Accepted.push(req);
        } else {
          newData.New.push(req);
        }
      }
    });

    setCachedData(newData);
    setLoadingStates({ New: false, Accepted: false, Completed: false });
  }, (error) => {
    console.error(`Error fetching real-time requests:`, error);
    setCachedData({ New: [], Accepted: [], Completed: [] });
    setLoadingStates({ New: false, Accepted: false, Completed: false });
  });

  return () => unsubscribe();
}, [userUid, isFocused]);

  const hasActiveFilters = !!(selectedPriority || selectedType || selectedStatus);

  const filteredServiceRequests = useMemo(() => {
    const currentData = cachedData[activeTab] || [];
    const filteredData = currentData.filter(req => {
      const matchesSearch = !searchQuery ||
        req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (req.customerName && req.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        req.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesPriority = !selectedPriority || req.priority === selectedPriority;
      const matchesType = !selectedType || req.type === selectedType;
      const matchesStatus = !selectedStatus || req.status === selectedStatus;

      return matchesSearch && matchesPriority && matchesType && matchesStatus;
    });

    return [...filteredData].sort((a, b) => {
      const dateA = getMillis(a.createdAt);
      const dateB = getMillis(b.createdAt);
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }, [cachedData, activeTab, searchQuery, selectedPriority, selectedType, selectedStatus, sortOrder]);

  const handleTabPress = useCallback(async (tab: TabKey) => {
    if (tab === activeTab) return;
    try {
      await Haptics.selectionAsync();
    } catch {}
    setActiveTab(tab);
  }, [activeTab]);
  
  const handleAcceptTask = async (ticketId: string) => {
    if (!userUid) return;
    // ... (rest of the function is unchanged)
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      Alert.alert('Permission required', 'Please grant foreground location permission.');
      return;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      Alert.alert('Permission required', 'Please grant background location permission for tracking.');
      return;
    }

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 60000,
      distanceInterval: 50,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Tracking Your Location',
        notificationBody: 'Your location is being tracked for the current task.',
      },
    });

    try {
      const requestRef = doc(db, "serviceRequests", ticketId);
      const userResponse: UserResponse = {
        userId: userUid,
        userName: user?.displayName || "مستخدم",
        response: "accepted",
        timestamp: new Date().toISOString()
      };
      
      await updateDoc(requestRef, {
        userResponses: arrayUnion(userResponse),
        lastUpdated: new Date().toISOString(),
        status :"قيد المعالجة"
      });
      
      const acceptanceComment: Comment = {
        id: `comment_${Date.now()}`,
        userId: userUid,
        userName: user?.displayName || "مستخدم",
        content: "قبلت المهمة وسأعمل عليها.",
        timestamp: new Date().toISOString()
      };
      await updateDoc(requestRef, { comments: arrayUnion(acceptanceComment) });
      
      router.push(`/tasks/${ticketId}`);
    } catch (error) {
      console.error("Error accepting task:", error);
      Alert.alert("حدث خطأ أثناء قبول المهمة");
    }
  }

  const handleRejectTask = async (ticketId: string) => {
     // ... (function is unchanged)
    if (!userUid) return;

    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }

    try {
      const requestRef = doc(db, "serviceRequests", ticketId);
      const userResponse: UserResponse = {
        userId: userUid,
        userName: user?.displayName || "مستخدم",
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
        userName: user?.displayName || "مستخدم",
        content: "رفضت المهمة. يرجى مراجعة التفاصيل معي.",
        timestamp: new Date().toISOString()
      };
      await updateDoc(requestRef, { comments: arrayUnion(rejectionComment) });

      Alert.alert("تم رفض المهمة بنجاح");
    } catch (error) {
      console.error("Error rejecting task:", error);
      Alert.alert("حدث خطأ أثناء رفض المهمة");
    }
  }
  
  const onViewableItemsChanged = useCallback(({ viewableItems: vItems }: { viewableItems: ViewToken[] }) => { viewableItems.value = vItems; }, [viewableItems]);
  const renderItem = useCallback(({ item }: { item: ServiceRequest }) => {
    const hasResponded = item.userResponses?.some(res => res.userId === userUid);
    return <InfoCard item={item} viewableItems={viewableItems} handleAcceptTask={handleAcceptTask} handleRejectTask={handleRejectTask} hasResponded={!!hasResponded} />;
  }, [handleAcceptTask, handleRejectTask, viewableItems, userUid]);
  const keyExtractor = useCallback((item: ServiceRequest) => item.id, []);
  const toggleFilterPopup = useCallback(() => setIsFilterVisible(prev => !prev), []);
  const toggleSortOrder = useCallback(() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc')), []);
  
  const clearFilters = useCallback(() => {
    setSelectedPriority(null);
    setSelectedType(null);
    setSelectedStatus(null);
  }, []);
  
  const handleClearFilter = useCallback((filterKey: 'priority' | 'type' | 'status') => {
    if (filterKey === 'priority') setSelectedPriority(null);
    if (filterKey === 'type') setSelectedType(null);
    if (filterKey === 'status') setSelectedStatus(null);
  }, []);

  const renderListEmpty = useCallback(() => (
    <ListEmptyComponent isLoading={loadingStates[activeTab]} theme={theme} hasActiveFilters={hasActiveFilters} />
  ), [loadingStates[activeTab], theme, hasActiveFilters]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={filteredServiceRequests}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={
          <ListHeader
            theme={theme}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            toggleFilterPopup={toggleFilterPopup}
            toggleSortOrder={toggleSortOrder}
            sortOrder={sortOrder}
            activeTab={activeTab}
            loadingStates={loadingStates}
            handleTabPress={handleTabPress}
            hasActiveFilters={hasActiveFilters}
            filters={{ priority: selectedPriority, type: selectedType, status: selectedStatus }}
            handleClearFilter={handleClearFilter}
            clearFilters={clearFilters}
          />
        }
        ListEmptyComponent={renderListEmpty}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />

     <FilterDialog
       isVisible={isFilterVisible}
       onClose={toggleFilterPopup}
       clearFilters={clearFilters}
       selectedPriority={selectedPriority}
       setSelectedPriority={setSelectedPriority}
       availablePriorities={AVAILABLE_PRIORITIES}
       selectedType={selectedType}
       setSelectedType={setSelectedType}
       availableTypes={AVAILABLE_TYPES}
       selectedStatus={selectedStatus}
       setSelectedStatus={setSelectedStatus}
       availableStatuses={AVAILABLE_STATUSES}
              showStatus={false}
       
     />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
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
  filterDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fff',
  },
  tabsContainer: {
    flexDirection: 'row-reverse',
    marginBottom: 8,
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
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  tabText: {
    fontWeight: 'bold',
    fontFamily: 'Cairo',
    fontSize: 14,
  },
  tabLoader: {
    marginLeft: 4,
  },
  activeFiltersWrapper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 36,
  },
  pillsScrollView: {
    flexGrow: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 8,
  },
  filterPillText: {
    fontSize: 13,
    fontFamily: 'Cairo',
    fontWeight: '600',
  },
  filterPillRemove: {
    marginLeft: -4,
  },
  clearAllText: {
    color: '#007bff',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Cairo',
    marginLeft: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Cairo',
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
});

export default React.memo(TasksScreen);