import { useTheme } from '@/context/ThemeContext';
import useFirebaseAuth from '@/hooks/use-firebase-auth';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  collection,
  DocumentData,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  where,
} from 'firebase/firestore';
// MODIFIED: Added useRef for the FlatList reference
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import FilterDialog, { User } from '../../components/FilterDialog'; // Assuming User is exported
import InfoCard from '../../components/InfoCard';
import { db } from '../../lib/firebase';
import { ServiceRequest } from '../../lib/types';

// --- Interfaces (defined here for type safety, could be imported) ---
interface DateRange {
  start: Date | null;
  end: Date | null;
}

// --- Constants ---
// AVAILABLE_TYPES is removed as the dialog has its own hardcoded list.
const AVAILABLE_STATUSES = ['مفتوح', 'قيد المعالجة', 'معلق', 'مكتمل', 'مغلق'];
const AVAILABLE_PRIORITIES = ['عالية', 'متوسطة', 'منخفضة'];

// --- Sub-components ---
const FilterPill = React.memo(({ label, onRemove }: { label: string; onRemove: () => void }) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.filterPill, { backgroundColor: theme.background }]}>
      <Text style={[styles.filterPillText, { color: theme.tabActive }]}>{label}</Text>
      <TouchableOpacity onPress={onRemove} style={styles.filterPillRemove}>
        <Ionicons name="close" size={16} color={theme.tabActive} />
      </TouchableOpacity>
    </View>
  );
});
FilterPill.displayName = 'FilterPill';

// MODIFIED: ActiveFilters now supports all new filter types
type FilterKeys = 'priority' | 'type' | 'status' | 'creator' | 'assigned' | 'date';
const ActiveFilters = React.memo(({
  filters,
  users,
  onClearFilter,
  onClearAll,
}: {
  filters: {
    priority: string | null;
    type: string | null;
    status: string | null;
    creator: string | null;
    assigned: string[];
    dateRange: DateRange;
  };
  users: User[];
  onClearFilter: (key: FilterKeys) => void;
  onClearAll: () => void;
}) => {
  const creatorName = useMemo(() => {
    if (!filters.creator) return null;
    return users.find(u => u.uid === filters.creator)?.name || '...';
  }, [filters.creator, users]);

  const hasFilters =
    !!filters.priority ||
    !!filters.type ||
    !!filters.status ||
    !!filters.creator ||
    filters.assigned.length > 0 ||
    !!filters.dateRange.start;

  if (!hasFilters) return null;

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
        {creatorName && (
          <FilterPill label={`المنشئ: ${creatorName}`} onRemove={() => onClearFilter('creator')} />
        )}
        {filters.assigned.length > 0 && (
          <FilterPill label={`مُعين لـ: ${filters.assigned.length}`} onRemove={() => onClearFilter('assigned')} />
        )}
        {filters.dateRange.start && (
          <FilterPill label={`النطاق: ${filters.dateRange.start.toLocaleDateString('ar-EG')}`} onRemove={() => onClearFilter('date')} />
        )}
      </ScrollView>
      <TouchableOpacity onPress={onClearAll}>
        <Text style={styles.clearAllText}>مسح الكل</Text>
      </TouchableOpacity>
    </View>
  );
});
ActiveFilters.displayName = 'ActiveFilters';

// --- Main Screen Component ---
const MyRequestsScreen: React.FC = () => {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPaginating, setIsPaginating] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [allDataLoaded, setAllDataLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  // --- MODIFIED: Consolidated Filter States ---
  const [usersList, setUsersList] = useState<User[]>([]);
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
  const [selectedAssignedUsers, setSelectedAssignedUsers] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });

  // --- NEW: State and Ref for Scroll-to-Top Button ---
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const flatListRef = useRef<FlatList<ServiceRequest>>(null);

  const { user } = useFirebaseAuth();
  const { theme } = useTheme();
  const router = useRouter();

  const PAGE_SIZE = 10;

  // --- NEW: Fetch users for the filter dialog ---
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        setUsersList(allUsers);
      } catch (error) {
        console.error("Error fetching users for filter:", error);
      }
    };
    fetchUsers();
  }, []); // Run only once

  const loadMoreRequests = useCallback(async () => {
    if (isPaginating || allDataLoaded || !user?.uid || !lastDoc) return;
    setIsPaginating(true);
    try {
      // MODIFIED: Added where('deleted', '==', false) to the query
      // NOTE: This complex query might require a composite index in Firestore.
      // The Firestore error message will provide a link to create it automatically.
      const q = query(
        collection(db, 'serviceRequests'),
        where('deleted', '==', false),
        where('creatorId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
      );
      const querySnapshot = await getDocs(q);
      const newRequests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRequest));
      if (newRequests.length > 0) {
        setRequests(prev => [...prev, ...newRequests]);
        setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
      }
      if (querySnapshot.docs.length < PAGE_SIZE) setAllDataLoaded(true);
    } catch (error) {
      console.error("Error loading more requests:", error);
    } finally {
      setIsPaginating(false);
    }
  }, [user?.uid, isPaginating, allDataLoaded, lastDoc]);

  const onRefresh = useCallback(async () => {
    if (!user?.uid) {
      setIsRefreshing(false);
      return;
    }
    setIsRefreshing(true);
    setAllDataLoaded(false);
    setLastDoc(null);
    try {
      // MODIFIED: Added where('deleted', '==', false) to the query
      // NOTE: This complex query might require a composite index in Firestore.
      // The Firestore error message will provide a link to create it automatically.
      const q = query(
        collection(db, 'serviceRequests'),
        where('deleted', '==', false),
        where('creatorId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE)
      );
      const querySnapshot = await getDocs(q);
      const initialRequests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRequest));
      setRequests(initialRequests);
      setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1] ?? null);
      if (querySnapshot.docs.length < PAGE_SIZE) setAllDataLoaded(true);
    } catch (error) {
      console.error("Error on refreshing requests:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (user?.uid) {
      setIsLoading(true);
      onRefresh().finally(() => setIsLoading(false));
    } else {
      setRequests([]);
      setIsLoading(false);
    }
  }, [user?.uid, onRefresh]);

  // --- MODIFIED: Memoized Logic and Callbacks ---
  const hasActiveFilters = useMemo(() => !!(
    selectedPriority || selectedType || selectedStatus || selectedCreator || selectedAssignedUsers.length > 0 || dateRange.start
  ), [selectedPriority, selectedType, selectedStatus, selectedCreator, selectedAssignedUsers, dateRange]);

  const clearFilters = useCallback(() => {
    setSelectedPriority(null);
    setSelectedType(null);
    setSelectedStatus(null);
    setSelectedCreator(null);
    setSelectedAssignedUsers([]);
    setDateRange({ start: null, end: null });
  }, []);

  const handleClearFilter = useCallback((filterKey: FilterKeys) => {
    if (filterKey === 'priority') setSelectedPriority(null);
    if (filterKey === 'type') setSelectedType(null);
    if (filterKey === 'status') setSelectedStatus(null);
    if (filterKey === 'creator') setSelectedCreator(null);
    if (filterKey === 'assigned') setSelectedAssignedUsers([]);
    if (filterKey === 'date') setDateRange({ start: null, end: null });
  }, []);

  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      const matchesSearch = !searchQuery ||
        req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (req.customerName && req.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        req.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = !selectedPriority || req.priority === selectedPriority;
      const matchesType = !selectedType || req.type === selectedType;
      const matchesStatus = !selectedStatus || req.status === selectedStatus;
      // --- NEW: Advanced filter logic ---
      const matchesCreator = !selectedCreator || req.creatorId === selectedCreator;
      const matchesAssignedUsers = !selectedAssignedUsers.length || (Array.isArray(req.assignedTo) && selectedAssignedUsers.some(uid => req.assignedTo.includes(uid)));
      const matchesDateRange = (() => {
        if (!dateRange.start && !dateRange.end) return true;
        if (!req.createdAt?.toDate) return false;
        const reqDate = req.createdAt.toDate();
        const matchesStart = !dateRange.start || reqDate >= dateRange.start;
        const matchesEnd = !dateRange.end || reqDate <= dateRange.end;
        return matchesStart && matchesEnd;
      })();

      return matchesSearch && matchesPriority && matchesType && matchesStatus && matchesCreator && matchesAssignedUsers && matchesDateRange;
    });
  }, [requests, searchQuery, selectedPriority, selectedType, selectedStatus, selectedCreator, selectedAssignedUsers, dateRange]);


  // --- NEW: Handlers for Scroll-to-Top button ---
  const handleScrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    // Show button if scrolled more than a screen height (approx 400px)
    if (event.nativeEvent.contentOffset.y > 400) {
      setShowScrollToTop(true);
    } else {
      setShowScrollToTop(false);
    }
  }, []);

  const renderItem = useCallback(({ item }: { item: ServiceRequest }) => <InfoCard item={item} showActions={false} />, []);
  const keyExtractor = (item: ServiceRequest) => item.id;
  const toggleFilterPopup = useCallback(() => setIsFilterVisible(prev => !prev), []);
  const onAddPress = useCallback(() => router.push('/create-request'), [router]);

  const renderListFooter = useCallback(() => {
    if (!isPaginating) return null;
    return <View style={styles.footerLoadingContainer}><ActivityIndicator size="small" color={theme.tabActive} /></View>;
  }, [isPaginating, theme.tabActive]);

  const renderListEmpty = useCallback(() => {
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
        <Ionicons name="document-text-outline" size={48} color="#ccc" />
        <Text style={[styles.emptyText, { color: theme.text }]}>
          {hasActiveFilters ? "لا توجد نتائج تطابق بحثك" : "لا توجد تذاكر"}
        </Text>
      </View>
    );
  }, [isLoading, theme, hasActiveFilters]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        // --- NEW: Add ref and scroll handlers to FlatList ---
        ref={flatListRef}
        onScroll={handleScroll}
        scrollEventThrottle={16} // Important for onScroll to fire frequently on Android
        // --- End of new props ---
        data={filteredRequests}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListEmptyComponent={renderListEmpty}
        contentContainerStyle={styles.listContentContainer}
        onRefresh={onRefresh}
        refreshing={isRefreshing}
        onEndReached={loadMoreRequests}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderListFooter}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            <View style={styles.titleSection}>
              <View style={styles.headerRow}>
                <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.headerTitle, { color: theme.text }]}>التكتات</Text>
                <TouchableOpacity style={[styles.addButton, { backgroundColor: theme.tabActive }]} onPress={onAddPress}>
                  <Text adjustsFontSizeToFit numberOfLines={1} style={styles.addButtonText}>انشاء تكت</Text>
                </TouchableOpacity>
              </View>
              <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.headerSubtitle, { color: theme.text }]}>
                قائمة التكتات التي قمت بإنشائها.
              </Text>
            </View>

            <View style={styles.controlsSection}>
              <View style={styles.controlsContainer}>
                <View style={[styles.searchContainer, { backgroundColor: theme.header }]}>
                  <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
                  <TextInput
                    style={[styles.searchInput, { color: theme.text }]}
                    placeholder="ابحث عن تكت..."
                    placeholderTextColor="#888"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    returnKeyType="search"
                  />
                </View>
                <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.header }]} onPress={toggleFilterPopup} activeOpacity={0.7}>
                  <Ionicons name="filter" size={22} color={hasActiveFilters ? theme.tabActive : theme.icon} />
                  {hasActiveFilters && <View style={[styles.filterDot, { backgroundColor: theme.tabActive }]} />}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.header }]} activeOpacity={0.7}>
                  <Ionicons name="swap-vertical" size={22} color={theme.icon} />
                </TouchableOpacity>
              </View>

              <ActiveFilters
                filters={{
                  priority: selectedPriority,
                  type: selectedType,
                  status: selectedStatus,
                  creator: selectedCreator,
                  assigned: selectedAssignedUsers,
                  dateRange,
                }}
                users={usersList}
                onClearFilter={handleClearFilter}
                onClearAll={clearFilters}
              />
            </View>
          </View>
        }
      />

      {/* --- NEW: Conditionally render the scroll-to-top button --- */}
      {showScrollToTop && (
        <TouchableOpacity
          style={[styles.scrollToTopButton, { backgroundColor: theme.tabActive }]}
          onPress={handleScrollToTop}
          activeOpacity={0.8}>
          <Ionicons name="arrow-up" size={24} color="white" />
        </TouchableOpacity>
      )}

      <FilterDialog
        isVisible={isFilterVisible}
        onClose={toggleFilterPopup}
        // Priorities
        selectedPriority={selectedPriority}
        setSelectedPriority={setSelectedPriority}
        availablePriorities={AVAILABLE_PRIORITIES}
        // Types
        selectedType={selectedType}
        setSelectedType={setSelectedType}
        availableTypes={[]} // Ignored by component, uses its own hardcoded list
        // Statuses
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        availableStatuses={AVAILABLE_STATUSES}
        // Users
        users={usersList}
        selectedCreator={selectedCreator}
        setSelectedCreator={setSelectedCreator}
        selectedAssignedUsers={selectedAssignedUsers}
        setSelectedAssignedUsers={setSelectedAssignedUsers}
        // Date
        dateRange={dateRange}
        setDateRange={setDateRange}
        // Actions
        clearFilters={clearFilters}
        // Configuration
        context="tickets"
        showStatus={true}
      />
    </View>
  );
};

// --- Styles (Added scrollToTopButton style) ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingBottom: 8,
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  titleSection: {
    paddingVertical: 16,
  },
  controlsSection: {},
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
    fontWeight: '600',
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
    marginBottom: 8,
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
  footerLoadingContainer: {
    paddingVertical: 20,
  },
  // --- NEW: Style for the scroll-to-top floating action button ---
  scrollToTopButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25, // Makes it a circle
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8, // Shadow for Android
    shadowColor: '#000', // Shadow for iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});

export default React.memo(MyRequestsScreen);