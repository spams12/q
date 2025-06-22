import { usePermissions } from '@/context/PermissionsContext';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { arrayUnion, collection, doc, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, ViewToken } from 'react-native';
import { useSharedValue, withSpring } from 'react-native-reanimated';
import FilterDialog from '../../components/FilterDialog';
import InfoCard from '../../components/InfoCard';
import useFirebaseAuth from '../../hooks/use-firebase-auth';
import { db } from '../../lib/firebase';
import { Comment, ServiceRequest, UserResponse } from '../../lib/types';

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

// Extracted Components

interface TabButtonProps {
  tabKey: TabKey;
  label: string;
  isActive: boolean;
  isLoading: boolean;
  onPress: (tabKey: TabKey) => void;
  theme: any;
}

const TabButton = React.memo(({ tabKey, label, isActive, isLoading, onPress, theme }: TabButtonProps) => (
  <Pressable
    style={[
      styles.tab,
      isActive && styles.activeTab,
      isActive && { backgroundColor: theme.background }
    ]}
    onPressIn={() => onPress(tabKey)}
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
));
TabButton.displayName = 'TabButton';

interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  theme: any;
}

const SearchInput = React.memo(({ value, onChangeText, theme }: SearchInputProps) => (
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

interface FilterButtonProps {
    onPress: () => void;
    theme: any;
}

const FilterButton = React.memo(({ onPress, theme }: FilterButtonProps) => (
  <TouchableOpacity
    style={[styles.iconButton, { backgroundColor: theme.header }]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Ionicons name="filter" size={22} color={theme.icon} />
  </TouchableOpacity>
));
FilterButton.displayName = 'FilterButton';

interface SortButtonProps {
    onPress: () => void;
    sortOrder: 'asc' | 'desc';
    theme: any;
}

const SortButton = React.memo(({ onPress, sortOrder, theme }: SortButtonProps) => (
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
  selectedPriority: string | null;
  selectedType: string | null;
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
  selectedPriority,
  selectedType,
  clearFilters,
}: ListHeaderProps) => (
  <>
    <View style={styles.headerContainer}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>المهام</Text>
      </View>
      <Text style={[styles.headerSubtitle, { color: theme.text }]}>
        قائمة المهام المسندة إليك من قبل المدير.
      </Text>
    </View>

    <View style={styles.controlsContainer}>
      <SearchInput value={searchQuery} onChangeText={setSearchQuery} theme={theme} />
      <FilterButton onPress={toggleFilterPopup} theme={theme} />
      <SortButton onPress={toggleSortOrder} sortOrder={sortOrder} theme={theme} />
    </View>

    <View style={[styles.tabsContainer, { backgroundColor: theme.header }]}>
      <TabButton tabKey="New" label="جديدة" isActive={activeTab === 'New'} isLoading={loadingStates.New} onPress={handleTabPress} theme={theme} />
      <TabButton tabKey="Accepted" label="مقبولة" isActive={activeTab === 'Accepted'} isLoading={loadingStates.Accepted} onPress={handleTabPress} theme={theme} />
      <TabButton tabKey="Completed" label="مكتمله" isActive={activeTab === 'Completed'} isLoading={loadingStates.Completed} onPress={handleTabPress} theme={theme} />
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

interface ListEmptyProps {
    isLoading: boolean;
    theme: any;
}

const ListEmptyComponent = React.memo(({ isLoading, theme }: ListEmptyProps) => {
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
                لا توجد تذاكر في هذا القسم
            </Text>
        </View>
    );
});
ListEmptyComponent.displayName = 'ListEmptyComponent';

const getMillis = (timestamp: any): number => {
    if (!timestamp) return 0;
    if (typeof timestamp.toMillis === 'function') {
        return timestamp.toMillis(); // Firestore Timestamp
    }
    if (typeof timestamp === 'string') {
        const date = new Date(timestamp);
        return isNaN(date.getTime()) ? 0 : date.getTime(); // ISO String
    }
    if (typeof timestamp === 'number') {
        return timestamp; // Milliseconds
    }
    if (timestamp.seconds && typeof timestamp.seconds === 'number') {
        return timestamp.seconds * 1000; // Firestore-like object
    }
    return 0;
};

const TasksScreen: React.FC = () => {
  // Data caching states
  const [cachedData, setCachedData] = useState<CachedData>({
    New: [],
    Accepted: [],
    Completed: [],
  });
  
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({
    New: true,
    Accepted: true,
    Completed: true,
  });

  // UI states
  const [activeTab, setActiveTab] = useState<TabKey>('New');
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

  // Real-time data fetching
  useEffect(() => {
    if (!userUid) {
      setCachedData({ New: [], Accepted: [], Completed: [] });
      setLoadingStates({ New: false, Accepted: false, Completed: false });
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
        if (req.status === 'مكتمل') {
          newData.Completed.push(req);
        } else {
          const userResponse = req.userResponses?.find(res => res.userId === userUid);
          if (userResponse) {
            if (userResponse.response === 'accepted') {
              newData.Accepted.push(req);
            }
            // Rejected tasks are ignored as there's no tab for them now
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
  }, [userUid]);

  // Optimized tab switching with haptic feedback
  const handleTabPress = useCallback(async (tab: TabKey) => {
    if (tab === activeTab) return;

    try {
      await Haptics.selectionAsync();
    } catch {
      // Haptics not available
    }

    setActiveTab(tab);
    
    const tabIndex = ['New', 'Accepted', 'Completed'].indexOf(tab);
    tabIndicatorX.value = withSpring(tabIndex * (Dimensions.get('window').width / 3 - 32));

  }, [activeTab, tabIndicatorX]);

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
      const dateA = getMillis(a.createdAt);
      const dateB = getMillis(b.createdAt);
      if (sortOrder === 'asc') {
        return dateA - dateB;
      }
      return dateB - dateA;
    });
  }, [cachedData, activeTab, searchQuery, selectedPriority, selectedType, sortOrder]);

  const handleAcceptTask = async (ticketId: string) => {
    if (!userUid) return;

    // Request permissions and start location tracking
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
      timeInterval: 60000, // 1 minute
      distanceInterval: 50, // 50 meters
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Tracking Your Location',
        notificationBody: 'Your location is being tracked for the current task.',
      },
    });

    try {
      const requestRef = doc(db, "serviceRequests", ticketId);
      // Find the ticket in the 'notAccepted' tab specifically
      const currentTicket = cachedData.New.find((t: ServiceRequest) => t.id === ticketId);
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
      
      router.push(`/tasks/${ticketId}`);
    } catch (error) {
      console.error("Error accepting task:", error);
      Alert.alert("حدث خطأ أثناء قبول المهمة");
    }
  }

  const handleRejectTask = async (ticketId: string) => {
    if (!userUid) return;

    // Stop location tracking if it was started for this task
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }

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


  const isCurrentTabLoading = loadingStates[activeTab];
  const hasActiveFilters = !!(selectedPriority || selectedType);

  const renderListEmpty = useCallback(() => (
    <ListEmptyComponent isLoading={isCurrentTabLoading} theme={theme} />
  ), [isCurrentTabLoading, theme]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={filteredServiceRequests}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={<ListHeader
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
          selectedPriority={selectedPriority}
          selectedType={selectedType}
          clearFilters={clearFilters}
        />}
        ListEmptyComponent={renderListEmpty}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={10}
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
    gap: 2,
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
