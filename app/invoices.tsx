import { Ionicons } from "@expo/vector-icons";
import firestore, { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { usePermissions } from "@/context/PermissionsContext";
import { useTheme } from "@/context/ThemeContext";

type InvoiceStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "paid"
  | "pending"
  | "cancelled"
  | "rejected";

interface InvoiceItem {
  name: string;
  price: number;
  quantity: number;
}

interface Invoice {
  id: string;
  linkedServiceRequestId?: string | null;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | Date | string | null;
  lastUpdated?: FirebaseFirestoreTypes.Timestamp | Date | string | null;
  items: InvoiceItem[];
  totalAmount: number;
  status: InvoiceStatus;
  notes?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  creatorName?: string;
  type?: string;
  statusLastChangedBy?: string;
  statusLastChangedAt?: FirebaseFirestoreTypes.Timestamp | Date | string | null;
  teamId?: string | null;
  teamCreatorId?: string | null;
  isSubscriptionInvoice?: boolean;
  parentInvoiceName?: string | null;
  subscriberId?: string | null;
}

interface DisplayInvoice extends Invoice {
  createdAtDate: Date | null;
  lastUpdatedDate: Date | null;
  statusLastChangedAtDate: Date | null;
}

const formatCurrency = (value?: number): string => {
  if (value == null || Number.isNaN(value)) {
    return `IQD`;
  }

  try {
    return `${value.toLocaleString("en-GB", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} IQD`;
  } catch {
    return `${value.toLocaleString()} IQD`;
  }
};

const convertToDate = (
  value: FirebaseFirestoreTypes.Timestamp | Date | string | number | null | undefined
): Date | null => {
  if (!value) return null;

  if (typeof (value as FirebaseFirestoreTypes.Timestamp).toDate === "function") {
    try {
      return (value as FirebaseFirestoreTypes.Timestamp).toDate();
    } catch {
      return null;
    }
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

const formatDateTime = (date: Date | null): string => {
  if (!date) return "—";

  try {
    return date.toLocaleString("en-GB", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return date.toLocaleString("en-GB");
  }
};


const itemsSummary = (items: InvoiceItem[] | undefined): string => {
  if (!items?.length) return "لا توجد عناصر";

  const [first, ...rest] = items;
  if (!first?.name) {
    return `${items.length} عنصر`;
  }

  return rest.length
    ? `${first.name} + ${rest.length} عنصر`
    : first.name;
};

const statusDisplay = (
  status: InvoiceStatus,
  themeColors: ReturnType<typeof useTheme>["theme"]
) => {
  const map: Record<InvoiceStatus, { label: string; background: string; text: string }> = {
    draft: {
      label: "مسودة",
      background: themeColors.lightGray,
      text: themeColors.text,
    },
    submitted: {
      label: "مقدمة",
      background: themeColors.blueTint,
      text: themeColors.primary,
    },
    approved: {
      label: "معتمدة",
      background: themeColors.primary,
      text: themeColors.white,
    },
    paid: {
      label: "مدفوعة",
      background: themeColors.success,
      text: themeColors.white,
    },
    pending: {
      label: "قيد الانتظار",
      background: themeColors.lightGray,
      text: themeColors.text,
    },
    cancelled: {
      label: "ملغاة",
      background: themeColors.redTint,
      text: themeColors.destructive,
    },
    rejected: {
      label: "مرفوضة",
      background: themeColors.redTint,
      text: themeColors.destructive,
    },
  };

  return map[status] ?? {
    label: status,
    background: themeColors.card,
    text: themeColors.text,
  };
};

export default function InvoicesPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const { userdoc, loading: permissionsLoading, realuserUid } = usePermissions();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<DisplayInvoice[]>([]);
  const [currentPeriodTotals, setCurrentPeriodTotals] = useState({ total: 0, count: 0 });
  useEffect(() => {
    if (permissionsLoading) {
      return;
    }

    if (!userdoc?.uid) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = firestore()
      .collection("invoices")
      .where("createdBy", "==", userdoc.uid)
      .where("status", "in", ["draft", "pending"])
      .orderBy("createdAt", "desc")
      .onSnapshot(
        (snapshot) => {
          const parsed = snapshot.docs.map((doc) => {
            const data = doc.data() as Invoice;
            const createdAtDate = convertToDate(data.createdAt);
            const lastUpdatedDate = convertToDate(data.lastUpdated ?? null);
            const statusLastChangedAtDate = convertToDate(
              data.statusLastChangedAt ?? null
            );

            const items: InvoiceItem[] = Array.isArray(data.items)
              ? data.items.map((item) => ({
                name: (item as any)?.name ?? (item as any)?.description ?? "عنصر",
                price: Number((item as any)?.price ?? (item as any)?.unitPrice ?? 0),
                quantity: Number((item as any)?.quantity ?? 1),
              }))
              : [];

            const totalAmount = Number(data.totalAmount ?? 0);
            return {
              ...data,
              id: doc.id,
              items,
              totalAmount,
              createdAtDate,
              lastUpdatedDate,
              statusLastChangedAtDate,
            } as DisplayInvoice;
          });

          setInvoices(parsed);
          setLoading(false);
        },
        (err) => {
          console.error("Failed to subscribe to invoices:", err);
          setError("تعذّر تحميل الفواتير. يرجى المحاولة لاحقًا.");
          setLoading(false);
        }
      );

    return () => unsubscribe();
  }, [permissionsLoading, userdoc?.uid]);

  useEffect(() => {
    if (!realuserUid) {
      setCurrentPeriodTotals({ total: 0, count: 0 });
      return;
    }

    const queryRef = firestore()
      .collection("invoices")
      .where("createdBy", "==", realuserUid)
      .where("status", "in", ["draft", "pending"]);

    const unsubscribe = queryRef.onSnapshot(
      (snapshot) => {
        let total = 0;
        snapshot.forEach((doc) => {
          const data = doc.data() as Invoice;
          const amount = Number(data.totalAmount ?? 0);
          if (!Number.isNaN(amount)) {
            total += amount;
          }
        });
        setCurrentPeriodTotals({ total, count: snapshot.size });
      },
      (error) => {
        console.error("Failed to subscribe to current period invoices:", error);
      }
    );

    return () => unsubscribe();
  }, [realuserUid]);

  const summary = useMemo(() => {
    const totalInvoices = invoices.length;
    const totalAmount = invoices.reduce(
      (sum, invoice) => sum + (invoice.totalAmount ?? 0),
      0
    );
    const pendingCount = invoices.filter((invoice) => invoice.status === "pending").length;
    const draftCount = invoices.filter((invoice) => invoice.status === "draft").length;
    const pendingAmount = invoices.reduce((sum, invoice) => {
      return invoice.status === "pending" ? sum + (invoice.totalAmount ?? 0) : sum;
    }, 0);
    const draftAmount = invoices.reduce((sum, invoice) => {
      return invoice.status === "draft" ? sum + (invoice.totalAmount ?? 0) : sum;
    }, 0);

    return {
      totalInvoices,
      totalAmount,
      pendingCount,
      draftCount,
      pendingAmount,
      draftAmount,
    };
  }, [invoices]);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: theme.background },
        scrollContent: { paddingBottom: 32 },
        container: {
          paddingHorizontal: 18,
          paddingTop: 24,
          direction: "rtl" as const,
        },
        header: { marginBottom: 20 },
        title: {
          fontSize: 26,
          fontWeight: "700",
          color: theme.text,
          textAlign: "left" as const,
        },
        subtitle: {
          fontSize: 14,
          color: theme.textSecondary,
          textAlign: "left" as const,
          marginTop: 6,
        },
        statsGrid: {
          flexDirection: "row" as const,
          flexWrap: "wrap" as const,
          justifyContent: "space-between" as const,
          gap: 14,
          marginBottom: 24,
        },
        statCard: {
          flexBasis: "48%",
          backgroundColor: theme.card,
          borderRadius: 18,
          padding: 16,
          borderWidth: 1,
          borderColor: theme.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 6,
          elevation: 3,
        },
        statLabel: {
          fontSize: 14,
          color: theme.textSecondary,
          textAlign: "left" as const,
        },
        statValue: {
          fontSize: 22,
          fontWeight: "700",
          color: theme.text,
          textAlign: "left" as const,
          marginTop: 6,
        },
        statHelper: {
          fontSize: 12,
          color: theme.textSecondary,
          textAlign: "left" as const,
          marginTop: 4,
        },
        sectionTitle: {
          fontSize: 18,
          fontWeight: "700",
          color: theme.text,
          textAlign: "left" as const,
          marginBottom: 16,
        },
        emptyState: {
          alignItems: "center" as const,
          paddingVertical: 48,
          gap: 12,
        },
        emptyText: {
          fontSize: 16,
          color: theme.textSecondary,
          textAlign: "center" as const,
        },
        errorText: {
          fontSize: 16,
          color: theme.destructive,
          textAlign: "center" as const,
          marginBottom: 16,
        },
        invoiceCard: {
          backgroundColor: theme.card,
          borderRadius: 18,
          padding: 18,
          marginBottom: 14,
          borderWidth: 1,
          borderColor: theme.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 6,
          elevation: 3,
        },
        invoiceHeader: {
          flexDirection: "row" as const,
          justifyContent: "space-between" as const,
          alignItems: "center" as const,
          marginBottom: 12,
        },
        invoiceTitle: {
          fontSize: 16,
          fontWeight: "700",
          color: theme.text,
          textAlign: "left" as const,
        },
        invoiceCustomer: {
          fontSize: 14,
          color: theme.textSecondary,
          textAlign: "left" as const,
        },
        badge: {
          paddingVertical: 6,
          paddingHorizontal: 14,
          borderRadius: 20,
          alignSelf: "flex-start" as const,
        },
        badgeText: {
          fontSize: 13,
          fontWeight: "600",
        },
        invoiceAmount: {
          fontSize: 22,
          fontWeight: "700",
          color: theme.text,
          textAlign: "left" as const,
          marginBottom: 10,
          flexShrink: 1,
        },
        invoiceMetaRow: {
          flexDirection: "row-reverse" as const,
          alignItems: "center" as const,
          gap: 6,
          marginBottom: 6,
        },
        metaText: {
          fontSize: 13,
          color: theme.textSecondary,
        },
        itemsText: {
          fontSize: 14,
          color: theme.text,
          textAlign: "left" as const,
          marginTop: 4,
        },
        notesText: {
          fontSize: 13,
          color: theme.textSecondary,
          textAlign: "left" as const,
          marginTop: 6,
        },
        divider: {
          height: 1,
          backgroundColor: theme.border,
          marginVertical: 12,
        },
        detailsButton: {
          flexDirection: "row-reverse" as const,
          alignItems: "center" as const,
          gap: 6,
        },
        detailsText: {
          fontSize: 14,
          fontWeight: "600",
          color: theme.primary,
        },
        loadingWrapper: {
          paddingVertical: 60,
          alignItems: "center" as const,
          gap: 12,
        },
      }),
    [theme]
  );

  const renderInvoiceCard = (invoice: DisplayInvoice) => {
    const statusStyles = statusDisplay(invoice.status, theme);

    return (
      <View key={invoice.id} style={styles.invoiceCard}>
        <View style={styles.invoiceHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.invoiceTitle}>{invoice.customerName ?? "فاتورة بدون اسم"}</Text>
            <Text style={styles.invoiceCustomer}>
              {invoice.creatorName ? `أنشأها: ${invoice.creatorName}` : `رقم: ${invoice.id}`}
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              { backgroundColor: statusStyles.background },
            ]}
          >
            <Text style={[styles.badgeText, { color: statusStyles.text }]}>
              {statusStyles.label}
            </Text>
          </View>
        </View>

        <Text style={styles.invoiceAmount} numberOfLines={1} ellipsizeMode="tail">
          {formatCurrency(invoice.totalAmount)}
        </Text>

        <View style={styles.invoiceMetaRow}>
          <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
          <Text style={styles.metaText}>{formatDateTime(invoice.createdAtDate)}</Text>
        </View>

        {invoice.customerPhone ? (
          <View style={styles.invoiceMetaRow}>
            <Ionicons name="call-outline" size={16} color={theme.textSecondary} />
            <Text style={styles.metaText}>{invoice.customerPhone}</Text>
          </View>
        ) : null}

        {invoice.customerEmail ? (
          <View style={styles.invoiceMetaRow}>
            <Ionicons name="mail-outline" size={16} color={theme.textSecondary} />
            <Text style={styles.metaText}>{invoice.customerEmail}</Text>
          </View>
        ) : null}

        <Text style={styles.itemsText}>{itemsSummary(invoice.items)}</Text>

        {invoice.notes ? (
          <Text style={styles.notesText}>{invoice.notes}</Text>
        ) : null}

        <View style={styles.divider} />

        <TouchableOpacity
          onPress={() => {
            if (invoice.linkedServiceRequestId) {
              router.push(`/tasks/${invoice.linkedServiceRequestId}`);
            } else {
              router.push(`/invoices/${invoice.id}`);
            }
          }}
          style={styles.detailsButton}
        >
          <Ionicons name="open-outline" size={18} color={theme.primary} />
          <Text style={styles.detailsText}>عرض التفاصيل</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>فواتيري</Text>
            <Text style={styles.subtitle}>
              يعرض هذا القسم الفواتير التي قمت بإنشائها وما زالت في حالة مسودة أو قيد الانتظار.
            </Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>إجمالي الفواتير</Text>
              <Text style={styles.statValue}>{summary.totalInvoices}</Text>
              <Text style={styles.statHelper}>مسودة + قيد الانتظار</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>فواتير الفترة الحالية</Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={styles.statValue}>
                {formatCurrency(currentPeriodTotals.total)}
              </Text>
              <Text style={styles.statHelper}>
                عدد الفواتير: {currentPeriodTotals.count}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>فواتير قيد الانتظار</Text>
              <Text style={styles.statValue}>{summary.pendingCount}</Text>
              <Text style={styles.statHelper}>
                قيمة إجمالية: {formatCurrency(summary.pendingAmount)}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>فواتير مسودة</Text>
              <Text style={styles.statValue}>{summary.draftCount}</Text>
              <Text style={styles.statHelper}>
                قيمة إجمالية: {formatCurrency(summary.draftAmount)}
              </Text>
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {loading ? (
            <View style={styles.loadingWrapper}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={styles.metaText}>جاري تحميل الفواتير...</Text>
            </View>
          ) : invoices.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={42} color={theme.textSecondary} />
              <Text style={styles.emptyText}>لا توجد فواتير في حالة مسودة أو قيد الانتظار.</Text>
            </View>
          ) : (
            <View>
              <Text style={styles.sectionTitle}>قائمة الفواتير</Text>
              {invoices.map(renderInvoiceCard)}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
