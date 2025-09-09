// (imports remain the same)
import InfoCard from '@/components/InfoCard';
import { usePermissions } from '@/context/PermissionsContext';
import { Theme, useTheme } from '@/context/ThemeContext';
import { ServiceRequest } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { useScrollToTop } from '@react-navigation/native';
import { liteClient as algoliasearch } from 'algoliasearch/lite';
import { router } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  InstantSearch,
  useClearRefinements,
  useConfigure,
  useCurrentRefinements,
  useInfiniteHits,
  useSearchBox
} from 'react-instantsearch-core';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '../../lib/firebase'; // Adjust this path if necessary
import { Filters } from '../fliters';

// --- (interfaces and constants remain the same) ---
interface User { id: string; uid: string; name: string; }
interface Team { id: string; name: string; }
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;
const searchClient = algoliasearch('NRMR6IJLJK', '36b7095707242f6be237f5e4e491d0a2');

// --- (FilterPill and ActiveFilters components remain the same) ---
type FilterPillProps = { label: string; onRemove: () => void };

const FilterPill = React.memo(({ label, onRemove }: FilterPillProps) => {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);

  return (
    <View style={styles.filterPill}>
      <Text style={styles.filterPillText}>{label}</Text>
      <TouchableOpacity onPress={onRemove} style={styles.filterPillRemove}>
        <Ionicons name="close" size={16} color={theme.primary} />
      </TouchableOpacity>
    </View>
  );
});

const ActiveFilters = () => {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { items, refine } = useCurrentRefinements();
  const { canRefine: canClear, refine: clearAll } = useClearRefinements();

  const flatRefinements = useMemo(() =>
    items.flatMap(item =>
      item.refinements.map(refinement => ({
        key: `${item.attribute}-${refinement.value}`,
        label: `${item.label}: ${refinement.label}`,
        onRemove: () => refine(refinement),
      }))
    ),
    [items, refine]
  );

  const hasFilters = flatRefinements.length > 0;
  if (!hasFilters) return null;

  return (
    <View style={styles.activeFiltersWrapper}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={flatRefinements}
        keyExtractor={item => item.key}
        renderItem={({ item }) => (
          <FilterPill
            label={item.label}
            onRemove={item.onRemove}
          />
        )}
        contentContainerStyle={styles.pillsScrollView}
        inverted
      />
      {canClear && (
        <TouchableOpacity onPress={clearAll}>
          <Text style={styles.clearAllText}>مسح الكل</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};


type SortOrder = 'desc' | 'asc';

type SearchHeaderProps = {
  sortOrder: SortOrder;
  setSortOrder: (v: SortOrder) => void;
  onOpenFilters: () => void;
};

const SearchHeader = ({
  sortOrder,
  setSortOrder,
  onOpenFilters,
}: SearchHeaderProps) => {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { query, refine } = useSearchBox();
  const { items } = useCurrentRefinements();

  // State to hold the input value, which updates instantly for a responsive UI
  const [inputValue, setInputValue] = useState(query);

  const isRealtime = query === '' && items.length === 0;
  const hasActiveFilters = items.length > 0;

  // This effect synchronizes the input field if the query is cleared from elsewhere
  useEffect(() => {
    if (query !== inputValue) {
      setInputValue(query);
    }
  }, [query]);

  // --- DEBOUNCE IMPLEMENTATION START ---
  useEffect(() => {
    // Set up a timer that will run after 800ms of inactivity
    const timerId = setTimeout(() => {
      // When the timer completes, trigger the Algolia search with the current input value
      refine(inputValue);
    }, 800);

    // This is the cleanup function. It runs every time `inputValue` changes,
    // clearing the previously set timer. This is what creates the debounce effect.
    return () => clearTimeout(timerId);
  }, [inputValue, refine]); // The effect re-runs only when inputValue changes
  // --- DEBOUNCE IMPLEMENTATION END ---

  const toggleSortOrder = useCallback(() => {
    setSortOrder(sortOrder === 'desc' ? 'asc' as SortOrder : 'desc' as SortOrder);
  }, [setSortOrder, sortOrder]);

  const { realuserUid } = usePermissions();
  // Always filter by the current user's ID for Algolia search
  const filters = realuserUid ? `creatorId:${realuserUid}` : '';
  useConfigure({ filters });

  return (
    <View style={styles.headerContainer}>
      <View style={styles.titleSection}>
        <View style={styles.headerRow}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.headerTitle}>
            تكتاتي
          </Text>
          <View style={[styles.dataSourceIndicator, isRealtime ? styles.realtimeIndicator : styles.searchIndicator]}>
            <Text style={styles.dataSourceIndicatorText}>
              {isRealtime ? 'مباشر' : 'نتائج البحث'}
            </Text>
          </View>
          {/* Spacer */}
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => { router.push('/create-request') }}
            style={styles.addButton}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.addButtonText}>
              إنشاء تكت
            </Text>
          </TouchableOpacity>
        </View>
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.headerSubtitle}>
          قائمة التكتات التي قمت بإنشائها.
        </Text>
      </View>
      {/* --- TABS REMOVED --- */}
      <View style={styles.controlsSection}>
        <View style={styles.controlsContainer}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={theme.placeholder} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث (بالاسم، هاتف، ايميل، ID...)"
              placeholderTextColor={theme.placeholder}
              value={inputValue}
              onChangeText={setInputValue}
              returnKeyType="search"
              multiline={false}
              allowFontScaling={false}
            />

          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onOpenFilters}
            activeOpacity={0.7}>
            <Ionicons name="filter" size={22} color={hasActiveFilters ? theme.primary : theme.icon} />
            {hasActiveFilters && <View style={styles.filterDot} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={toggleSortOrder}
            activeOpacity={0.9}>
            <Ionicons
              name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
              size={22}
              color={theme.icon}
            />
          </TouchableOpacity>
        </View>
        <ActiveFilters />
      </View>
    </View>
  );
};

// --- (AlgoliaHitAdapter component remains the same) ---
const AlgoliaHitAdapter = ({ hit, users }: { hit: any, users: User[] }) => {
  const getTimestampFromMilliseconds = (ms: number | undefined): FirebaseFirestoreTypes.Timestamp | undefined => {
    if (typeof ms !== 'number') {
      return undefined;
    }
    const seconds = Math.floor(ms / 1000);
    const nanoseconds = (ms % 1000) * 1000000;
    return new firestore.Timestamp(seconds, nanoseconds);
  };

  const transformedItem: ServiceRequest = {
    ...hit,
    id: hit.objectID,
    createdAt: getTimestampFromMilliseconds(hit.createdAt as number),
    title: hit.title as string,
    type: hit.type as string,
    status: hit.status as string,
    customerName: hit.customerName as string,
  };

  return <InfoCard item={transformedItem} users={users} showActions={false} hit={hit} />;
};


type HybridListProps = {
  sortOrder: SortOrder;
  setSortOrder: (v: SortOrder) => void;
  onOpenFilters: () => void;
  users: User[];
};

const HybridList = ({ sortOrder, setSortOrder, onOpenFilters, users }: HybridListProps) => {
  const listRef = useRef<FlatList>(null);
  useScrollToTop(listRef);
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { realuserUid } = usePermissions();
  const [firebaseRequests, setFirebaseRequests] = useState<ServiceRequest[]>([]);
  const [isFirebaseLoading, setIsFirebaseLoading] = useState(true);
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  const { query: algoliaQuery } = useSearchBox();
  const { items: refinements } = useCurrentRefinements();
  const shouldUseFirebase = algoliaQuery === '' && refinements.length === 0;

  const { items: algoliaHits, isLastPage: isAlgoliaLastPage, showMore: showMoreAlgoliaHits } = useInfiniteHits();
  const [isAlgoliaLoadingMore, setIsAlgoliaLoadingMore] = useState(false);

  useEffect(() => {
    if (isAlgoliaLoadingMore) {
      setIsAlgoliaLoadingMore(false);
    }
  }, [algoliaHits]);

  const handleAlgoliaLoadMore = useCallback(() => {
    if (!isAlgoliaLastPage && !isAlgoliaLoadingMore) {
      setIsAlgoliaLoadingMore(true);
      showMoreAlgoliaHits();
    }
  }, [isAlgoliaLastPage, isAlgoliaLoadingMore, showMoreAlgoliaHits]);

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    setShowScrollToTop(event.nativeEvent.contentOffset.y > SCREEN_HEIGHT * 0.5);
  }, []);

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  useEffect(() => {
    if (!shouldUseFirebase) {
      setFirebaseRequests([]);
      if (isFirebaseLoading) setIsFirebaseLoading(false);
      return;
    }

    setIsFirebaseLoading(true);
    let query: FirebaseFirestoreTypes.Query = db.collection('serviceRequests');

    // Always filter by creatorId for the Firebase real-time listener
    if (realuserUid) {
      query = query.where('creatorId', '==', realuserUid);
    }
    query = query.orderBy('createdAt', sortOrder);

    const unsubscribe = query.onSnapshot((querySnapshot) => {
      const requestsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as ServiceRequest));
      setFirebaseRequests(requestsData);
      setIsFirebaseLoading(false);
    }, (error) => {
      console.error("Firebase listener error:", error);
      setIsFirebaseLoading(false);
    });

    return () => unsubscribe();
  }, [shouldUseFirebase, sortOrder, realuserUid]); // Removed requestView from dependencies

  const renderItem = useCallback(({ item }: { item: any }) => {
    if (shouldUseFirebase) {
      return (
        <View style={styles.item}>
          <InfoCard item={item as ServiceRequest} users={users} showActions={false} />
        </View>
      );
    }
    // Else, it's an Algolia hit
    return (
      <View style={styles.item}>
        <AlgoliaHitAdapter hit={item} users={users} />
      </View>
    );
  }, [shouldUseFirebase, users]);

  const ListEmptyComponent = useMemo(() => {
    const renderEmptyFirebase = () => (
      <View style={styles.emptyContainer}>
        <Ionicons name="document-text-outline" size={48} color={theme.placeholder} />
        <Text style={styles.emptyText}>لم تقم بإنشاء أي تكتات بعد</Text>
      </View>
    );
    const renderEmptyAlgolia = () => (
      <View style={styles.emptyContainer}>
        <Ionicons name="search-outline" size={48} color={theme.placeholder} />
        <Text style={styles.emptyText}>لا توجد نتائج تطابق بحثك</Text>
      </View>
    );
    const loader = <ActivityIndicator color={theme.primary} style={{ margin: 40 }} />;

    if (shouldUseFirebase) {
      return isFirebaseLoading ? loader : renderEmptyFirebase();
    }

    const isAlgoliaInitialLoading = algoliaHits.length === 0 && !isAlgoliaLastPage;
    return isAlgoliaInitialLoading ? loader : renderEmptyAlgolia();
  }, [shouldUseFirebase, isFirebaseLoading, algoliaHits, isAlgoliaLastPage, theme]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    // For Firebase data, the real-time listener will automatically update
    // For Algolia, we need to refresh the search
    if (!shouldUseFirebase) {
      // Trigger a new search with the same parameters
      showMoreAlgoliaHits();
    }
    setIsRefreshing(false);
  }, [shouldUseFirebase, showMoreAlgoliaHits]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={shouldUseFirebase ? firebaseRequests : algoliaHits}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        ListHeaderComponent={
          <SearchHeader
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            onOpenFilters={onOpenFilters}
          />
        }
        keyExtractor={item => shouldUseFirebase ? item.id : item.objectID}
        renderItem={renderItem}
        ListEmptyComponent={ListEmptyComponent}
        onEndReached={shouldUseFirebase ? undefined : handleAlgoliaLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={!shouldUseFirebase && isAlgoliaLoadingMore ? <ActivityIndicator color={theme.primary} style={{ margin: 20 }} /> : null}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContentContainer}
      />
      {showScrollToTop && (
        <TouchableOpacity
          style={styles.scrollToTopButton}
          onPress={scrollToTop}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-up" size={36} color={theme.text} style={{ opacity: 0.7 }} />
        </TouchableOpacity>
      )}
    </View>
  );
};

export default function App() {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  console.log("index")
  const [isFilterModalOpen, setFilterModalOpen] = useState(false);
  // Removed requestView state
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isTeamsLoading, setIsTeamsLoading] = useState(true);
  const indexName = sortOrder === 'asc' ? 'hello_asc' : 'hello';


  useEffect(() => {
    const usersRef = db.collection('users');
    const unsubscribe = usersRef.onSnapshot((snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(usersData);
      setIsUsersLoading(false);
    }, (error) => {
      console.error("Failed to fetch users:", error);
      setIsUsersLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const teamsRef = db.collection('teams');
    const unsubscribe = teamsRef.onSnapshot((snapshot) => {
      const teamsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
      setTeams(teamsData);
      setIsTeamsLoading(false);
    }, (error) => {
      console.error("Failed to fetch teams:", error);
      setIsTeamsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (isUsersLoading || isTeamsLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <InstantSearch searchClient={searchClient} indexName={indexName}>
          <HybridList
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            onOpenFilters={() => setFilterModalOpen(true)}
            users={users}
          />
          {/* Render the Filters component directly without a key */}
          <Filters
            isModalOpen={isFilterModalOpen}
            onToggleModal={() => setFilterModalOpen(false)}
            users={users}
            teams={teams}
          />
        </InstantSearch>
      </View>
    </SafeAreaView>
  );
}

// Styles are largely the same, but the 'switch' styles are no longer used
const getStyles = (theme: Theme) => {
  const placeholderFontSize = Math.max(12, Math.min(16, SCREEN_WIDTH * 0.035));
  return StyleSheet.create({
    // Main Layout
    safeArea: { flex: 1, backgroundColor: theme.background },
    container: { flex: 1, backgroundColor: theme.background },
    listContentContainer: { paddingHorizontal: 16, paddingBottom: 24 },
    item: { paddingVertical: 0 },
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
      color: theme.textSecondary,
    },

    // Header Styles
    headerContainer: { paddingBottom: 8, paddingTop: 16 },
    titleSection: { paddingVertical: 16, paddingBottom: 24, }, // Added more bottom padding
    headerRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      width: '100%',
      gap: 12, // Gap between title and badge
    },
    headerTitle: { fontSize: 28, textAlign: 'right', fontFamily: 'Cairo', fontWeight: 'bold', color: theme.text },
    headerSubtitle: {
      fontSize: 16,
      textAlign: 'right',
      marginTop: 4,
      fontFamily: 'Cairo',
      color: theme.textSecondary,
    },
    addButton: {
      backgroundColor: theme.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8
    },
    addButtonText: { color: theme.text, fontFamily: 'Cairo', fontWeight: '600' },
    // Data source indicator styles
    dataSourceIndicator: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dataSourceIndicatorText: {
      color: theme.text,
      fontFamily: 'Cairo',
      fontWeight: 'bold',
      fontSize: 12,
    },
    realtimeIndicator: {
      backgroundColor: '#34C759', // Green for "Live"
    },
    searchIndicator: {
      backgroundColor: theme.primary,
    },

    // --- Styles for the removed switcher are no longer needed ---

    // Controls Section (Search, Filter, Sort)
    controlsSection: {},
    controlsContainer: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 8, gap: 8 },

    searchContainer: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, height: 48, borderWidth: 1, backgroundColor: theme.inputBackground, borderColor: theme.border, justifyContent: "center" },
    searchIcon: { marginLeft: 8 },
    searchInput: { flex: 1, height: '100%', textAlign: 'right', fontSize: placeholderFontSize, fontFamily: 'Cairo', color: theme.text, letterSpacing: 0.2 },
    iconButton: {
      justifyContent: 'center',
      alignItems: 'center',
      width: 48,
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      backgroundColor: theme.inputBackground,
      borderColor: theme.border,
    },
    filterDot: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 8,
      height: 8,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: theme.card,
      backgroundColor: theme.primary,
    },

    // Active Filter Pills
    activeFiltersWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
      minHeight: 36,
    },
    pillsScrollView: {
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
    },
    filterPill: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      backgroundColor: theme.inputBackground,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 8,
    },
    filterPillText: { fontSize: 13, fontFamily: 'Cairo', fontWeight: '600', color: theme.primary },
    filterPillRemove: { marginLeft: -4, padding: 2 },
    clearAllText: {
      fontSize: 14,
      fontWeight: 'bold',
      fontFamily: 'Cairo',
      marginRight: 12,
      padding: 8,
      color: theme.primary,
    },
    scrollToTopButton: {
      position: 'absolute',
      bottom: 15,
      alignSelf: 'center',
      padding: 8,
    },
  });
};