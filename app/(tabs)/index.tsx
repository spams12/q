// src/screens/YourScreen.tsx

import InfoCard from '@/components/InfoCard';
import { usePermissions } from '@/context/PermissionsContext';
import { Theme, useTheme } from '@/context/ThemeContext';
import { ServiceRequest } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { liteClient as algoliasearch } from 'algoliasearch/lite';
import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Hit } from 'instantsearch.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InstantSearch,
  useClearRefinements,
  useConfigure,
  useCurrentRefinements,
  useInfiniteHits,
  useSearchBox,
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
import { db } from '../../lib/firebase';
import { Filters } from '../fliters';


interface User {
  id: string;
  uid: string;
  name: string;
}

interface Team {
  id: string;
  name: string;
}

interface StatusCounts {
  open: number;
  pending: number;
  closed: number;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

const searchClient = algoliasearch(
  'NRMR6IJLJK',
  '36b7095707242f6be237f5e4e491d0a2'
);


// --- REFACTOR 1: New component to dynamically fetch status counts ---
// This component sits within the InstantSearch context, listens for changes,
// and performs a debounced facet search to update the counts. It does not render any UI.
const DynamicStatusCountsProvider = ({ setStatusCounts, userUid, indexName }) => {
  const { query } = useSearchBox();
  const { items: refinements } = useCurrentRefinements();
  const debounceTimeoutRef = useRef(null);

  useEffect(() => {
    // Clear any pending timeout on re-render
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Debounce the API call to avoid searching on every keystroke
    debounceTimeoutRef.current = setTimeout(() => {
      const fetchCounts = async () => {
        if (!userUid) return;

        // Base filter for the current user
        const baseFilter = `assignedUsers:${userUid}`;

        // Build filter string from active refinements (e.g., from the filter modal)
        // This correctly ignores the status filter applied by `useConfigure` on the main list.
        const refinementFilters = refinements
          .map(refinement => {
            const attributeFilters = refinement.refinements
              .map(r => `${refinement.attribute}:"${r.value}"`)
              .join(' OR ');
            return `(${attributeFilters})`;
          })
          .join(' AND ');

        const finalFilters = [baseFilter, refinementFilters].filter(Boolean).join(' AND ');

        try {
          const { results } = await searchClient.search([
            {
              indexName,
              query,
              params: {
                filters: finalFilters,
                facets: ['status'],
                hitsPerPage: 0, // We only need the counts, not the hits
              },
            },
          ]);

          const facets = results[0]?.facets || {};
          const counts = facets.status || {};

          // Sum 'completed' and 'closed' statuses into a single count
          const closedCount = (counts['مكتمل'] || 0) + (counts['مغلق'] || 0);

          setStatusCounts({
            open: counts['مفتوح'] || 0,
            pending: counts['قيد المعالجة'] || 0,
            closed: closedCount,
          });
        } catch (error) {
          console.error("Error fetching dynamic facet counts:", error);
          // On error, reset counts to prevent showing stale data
          setStatusCounts({ open: 0, pending: 0, closed: 0 });
        }
      };

      fetchCounts();
    }, 300); // 300ms debounce delay

    // Cleanup timeout on component unmount
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [query, refinements, userUid, indexName, setStatusCounts]);

  return null; // This component does not render anything
};


const FilterPill = React.memo(({ label, onRemove }) => {
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
  if (!items.length) return null;
  return (
    <View style={styles.activeFiltersWrapper}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={item => item.attribute}
        renderItem={({ item }) => item.refinements.map(refinement => (
          <FilterPill key={refinement.value} label={`${item.label}: ${refinement.label}`} onRemove={() => refine(refinement)} />
        ))}
        contentContainerStyle={styles.pillsScrollView}
        inverted
      />
      {canClear && <TouchableOpacity onPress={clearAll}><Text style={styles.clearAllText}>مسح الكل</Text></TouchableOpacity>}
    </View>
  );
};

const SearchHeader = ({ requestView, setRequestView, sortOrder, setSortOrder, onOpenFilters, statusCounts, isRealtime }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { query, refine } = useSearchBox();
  // State to hold the input value, which updates instantly for a responsive UI
  const [inputValue, setInputValue] = useState(query);
  const { items } = useCurrentRefinements();
  const hasActiveFilters = items.length > 0;
  const { userUid } = usePermissions();

  const toggleSortOrder = useCallback(() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc')), [setSortOrder]);

  const filters = useMemo(() => {
    if (!userUid) return 'status:__no_user__';
    const baseFilter = `assignedUsers:${userUid}`;
    let statusFilter = '';
    if (requestView === "open") statusFilter = 'status:"مفتوح"';
    else if (requestView === "pending") statusFilter = 'status:"قيد المعالجة"';
    else if (requestView === "closed") statusFilter = '(status:"مكتمل" OR status:"مغلق")';
    return statusFilter ? `${baseFilter} AND ${statusFilter}` : baseFilter;
  }, [userUid, requestView]);

  useConfigure({
    filters,
  });

  // This effect synchronizes the input field if the query is cleared from elsewhere (e.g., "Clear All" filters)
  useEffect(() => { setInputValue(query); }, [query]);

  // --- DEBOUNCE IMPLEMENTATION START ---
  useEffect(() => {
    // Set up a timer that will run after 800ms
    const timerId = setTimeout(() => {
      // Once the timer fires, call refine to trigger the Algolia search
      refine(inputValue);
    }, 800);

    // This is the cleanup function. It runs whenever `inputValue` changes.
    // It clears the previous timer, preventing the search from firing.
    return () => clearTimeout(timerId);
  }, [inputValue, refine]); // The effect re-runs only when inputValue or refine changes
  // --- DEBOUNCE IMPLEMENTATION END ---

  return (
    <View style={styles.headerContainer}>
      <View style={styles.titleSection}>
        <View style={styles.headerRow}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.headerTitle}>الطلبات</Text>
          <View style={[styles.dataSourceIndicator, isRealtime ? styles.realtimeIndicator : styles.searchIndicator]}>
            <Text style={styles.dataSourceIndicatorText}>
              {isRealtime ? 'مباشر' : 'نتائج البحث'}
            </Text>
          </View>
        </View>
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.headerSubtitle}>عرض وتصفية الطلبات المرسلة اليك.</Text>
      </View>
      <View style={styles.controlsSection}>
        <View style={styles.controlsContainer}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={theme.placeholder} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث (بالاسم، هاتف، ايميل، ID...)"
              placeholderTextColor={theme.placeholder}
              value={inputValue}
              // Update only the local state on change, not the search itself
              onChangeText={setInputValue}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={onOpenFilters} activeOpacity={0.7}>
            <Ionicons name="filter" size={22} color={hasActiveFilters ? theme.primary : theme.icon} />
            {hasActiveFilters && <View style={styles.filterDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={toggleSortOrder} activeOpacity={0.9}>
            <Ionicons name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'} size={22} color={theme.icon} />
          </TouchableOpacity>
        </View>
        <ActiveFilters />
      </View>
      <View style={styles.switchContainer}>
        <TouchableOpacity style={[styles.switchTab, requestView === 'open' && styles.switchTabActive]} onPress={() => setRequestView('open')} activeOpacity={0.8}><Text style={[styles.switchText, requestView === 'open' && styles.switchTextActive]}>مفتوح ({statusCounts.open})</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.switchTab, requestView === 'pending' && styles.switchTabActive]} onPress={() => setRequestView('pending')} activeOpacity={0.8}><Text style={[styles.switchText, requestView === 'pending' && styles.switchTextActive]}>قيد المعالجة ({statusCounts.pending})</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.switchTab, requestView === 'closed' && styles.switchTabActive]} onPress={() => setRequestView('closed')} activeOpacity={0.8}><Text style={[styles.switchText, requestView === 'closed' && styles.switchTextActive]}>مكتمل ({statusCounts.closed})</Text></TouchableOpacity>
      </View>
    </View>
  );
};

const AlgoliaHitAdapter = ({ hit, users, userUid, loadingItemId, handleAcceptTask }: { hit: Hit, users: User[], userUid: string | null, loadingItemId: string | null, handleAcceptTask: (id: string) => void }) => {
  const getTimestampFromMilliseconds = (ms: number | undefined): Timestamp | undefined => {
    if (typeof ms !== 'number') return undefined;
    const seconds = Math.floor(ms / 1000);
    const nanoseconds = (ms % 1000) * 1000000;
    return new Timestamp(seconds, nanoseconds);
  };

  const userResponses = (hit.userResponses as any[]) || [];
  const hasResponded = userResponses.some(res => res.userId === userUid);

  const transformedItem: ServiceRequest = {
    ...hit,
    id: hit.objectID,
    createdAt: getTimestampFromMilliseconds(hit.createdAt as number),
    title: hit.title as string,
    type: hit.type as string,
    status: hit.status as string,
    customerName: hit.customerName as string,
    userResponses: userResponses,
  };

  return (
    <InfoCard
      item={transformedItem}
      users={users}
      showActions={true}
      hit={hit}
      hasResponded={hasResponded}
      isActionLoading={loadingItemId === hit.objectID}
      handleAcceptTask={handleAcceptTask}
    />
  );
};

const HybridList = ({ requestView, setRequestView, sortOrder, setSortOrder, onOpenFilters, users, statusCounts }) => {
  const listRef = useRef<FlatList>(null);
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const [firebaseRequests, setFirebaseRequests] = useState<ServiceRequest[]>([]);
  const [isFirebaseLoading, setIsFirebaseLoading] = useState(true);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const { userUid } = usePermissions();
  const { query: algoliaQuery } = useSearchBox();
  const { items: refinements } = useCurrentRefinements();
  const shouldUseFirebase = algoliaQuery === '' && refinements.length === 0;
  const { items: algoliaHits, isLastPage: isAlgoliaLastPage, showMore: showMoreAlgoliaHits } = useInfiniteHits();
  const [isAlgoliaLoadingMore, setIsAlgoliaLoadingMore] = useState(false);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);


  useEffect(() => {
    if (isAlgoliaLoadingMore) {
      setIsAlgoliaLoadingMore(false);
    }
  }, [algoliaHits]);

  const handleAcceptTask = async (ticketId: string) => {
    if (loadingItemId || !userUid) return;
    setLoadingItemId(ticketId);
    try {
      const taskRef = doc(db, 'serviceRequests', ticketId);
      await updateDoc(taskRef, {
        status: 'قيد المعالجة',
        userResponses: arrayUnion({
          userId: userUid,
          respondedAt: Timestamp.now(),
          action: 'accepted'
        })
      });
    } catch (error) {
      console.error("Error accepting task:", error);
    } finally {
      setLoadingItemId(null);
    }
  };

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
    if (!shouldUseFirebase || !userUid) {
      setFirebaseRequests([]);
      if (isFirebaseLoading) setIsFirebaseLoading(false);
      return;
    }
    setIsFirebaseLoading(true);
    const queryConstraints = [where('assignedUsers', 'array-contains', userUid)];
    if (requestView === 'open') queryConstraints.push(where('status', '==', 'مفتوح'));
    else if (requestView === 'pending') queryConstraints.push(where('status', '==', 'قيد المعالجة'));
    else if (requestView === 'closed') queryConstraints.push(where('status', 'in', ['مكتمل', 'مغلق']));
    queryConstraints.push(orderBy('createdAt', sortOrder));
    const finalQuery = query(collection(db, 'serviceRequests'), ...queryConstraints);
    const unsubscribe = onSnapshot(finalQuery, (querySnapshot) => {
      const requestsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRequest));
      setFirebaseRequests(requestsData);
      setIsFirebaseLoading(false);
    }, (error) => {
      console.error("Firebase listener error:", error);
      setIsFirebaseLoading(false);
    });
    return () => unsubscribe();
  }, [shouldUseFirebase, requestView, sortOrder, userUid]);

  const renderItem = useCallback(({ item }) => {
    if (shouldUseFirebase) {
      const hasResponded = item.userResponses?.some(res => res.userId === userUid) || false;
      return (
        <View style={styles.item}>
          <InfoCard
            item={item}
            users={users}
            showActions={true}
            hasResponded={hasResponded}
            isActionLoading={loadingItemId === item.id}
            handleAcceptTask={handleAcceptTask}
          />
        </View>
      );
    }
    return (
      <View style={styles.item}>
        <AlgoliaHitAdapter
          hit={item}
          users={users}
          userUid={userUid}
          loadingItemId={loadingItemId}
          handleAcceptTask={handleAcceptTask}
        />
      </View>
    );
  }, [shouldUseFirebase, users, userUid, loadingItemId, handleAcceptTask]);

  const ListEmptyComponent = useMemo(() => {
    const renderEmptyFirebase = () => <View style={styles.emptyContainer}><Ionicons name="document-text-outline" size={48} color={theme.placeholder} /><Text style={styles.emptyText}>لا توجد تكتات لعرضها في هذا القسم</Text></View>;
    const renderEmptyAlgolia = () => <View style={styles.emptyContainer}><Ionicons name="search-outline" size={48} color={theme.placeholder} /><Text style={styles.emptyText}>لا توجد نتائج تطابق بحثك</Text></View>;
    const loader = <ActivityIndicator color={theme.primary} style={{ margin: 40 }} />;

    if (shouldUseFirebase) {
      return isFirebaseLoading ? loader : renderEmptyFirebase();
    }

    const isAlgoliaInitialLoading = algoliaHits.length === 0 && !isAlgoliaLastPage;
    return isAlgoliaInitialLoading ? loader : renderEmptyAlgolia();
  }, [shouldUseFirebase, isFirebaseLoading, algoliaHits, isAlgoliaLastPage, theme]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={shouldUseFirebase ? firebaseRequests : algoliaHits}
        ListHeaderComponent={<SearchHeader {...{ requestView, setRequestView, sortOrder, setSortOrder, onOpenFilters, statusCounts, isRealtime: shouldUseFirebase }} />}
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
      {showScrollToTop && <TouchableOpacity style={styles.scrollToTopButton} onPress={scrollToTop} activeOpacity={0.7}><Ionicons name="chevron-up" size={36} color={theme.text} style={{ opacity: 0.7 }} /></TouchableOpacity>}
    </View>
  );
};

const ConnectedFilters = (props) => {
  const { query } = useSearchBox();
  return <Filters {...props} key={query} />;
};

export default function Taskscreen() {
  const { theme } = useTheme();
  console.log("HybridList")
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { userUid } = usePermissions();
  const [isFilterModalOpen, setFilterModalOpen] = useState(false);
  const [requestView, setRequestView] = useState('open');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isTeamsLoading, setIsTeamsLoading] = useState(true);
  const indexName = 'hello';
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({ open: 0, pending: 0, closed: 0 });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), snapshot => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
      setIsUsersLoading(false);
    }, error => { console.error("Failed to fetch users:", error); setIsUsersLoading(false); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'teams'), snapshot => {
      setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)));
      setIsTeamsLoading(false);
    }, error => { console.error("Failed to fetch teams:", error); setIsTeamsLoading(false); });
    return () => unsubscribe();
  }, []);

  if (isUsersLoading || isTeamsLoading || !userUid) {
    return <SafeAreaView style={styles.safeArea}><View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={theme.primary} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <InstantSearch searchClient={searchClient} indexName={indexName}>
          {/* --- REFACTOR 3: Added the provider component to the InstantSearch tree --- */}
          <DynamicStatusCountsProvider
            setStatusCounts={setStatusCounts}
            userUid={userUid}
            indexName={indexName}
          />
          <HybridList {...{ requestView, setRequestView, sortOrder, setSortOrder, onOpenFilters: () => setFilterModalOpen(true), users, statusCounts }} />
          <ConnectedFilters {...{ isModalOpen: isFilterModalOpen, onToggleModal: () => setFilterModalOpen(false), users, teams }} />
        </InstantSearch>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  container: { flex: 1, backgroundColor: theme.background },
  listContentContainer: { paddingHorizontal: 16, paddingBottom: 24 },
  item: { paddingVertical: 0 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, textAlign: 'center', marginTop: 16, fontFamily: 'Cairo', color: theme.textSecondary },
  headerContainer: { paddingBottom: 8, paddingTop: 16 },
  titleSection: { paddingVertical: 16 },
  headerRow: { flexDirection: 'row-reverse', justifyContent: 'flex-start', alignItems: 'center', width: '100%', gap: 12 },
  headerTitle: { fontSize: 28, textAlign: 'right', fontFamily: 'Cairo', fontWeight: 'bold', color: theme.text },
  headerSubtitle: { fontSize: 16, textAlign: 'right', marginTop: 4, fontFamily: 'Cairo', color: theme.textSecondary },
  dataSourceIndicator: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dataSourceIndicatorText: {
    color: theme.contrastText,
    fontFamily: 'Cairo',
    fontWeight: 'bold',
    fontSize: 12,
  },
  realtimeIndicator: {
    backgroundColor: '#34C759',
  },
  searchIndicator: {
    backgroundColor: theme.primary,
  },
  switchContainer: { flexDirection: 'row-reverse', borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.iconBackground, padding: 4, marginVertical: 12 },
  switchTab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  switchTabActive: { backgroundColor: theme.primary },
  switchText: { fontFamily: 'Cairo', fontSize: 15, fontWeight: '600', color: theme.text },
  switchTextActive: { color: theme.contrastText, fontWeight: 'bold' },
  controlsSection: {},
  controlsContainer: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 8, gap: 8 },
  searchContainer: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, height: 48, borderWidth: 1, backgroundColor: theme.inputBackground, borderColor: theme.border },
  searchIcon: { marginLeft: 8 },
  searchInput: { flex: 1, height: '100%', textAlign: 'right', fontSize: 16, fontFamily: 'Cairo', color: theme.text },
  iconButton: { justifyContent: 'center', alignItems: 'center', width: 48, height: 48, borderRadius: 12, borderWidth: 1, backgroundColor: theme.inputBackground, borderColor: theme.border },
  filterDot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: theme.card, backgroundColor: theme.primary },
  activeFiltersWrapper: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, minHeight: 36 },
  pillsScrollView: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  filterPill: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: theme.primaryTransparent, borderWidth: 1, borderColor: theme.primaryBorder, gap: 8 },
  filterPillText: { fontSize: 13, fontFamily: 'Cairo', fontWeight: '600', color: theme.primary },
  filterPillRemove: { marginLeft: -4, padding: 2 },
  clearAllText: { fontSize: 14, fontWeight: 'bold', fontFamily: 'Cairo', marginRight: 12, padding: 8, color: theme.primary },
  scrollToTopButton: { position: 'absolute', bottom: 0, alignSelf: 'center', padding: 8 },
});