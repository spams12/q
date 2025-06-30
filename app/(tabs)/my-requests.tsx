import { useTheme } from '@/context/ThemeContext';
import useFirebaseAuth from '@/hooks/use-firebase-auth';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
// MODIFIED: Imported getDocs for the refresh action
import { collection, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

import FilterDialog from '../../components/FilterDialog';
import InfoCard from '../../components/InfoCard'; // Assuming InfoCard is updated to not require `viewableItems`
import { db } from '../../lib/firebase';
import { ServiceRequest } from '../../lib/types';

// --- Constants ---
const AVAILABLE_TYPES = ['مشكلة', 'طلب جديد', 'طلب', 'شكوى'];
const AVAILABLE_STATUSES = ['مفتوح', 'قيد المعالجة', 'معلق', 'مكتمل', 'مغلق'];
const AVAILABLE_PRIORITIES = ['عالية', 'متوسطة', 'منخفضة'];

// --- Reusable Sub-components ---
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

const ActiveFilters = React.memo(({ filters, onClearFilter, onClearAll }: {
  filters: { priority: string | null; type: string | null; status: string | null; };
  onClearFilter: (key: 'priority' | 'type' | 'status') => void;
  onClearAll: () => void;
}) => {
  const hasFilters = Object.values(filters).some(v => v);
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
  const [isRefreshing, setIsRefreshing] = useState(false); // ADDED: State for pull-to-refresh
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  // Filter States
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  const { user } = useFirebaseAuth();
  const { theme } = useTheme();
  const router = useRouter();

  // --- Data Fetching Logic (Real-time listener) ---
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'serviceRequests'),
      where('creatorId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedRequests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRequest));
      setRequests(fetchedRequests);
      setIsLoading(false);
    }, (error) => {
      console.error(`Error fetching requests:`, error);
      setRequests([]);
      setIsLoading(false);
    });
    return () => {
      unsubscribe();
      setRequests([]);
    };
  }, [user?.uid]);

  // --- Memoized Logic and Callbacks ---

  // ADDED: Callback for the pull-to-refresh action
  const onRefresh = useCallback(async () => {
    if (!user?.uid) {
      setIsRefreshing(false);
      return;
    }

    setIsRefreshing(true);
    try {
      // Create the same query but use getDocs for a one-time fetch
      const q = query(
        collection(db, 'serviceRequests'),
        where('creatorId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const querySnapshot = await getDocs(q);
      const fetchedRequests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRequest));
      setRequests(fetchedRequests); // Manually update the state with the fresh data
    } catch (error) {
      console.error("Error on refreshing requests:", error);
      // You could add a user-facing error message here (e.g., using a toast)
    } finally {
      setIsRefreshing(false); // Ensure the refreshing indicator is always hidden
    }
  }, [user?.uid]);


  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      const matchesSearch = !searchQuery ||
        req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (req.customerName && req.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        req.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = !selectedPriority || req.priority === selectedPriority;
      const matchesType = !selectedType || req.type === selectedType;
      const matchesStatus = !selectedStatus || req.status === selectedStatus;
      return matchesSearch && matchesPriority && matchesType && matchesStatus;
    });
  }, [requests, searchQuery, selectedPriority, selectedType, selectedStatus]);

  const hasActiveFilters = !!(selectedPriority || selectedType || selectedStatus);

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

  const renderItem = useCallback(({ item }: { item: ServiceRequest }) => (
    <InfoCard item={item} showActions={false} />
  ), []);

  const keyExtractor = (item: ServiceRequest) => item.id;
  const toggleFilterPopup = useCallback(() => setIsFilterVisible(prev => !prev), []);
  const onAddPress = useCallback(() => router.push('/create-request'), [router]);

  const renderListEmpty = useCallback(() => {
    // The main loading indicator only shows on initial load, not during a refresh.
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
        data={filteredRequests}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListEmptyComponent={renderListEmpty}
        contentContainerStyle={styles.listContentContainer}
        // ADDED: Props to enable pull-to-refresh
        onRefresh={onRefresh}
        refreshing={isRefreshing}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            {/* Title Section */}
            <View style={styles.titleSection}>
              <View style={styles.headerRow}>
                <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.headerTitle, { color: theme.text }]}>التكتات</Text>
                <TouchableOpacity style={[styles.addButton, { backgroundColor: theme.tabActive }]} onPress={onAddPress}>
                  <Text adjustsFontSizeToFit numberOfLines={1} style={styles.addButtonText}>انشاء تكت</Text>
                </TouchableOpacity>
              </View>
              <Text  adjustsFontSizeToFit numberOfLines={1} style={[styles.headerSubtitle, { color: theme.text }]}>
                قائمة التكتات التي قمت بإنشائها.
              </Text>
            </View>

            {/* Controls Section (Search, Filter, etc.) */}
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
                <TouchableOpacity
                  style={[styles.iconButton, { backgroundColor: theme.header }]}
                  onPress={toggleFilterPopup}
                  activeOpacity={0.7}
                >
                  <Ionicons name="filter" size={22} color={hasActiveFilters ? theme.tabActive : theme.icon} />
                  {hasActiveFilters && <View style={[styles.filterDot, { backgroundColor: theme.tabActive }]} />}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.header }]} activeOpacity={0.7}>
                  <Ionicons name="swap-vertical" size={22} color={theme.icon} />
                </TouchableOpacity>
              </View>

              <ActiveFilters
                filters={{ priority: selectedPriority, type: selectedType, status: selectedStatus }}
                onClearFilter={handleClearFilter}
                onClearAll={clearFilters}
              />
            </View>
          </View>
        }
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
      />
    </View>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Container for all header content, used in ListHeaderComponent
  headerContainer: {
    paddingBottom: 8, // Space between header and first list item
  },
  // Style for the content of the FlatList
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  titleSection: {
    paddingVertical: 16,
    // The horizontal padding is now handled by listContentContainer
  },
  controlsSection: {
    // The horizontal padding is now handled by listContentContainer
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
});

export default React.memo(MyRequestsScreen);