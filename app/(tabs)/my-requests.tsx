import { useTheme } from '@/context/ThemeContext';
import useFirebaseAuth from '@/hooks/use-firebase-auth';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View, ViewToken } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import FilterDialog from '../../components/FilterDialog';
import InfoCard from '../../components/InfoCard';
import { db } from '../../lib/firebase';
import { ServiceRequest } from '../../lib/types';

interface ListHeaderProps {
  theme: ReturnType<typeof useTheme>['theme'];
  onAddPress: () => void;
  searchQuery: string;
  setSearchQuery: (text: string) => void;
  onFilterPress: () => void;
  hasActiveFilters: boolean;
  selectedPriority: string | null;
  selectedType: string | null;
  onClearFilters: () => void;
}

const ListHeader = React.memo(({
  theme,
  onAddPress,
  searchQuery,
  setSearchQuery,
  onFilterPress,
  hasActiveFilters,
  selectedPriority,
  selectedType,
  onClearFilters,
}: ListHeaderProps) => {
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
          <Ionicons name="filter" size={22} color={theme.icon} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.header }]}
          activeOpacity={0.7}
        >
          <Ionicons name="swap-vertical" size={22} color={theme.icon} />
        </TouchableOpacity>
      </View>

      {hasActiveFilters && (
        <View style={styles.activeFiltersContainer}>
          <Text style={[styles.activeFiltersText, { color: theme.text }]}>
            المرشحات النشطة:
            {selectedPriority && ` الأولوية: ${selectedPriority}`}
            {selectedType && ` النوع: ${selectedType}`}
          </Text>
          <TouchableOpacity onPress={onClearFilters}>
            <Text style={styles.clearFiltersText}>مسح</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
});
ListHeader.displayName = 'ListHeader';

const MyRequestsScreen: React.FC = () => {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  const { user } = useFirebaseAuth();
  const { theme } = useTheme();
  const router = useRouter();

  const viewableItems = useSharedValue<ViewToken[]>([]);
 
   const onViewableItemsChanged = useCallback(
    ({ viewableItems: vItems }: { viewableItems: ViewToken[] }) => {
      viewableItems.value = vItems;
    },
    []
  );

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
    if (!searchQuery && !selectedPriority && !selectedType) {
      return requests;
    }
    return requests.filter(req => {
      const matchesSearch = !searchQuery ||
        req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (req.customerName && req.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        req.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = !selectedPriority || req.priority === selectedPriority;
      const matchesType = !selectedType || req.type === selectedType;
      return matchesSearch && matchesPriority && matchesType;
    });
  }, [requests, searchQuery, selectedPriority, selectedType]);

  const renderItem = useCallback(({ item }: { item: ServiceRequest }) => (
    <InfoCard
      item={item}
      viewableItems={viewableItems}
      showActions={false}
    />
  ), [viewableItems]);

  const keyExtractor = (item: ServiceRequest) => item.id;


  const toggleFilterPopup = useCallback(() => {
   setIsFilterVisible(prev => !prev);
 }, []);

  const clearFilters = useCallback(() => {
    setSelectedPriority(null);
    setSelectedType(null);
  }, []);

  const hasActiveFilters = !!(selectedPriority || selectedType);
  const onAddPress = useCallback(() => router.push('/create-request'), [router]);

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
        <Ionicons name="document-outline" size={48} color="#ccc" />
        <Text style={[styles.emptyText, { color: theme.text }]}>
          لا توجد تذاكر
        </Text>
      </View>
    );
  }, [isLoading, theme]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]} >
      <FlatList
        data={filteredRequests}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={
          <ListHeader
            theme={theme}
            onAddPress={onAddPress}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onFilterPress={toggleFilterPopup}
            hasActiveFilters={hasActiveFilters}
            selectedPriority={selectedPriority}
            selectedType={selectedType}
            onClearFilters={clearFilters}
          />
        }
        ListEmptyComponent={renderListEmpty}
        contentContainerStyle={styles.listContainer}
        refreshing={isLoading && requests.length === 0}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
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