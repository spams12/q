import { Ionicons } from '@expo/vector-icons';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { usePermissions } from '../../context/PermissionsContext';
import { useTheme } from '../../context/ThemeContext';
import { db } from '../../lib/firebase';
import { StockTransaction, User, UserStockItem } from '../../lib/types';

type TabKey = 'stock' | 'transactions';

type StockManagementListItem =
  | { type: 'stock'; data: UserStockItem }
  | { type: 'transaction'; data: StockTransaction };

const StockManagementScreen: React.FC = () => {
  const { userUid } = usePermissions();
  const { theme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [stockItems, setStockItems] = useState<UserStockItem[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('stock');

  useEffect(() => {
    if (!userUid) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const userDocRef = doc(db, 'users', userUid);
    const unsubscribeUser = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        const userData = { id: doc.id, ...doc.data() } as User;
        setUser(userData);
        setStockItems(userData.stockItems || []);
      } else {
        console.error('User document does not exist');
        Alert.alert('خطأ', 'المستخدم غير موجود');
      }
    }, (error) => {
      console.error('Error fetching user:', error);
      Alert.alert('خطأ', 'فشل في جلب بيانات المستخدم');
    });

    const transactionsQuery = query(
      collection(db, 'stockTransactions'),
      where('userId', '==', userUid),
      // orderBy('timestamp', 'desc') // Firestore requires an index for this
    );

    const unsubscribeTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      const transactionData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockTransaction));
      // Sort by timestamp descending
      transactionData.sort((a, b) => {
        const getSafeDate = (timestamp: any) => {
          if (timestamp && typeof timestamp.toDate === 'function') {
            return timestamp.toDate();
          }
          // Fallback for string or number timestamps
          if (!timestamp) return new Date(0); // Handle null/undefined case
          return new Date(timestamp);
        };
        const aTime = getSafeDate(a.timestamp);
        const bTime = getSafeDate(b.timestamp);
        return bTime.getTime() - aTime.getTime();
      });
      setTransactions(transactionData);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching transactions:', error);
      Alert.alert('خطأ', 'فشل في جلب المعاملات');
      setLoading(false);
    });

    return () => {
      unsubscribeUser();
      unsubscribeTransactions();
    };
  }, [userUid]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // This is a mock refresh. In a real app, you'd re-trigger the fetches.
    // Since we use onSnapshot, data is live, but this provides pull-to-refresh UX.
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const getItemTypeColor = (type: string) => {
    const colors = { packageType: '#FF6B6B', cableLength: '#4ECDC4', connectorType: '#45B7D1', deviceModel: '#96CEB4', maintenanceType: '#FFEAA7' };
    return colors[type as keyof typeof colors] || '#DDD';
  };

  const getTransactionTypeColor = (type: string) => {
    const colors = { addition: '#00B894', reduction: '#E17055', inventory: '#0984E3', invoice: '#6C5CE7' };
    return colors[type as keyof typeof colors] || '#DDD';
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate?.() || new Date(timestamp);
    return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) + ' ' + date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  const renderStockItem = ({ item }: { item: UserStockItem }) => (
    <View style={[styles.stockCard, { backgroundColor: theme.card }]}>
      <View style={styles.stockHeader}>
        <View style={[styles.itemTypeBadge, { backgroundColor: getItemTypeColor(item.itemType) }]}>
          <Text style={styles.itemTypeText}>{item.itemType}</Text>
        </View>
        <Text style={[styles.quantityText, { color: theme.text }]}>{item.quantity}</Text>
      </View>
      <Text style={[styles.itemName, { color: theme.text }]}>{item.itemName}</Text>
      <Text style={styles.lastUpdated}>آخر تحديث: {formatDate(item.lastUpdated)}</Text>
      {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
    </View>
  );

  const renderTransactionItem = ({ item }: { item: StockTransaction }) => (
    <View style={[styles.transactionCard, { backgroundColor: theme.card }]}>
      <View style={styles.transactionHeader}>
        <View style={[styles.transactionTypeBadge, { backgroundColor: getTransactionTypeColor(item.type) }]}>
          <Text style={styles.transactionTypeText}>{item.type}</Text>
        </View>
        <Text style={[styles.quantityChange, { color: item.type === 'addition' ? '#00B894' : '#E17055' }]}>
          {item.type === 'addition' ? '+' : '-'}{item.quantity}
        </Text>
      </View>
      <Text style={[styles.transactionItemName, { color: theme.text }]}>{item.itemName}</Text>
      <View style={styles.transactionDetails}>
        <Text style={styles.transactionDate}>{formatDate(item.timestamp)}</Text>
        <View style={[styles.itemTypeBadge, { backgroundColor: getItemTypeColor(item.itemType) }]}>
          <Text style={styles.itemTypeText}>{item.itemType}</Text>
        </View>
      </View>
      {item.sourceName && <Text style={styles.source}>المصدر: {item.sourceName}</Text>}
      {item.notes && <Text style={styles.notes}>ملاحظات: {item.notes}</Text>}
    </View>
  );

  const listData = React.useMemo((): StockManagementListItem[] => {
    if (activeTab === 'stock') {
      return stockItems.map(data => ({ type: 'stock', data }));
    } else {
      return transactions.map(data => ({ type: 'transaction', data }));
    }
  }, [activeTab, stockItems, transactions]);

  const renderItem = ({ item }: { item: StockManagementListItem }) => {
    if (item.type === 'stock') {
      return renderStockItem({ item: item.data });
    }
    return renderTransactionItem({ item: item.data });
  };

  const keyExtractor = (item: StockManagementListItem, index: number) => {
    return `${item.type}-${item.data.id || index.toString()}`;
  };

  const TabButton = React.memo(({ tabKey, label, count }: { tabKey: TabKey; label: string; count: number }) => {
    const isActive = activeTab === tabKey;
    return (
      <Pressable
        style={[styles.tab, isActive && styles.activeTab, isActive && { backgroundColor: theme.background }]}
        onPress={() => setActiveTab(tabKey)}
      >
        <View style={styles.tabContent}>
          <Text style={[styles.tabText, { color: isActive ? theme.tabActive : theme.tabInactive }]}>
            {label} ({count})
          </Text>
        </View>
      </Pressable>
    );
  });
  TabButton.displayName = 'TabButton';

  const ListHeader = React.memo(() => (
    <>
      <View style={styles.headerContainer}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>إدارة المخزون</Text>
        <Text style={[styles.headerSubtitle, { color: theme.text }]}>
          عرض وإدارة مخزونك ومعاملاتك.
        </Text>
      </View>
      <View style={[styles.tabsContainer, { backgroundColor: theme.header }]}>
        <TabButton tabKey="stock" label="المخزون" count={stockItems.length} />
        <TabButton tabKey="transactions" label="المعاملات" count={transactions.length} />
      </View>
    </>
  ));
  ListHeader.displayName = 'ListHeader';

  const renderListEmpty = () => {
    if (loading) return null; // The main loading indicator is covering this.
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="archive-outline" size={48} color="#ccc" />
        <Text style={[styles.emptyText, { color: theme.text }]}>
          {activeTab === 'stock' ? 'لا توجد عناصر في المخزون' : 'لا توجد معاملات'}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tabActive} />
        <Text style={[styles.loadingText, { color: theme.text }]}>جاري تحميل بيانات المخزون...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={renderListEmpty}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.tabActive]} tintColor={theme.tabActive} />}
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
  headerContainer: {
    marginBottom: 16,
    alignItems: 'flex-end',
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
  stockCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginHorizontal: 8,
  },
  stockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  itemTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    fontFamily: 'Cairo',
  },
  quantityText: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Cairo',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'right',
    fontFamily: 'Cairo',
  },
  lastUpdated: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    textAlign: 'right',
    fontFamily: 'Cairo',
  },
  notes: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'right',
    fontFamily: 'Cairo',
  },
  transactionCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginHorizontal: 8,
  },
  transactionHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  transactionTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  transactionTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    textTransform: 'capitalize',
    fontFamily: 'Cairo',
  },
  quantityChange: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Cairo',
  },
  transactionItemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'right',
    fontFamily: 'Cairo',
  },
  transactionDetails: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'Cairo',
  },
  source: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    textAlign: 'right',
    fontFamily: 'Cairo',
  },
});

export default StockManagementScreen;