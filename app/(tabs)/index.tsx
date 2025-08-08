// src/screens/YourScreen.tsx

import InfoCard from '@/components/InfoCard';
import { usePermissions } from '@/context/PermissionsContext';
import { Theme, useTheme } from '@/context/ThemeContext';
import { ServiceRequest } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { useScrollToTop } from '@react-navigation/native';
import { liteClient as algoliasearch } from 'algoliasearch/lite';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where
} from 'firebase/firestore';
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
  Animated,
  Dimensions,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { handleAcceptTask as acceptTask, handleRejectTask as rejectTask } from '@/hooks/taskar';
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
const SCREEN_WIDTH = Dimensions.get('window').width;

const searchClient = algoliasearch(
  'NRMR6IJLJK',
  '36b7095707242f6be237f5e4e491d0a2'
);


// --- DynamicStatusCountsProvider (No changes needed) ---
const DynamicStatusCountsProvider = ({ setStatusCounts, userUid, indexName }) => {
  const { query } = useSearchBox();
  const { items: refinements } = useCurrentRefinements();
  const debounceTimeoutRef = useRef(null);
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      const fetchCounts = async () => {
        if (!userUid) return;
        const baseFilter = `assignedUsers:${userUid}`;
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
                hitsPerPage: 0,
              },
            },
          ]);
          const facets = results[0]?.facets || {};
          const counts = facets.status || {};
          const closedCount = (counts['مكتمل'] || 0) + (counts['مغلق'] || 0);
          setStatusCounts({
            open: counts['مفتوح'] || 0,
            pending: counts['قيد المعالجة'] || 0,
            closed: closedCount,
          });
        } catch (error) {
          console.error("Error fetching dynamic facet counts:", error);
          setStatusCounts({ open: 0, pending: 0, closed: 0 });
        }
      };
      fetchCounts();
    }, 300);
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [query, refinements, userUid, indexName, setStatusCounts]);

  return null;
};


// --- FilterPill and ActiveFilters (No changes needed) ---
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

// --- MODIFIED: SearchHeader with animation logic ---
const SearchHeader = ({ requestView, setRequestView, sortOrder, setSortOrder, onOpenFilters, statusCounts, isLoading }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { query, refine } = useSearchBox();
  const { items: refinements } = useCurrentRefinements();
  const { userUid } = usePermissions();

  const [inputValue, setInputValue] = useState(query);
  const hasActiveFilters = refinements.length > 0;
  const isRealtime = query === '' && refinements.length === 0;

  // Animation state for the tab indicator
  const [tabLayouts, setTabLayouts] = useState({});
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const indicatorWidth = useRef(new Animated.Value(0)).current;

  // Animate indicator when tab or layouts change
  useEffect(() => {
    const layout = tabLayouts[requestView];
    if (layout) {
      Animated.spring(indicatorPosition, {
        toValue: layout.x,
        useNativeDriver: false,
      }).start();
      Animated.spring(indicatorWidth, {
        toValue: layout.width,
        useNativeDriver: false,
      }).start();
    }
  }, [requestView, tabLayouts]);

  const toggleSortOrder = useCallback(() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc')), [setSortOrder]);

  const filters = useMemo(() => {
    if (!userUid) return 'status:__no_user__';
    const baseFilter = `assignedUsers:${userUid}`;
    let statusFilter = '';
    if (requestView === "open") statusFilter = 'status:"مفتوح"';
    else if (requestView === "pending") statusFilter = 'status:"قيد المعالجة"';
    else if (requestView === "closed") statusFilter = '(status:"مكتمل")';
    return statusFilter ? `${baseFilter} AND ${statusFilter}` : baseFilter;
  }, [userUid, requestView]);

  useConfigure({ filters });
  useEffect(() => { setInputValue(query); }, [query]);

  useEffect(() => {
    const timerId = setTimeout(() => { refine(inputValue); }, 800);
    return () => clearTimeout(timerId);
  }, [inputValue, refine]);

  const TABS = {
    open: `مفتوح (${statusCounts.open})`,
    pending: `قيد المعالجة (${statusCounts.pending})`,
    closed: `مكتمل (${statusCounts.closed})`,
  };

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
              onChangeText={setInputValue}
              returnKeyType="search"
              multiline={false}
              allowFontScaling={false}
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
        <Animated.View style={[styles.activeTabIndicator, { left: indicatorPosition, width: indicatorWidth }]} />
        {Object.keys(TABS).map((tabKey) => (
          <TouchableOpacity
            key={tabKey}
            style={styles.switchTab}
            onPress={() => setRequestView(tabKey)}
            activeOpacity={0.8}
            onLayout={(event) => {
              const { x, width } = event.nativeEvent.layout;
              setTabLayouts((prev) => ({ ...prev, [tabKey]: { x, width } }));
            }}
          >
            <Text adjustsFontSizeToFit style={[styles.switchText, requestView === tabKey && styles.switchTextActive]}>
              {TABS[tabKey]}
              {requestView === tabKey && isLoading && '...'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

// --- AlgoliaHitAdapter (No changes needed) ---
interface AlgoliaHitAdapterProps {
  hit: any;
  users: User[];
  userUid: string;
  loadingItemId: string | null;
  handleAcceptTask: (ticketId: string) => Promise<void>;
  handleRejectTask: (ticketId: string) => Promise<void>;
}

const AlgoliaHitAdapter: React.FC<AlgoliaHitAdapterProps> = ({ hit, users, userUid, loadingItemId, handleAcceptTask, handleRejectTask }) => {
  const getTimestampFromMilliseconds = (ms) => {
    if (typeof ms !== 'number') return undefined;
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1000000);
  };
  const userResponses = (hit.userResponses || []);
  const hasResponded = userResponses.some(res => res.userId === userUid);
  const transformedItem = {
    ...hit,
    id: hit.objectID,
    createdAt: getTimestampFromMilliseconds(hit.createdAt),
    title: hit.title,
    type: hit.type,
    status: hit.status,
    customerName: hit.customerName,
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
      handleRejectTask={handleRejectTask}
    />
  );
};

// --- MODIFIED: HybridList to handle tab switching state ---
const HybridList = ({ requestView, sortOrder, users, isTabSwitching, listHeader, listRef }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const [firebaseRequests, setFirebaseRequests] = useState<ServiceRequest[]>([]);
  const [isFirebaseLoading, setIsFirebaseLoading] = useState(true);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const { userdoc, userUid } = usePermissions();
  const { query: algoliaQuery } = useSearchBox();
  const { items: refinements } = useCurrentRefinements();
  const { items: algoliaHits, isLastPage: isAlgoliaLastPage, showMore: showMoreAlgoliaHits } = useInfiniteHits();
  const [isAlgoliaLoadingMore, setIsAlgoliaLoadingMore] = useState(false);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);

  const shouldUseFirebase = algoliaQuery === '' && refinements.length === 0;
  const currentData = shouldUseFirebase ? firebaseRequests : algoliaHits;
  const isListLoading = shouldUseFirebase ? isFirebaseLoading : (algoliaHits.length === 0 && !isAlgoliaLastPage);
  // If tab is switching, render an empty list to allow the loader to show
  const listData = isTabSwitching ? [] : currentData;

  useEffect(() => {
    if (isAlgoliaLoadingMore) { setIsAlgoliaLoadingMore(false); }
  }, [algoliaHits]);

  const handleAcceptTask = async (ticketId: string) => {
    if (loadingItemId || !userdoc) return;
    await acceptTask(
      ticketId,
      userdoc,
      (action: 'accept' | null) => setLoadingItemId(action === 'accept' ? ticketId : null)
    );
  };

  const handleRejectTask = async (ticketId: string) => {
    if (loadingItemId || !userdoc) return;
    await rejectTask(
      ticketId,
      userdoc,
      (action: 'reject' | null) => setLoadingItemId(action === 'reject' ? ticketId : null)
    );
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
    else if (requestView === 'closed') queryConstraints.push(where('status', 'in', ['مكتمل']));
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
          <InfoCard item={item} users={users} showActions={true} hasResponded={hasResponded} isActionLoading={loadingItemId === item.id} handleAcceptTask={handleAcceptTask} handleRejectTask={handleRejectTask} />
        </View>
      );
    }
    return (
      <View style={styles.item}>
        <AlgoliaHitAdapter hit={item} users={users} userUid={userUid} loadingItemId={loadingItemId} handleAcceptTask={handleAcceptTask} handleRejectTask={handleRejectTask} />
      </View>
    );
  }, [shouldUseFirebase, users, userUid, loadingItemId, handleAcceptTask]);

  const ListEmptyComponent = useMemo(() => {
    // Show a main loader when switching tabs or on initial load
    if (isTabSwitching || (isListLoading && listData.length === 0)) {
      return <ActivityIndicator color={theme.primary} style={{ marginVertical: 60 }} size="large" />;
    }
    const emptyIcon = shouldUseFirebase ? "document-text-outline" : "search-outline";
    const emptyText = shouldUseFirebase ? "لا توجد تكتات لعرضها في هذا القسم" : "لا توجد نتائج تطابق بحثك";
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name={emptyIcon} size={48} color={theme.placeholder} />
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }, [isTabSwitching, isListLoading, listData.length, shouldUseFirebase, theme]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={listData}
        ListHeaderComponent={listHeader}
        keyExtractor={item => shouldUseFirebase ? item.id : item.objectID}
        renderItem={renderItem}
        ListEmptyComponent={ListEmptyComponent}
        onEndReached={shouldUseFirebase ? undefined : handleAlgoliaLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={!shouldUseFirebase && isAlgoliaLoadingMore ? <ActivityIndicator color={theme.primary} style={{ margin: 20 }} /> : null}
        onScroll={handleScroll}
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

// --- MODIFIED: Main screen component ---
export default function Taskscreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { userUid } = usePermissions();
  const [isFilterModalOpen, setFilterModalOpen] = useState(false);
  const [requestView, setRequestView] = useState('open');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isTeamsLoading, setIsTeamsLoading] = useState(true);
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({ open: 0, pending: 0, closed: 0 });
  const indexName = 'hello';

  // State and handler for tab switching
  const [isTabSwitching, setIsTabSwitching] = useState(false);
  const handleRequestViewChange = useCallback((newView: 'open' | 'pending' | 'closed') => {
    if (newView === requestView || isTabSwitching) return;
    setRequestView(newView);
    setIsTabSwitching(true);
    setTimeout(() => setIsTabSwitching(false), 400); // Duration for loading state
  }, [requestView, isTabSwitching]);

  // Ref for FlatList to support scroll-to-top on tab press
  const listRef = useRef<FlatList | null>(null);
  useScrollToTop(listRef);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), snapshot => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
      setIsUsersLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'teams'), snapshot => {
      setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)));
      setIsTeamsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Memoize the header to preserve its state (like animations) during re-renders
  const headerComponent = useMemo(() => (
    <SearchHeader
      requestView={requestView}
      setRequestView={handleRequestViewChange}
      sortOrder={sortOrder}
      setSortOrder={setSortOrder}
      onOpenFilters={() => setFilterModalOpen(true)}
      statusCounts={statusCounts}
      isLoading={isTabSwitching}
    />
  ), [requestView, handleRequestViewChange, sortOrder, statusCounts, isTabSwitching]);

  if (isUsersLoading || isTeamsLoading || !userUid) {
    return <SafeAreaView style={styles.safeArea}><View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={theme.primary} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <InstantSearch searchClient={searchClient} indexName={indexName}>
          <DynamicStatusCountsProvider
            setStatusCounts={setStatusCounts}
            userUid={userUid}
            indexName={indexName}
          />
          <HybridList
            requestView={requestView}
            sortOrder={sortOrder}
            users={users}
            isTabSwitching={isTabSwitching}
            listHeader={headerComponent}
            listRef={listRef}
          />
          <ConnectedFilters {...{ isModalOpen: isFilterModalOpen, onToggleModal: () => setFilterModalOpen(false), users, teams }} />
        </InstantSearch>
      </View>
    </SafeAreaView>
  );
}

// --- MODIFIED: Stylesheet with animation styles ---
const getStyles = (theme: Theme) => {
  const placeholderFontSize = Math.max(12, Math.min(16, SCREEN_WIDTH * 0.035));
  return StyleSheet.create({
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
    dataSourceIndicator: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    dataSourceIndicatorText: { color: theme.contrastText, fontFamily: 'Cairo', fontWeight: 'bold', fontSize: 12 },
    realtimeIndicator: { backgroundColor: '#34C759' },
    searchIndicator: { backgroundColor: theme.primary },
    // Styles for animated tabs
    switchContainer: {
      flexDirection: 'row-reverse',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.iconBackground,
      padding: 4,
      marginVertical: 12,
      position: 'relative', // <-- Important for indicator positioning
    },
    activeTabIndicator: {
      position: 'absolute',
      backgroundColor: theme.primary,
      borderRadius: 8,
      top: 4,
      bottom: 4,
    },
    switchTab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent', // Tab itself is transparent
      zIndex: 1, // Text sits above the animated indicator
    },
    switchTabActive: {
    },
    switchText: { fontFamily: 'Cairo', fontSize: 15, fontWeight: '600', color: theme.text },
    switchTextActive: {},
    // End of tab styles
    controlsSection: {},
    controlsContainer: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 8, gap: 8 },
    searchContainer: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, height: 48, borderWidth: 1, backgroundColor: theme.inputBackground, borderColor: theme.border },
    searchIcon: { marginLeft: 8 },
    searchInput: { flex: 1, height: '100%', textAlign: 'right', fontSize: placeholderFontSize, fontFamily: 'Cairo', color: theme.text, letterSpacing: 0.2 },
    iconButton: { justifyContent: 'center', alignItems: 'center', width: 48, height: 48, borderRadius: 12, borderWidth: 1, backgroundColor: theme.inputBackground, borderColor: theme.border },
    filterDot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: theme.card, backgroundColor: theme.primary },
    activeFiltersWrapper: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, minHeight: 36 },
    pillsScrollView: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    filterPill: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: theme.primaryTransparent, borderWidth: 1, borderColor: theme.primaryBorder, gap: 8 },
    filterPillText: { fontSize: 13, fontFamily: 'Cairo', fontWeight: '600', color: theme.primary },
    filterPillRemove: { marginLeft: -4, padding: 2 },
    clearAllText: { fontSize: 14, fontWeight: 'bold', fontFamily: 'Cairo', marginRight: 12, padding: 8, color: theme.primary },
    scrollToTopButton: { position: 'absolute', bottom: 15, alignSelf: 'center', padding: 8 },
  });
};