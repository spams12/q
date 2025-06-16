import { useTheme } from '@/context/ThemeContext';
import useFirebaseAuth from '@/hooks/use-firebase-auth';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, ViewToken } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import FilterDialog from '../../components/FilterDialog';
import InfoCard from '../../components/InfoCard';
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

const MyRequestsScreen: React.FC = () => {
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

  const [activeTab, setActiveTab] = useState<TabKey>('Open');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  const { user } = useFirebaseAuth();
  const { theme } = useTheme();
  const router = useRouter();

  const viewableItems = useSharedValue<ViewToken[]>([]);

  const dataCache = useRef<Map<TabKey, { data: ServiceRequest[]; timestamp: number }>>(new Map());
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  const getStatusFilter = useCallback((tab: TabKey): string[] => {
    const statusMap = {
      'Open': ['مفتوح'],
      'Accepted': ['قيد المعالجة', 'مقبولة'],
      'Done': ['منجزة', 'مغلق', 'مكتمل']
    };
    return statusMap[tab];
  }, []);

  const fetchRequests = useCallback(async (tab: TabKey, forceRefresh = false) => {
    if (!user?.uid) {
      setLoadingStates(prev => ({ ...prev, [tab]: false }));
      return;
    }

    const cached = dataCache.current.get(tab);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_DURATION) {
      setCachedData(prev => ({ ...prev, [tab]: cached.data }));
      return;
    }

    setLoadingStates(prev => ({ ...prev, [tab]: true }));

    try {
      const statusFilter = getStatusFilter(tab);
      let q = query(
        collection(db, 'serviceRequests'),
        where('creatorId', '==', user?.uid),
        where('status', 'in', statusFilter),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const querySnapshot = await getDocs(q);
      const fetchedRequests = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ServiceRequest));

      dataCache.current.set(tab, { data: fetchedRequests, timestamp: now });
      setCachedData(prev => ({ ...prev, [tab]: fetchedRequests }));

    } catch (error) {
      console.error(`Error fetching ${tab} requests:`, error);
      setCachedData(prev => ({ ...prev, [tab]: [] }));
    } finally {
      setLoadingStates(prev => ({ ...prev, [tab]: false }));
    }
  }, [user?.uid, getStatusFilter, CACHE_DURATION]);


  useEffect(() => {
    const loadInitialData = async () => {
      await fetchRequests('Open');
      const preloadTabs = async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        await fetchRequests('Accepted');
        await new Promise(resolve => setTimeout(resolve, 300));
        await fetchRequests('Done');
      };
      preloadTabs();
    };
    loadInitialData();
  }, [fetchRequests]);


  const handleTabPress = useCallback(async (tab: TabKey) => {
    if (tab === activeTab) return;
    try {
      await Haptics.selectionAsync();
    } catch {
      // Haptics not available
    }
    setActiveTab(tab);
    const cached = dataCache.current.get(tab);
    const now = Date.now();
    if (!cached || (now - cached.timestamp) > CACHE_DURATION) {
      fetchRequests(tab);
    }
  }, [activeTab, fetchRequests, CACHE_DURATION]);

  const filteredRequests = useMemo(() => {
    const currentData = cachedData[activeTab] || [];
    if (!searchQuery && !selectedPriority && !selectedType) {
      return currentData;
    }
    return currentData.filter(req => {
      const matchesSearch = !searchQuery ||
        req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (req.customerName && req.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        req.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = !selectedPriority || req.priority === selectedPriority;
      const matchesType = !selectedType || req.type === selectedType;
      return matchesSearch && matchesPriority && matchesType;
    });
  }, [cachedData, activeTab, searchQuery, selectedPriority, selectedType]);

  const renderItem = useCallback(({ item }: { item: ServiceRequest }) => (
    <InfoCard item={item} viewableItems={viewableItems} />
  ), [viewableItems]);

  const keyExtractor = (item: ServiceRequest) => item.id;

  const onRefresh = useCallback(() => {
    fetchRequests(activeTab, true);
  }, [activeTab, fetchRequests]);

  const toggleFilterPopup = useCallback(() => {
   setIsFilterVisible(prev => !prev);
 }, []);

  const clearFilters = useCallback(() => {
    setSelectedPriority(null);
    setSelectedType(null);
  }, []);

  const isCurrentTabLoading = loadingStates[activeTab];
  const hasActiveFilters = selectedPriority || selectedType;

  const ListHeader = React.memo(() => (
    <>
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>التكتات التي أنشأتها</Text>
          <TouchableOpacity style={[styles.addButton, { backgroundColor: theme.tabActive }]} onPress={() => router.push('/create-request')}>
            <Text style={styles.addButtonText}>اضافة تكت</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.headerSubtitle, { color: theme.text }]}>
          قائمة التذاكر التي قمت بإنشائها.
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
          onPress={toggleFilterPopup}
          activeOpacity={0.7}
        >
          <Ionicons name="filter" size={22} color={theme.icon} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.header }]}
          activeOpacity={0.7}
        >
          <Ionicons name="swap-vertical" size={22} color={theme.icon} />
        </TouchableOpacity>
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

  const TabButton = React.memo(({ tabKey, label }: { tabKey: TabKey; label: string }) => {
    const isActive = activeTab === tabKey;
    const isLoading = loadingStates[tabKey];
    return (
      <Pressable
        style={[styles.tab, isActive && styles.activeTab, isActive && { backgroundColor: theme.background }]}
        onPressIn={() => handleTabPress(tabKey)}
      >
        <View style={styles.tabContent}>
          <Text style={[styles.tabText, { color: isActive ? theme.tabActive : theme.tabInactive }]}>
            {label}
          </Text>
          {isLoading && (
            <ActivityIndicator size="small" color={theme.tabActive} style={styles.tabLoader} />
          )}
        </View>
      </Pressable>
    );
  });
  TabButton.displayName = 'TabButton';

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
    <View style={[styles.container, { backgroundColor: theme.background }]} >
      <FlatList
        data={filteredRequests}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={renderListEmpty}
        contentContainerStyle={styles.listContainer}
        onRefresh={onRefresh}
        refreshing={isCurrentTabLoading && cachedData[activeTab].length > 0}
      />
     <FilterDialog
       isVisible={isFilterVisible}
       onClose={toggleFilterPopup}
       selectedPriority={selectedPriority}
       setSelectedPriority={setSelectedPriority}
       selectedType={selectedType}
       setSelectedType={setSelectedType}
       clearFilters={clearFilters}
       availableTypes={['مشكلة', 'طلب جديد', 'طلب', 'شكوى', ]}
     />
    </View>
  );
};

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
});

export default MyRequestsScreen;