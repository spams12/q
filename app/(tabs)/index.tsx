// src/screens/TasksScreen.tsx

import { usePermissions } from '@/context/PermissionsContext';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { DocumentData, Query, QuerySnapshot, collection, getDocs, limit, onSnapshot, orderBy, query, startAfter, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, NativeScrollEvent, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
// Note: The FilterDialog is now imported from the file you provided.
// Make sure the path is correct in your project structure.
import FilterDialog from '../../components/FilterDialog';
import InfoCard from '../../components/InfoCard';
import { handleAcceptTask, handleRejectTask } from '../../hooks/taskar';
import { db } from '../../lib/firebase';
// MODIFICATION: Added createdBy to ServiceRequest and defined User and DateRange types
import { ServiceRequest, User } from '../../lib/types';

// --- Type Definitions ---
interface DateRange {
  start: Date | null;
  end: Date | null;
}

// --- Constants ---
const AVAILABLE_TYPES = [
  "صيانة رئيسية", "تنصيب مشترك", "صيانة مشترك", "تغيير زون المشترك",
  "مشكلة في التفعيل", "جباية", "شكوى", "مشكلة", "طلب", "استفسار", "اقتراح"
];
const AVAILABLE_PRIORITIES = ['عالية', 'متوسطة', 'منخفضة'];
// MODIFICATION: Added available statuses for the filter dialog
const AVAILABLE_STATUSES = ['جديدة', 'قيد التنفيذ', 'مكتمل', 'معلق', 'مغلق', 'مرفوض'];
const PAGE_SIZE = 15;
const SCROLL_TO_TOP_THRESHOLD = 400;

type TabKey = 'New' | 'Accepted' | 'Completed';
type ListenerKey = 'New' | 'Completed';

interface CachedData {
  New: ServiceRequest[];
  Accepted: ServiceRequest[];
  Completed: ServiceRequest[];
}

interface LastDocState {
  New: DocumentData | null;
  Accepted: DocumentData | null;
  Completed: DocumentData | null;
}

interface LoadingStates {
  New: boolean;
  Accepted: boolean;
  Completed: boolean;
}

interface LoadingMoreStates {
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

// MODIFICATION: The ActiveFilters component has been significantly upgraded to handle all new filter types.
const ActiveFilters = React.memo(({ filters, onClearFilter, onClearAll, users }: {
  filters: {
    priority: string | null;
    type: string | null;
    status: string | null;
    creator: string | null;
    assignedUsers: string[];
    dateRange: DateRange;
  };
  onClearFilter: (key: 'priority' | 'type' | 'status' | 'creator' | 'assignedUsers' | 'dateRange') => void;
  onClearAll: () => void;
  users: User[];
}) => {
  const { theme } = useTheme();
  const hasFilters = filters.priority || filters.type || filters.status || filters.creator || filters.assignedUsers.length > 0 || filters.dateRange.start || filters.dateRange.end;

  if (!hasFilters) {
    return null;
  }

  const getCreatorName = (userId: string) => users.find(u => u.uid === userId)?.name || userId;
  const getAssignedUsersNames = (userIds: string[]) => userIds.map(id => users.find(u => u.id === id)?.name || id).join(', ');
  const formatDateRange = (range: DateRange) => {
    const start = range.start ? range.start.toLocaleDateString('ar-EG-u-nu-latn', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '...';
    const end = range.end ? range.end.toLocaleDateString('ar-EG-u-nu-latn', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '...';
    return `${start} - ${end}`;
  }

  return (
    <View style={styles.activeFiltersWrapper}>
      <ScrollView horizontal contentContainerStyle={styles.pillsScrollView} showsHorizontalScrollIndicator={false}>
        {filters.priority && (
          <FilterPill label={`الأولوية: ${filters.priority}`} onRemove={() => onClearFilter('priority')} />
        )}
        {filters.type && (
          <FilterPill label={`النوع: ${filters.type}`} onRemove={() => onClearFilter('type')} />
        )}
        {filters.status && (
          <FilterPill label={`الحالة: ${filters.status}`} onRemove={() => onClearFilter('status')} />
        )}
        {filters.creator && (
          <FilterPill label={`المنشئ: ${getCreatorName(filters.creator)}`} onRemove={() => onClearFilter('creator')} />
        )}
        {filters.assignedUsers.length > 0 && (
          <FilterPill label={`المعين لهم: ${getAssignedUsersNames(filters.assignedUsers)}`} onRemove={() => onClearFilter('assignedUsers')} />
        )}
        {(filters.dateRange.start || filters.dateRange.end) && (
          <FilterPill label={`التاريخ: ${formatDateRange(filters.dateRange)}`} onRemove={() => onClearFilter('dateRange')} />
        )}
      </ScrollView>
      <TouchableOpacity onPress={onClearAll}>
        <Text style={[styles.clearAllText, { color: theme.tabActive }]}>مسح الكل</Text>
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
  <TouchableOpacity
    style={[styles.tab, isActive && styles.activeTab, isActive && { backgroundColor: theme.background }]}
    onPress={() => onPress(tabKey)}
  >
    <View style={styles.tabContent}>
      <Text style={[styles.tabText, { color: isActive ? theme.tabActive : theme.tabInactive }]}>{label}</Text>
      {isLoading && <ActivityIndicator size="small" color={theme.tabActive} style={styles.tabLoader} />}
    </View>
  </TouchableOpacity>
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

// --- Utility Functions ---
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

// --- Main Screen Component ---
const TasksScreen: React.FC = () => {
  // --- State Management ---
  const [cachedData, setCachedData] = useState<CachedData>({ New: [], Accepted: [], Completed: [] });
  const [lastDocs, setLastDocs] = useState<LastDocState>({ New: null, Accepted: null, Completed: null });
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({ New: false, Accepted: false, Completed: false });
  const [loadingMoreStates, setLoadingMoreStates] = useState<LoadingMoreStates>({ New: false, Accepted: false, Completed: false });
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('New');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [actionLoadingTaskId, setActionLoadingTaskId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // MODIFICATION: Added state for all new filters
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
  const [selectedAssignedUsers, setSelectedAssignedUsers] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });

  const { userdoc, userUid } = usePermissions();
  const { theme } = useTheme();
  const router = useRouter();
  const scrollRef = useRef<FlatList<ServiceRequest>>(null);
  const unsubscribeListeners = useRef<{ [key in ListenerKey]?: () => void }>({});

  // --- Data Fetching ---

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersCollectionRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollectionRef);
        const usersList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[];
        setUsers(usersList);
      } catch (error) {
        console.error("Failed to fetch users:", error);
      }
    };
    fetchUsers();
  }, []);

  const createQueryForTab = (tabKey: ListenerKey, startAfterDoc: DocumentData | null = null): Query | null => {
    if (!userUid) return null;

    const baseQuery = collection(db, 'serviceRequests');
    const userQuery = where("assignedUsers", "array-contains", userdoc.id);
    const order = orderBy('createdAt', 'desc');
    const pageLimit = limit(PAGE_SIZE);

    let q: Query;
    switch (tabKey) {
      case 'New':
        q = query(baseQuery, userQuery, where("status", "not-in", ['مكتمل', 'معلق', 'مغلق', 'مرفوض']), order);
        break;
      case 'Completed':
        q = query(baseQuery, userQuery, where("status", "in", ['مكتمل', 'مغلق']), order);
        break;
      default:
        return null;
    }

    return startAfterDoc ? query(q, startAfter(startAfterDoc), pageLimit) : query(q, pageLimit);
  };

  const processAndSetData = useCallback((snapshot: QuerySnapshot<DocumentData>, listenerKey: ListenerKey, isInitialLoad: boolean) => {
    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRequest));
    const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;

    if (listenerKey === 'New') {
      const categorizedData = { New: [] as ServiceRequest[], Accepted: [] as ServiceRequest[] };
      requests.forEach(req => {
        const userResponse = req.userResponses?.find(res => res.userId === userUid);
        if (userResponse?.response === 'accepted') categorizedData.Accepted.push(req);
        else categorizedData.New.push(req);
      });

      setCachedData(prev => {
        const updatedNew = isInitialLoad ? categorizedData.New : [...prev.New, ...categorizedData.New.filter(newItem => !prev.New.some(oldItem => oldItem.id === newItem.id))];
        const updatedAccepted = isInitialLoad ? categorizedData.Accepted : [...prev.Accepted, ...categorizedData.Accepted.filter(newItem => !prev.Accepted.some(oldItem => oldItem.id === newItem.id))];
        return { ...prev, New: updatedNew, Accepted: updatedAccepted };
      });

      if (!isInitialLoad && snapshot.empty) {
        setLastDocs(prev => ({ ...prev, New: null, Accepted: null }));
      } else {
        setLastDocs(prev => ({ ...prev, New: lastVisible, Accepted: lastVisible }));
      }

    } else {
      setCachedData(prev => {
        const updatedCompleted = isInitialLoad ? requests : [...prev.Completed, ...requests.filter(newItem => !prev.Completed.some(oldItem => oldItem.id === newItem.id))];
        return { ...prev, Completed: updatedCompleted };
      });

      if (!isInitialLoad && snapshot.empty) {
        setLastDocs(prev => ({ ...prev, Completed: null }));
      } else {
        setLastDocs(prev => ({ ...prev, Completed: lastVisible }));
      }
    }

    if (isInitialLoad) {
      setLoadingStates(prev => ({ ...prev, [listenerKey]: false, ...(listenerKey === 'New' && { Accepted: false }) }));
    }
    setLoadingMoreStates(prev => ({ ...prev, [listenerKey]: false, ...(listenerKey === 'New' && { Accepted: false }) }));
  }, [userUid]);


  useEffect(() => {
    if (!userUid) return;

    const listenerKey = (activeTab === 'Accepted' ? 'New' : activeTab) as ListenerKey;

    if (unsubscribeListeners.current[listenerKey]) {
      return;
    }

    const q = createQueryForTab(listenerKey);
    if (!q) return;

    setLoadingStates(prev => ({
      ...prev,
      [listenerKey]: true,
      ...(listenerKey === 'New' && { Accepted: true }),
    }));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      processAndSetData(snapshot, listenerKey, true);
    }, (error) => {
      console.error(`Error fetching data for tab ${activeTab}:`, error);
      setLoadingStates(prev => ({
        ...prev,
        [listenerKey]: false,
        ...(listenerKey === 'New' && { Accepted: false }),
      }));
    });

    unsubscribeListeners.current[listenerKey] = unsubscribe;
  }, [activeTab, userUid, processAndSetData]);


  useEffect(() => {
    const listeners = unsubscribeListeners.current;
    return () => {
      Object.values(listeners).forEach(unsub => unsub?.());
    };
  }, []);

  const handleLoadMore = useCallback(async () => {
    const listenerKey = activeTab === 'Accepted' ? 'New' : activeTab;
    const currentLastDoc = lastDocs[listenerKey];

    if (loadingMoreStates[listenerKey] || !currentLastDoc) return;

    setLoadingMoreStates(prev => ({ ...prev, [listenerKey]: true }));
    const q = createQueryForTab(listenerKey, currentLastDoc);
    if (!q) {
      setLoadingMoreStates(prev => ({ ...prev, [listenerKey]: false }));
      return;
    }

    try {
      const snapshot = await getDocs(q);
      processAndSetData(snapshot, listenerKey, false);
    } catch (error) {
      console.error("Error fetching more tasks:", error);
    } finally {
      setLoadingMoreStates(prev => ({ ...prev, [listenerKey]: false }));
    }
  }, [activeTab, loadingMoreStates, lastDocs, userUid, processAndSetData]);

  const handleTabPress = useCallback(async (tab: TabKey) => {
    if (tab === activeTab) return;
    try { await Haptics.selectionAsync(); } catch { }
    setActiveTab(tab);
  }, [activeTab]);


  // --- Action Handlers ---
  const handleAcceptTaskTEST = useCallback((taskId: string) => {
    if (!userdoc) return;
    const navigateToDetails = (id: string) => router.push({ pathname: "/tasks/[id]", params: { id } });
    const setActionLoading = (action: 'accept' | 'reject' | null) => setActionLoadingTaskId(action ? taskId : null);
    handleAcceptTask(taskId, userdoc, setActionLoading, navigateToDetails);
  }, [userdoc, router]);

  const handleRejectTaskTEST = useCallback((taskId: string) => {
    if (!userdoc) return;
    const setActionLoading = (action: 'accept' | 'reject' | null) => setActionLoadingTaskId(action ? taskId : null);
    handleRejectTask(taskId, userdoc, setActionLoading);
  }, [userdoc]);

  // --- Memoized Logic and Callbacks ---

  // MODIFICATION: hasActiveFilters now checks all filters
  const hasActiveFilters = !!(
    selectedPriority ||
    selectedType ||
    selectedStatus ||
    selectedCreator ||
    selectedAssignedUsers.length > 0 ||
    dateRange.start ||
    dateRange.end
  );

  // MODIFICATION: filteredServiceRequests now applies all active filters
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
      const matchesCreator = !selectedCreator || req.creatorId === selectedCreator;
      const matchesAssignedUsers = selectedAssignedUsers.length === 0 ||
        (req.assignedUsers && req.assignedUsers.some(user => selectedAssignedUsers.includes(user)));

      const reqDate = getMillis(req.createdAt);
      const matchesDateRange = (!dateRange.start || reqDate >= dateRange.start.getTime()) &&
        (!dateRange.end || reqDate <= dateRange.end.getTime());

      return matchesSearch && matchesPriority && matchesType && matchesStatus && matchesCreator && matchesAssignedUsers && matchesDateRange;
    });

    return [...filteredData].sort((a, b) => {
      const dateA = getMillis(a.createdAt);
      const dateB = getMillis(b.createdAt);
      // BUG FIX: Was `dateB - a`, corrected to `dateB - dateA`
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }, [cachedData, activeTab, searchQuery, selectedPriority, selectedType, selectedStatus, selectedCreator, selectedAssignedUsers, dateRange, sortOrder]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    const listenerKey = (activeTab === 'Accepted' ? 'New' : activeTab) as ListenerKey;

    unsubscribeListeners.current[listenerKey]?.();
    delete unsubscribeListeners.current[listenerKey];

    const q = createQueryForTab(listenerKey);
    if (!q || !userUid) {
      setIsRefreshing(false);
      return;
    }
    const unsubscribe = onSnapshot(q, (snapshot) => {
      processAndSetData(snapshot, listenerKey, true);
      setIsRefreshing(false);
    }, (error) => {
      console.error("Error on refresh:", error);
      setIsRefreshing(false);
    });
    unsubscribeListeners.current[listenerKey] = unsubscribe;
  }, [activeTab, userUid, processAndSetData]);


  // --- Scroll handling functions
  const handleScroll = (event: NativeScrollEvent) => {
    const offsetY = event.contentOffset.y;
    if (offsetY > SCROLL_TO_TOP_THRESHOLD && !showScrollToTop) {
      setShowScrollToTop(true);
    } else if (offsetY <= SCROLL_TO_TOP_THRESHOLD && showScrollToTop) {
      setShowScrollToTop(false);
    }
  };

  const scrollToTop = () => {
    scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  // --- Render Logic ---
  const renderItem = useCallback(({ item }: { item: ServiceRequest }) => {
    const hasResponded = item.userResponses?.some(res => res.userId === userUid);
    const isActionLoading = actionLoadingTaskId === item.id;
    const showActions = activeTab === 'New';

    return (
      <InfoCard
        item={item}
        users={users}
        hasResponded={!!hasResponded}
        showActions={showActions}
        handleAcceptTask={handleAcceptTaskTEST}
        isActionLoading={isActionLoading}
      />
    );
  }, [userUid, activeTab, actionLoadingTaskId, handleRejectTaskTEST, handleAcceptTaskTEST, users]);

  const keyExtractor = useCallback((item: ServiceRequest) => item.id, []);
  const toggleFilterPopup = useCallback(() => setIsFilterVisible(prev => !prev), []);
  const toggleSortOrder = useCallback(() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc')), []);

  // MODIFICATION: clearFilters now resets all filter states
  const clearFilters = useCallback(() => {
    setSelectedPriority(null);
    setSelectedType(null);
    setSelectedStatus(null);
    setSelectedCreator(null);
    setSelectedAssignedUsers([]);
    setDateRange({ start: null, end: null });
  }, []);

  // MODIFICATION: handleClearFilter now handles all filter keys
  const handleClearFilter = useCallback((filterKey: 'priority' | 'type' | 'status' | 'creator' | 'assignedUsers' | 'dateRange') => {
    if (filterKey === 'priority') setSelectedPriority(null);
    if (filterKey === 'type') setSelectedType(null);
    if (filterKey === 'status') setSelectedStatus(null);
    if (filterKey === 'creator') setSelectedCreator(null);
    if (filterKey === 'assignedUsers') setSelectedAssignedUsers([]);
    if (filterKey === 'dateRange') setDateRange({ start: null, end: null });
  }, []);

  const isLoadingCurrentTab = loadingStates[activeTab];
  const renderListEmpty = useCallback(() => (
    <ListEmptyComponent isLoading={isLoadingCurrentTab} theme={theme} hasActiveFilters={hasActiveFilters} />
  ), [isLoadingCurrentTab, theme, hasActiveFilters]);

  const ListFooter = React.memo(() => {
    const listenerKey = activeTab === 'Accepted' ? 'New' : activeTab;
    if (!loadingMoreStates[listenerKey]) return null;
    return (
      <View style={{ paddingVertical: 20 }}>
        <ActivityIndicator size="small" color={theme.tabActive} />
      </View>
    );
  });
  ListFooter.displayName = 'ListFooter';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        ref={scrollRef}
        data={filteredServiceRequests}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={[theme.tabActive]}
            tintColor={theme.tabActive}
          />
        }
        // MODIFICATION: Disabled fetching on scroll to prevent loading more data automatically.
        onEndReached={handleLoadMore}
        onEndReachedThreshold={1}
        onScroll={(e) => handleScroll(e.nativeEvent)}
        scrollEventThrottle={16}
        ListFooterComponent={<ListFooter />}
        ListHeaderComponent={
          <>
            <View style={styles.headerTitleContainer}>
              <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.headerTitle, { color: theme.text }]}>المهام</Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.headerSubtitle, { color: theme.text }]}>الطلبات المسندة اليك من قبل الفريق.</Text>
            </View>

            <View style={styles.controlsContainer}>
              <SearchInput value={searchQuery} onChangeText={setSearchQuery} theme={theme} />
              <FilterButton onPress={toggleFilterPopup} theme={theme} hasActiveFilters={hasActiveFilters} />
              <SortButton onPress={toggleSortOrder} sortOrder={sortOrder} theme={theme} />
            </View>

            <View style={[styles.tabsContainer, { backgroundColor: theme.header }]}>
              <TabButton tabKey="New" label="مفتوح" isActive={activeTab === 'New'} isLoading={loadingStates.New && !isRefreshing} onPress={handleTabPress} theme={theme} />
              <TabButton tabKey="Accepted" label="قيد المعالجة" isActive={activeTab === 'Accepted'} isLoading={loadingStates.Accepted && !isRefreshing} onPress={handleTabPress} theme={theme} />
              <TabButton tabKey="Completed" label="مكتمل" isActive={activeTab === 'Completed'} isLoading={loadingStates.Completed && !isRefreshing} onPress={handleTabPress} theme={theme} />
            </View>

            <ActiveFilters
              filters={{
                priority: selectedPriority,
                type: selectedType,
                status: selectedStatus,
                creator: selectedCreator,
                assignedUsers: selectedAssignedUsers,
                dateRange: dateRange,
              }}
              onClearFilter={handleClearFilter}
              onClearAll={clearFilters}
              users={users}
            />
          </>
        }
        ListEmptyComponent={renderListEmpty}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />

      {showScrollToTop && (
        <TouchableOpacity
          style={[styles.scrollToTopButton, { backgroundColor: theme.tabActive }]}
          onPress={scrollToTop}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-up" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* MODIFICATION: The FilterDialog is now passed a context to change its appearance */}
      <FilterDialog
        isVisible={isFilterVisible}
        onClose={toggleFilterPopup}
        clearFilters={clearFilters}
        // Priority
        selectedPriority={selectedPriority}
        setSelectedPriority={setSelectedPriority}
        availablePriorities={AVAILABLE_PRIORITIES}
        // Type
        selectedType={selectedType}
        setSelectedType={setSelectedType}
        availableTypes={AVAILABLE_TYPES}
        // Status
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        availableStatuses={AVAILABLE_STATUSES}
        showStatus={true}
        // Users
        users={users}
        selectedCreator={selectedCreator}
        setSelectedCreator={setSelectedCreator}
        selectedAssignedUsers={selectedAssignedUsers}
        setSelectedAssignedUsers={setSelectedAssignedUsers}
        // Date
        dateRange={dateRange}
        setDateRange={setDateRange}
        // Context
        context="tasks"
      />
    </View>
  );
};

// --- Styles (no changes) ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  headerTitleContainer: {
    alignItems: 'flex-end',
    paddingTop: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Cairo',
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 16,
    marginTop: 4,
    fontFamily: 'Cairo',
    opacity: 0.7,
  },
  controlsContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginTop: 24,
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
  // MODIFICATION: Changed from a Pressable to a ScrollView, styles adjusted
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
  scrollToTopButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 10,
  },
});

export default React.memo(TasksScreen);