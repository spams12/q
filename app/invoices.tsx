import { usePermissions } from '@/context/PermissionsContext';
import { useTheme } from '@/context/ThemeContext';
import { db } from '@/lib/firebase';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface InvoiceItem {
  name: string;
  price: number;
  quantity: number;
}

// Your Invoice Interface
export interface Invoice {
  id: string;
  linkedServiceRequestId: string;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  lastUpdated: FirebaseFirestoreTypes.Timestamp;
  items: InvoiceItem[];
  totalAmount: number;
  status: 'draft' | 'submitted' | 'approved' | 'paid';
  notes?: string;
  customerName?: string;
  customerPhone?: string;
  creatorName?: string;
  customerEmail?: string;
  type: string;
  statusLastChangedBy?: string;
  statusLastChangedAt?: FirebaseFirestoreTypes.Timestamp;
  teamId: string | null;
  teamCreatorId: string | null;
  isSubscriptionInvoice?: boolean;
  parentInvoiceName?: string;
  subscriberId?: string;
}

// Helper to format date for display
const formatDate = (date: FirebaseFirestoreTypes.Timestamp | Date | string) => {
  const d = date instanceof firestore.Timestamp ? date.toDate() : new Date(date);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

// Helper to format currency with commas for thousands
const formatCurrency = (amount: number) => {
  return amount.toLocaleString('en-US', {

  });
};


// Helper for status badge styling and text
const getStatusDetails = (status: Invoice['status']) => {
  switch (status) {
    case 'paid':
      return { text: 'مدفوعة', color: '#28a745', backgroundColor: '#e9f7eb' };
    case 'approved':
      return { text: 'مقبولة', color: '#007bff', backgroundColor: '#e6f2ff' };
    case 'submitted':
      return { text: 'قيد المراجعة', color: '#ffc107', backgroundColor: '#fff8e1' };
    case 'draft':
    default:
      return { text: 'مسودة', color: '#6c757d', backgroundColor: '#f8f9fa' };
  }
};

const InvoicesScreen = () => {
  const { themeName } = useTheme();
  const styles = getStyles(themeName);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { userdoc } = usePermissions()
  const [selectedTime, setSelectedTime] = useState<string>("all");

  const sortedClearTimes = useMemo(() => {
    if (!userdoc?.lastClearTimes) return [];
    return [...userdoc.lastClearTimes].sort((a, b) => a.toMillis() - b.toMillis());
  }, [userdoc?.lastClearTimes]);

  useEffect(() => {
    if (!userdoc?.uid) return;

    setInvoicesLoading(true);
    setError(null); // Reset error on new fetch

    let invoicesQuery: FirebaseFirestoreTypes.Query = db.collection("invoices")
      .where("createdBy", "==", userdoc.uid)
      .orderBy("createdAt", "desc");

    if (selectedTime !== "all" && userdoc.lastClearTimes && userdoc.lastClearTimes.length > 0) {
      const sortedTimestamps = [...userdoc.lastClearTimes].sort((a, b) => a.toMillis() - b.toMillis());
      const selectedIndex = sortedTimestamps.findIndex(t => t.toMillis().toString() === selectedTime);

      if (selectedIndex !== -1) {
        const selectedTimestamp = sortedTimestamps[selectedIndex];

        // Fetch invoices created up to the selected clear date.
        let baseQuery = db.collection("invoices")
          .where("createdBy", "==", userdoc.uid)
          .where("createdAt", "<=", selectedTimestamp); // Use Timestamp object directly

        // If there's a previous clear date, create a range.
        if (selectedIndex > 0) {
          const previousTimestamp = sortedTimestamps[selectedIndex - 1];
          baseQuery = baseQuery.where("createdAt", ">", previousTimestamp);
        }

        // Apply final ordering
        invoicesQuery = baseQuery.orderBy("createdAt", "desc");
      }
    }

    // onSnapshot provides real-time updates
    const unsubscribe = invoicesQuery.onSnapshot(
      (snapshot) => {
        const fetchedInvoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
        setInvoices(fetchedInvoices);
        setInvoicesLoading(false);
      },
      (err) => {
        console.error("Error fetching invoices in real-time:", err);
        setError("فشل في تحديث الفواتير: " + err.message);
        setInvoicesLoading(false);
      }
    );

    // Cleanup subscription on component unmount or when dependencies change
    return () => unsubscribe();
  }, [userdoc?.uid, selectedTime, userdoc?.lastClearTimes]);


  const invoiceStats = useMemo(() => {
    return {
      count: invoices.length,
      total: invoices.reduce((acc, inv) => acc + inv.totalAmount, 0),
    };
  }, [invoices]);

  const renderInvoiceItem = ({ item }: { item: Invoice }) => {
    const status = getStatusDetails(item.status);
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => item.linkedServiceRequestId ? router.push(`/tasks/${item.linkedServiceRequestId}`) : null}>
        <View style={styles.cardTopRow}>
          <View style={styles.customerInfo}>
            <Feather name="user" size={16} color="#555" />
            <Text style={styles.customerName}>{item.customerName || 'عميل غير محدد'}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.backgroundColor }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
          </View>
        </View>

        {/* Invoice ID Display */}
        <View style={styles.invoiceIdContainer}>
          <Text style={styles.invoiceIdLabel}>رقم الفاتورة:</Text>
          <Text style={styles.invoiceIdText}>{item.id}</Text>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.detailItem}>
            <MaterialCommunityIcons name="cash" size={20} color="#16a085" />
            {/* Use formatCurrency for comma separation */}
            <Text style={styles.amountText}>{formatCurrency(item.totalAmount)} د.ع</Text>
          </View>
          <View style={styles.detailItem}>
            <Feather name="calendar" size={16} color="#888" />
            <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderContent = () => {
    if (invoicesLoading) {
      return <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 50 }} />;
    }
    if (error) {
      return <Text style={styles.infoText}>{error}</Text>;
    }
    if (invoices.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="file-document-outline" size={60} color="#ccc" />
          <Text style={styles.infoText}>لا توجد فواتير لعرضها</Text>
          <Text style={styles.infoSubText}>جرّب تغيير فلتر التاريخ أو قم بإنشاء فاتورة جديدة.</Text>
        </View>
      );
    }
    return (
      <FlatList
        data={invoices}
        renderItem={renderInvoiceItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>


      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          <TouchableOpacity
            style={[styles.filterButton, selectedTime === "all" && styles.filterButtonActive]}
            onPress={() => setSelectedTime("all")}
          >
            <Text style={[styles.filterText, selectedTime === "all" && styles.filterTextActive]}>الكل</Text>
          </TouchableOpacity>
          {[...sortedClearTimes].reverse().map((time) => (
            <TouchableOpacity
              key={time.toMillis()}
              style={[styles.filterButton, selectedTime === time.toMillis().toString() && styles.filterButtonActive]}
              onPress={() => setSelectedTime(time.toMillis().toString())}
            >
              <Text style={[styles.filterText, selectedTime === time.toMillis().toString() && styles.filterTextActive]}>
                حتى {formatDate(time.toDate())}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Summary Section */}
      {invoices.length > 0 && !invoicesLoading && (
        <View style={styles.summaryContainer}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>إجمالي الفواتير</Text>
            <Text style={styles.summaryValue}>{invoiceStats.count}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>المبلغ الإجمالي</Text>
            {/* Use formatCurrency and corrected currency symbol */}
            <Text style={styles.summaryValue}>{formatCurrency(invoiceStats.total)} د.ع</Text>
          </View>
        </View>
      )}

      {renderContent()}
    </SafeAreaView>
  );
};

const getStyles = (theme: 'light' | 'dark') => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme === 'dark' ? '#1a202c' : '#f4f6f8',
    writingDirection: 'ltr',
  },
  headerContainer: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme === 'dark' ? '#e2e8f0' : '#1a2533',
    textAlign: 'center',
  },
  backButton: {
    padding: 5,
  },
  filterContainer: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: 'row-reverse',
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: theme === 'dark' ? '#2d3748' : '#fff',
    borderRadius: 20,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: theme === 'dark' ? '#4a5568' : '#e0e0e0',
  },
  filterButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  filterText: {
    fontSize: 14,
    color: theme === 'dark' ? '#cbd5e0' : '#333',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  summaryContainer: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-around',
    padding: 15,
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: theme === 'dark' ? '#2d3748' : '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: theme === 'dark' ? 0.2 : 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  summaryBox: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: theme === 'dark' ? '#a0aec0' : '#6c757d',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme === 'dark' ? '#e2e8f0' : '#1a2533',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: theme === 'dark' ? '#2d3748' : '#ffffff',
    borderRadius: 12,
    padding: 18,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: theme === 'dark' ? 0.25 : 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTopRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  customerInfo: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  customerName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: theme === 'dark' ? '#e2e8f0' : '#2c3e50',
    marginRight: 8,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Styles for Invoice ID
  invoiceIdContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme === 'dark' ? '#4a5568' : '#f0f0f0',
  },
  invoiceIdLabel: {
    fontSize: 14,
    color: theme === 'dark' ? '#a0aec0' : '#6c757d',
    fontWeight: '600',
  },
  invoiceIdText: {
    fontSize: 14,
    color: theme === 'dark' ? '#cbd5e0' : '#333',
    marginRight: 6,
    flex: 1,
    textAlign: 'left',
  },
  cardBody: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  amountText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#16a085',
    marginRight: 8,
  },
  dateText: {
    fontSize: 14,
    color: theme === 'dark' ? '#a0aec0' : '#888',
    marginRight: 8,
  },
  infoText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 18,
    color: theme === 'dark' ? '#a0aec0' : '#6c757d',
  },
  infoSubText: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 14,
    color: theme === 'dark' ? '#718096' : '#aab5c0',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -50,
  },
});

export default InvoicesScreen;