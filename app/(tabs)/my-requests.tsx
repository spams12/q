import { useTheme } from '@/context/ThemeContext';
import useFirebaseAuth from '@/hooks/use-firebase-auth';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
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
  ViewToken
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import FilterDialog from '../../components/FilterDialog';
import InfoCard from '../../components/InfoCard';
import { db } from '../../lib/firebase';
import { ServiceRequest } from '../../lib/types';

// --- Constants for Filter Options ---
const AVAILABLE_TYPES = ['مشكلة', 'طلب جديد', 'طلب', 'شكوى'];
const AVAILABLE_STATUSES = ['مفتوح', 'قيد المعالجة', 'معلق', 'مكتمل' , "مغلق"];
const AVAILABLE_PRIORITIES = ['عالية', 'متوسطة', 'منخفضة'];

// --- New Component for Filter Pills ---
const FilterPill = React.memo(({ label, onRemove }: { label: string; onRemove: () => void }) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.filterPill, { backgroundColor: theme.tabActiveMuted }]}>
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


// --- Simplified ListHeader Component ---
const ListHeader = React.memo(({
  theme,
  onAddPress,
  searchQuery,
  setSearchQuery,
  onFilterPress,
  hasActiveFilters,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  onAddPress: () => void;
  searchQuery: string;
  setSearchQuery: (text: string) => void;
  onFilterPress: () => void;
  hasActiveFilters: boolean;
}) => {
  return (
    <>
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>التكتات</Text>
          <TouchableOpacity style={[styles.addButton, { backgroundColor: theme.tabActive }]} onPress={onAddPress}>
            <Text style={styles.addButtonText}>انشاء تكت</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.headerSubtitle, { color: theme.text }]}>
          قائمة التكتات التي قمت بإنشائها.
        </Text>
      </View>

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
          onPress={onFilterPress}
          activeOpacity={0.7}
        >
          <Ionicons name="filter" size={22} color={hasActiveFilters ? theme.tabActive : theme.icon} />
          {hasActiveFilters && <View style={[styles.filterDot, {backgroundColor: theme.tabActive}]} />}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.header }]}
          activeOpacity={0.7}
        >
          <Ionicons name="swap-vertical" size={22} color={theme.icon} />
        </TouchableOpacity>
      </View>
    </>
  );
});
ListHeader.displayName = 'ListHeader';

// --- Main Screen Component ---
const MyRequestsScreen: React.FC = () => {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  
  // Filter States
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  const { user } = useFirebaseAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const viewableItems = useSharedValue<ViewToken[]>([]);

  useEffect(() => {
    if (!user?.uid) {
      setRequests([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const q = query(
      collection(db, 'serviceRequests'),
      where('creatorId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedRequests = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ServiceRequest));
      setRequests(fetchedRequests);
      setIsLoading(false);
    }, (error) => {
      console.error(`Error fetching requests:`, error);
      setRequests([]);
      setIsLoading(false);
    });

    return () => unsubscribe();
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
    <InfoCard item={item} viewableItems={viewableItems} showActions={false} />
  ), [viewableItems]);

  const keyExtractor = (item: ServiceRequest) => item.id;
  const toggleFilterPopup = useCallback(() => setIsFilterVisible(prev => !prev), []);
  const onAddPress = useCallback(() => router.push('/create-request'), [router]);
  const onViewableItemsChanged = useCallback(({ viewableItems: vItems }: { viewableItems: ViewToken[] }) => {
    viewableItems.value = vItems;
  }, []);

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
    <View style={[styles.container, { backgroundColor: theme.background }]} >
      <FlatList
        data={filteredRequests}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={
          <>
            <ListHeader
              theme={theme}
              onAddPress={onAddPress}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onFilterPress={toggleFilterPopup}
              hasActiveFilters={hasActiveFilters}
            />
            <ActiveFilters
              filters={{ priority: selectedPriority, type: selectedType, status: selectedStatus }}
              onClearFilter={handleClearFilter}
              onClearAll={clearFilters}
            />
          </>
        }
        ListEmptyComponent={renderListEmpty}
        contentContainerStyle={styles.listContainer}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
      />
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
     />
    </View>
  );
};

// --- Updated Styles ---
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
    marginLeft: -4, // Visually centers the icon better
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

export default MyRequestsScreen;