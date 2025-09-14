import { usePermissions } from '@/context/PermissionsContext';
import { useTheme } from '@/context/ThemeContext';
import { db } from '@/lib/firebase';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  let d: Date;
  
  if (date instanceof Date) {
    d = date;
  } else if (typeof date === 'string') {
    d = new Date(date);
  } else {
    // For Timestamp objects, we extract the milliseconds and create a new Date
    // This avoids using the deprecated .toDate() method
    d = new Date(date.toMillis());
  }
  
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
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => item.linkedServiceRequestId ? router.push(`/tasks/${item.linkedServiceRequestId}`) : null}
      >
        <View style={styles.cardTopRow}>
          <View style={styles.customerInfo}>
            <Feather name="user" size={16} color="#555" />
            <Text style={styles.customerName} numberOfLines={1}>{item.customerName || 'عميل غير محدد'}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.backgroundColor }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
          </View>
        </View>

        {/* Invoice ID Display */}
        <View style={styles.invoiceIdContainer}>
          <Text style={styles.invoiceIdLabel}>رقم الفاتورة:</Text>
          <Text style={styles.invoiceIdText} numberOfLines={1}>{item.id}</Text>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.detailItem}>
            <MaterialCommunityIcons name="cash" size={20} color="#16a085" />
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
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>جاري تحميل الفواتير...</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons name="alert-circle-outline" size={50} color="#ff6b6b" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => window.location.reload()}>
            <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (invoices.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="file-document-outline" size={80} color="#ccc" />
          <Text style={styles.infoText}>لا توجد فواتير لعرضها</Text>
          <Text style={styles.infoSubText}>جرّب تغيير فلتر التاريخ أو قم بإنشاء فاتورة جديدة.</Text>
        </View>
      );
    }

    return (
      <View style={styles.listContainer}>
        {invoices.map((invoice) => (
          <View key={invoice.id} style={styles.invoiceItemWrapper}>
            {renderInvoiceItem({ item: invoice })}
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.filterSection}>
          <Text style={styles.sectionTitle}>تصفية حسب التاريخ</Text>
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
            {sortedClearTimes.map((time) => (
              <TouchableOpacity
                key={time.toMillis()}
                style={[styles.filterButton, selectedTime === time.toMillis().toString() && styles.filterButtonActive]}
                onPress={() => setSelectedTime(time.toMillis().toString())}
              >
                <Text style={[styles.filterText, selectedTime === time.toMillis().toString() && styles.filterTextActive]}>
                  حتى {formatDate(time)}
                </Text>
              </TouchableOpacity>
            )).reverse()}
          </ScrollView>
        </View>

        {/* Summary Section */}
        {invoices.length > 0 && !invoicesLoading && (
          <View style={styles.summarySection}>
            <Text style={styles.sectionTitle}>ملخص الفواتير</Text>
            <View style={styles.summaryContainer}>
              <View style={styles.summaryBox}>
                <MaterialCommunityIcons name="file-document-multiple" size={24} color={themeName === 'dark' ? '#a0aec0' : '#6c757d'} />
                <Text style={styles.summaryLabel}>إجمالي الفواتير</Text>
                <Text style={styles.summaryValue}>{invoiceStats.count}</Text>
              </View>
              <View style={styles.summaryBox}>
                <MaterialCommunityIcons name="cash-multiple" size={24} color="#16a085" />
                <Text style={styles.summaryLabel}>المبلغ الإجمالي</Text>
                <Text style={styles.summaryValue}>{formatCurrency(invoiceStats.total)} د.ع</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.contentSection}>
          <Text style={styles.sectionTitle}>قائمة الفواتير</Text>
          {renderContent()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const getStyles = (theme: 'light' | 'dark') => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme === 'dark' ? '#1a202c' : '#f4f6f8',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme === 'dark' ? '#2d3748' : '#e2e8f0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme === 'dark' ? '#e2e8f0' : '#1a2533',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme === 'dark' ? '#e2e8f0' : '#1a2533',
    marginBottom: 15,
    textAlign: 'right'
  },
  filterSection: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    alignItems: 'flex-end',
  },
  filterContainer: {
    flexDirection: 'row-reverse',
  },
  filterButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: theme === 'dark' ? '#2d3748' : '#fff',
    borderRadius: 25,
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
  summarySection: {
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  summaryContainer: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-around',
    padding: 20,
    backgroundColor: theme === 'dark' ? '#2d3748' : '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: theme === 'dark' ? 0.25 : 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryBox: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: theme === 'dark' ? '#a0aec0' : '#6c757d',
    marginTop: 8,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme === 'dark' ? '#e2e8f0' : '#1a2533',
    marginTop: 4,
  },
  contentSection: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  listContainer: {
    paddingBottom: 20,
  },
  invoiceItemWrapper: {
    marginBottom: 15,
  },
  card: {
    backgroundColor: theme === 'dark' ? '#2d3748' : '#ffffff',
    borderRadius: 16,
    padding: 20,
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
    marginBottom: 15,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme === 'dark' ? '#e2e8f0' : '#2c3e50',
    marginRight: 10,
    flex: 1,
    textAlign: 'right',
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  invoiceIdContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: theme === 'dark' ? '#4a5568' : '#f0f0f0',
  },
  invoiceIdLabel: {
    fontSize: 15,
    color: theme === 'dark' ? '#a0aec0' : '#6c757d',
    fontWeight: '600',
    marginRight: 10,
  },
  invoiceIdText: {
    fontSize: 15,
    color: theme === 'dark' ? '#cbd5e0' : '#333',
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#16a085',
    marginRight: 10,
  },
  dateText: {
    fontSize: 15,
    color: theme === 'dark' ? '#a0aec0' : '#888',
    marginRight: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: theme === 'dark' ? '#a0aec0' : '#6c757d',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  errorText: {
    textAlign: 'center',
    marginTop: 15,
    fontSize: 16,
    color: theme === 'dark' ? '#a0aec0' : '#6c757d',
  },
  retryButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 30,
    backgroundColor: '#007bff',
    borderRadius: 25,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 18,
    color: theme === 'dark' ? '#a0aec0' : '#6c757d',
  },
  infoSubText: {
    textAlign: 'center',
    marginTop: 10,
    fontSize: 15,
    color: theme === 'dark' ? '#718096' : '#aab5c0',
    lineHeight: 22,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
});

export default InvoicesScreen;