import { usePermissions } from '@/context/PermissionsContext';
// Import the Theme interface for type safety
import { Theme, useTheme } from '@/context/ThemeContext';
// NEW: Import the native firestore library and its types
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { router } from 'expo-router';
// REMOVED: Imports from 'firebase/firestore' are no longer needed
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

// --- INTERFACES & HELPERS ---

// UPDATED: Use Timestamp type from the native library
export interface Transaction {
  id: string;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  totalAmount: number;
  type: 'invoice' | 'expense' | string;
  notes?: string;
  customerName?: string;
  serviceRequestId?: string;
  serviceRequestTitle?: string;
  lastUpdated: FirebaseFirestoreTypes.Timestamp;
  status: 'draft' | 'submitted' | 'approved' | 'paid';
  creatorName?: string;
  teamId: string | null;
  assineduser: string | null;
}

const PAGE_SIZE = 15;

// UPDATED: Ensure Timestamp check works with the new type
const formatDate = (date: FirebaseFirestoreTypes.Timestamp | Date | string) => {
  // The toDate() method exists on the native Timestamp, so this logic is safe
  const d = date instanceof firestore.Timestamp ? date.toDate() : new Date(date as any);
  return d.toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatCurrency = (amount: number) => {
  return `${amount.toLocaleString('en-US')} د.ع`;
};

// --- DONUT CHART COMPONENT (No changes needed here) ---
const DonutChart = ({ income, expenses, theme }: { income: number; expenses: number; theme: Theme }) => {
  const positiveExpenses = Math.abs(expenses);
  const size = 100;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = income + positiveExpenses;

  if (total === 0) {
    return (
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.border}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
        </Svg>
      </View>
    );
  }

  const expensePercentage = total > 0 ? positiveExpenses / total : 0;
  const expenseStrokeDashoffset = circumference * (1 - expensePercentage);

  return (
    <View style={{ width: size, height: size, transform: [{ rotate: '-90deg' }] }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.border} strokeWidth={strokeWidth} fill="transparent" />
        {income > 0 && <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.success} strokeWidth={strokeWidth} fill="transparent" strokeLinecap="round" />}
        {positiveExpenses > 0 && <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.destructive} strokeWidth={strokeWidth} fill="transparent" strokeDasharray={circumference} strokeDashoffset={expenseStrokeDashoffset} strokeLinecap="round" />}
      </Svg>
    </View>
  );
};


// --- DATA FETCHING HELPER ---
const fetchServiceRequestDetails = async (transactions: Transaction[]): Promise<Transaction[]> => {
  const enrichedTransactions = await Promise.all(
    transactions.map(async (transaction) => {
      if (transaction.serviceRequestId) {
        try {
          // UPDATED: Use native SDK syntax to get a document reference and fetch it
          const serviceRequestRef = firestore().collection('serviceRequests').doc(transaction.serviceRequestId);
          const serviceRequestSnap = await serviceRequestRef.get();

          if (serviceRequestSnap.exists()) {
            return { ...transaction, serviceRequestTitle: serviceRequestSnap.data()?.title || 'مهمة غير مسماة' };
          }
        } catch (error) {
          console.error("Error fetching service request details:", error);
        }
      }
      return transaction;
    })
  );
  return enrichedTransactions;
};

// --- SKELETON LOADER (No changes needed here) ---
const SkeletonItem = ({ styles }: { styles: any }) => {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);

  return (
    <Animated.View style={[styles.itemCard, { opacity }]}>
      <View style={styles.itemHeader}><View style={styles.skeletonBarMedium} /><View style={[styles.skeletonBarShort, { width: 80 }]} /></View>
      <View style={styles.itemBody}><View style={styles.skeletonBarLong} /></View>
      <View style={styles.skeletonServiceRequest}><View style={styles.skeletonIconCircleSmall} /><View style={{ flex: 1 }}><View style={[styles.skeletonBarLong, { width: '70%', height: 14 }]} /><View style={[styles.skeletonBarShort, { width: '40%', height: 12, marginTop: 6 }]} /></View></View>
    </Animated.View>
  );
};
const TransactionsSkeleton = () => {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  return (
    <View style={styles.listContainer}>
      <Text style={styles.listHeader}>آخر الحركات</Text>
      {[...Array(5)].map((_, index) => <SkeletonItem key={index} styles={styles} />)}
    </View>
  );
};

// --- TRANSACTION ITEM COMPONENT (No changes needed here) ---
const TransactionItem = React.memo(({ item, theme, styles }: { item: Transaction; theme: Theme, styles: any }) => {
  const effectiveAmount = item.type === 'expense' ? -item.totalAmount : item.totalAmount;
  const isIncome = effectiveAmount >= 0;
  const amountColor = isIncome ? theme.success : theme.destructive;
  const iconName = isIncome ? 'cash-plus' : 'cash-minus';
  const transactionTitle = item.notes || item.customerName || 'حركة مالية';
  const transactionSubtitle = item.creatorName ? `${item.creatorName}` : `بواسطة النظام`;
  const handlePress = () => item.serviceRequestId && router.push(`/tasks/${item.serviceRequestId}`);

  return (
    <TouchableOpacity style={styles.itemCard} activeOpacity={item.serviceRequestId ? 0.7 : 1.0} onPress={handlePress} disabled={!item.serviceRequestId}>
      <View style={styles.itemHeader}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
          <MaterialCommunityIcons name={iconName} size={24} color={amountColor} />
          <Text style={[styles.itemAmount, { color: amountColor }]}>{isIncome ? '+' : ''}{formatCurrency(effectiveAmount)}</Text>
        </View>
        <Text style={styles.itemDate}>{formatDate(item.createdAt)}</Text>
      </View>
      <View style={styles.itemBody}>
        <Text style={styles.itemTitle} numberOfLines={2}>{transactionTitle}</Text>
        <Text style={styles.itemSubtitle}>{transactionSubtitle}</Text>
      </View>
      {item.serviceRequestId && (
        <View style={styles.serviceRequestContainer}>
          <View style={styles.serviceRequestInfo}>
            <MaterialCommunityIcons name="briefcase-check-outline" size={20} color={theme.primary} />
            <View style={{ marginRight: 12 }}>
              <Text style={styles.serviceRequestTitle}>{item.serviceRequestTitle || 'تحميل...'}</Text>
              <Text style={styles.serviceRequestId}>رقم التكت: {item.serviceRequestId}</Text>
            </View>
          </View>
          <Feather name={I18nManager.isRTL ? "chevron-left" : "chevron-right"} size={22} color={theme.textSecondary} />
        </View>
      )}
    </TouchableOpacity>
  );
});

// --- MAIN SCREEN COMPONENT ---
const AccountBalanceScreen = () => {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { userdoc } = usePermissions();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // UPDATED: Use QueryDocumentSnapshot from native library types
  const [lastVisible, setLastVisible] = useState<FirebaseFirestoreTypes.QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NEW: Separate function to fetch initial data with pagination support
  const fetchInitialData = useCallback(async (refresh = false) => {
    if (!userdoc?.id) {
      setLoading(false);
      return;
    }

    if (refresh) setIsRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // UPDATED: Query using the native SDK's chained-method syntax
      const query = firestore()
        .collection("transactions")
        .where("assineduser", "==", userdoc.id)
        .where("status", "!=", "cleared")
        .orderBy("createdAt", "desc")
        .limit(PAGE_SIZE);

      const snapshot = await query.get();
      
      const fetchedTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      const enrichedTransactions = await fetchServiceRequestDetails(fetchedTransactions);

      setTransactions(enrichedTransactions);

      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);

    } catch (err: any) {
      console.error("Error fetching transactions:", err);
      setError("فشل في تحميل الحركات المالية.");
    } finally {
      setLoading(false);
      if (refresh) setIsRefreshing(false);
    }
  }, [userdoc?.id]);

  // NEW: Real-time listener for updates to existing transactions
  const subscribeToUpdates = useCallback(() => {
    if (!userdoc?.id) return () => {};

    const query = firestore()
      .collection("transactions")
      .where("assineduser", "==", userdoc.id)
      .where("status", "!=", "cleared")
      .orderBy("createdAt", "desc")
      .limit(PAGE_SIZE);

    // Listen for real-time updates
    const unsubscribe = query.onSnapshot(async (snapshot) => {
      const fetchedTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      const enrichedTransactions = await fetchServiceRequestDetails(fetchedTransactions);
      setTransactions(prev => {
        // Merge new data with existing data, avoiding duplicates
        const existingIds = new Set(prev.map(t => t.id));
        const newTransactions = enrichedTransactions.filter(t => !existingIds.has(t.id));
        return [...newTransactions, ...prev];
      });
    }, (err) => {
      console.error("Error with real-time listener:", err);
    });

    return unsubscribe;
  }, [userdoc?.id]);

  useEffect(() => {
    fetchInitialData(false);
    const unsubscribe = subscribeToUpdates();
    return () => unsubscribe();
  }, [fetchInitialData, subscribeToUpdates]);

  const fetchMoreTransactions = async () => {
    if (loadingMore || !hasMore || !lastVisible || !userdoc?.id) return;
    setLoadingMore(true);

    try {
      // UPDATED: Query for more documents using the native SDK's chained methods
      const snapshots = await firestore()
        .collection("transactions")
        .where("assineduser", "==", userdoc.id)
        .where("status", "!=", "cleared")
        .orderBy("createdAt", "desc")
        .startAfter(lastVisible)
        .limit(PAGE_SIZE)
        .get();

      const newTransactions = snapshots.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));

      if (newTransactions.length > 0) {
        const enrichedNewTransactions = await fetchServiceRequestDetails(newTransactions);
        setTransactions(prev => [...prev, ...enrichedNewTransactions]);
        const lastDoc = snapshots.docs[snapshots.docs.length - 1];
        setLastVisible(lastDoc);
      }
      setHasMore(snapshots.docs.length === PAGE_SIZE);

    } catch (err: any) {
      console.error("Error fetching more transactions:", err);
      setError("فشل في تحميل المزيد من الحركات المالية.");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRefresh = useCallback(() => {
    fetchInitialData(true);
  }, [fetchInitialData]);

  // Logic for calculations remains the same
  const { totalIncome, totalExpenses, accountBalance } = useMemo(() => {
    return transactions.reduce(
      (acc, trans) => {
        // NOTE: The string 'مصروف' should match what's in your database for 'type'
        if (trans.type === 'مصروف' || trans.type === 'expense') {
          acc.totalExpenses += trans.totalAmount;
        } else {
          acc.totalIncome += trans.totalAmount;
        }
        acc.accountBalance = acc.totalIncome + acc.totalExpenses; // Fixed calculation
        return acc;
      },
      { totalIncome: 0, totalExpenses: 0, accountBalance: 0 }
    );
  }, [transactions]);

  const renderTransactionItem = useCallback(({ item }: { item: Transaction }) => (
    <TransactionItem item={item} theme={theme} styles={styles} />
  ), [theme, styles]);

  const renderContent = () => {
    if (loading && transactions.length === 0) return <TransactionsSkeleton />;
    if (error) return <Text style={[styles.infoText, { color: theme.destructive }]}>{error}</Text>;
    if (!loading && transactions.length === 0) {
      return (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[theme.primary]} tintColor={theme.primary} />}
        >
          <MaterialCommunityIcons name="finance" size={90} color={theme.border} />
          <Text style={styles.infoText}>لا توجد حركات مالية بعد</Text>
          <Text style={styles.infoSubText}>عندما تضيف فواتير أو مصاريف، ستظهر هنا.</Text>
        </ScrollView>
      );
    }
    return (
      <FlatList
        data={transactions}
        renderItem={renderTransactionItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        onEndReached={fetchMoreTransactions}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <>
            <View style={styles.summaryCard}>
              <View style={styles.chartContainer}>
                <DonutChart income={totalIncome} expenses={totalExpenses} theme={theme} />
              </View>
              <View style={styles.summaryDetailsContainer}>
                <Text style={styles.summaryLabel}>الرصيد الحالي</Text>
                <Text style={[styles.summaryValue, { color: accountBalance >= 0 ? theme.success : theme.destructive }]}>{formatCurrency(accountBalance)}</Text>
                <View style={styles.summaryBreakdown}>
                  <View style={styles.summaryBreakdownRow}><View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}><View style={[styles.legendDot, { backgroundColor: theme.success }]} /><Text style={styles.summaryBreakdownLabel}>إجمالي الدخل:</Text></View><Text style={[styles.summaryBreakdownValue, { color: theme.success }]}>{formatCurrency(totalIncome)}</Text></View>
                  <View style={styles.summaryBreakdownRow}><View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}><View style={[styles.legendDot, { backgroundColor: theme.destructive }]} /><Text style={styles.summaryBreakdownLabel}>إجمالي المصاريف:</Text></View><Text style={[styles.summaryBreakdownValue, { color: theme.destructive }]}>{formatCurrency(totalExpenses)}</Text></View>
                </View>
              </View>
            </View>
            <Text style={styles.listHeader}>آخر الحركات</Text>
          </>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator size="large" color={theme.primary} style={{ marginVertical: 20 }} /> : null}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[theme.primary]} tintColor={theme.primary} />}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>كشف الحساب</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-right" size={28} color={theme.text} />
        </TouchableOpacity>
      </View>
      {renderContent()}
    </SafeAreaView>
  );
};

// --- STYLES (No changes needed) ---
const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  headerContainer: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  headerTitle: { fontSize: 32, fontWeight: 'bold', color: theme.text },
  backButton: { padding: 8 },
  summaryCard: {
    backgroundColor: theme.card,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 24,
    marginBottom: 24,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: theme.black,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: theme.themeName === 'dark' ? 0.2 : 0.08,
    shadowRadius: 15,
    elevation: 5,
  },
  summaryDetailsContainer: { flex: 1, alignItems: 'flex-end' },
  chartContainer: { marginLeft: 16 },
  summaryLabel: { fontSize: 16, color: theme.textSecondary, fontWeight: '500' },
  summaryValue: { fontSize: 32, fontWeight: '700', marginTop: 4, textAlign: 'right' },
  summaryBreakdown: { marginTop: 16, alignSelf: 'stretch', borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 },
  summaryBreakdownRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  summaryBreakdownLabel: { fontSize: 14, color: theme.textSecondary },
  summaryBreakdownValue: { fontSize: 15, fontWeight: '600' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  listContainer: { paddingHorizontal: 20, paddingBottom: 20 },
  listHeader: { fontSize: 18, fontWeight: '600', color: theme.textSecondary, marginBottom: 16, textAlign: 'right' },
  infoText: { textAlign: 'center', marginTop: 24, fontSize: 20, fontWeight: '600', color: theme.text },
  infoSubText: { textAlign: 'center', marginTop: 8, fontSize: 16, color: theme.textSecondary, paddingHorizontal: 40 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 50 },
  itemCard: {
    backgroundColor: theme.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: theme.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: theme.themeName === 'dark' ? 0.15 : 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  itemHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  itemAmount: { fontSize: 18, fontWeight: 'bold', marginRight: 8 },
  itemDate: { fontSize: 14, color: theme.textSecondary },
  itemBody: { alignItems: 'flex-end', marginBottom: 12 },
  itemTitle: { fontSize: 16, fontWeight: '600', color: theme.text, textAlign: 'right' },
  itemSubtitle: { fontSize: 14, color: theme.textSecondary, textAlign: 'right', marginTop: 4 },
  serviceRequestContainer: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
  serviceRequestInfo: { flexDirection: 'row-reverse', alignItems: 'center', flexShrink: 1 },
  serviceRequestTitle: { fontSize: 15, fontWeight: '500', color: theme.text, textAlign: 'right' },
  serviceRequestId: { fontSize: 12, color: theme.textSecondary, textAlign: 'right', marginTop: 2 },
  skeletonBarLong: { height: 16, backgroundColor: theme.border, borderRadius: 4 },
  skeletonBarShort: { height: 14, backgroundColor: theme.border, borderRadius: 4 },
  skeletonBarMedium: { height: 18, width: 120, backgroundColor: theme.border, borderRadius: 4 },
  skeletonIconCircleSmall: { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.border, marginRight: 12 },
  skeletonServiceRequest: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border + '33' },
});

export default AccountBalanceScreen;