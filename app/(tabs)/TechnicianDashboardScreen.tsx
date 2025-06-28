// screens/TechnicianDashboardScreen.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions
} from "react-native";


// NAVIGATION
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";

// FIREBASE
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  type DocumentSnapshot,
  type QueryConstraint
} from "firebase/firestore";
import { db } from "../../lib/firebase";

// ICONS
import { CheckCircle, Clock, Inbox, ListChecks, Search, TrendingDown, TrendingUp, XCircle } from "lucide-react-native";

// CONTEXT & TYPES
import { useTheme } from "../../context/ThemeContext";
import useAuth from "../../hooks/use-firebase-auth";
import { ServiceRequest } from "../../lib/types";

 
 
 // --- HELPER FUNCTIONS ---

const formatTimestamp = (date: any): string => {
  if (!date) return "N/A";
  try {
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return "تاريخ غير صالح";
  }
};

const formatDuration = (ms: number) => {
    if (!ms || ms < 0) return "0 د";
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0 && minutes > 0) {
        return `${hours}س ${minutes}د`;
    }
    if (hours > 0) {
        return `${hours}س`;
    }
    return `${minutes}د`;
};

// --- SUB-COMPONENTS ---

const StatInfoCard = ({ title, value, icon, backgroundColor, iconColor, textColor, styles }: { title: string, value: string, icon: React.ReactNode, backgroundColor: string, iconColor: string, textColor?: string, styles: any }) => {
    return (
        <View style={[styles.infoCard, { backgroundColor }]}>
            <View style={[styles.infoCardIconContainer, { backgroundColor: iconColor }]}>
                {icon}
            </View>
            <View>
                <Text style={[styles.infoCardValue, textColor ? { color: textColor } : {}]}>{value}</Text>
                <Text style={[styles.infoCardTitle, textColor ? { color: textColor, opacity: 0.8 } : {}]}>{title}</Text>
            </View>
        </View>
    );
};


const StatCard = ({ title, value, icon, color, styles }: { title: string; value: string | number; icon: React.ReactNode; color: string, styles: any }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.96, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  return (
    <TouchableOpacity onPress={animatePress} activeOpacity={0.7}>
      <Animated.View style={[styles.statCardContainer, { transform: [{ scale: scaleAnim }] }]}>
        <View style={[styles.iconContainer, { backgroundColor: color }]}>
          {icon}
        </View>
        <View style={styles.statCardContent}>
          <Text style={styles.statCardValue}>{value}</Text>
          <Text style={styles.statCardTitle}>{title}</Text>
        </View>
        <View style={[styles.cardGradientOverlay, { backgroundColor: color }]} />
      </Animated.View>
    </TouchableOpacity>
  );
};

// MODIFIED: This component now uses explicit rows for the 2x2 layout
const TechnicianStatCards = React.memo(({ tickets, styles, currentUserDocId }: { tickets: ServiceRequest[], styles: any, currentUserDocId: string | null }) => {
  const stats = useMemo(() => {
    const pending = tickets.filter(t => ["مفتوح", "قيد المعالجة"].includes(t.status)).length;
    const completed = tickets.filter(t => ["مكتمل", "مغلق"].includes(t.status)).length;
    const rejected = tickets.filter(ticket => {
        const userResponse = ticket.userResponses?.find(r => r.userId === currentUserDocId);
        return userResponse?.response === 'rejected';
    }).length;

    return { pending, completed, rejected, total: tickets.length };
  }, [tickets, currentUserDocId]);

  const iconSize = 28;

  return (
    <View style={styles.technicianStatsContainer}>
      {/* Row 1 */}
      <View style={styles.statCardRow}>
        <StatCard
          title="مهام قيد التنفيذ"
          value={stats.pending}
          icon={<Clock color="#3B82F6" size={iconSize} />}
          color="rgba(59, 130, 246, 0.1)"
          styles={styles}
        />
        <StatCard
          title="مهام مكتملة"
          value={stats.completed}
          icon={<ListChecks color="#10B981" size={iconSize} />}
          color="rgba(16, 185, 129, 0.1)"
          styles={styles}
        />
      </View>
      {/* Row 2 */}
      <View style={styles.statCardRow}>
        <StatCard
          title="المهام الفاشلة"
          value={stats.rejected}
          icon={<XCircle color="#EF4444" size={iconSize} />}
          color="rgba(239, 68, 68, 0.1)"
          styles={styles}
        />
        <StatCard
          title="إجمالي المهام"
          value={stats.total}
          icon={<Inbox color="#6B7280" size={iconSize} />}
          color="rgba(107, 114, 128, 0.1)"
          styles={styles}
        />
      </View>
    </View>
  );
});
TechnicianStatCards.displayName = 'TechnicianStatCards';


interface TicketItemProps {
  ticket: ServiceRequest;
  currentUserDocId: string | null;
  router: any;
  styles: any;
  theme: any;
}

const TicketItem: React.FC<TicketItemProps> = React.memo(({ ticket, currentUserDocId, router, styles, theme }) => {
  const userResponse = ticket.userResponses?.find((r) => r.userId === currentUserDocId);
  const hasAccepted = userResponse?.response === "accepted";
  const hasRejected = userResponse?.response === "rejected";
  const isCompleted = ticket.status === "مكتمل" || ticket.status === "مغلق";
    

  const itemAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(itemAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  const getStatusBadgeStyle = (status: string) => {
    const statusStyles: { [key: string]: object } = {
      "مفتوح": styles.badgeBlue,
      "قيد المعالجة": styles.badgeYellow,
      "مكتمل": styles.badgeGreen,
      "مغلق": styles.badgeGray,
      "معلق": styles.badgePurple
    };
    return [styles.badge, statusStyles[status] || styles.badgeGray];
  };
    const getStatusBadgeTextStyle = (status: string) => {
    const statusStyles: { [key: string]: object } = {
      "مفتوح": styles.badgeBlue,
      "قيد المعالجة": styles.textbadgeYellow,
      "مكتمل": styles.badgeGreen,
      "مغلق": styles.badgeGray,
      "معلق": styles.badgePurple
    };
    return [ statusStyles[status]];
  };

  return (
    <Animated.View
      style={[
        styles.ticketItemContainer,
        {
          opacity: itemAnim,
          transform: [{
            translateY: itemAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0],
            })
          }]
        }
      ]}
    >
      <TouchableOpacity
        onPress={() => router.push(`/tasks/${ticket.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.ticketContent}>
          <View style={styles.ticketHeader}>
            <View style={styles.ticketTitleContainer}>
              <Text style={styles.ticketTitle} numberOfLines={1}>{ticket.title}</Text>
              <View style={getStatusBadgeStyle(ticket.status)}>
                <Text style={[styles.badgeText,getStatusBadgeTextStyle(ticket.status)]}>{ticket.status}</Text>
              </View>
            </View>
                          <Text style={styles.ticketCustomer}>العميل: {ticket.customerName}</Text>
                            <Text style={styles.ticketDate}>تاريخ الإنشاء: {formatTimestamp(ticket.date)}</Text>

          </View>

         
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

TicketItem.displayName = 'TicketItem';


const PerformanceSummaryCard = ({ tasks, styles, theme }: { tasks: ServiceRequest[], styles: any, theme: any }) => {
    const performanceStats = useMemo(() => {
        const relevantTasks = tasks.filter(
            (t) =>
                (t.status === "مكتمل" || t.status === "مغلق") &&
                t.completionTimestamp &&
                t.onLocationTimestamp
        );

        if (relevantTasks.length === 0) {
            return {
                onTimePercentage: 100, latePercentage: 0, onTimeCount: 0, lateCount: 0,
                averageCompletionTime: 0, totalWorkTime: 0, averageDailyWorkTime: 0
            };
        }

        let totalCompletionTimeDuration = 0;
        const workTimeByDay: { [key: string]: number } = {};

        relevantTasks.forEach(task => {
            const onLocationTime = task.onLocationTimestamp.toDate().getTime();
            const completionTime = task.completionTimestamp.toDate().getTime();
            const duration = completionTime - onLocationTime;
            totalCompletionTimeDuration += duration;

            const dayKey = task.completionTimestamp.toDate().toISOString().split('T')[0];
            if (workTimeByDay[dayKey]) {
                workTimeByDay[dayKey] += duration;
            } else {
                workTimeByDay[dayKey] = duration;
            }
        });

        const averageCompletionTime = (totalCompletionTimeDuration / relevantTasks.length);

        const dailyWorkTimes = Object.values(workTimeByDay);
        const totalDailyWorkSum = dailyWorkTimes.reduce((sum, time) => sum + time, 0);
        const averageDailyWorkTime = dailyWorkTimes.length > 0 ? totalDailyWorkSum / dailyWorkTimes.length : 0;

        const tasksWithSla = relevantTasks.filter(t => t.estimatedTime != null);
        let lateCount = 0;
        if (tasksWithSla.length > 0) {
            tasksWithSla.forEach((task) => {
                if (task.onLocationTimestamp && task.completionTimestamp && task.estimatedTime) {
                    const onLocationTime = task.onLocationTimestamp.toDate().getTime();
                    const completionTime = task.completionTimestamp.toDate().getTime();
                    const estimatedDuration = task.estimatedTime * 60 * 1000;
                    if (completionTime > onLocationTime + estimatedDuration) {
                        lateCount++;
                    }
                }
            });
        }
        const totalSla = tasksWithSla.length;
        const onTimeCount = totalSla - lateCount;

        return {
            onTimePercentage: totalSla > 0 ? Math.round((onTimeCount / totalSla) * 100) : 100,
            latePercentage: totalSla > 0 ? Math.round((lateCount / totalSla) * 100) : 0,
            onTimeCount,
            lateCount,
            averageCompletionTime,
            totalWorkTime: totalCompletionTimeDuration,
            averageDailyWorkTime,
        };
    }, [tasks]);

    const { onTimePercentage, latePercentage, onTimeCount, lateCount, averageCompletionTime, totalWorkTime, averageDailyWorkTime } = performanceStats;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>ملخص الأداء</Text>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardsScrollView}
                decelerationRate="fast"
                snapToInterval={styles.infoCard.width + styles.cardsScrollView.gap}
                snapToAlignment="start"
            >
                <StatInfoCard
                    title="متوسط وقت الإنجاز"
                    value={formatDuration(averageCompletionTime)}
                    icon={<Clock size={20} color="#4A5568" />}
                    backgroundColor="#F7FAFC"
                    iconColor="#E2E8F0"
                    textColor="#2D3748"
                    styles={styles}
                />
                <StatInfoCard
                    title="متوسط العمل اليومي"
                    value={formatDuration(averageDailyWorkTime)}
                    icon={<Clock size={20} color="#2F4D0C" />}
                    backgroundColor="#C5F87C"
                    iconColor="#B3E06B"
                    textColor="#2F4D0C"
                    styles={styles}
                />
                <StatInfoCard
                    title="إجمالي وقت العمل"
                    value={formatDuration(totalWorkTime)}
                    icon={<Clock size={20} color="#E0E7FF" />}
                    backgroundColor="#4338CA"
                    iconColor="#5A51D1"
                    textColor="#FFFFFF"
                    styles={styles}
                />

                <View style={[styles.card, styles.onTimeCard]}>
                    <View style={styles.cardContent}>
                        <View style={styles.cardIcon}>
                        <CheckCircle size={24} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cardTitle}>في الوقت المحدد (SLA)</Text>
                        <Text style={styles.projectCount}>{onTimeCount} مهمة</Text>
                    </View>
                    <View style={styles.bottomSection}>
                        <View style={styles.progressSection}>
                        <Text style={styles.percentage}>{onTimePercentage}%</Text>
                        <View style={styles.progressBar}>
                            <View style={[styles.progressFill, { width: `${onTimePercentage}%` }]} />
                        </View>
                        </View>
                        <View style={styles.iconSection}>
                        <View style={styles.successIcon}>
                            <TrendingUp size={20} color="#10B981" />
                        </View>
                        </View>
                    </View>
                </View>

                <View style={[styles.card, styles.lateCard]}>
                    <View style={styles.cardContent}>
                        <View style={styles.cardIcon}>
                        <Clock size={24} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cardTitle}>المهام المتأخرة (SLA)</Text>
                        <Text style={styles.projectCount}>{lateCount} مهمة</Text>
                    </View>
                    <View style={styles.bottomSection}>
                        <View style={styles.progressSection}>
                        <Text style={styles.percentage}>{latePercentage}%</Text>
                        <View style={styles.progressBar}>
                            <View style={[styles.progressFill, { width: `${latePercentage}%` }]} />
                        </View>
                        </View>
                        <View style={styles.iconSection}>
                        <View style={styles.warningIcon}>
                            <TrendingDown size={20} color="#EF4444" />
                        </View>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
};


// --- MAIN PAGE COMPONENT ---

const TabButton = ({ title, isActive, onPress, styles }: { title: string, isActive: boolean, onPress: () => void, styles: any }) => (
    <TouchableOpacity onPress={onPress} style={styles.tabButton} activeOpacity={0.7}>
        <View style={[styles.tab, isActive && styles.activeTab]}>
            <Text style={[styles.tabText, isActive && styles.activeTabText]}>{title}</Text>
        </View>
    </TouchableOpacity>
);

interface ListHeaderProps {
    tasks: ServiceRequest[];
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    selectedTab: "all" | "pending" | "completed" | "rejected";
    handleTabChange: (tab: "all" | "pending" | "completed" | "rejected") => void;
    styles: any;
    currentUserDocId: string | null;
    theme: any;
}

const ListHeader = React.memo(({
    tasks,
    searchTerm,
    setSearchTerm,
    selectedTab,
    handleTabChange,
    styles,
    currentUserDocId,
    theme
}: ListHeaderProps) => (
    <View style={styles.dashboardContainer}>
        <View style={styles.welcomeHeader}>
            <Text style={styles.dashboardTitle}>الاحصائيات</Text>
            <Text style={styles.dashboardSubtitle}>مرحباً بك، تتبع مهامك وأدائك</Text>
        </View>
        <TechnicianStatCards tickets={tasks} styles={styles} currentUserDocId={currentUserDocId}/>
        <PerformanceSummaryCard tasks={tasks} styles={styles} theme={theme} />
        
        <View style={styles.taskListContainer}>
            <View style={styles.taskListHeader}>
                <View style={styles.headerTop}>
                    <View>
                        <Text style={styles.taskListTitle}>قائمة المهام</Text>
                        <Text style={styles.taskListSubtitle}>جميع المهام المسندة إليك</Text>
                    </View>
                </View>
                
                <View style={styles.searchContainer}>
                    <Search size={20} color="#9CA3AF" style={styles.searchIcon} />
                    <TextInput
                        placeholder="بحث بالاسم، العنوان، أو رقم الطلب..."
                        style={styles.searchInput}
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        placeholderTextColor="#9CA3AF"
                    />
                </View>
                
                <View style={styles.tabsContainer}>
                    <TabButton title="الكل" isActive={selectedTab === 'all'} onPress={() => handleTabChange('all')} styles={styles} />
                    <TabButton title="قيد التنفيذ" isActive={selectedTab === 'pending'} onPress={() => handleTabChange('pending')} styles={styles} />
                    <TabButton title="مكتملة" isActive={selectedTab === 'completed'} onPress={() => handleTabChange('completed')} styles={styles} />
                    <TabButton title="فاشلة" isActive={selectedTab === 'rejected'} onPress={() => handleTabChange('rejected')} styles={styles} />
                </View>
            </View>
        </View>
    </View>
));
ListHeader.displayName = 'ListHeader';


interface EmptyListProps {
    searchTerm: string;
    styles: any;
}

const EmptyList = ({ searchTerm, styles }: EmptyListProps) => (
    <View style={styles.centeredMessage}>
        <View style={styles.emptyStateContainer}>
            <Inbox size={48} color="#D1D5DB" />
            <Text style={styles.emptyStateText}>
                {searchTerm ? "لا توجد مهام تطابق الفلترة الحالية" : "ليس لديك مهام مسندة حالياً"}
            </Text>
        </View>
    </View>
);

const mapDocToServiceRequest = (docSnap: DocumentSnapshot): ServiceRequest => {
  const data = docSnap.data() as any;
  return { id: docSnap.id, ...data } as ServiceRequest;
};

function TechnicianDashboardScreen() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const styles = getStyles(theme, width);
  const [tasks, setTasks] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const [currentUserDocId, setCurrentUserDocId] = useState<string | null>(null);
  const router = useRouter();
  const isFocused = useIsFocused();

  const [selectedTab, setSelectedTab] = useState<"all" | "pending" | "completed" | "rejected">("all");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchUserDocId = useCallback(async () => {
    if (!user?.email) return null;
    const usersQuery = query(collection(db, "users"), where("email", "==", user.email));
    const usersSnapshot = await getDocs(usersQuery);
    if (usersSnapshot.empty) return null;
    return usersSnapshot.docs[0].id;
  }, [user]);

  const fetchTasks = useCallback(async (userDocId: string) => {
    try {
        const constraints: QueryConstraint[] = [
            where("assignedUsers", "array-contains", userDocId),
            orderBy("date", "desc"),
        ];
        
        const q = query(collection(db, "serviceRequests"), ...constraints);
        const snap = await getDocs(q);
      
        if (!snap.empty) {
            const newTasks = snap.docs.map(mapDocToServiceRequest);
            setTasks(newTasks);
        } else {
            setTasks([]);
        }
    } catch (error) {
        console.error("Error fetching tasks:", error);
        Alert.alert("خطأ", "لم نتمكن من تحميل المهام.");
    }
  }, []);

  const loadData = useCallback(async () => {
    if (user) {
      setLoading(true);
      const docId = await fetchUserDocId();
      if (docId) {
        setCurrentUserDocId(docId);
        await fetchTasks(docId);
      } else {
        setTasks([]);
      }
      setLoading(false);
    } else {
      setTasks([]);
      setLoading(false);
    }
  }, [user, fetchUserDocId, fetchTasks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData().finally(() => setRefreshing(false));
  }, [loadData]);

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused, loadData]);


  const handleTabChange = useCallback((tab: "all" | "pending" | "completed" | "rejected") => {
    if (tab === selectedTab) return;
    setSelectedTab(tab);
  }, [selectedTab]);


  const filteredTasks = useMemo(() => {
    let baseTickets = tasks;
    
    if (selectedTab === "pending") {
      baseTickets = tasks.filter(ticket => ["مفتوح", "قيد المعالجة"].includes(ticket.status));
    } else if (selectedTab === "completed") {
      baseTickets = tasks.filter(ticket => ["مكتمل", "مغلق"].includes(ticket.status));
    } else if (selectedTab === "rejected") {
      baseTickets = tasks.filter(ticket => {
        const userResponse = ticket.userResponses?.find(r => r.userId === currentUserDocId);
        return userResponse?.response === 'rejected';
      });
    }
  
    if (searchTerm) {
      const lowercasedSearch = searchTerm.toLowerCase();
      return baseTickets.filter(ticket =>
        ticket.title.toLowerCase().includes(lowercasedSearch) ||
        ticket.customerName.toLowerCase().includes(lowercasedSearch) ||
        ticket.id.toLowerCase().includes(lowercasedSearch)
      );
    }
  
    return baseTickets;
  }, [tasks, selectedTab, searchTerm, currentUserDocId]);

  const renderItem = useCallback(({ item }: { item: ServiceRequest }) => (
    <TicketItem
      ticket={item}
      currentUserDocId={currentUserDocId}
      router={router}
      styles={styles}
      theme={theme}
    />
  ), [currentUserDocId, router, styles, theme]);



  if (loading && tasks.length === 0) {
    return (
      <View style={styles.fullScreenLoader}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingTextScreen}>جاري التحميل...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screenContainer}>
      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
        ListHeaderComponent={<ListHeader
          tasks={tasks}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          selectedTab={selectedTab}
          handleTabChange={handleTabChange}
          styles={styles}
          currentUserDocId={currentUserDocId}
          theme={theme}
        />}
        ListEmptyComponent={loading ? null : <EmptyList searchTerm={searchTerm} styles={styles} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContentContainer}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={21}
        updateCellsBatchingPeriod={50}
      />
    </View>
  );
}

export default React.memo(TechnicianDashboardScreen);

// MODIFIED: Styles updated for a stable 2x2 grid layout
const getStyles = (theme: any, width: number) => {
  const containerPadding = 16;
  const scrollViewPadding = 20;
  const cardWidth = width - (containerPadding * 2) - (scrollViewPadding) - 24;
  
  const statCardGap = 18;
  const statCardWidth = (width - (containerPadding * 2) - statCardGap) / 2;


  return StyleSheet.create({
    screenContainer: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollContentContainer: {
      paddingBottom: 40,
    },
    dashboardContainer: {
      padding: containerPadding,
    },
    welcomeHeader: {
      marginBottom: 24,
      alignItems:  'flex-end',
    },
    dashboardTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: theme.text,
      fontFamily: 'Cairo',
      textAlign:  'right',
    },
    dashboardSubtitle: {
      fontSize: 16,
      color: theme.textSecondary,
      fontFamily: 'Cairo',
      textAlign:  'right',
      marginTop: 4,
    },
    fullScreenLoader: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.background,
    },
    loadingTextScreen: {
      marginTop: 12,
      fontSize: 16,
      color: theme.textSecondary,
      fontFamily: 'Cairo',
    },
    // --- StatCard styles MODIFIED for 2x2 grid ---
    technicianStatsContainer: {
      flexDirection: 'column', // Lays out the rows vertically
      gap: statCardGap,         // Creates vertical space between rows
      marginBottom: 24,
    },
    // New style for rows
    statCardRow: {
      flexDirection: 'row',
      justifyContent: 'space-between', // Spaces the two cards in a row
    },
    statCardContainer: {
      width: statCardWidth,
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 16,
      alignItems: 'center',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 3,
      overflow: 'hidden',
      position: 'relative',
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    statCardContent: {
      alignItems: 'center',
    },
    statCardValue: {
      fontSize: 26,
      fontWeight: 'bold',
      color: theme.text,
      fontFamily: 'Cairo',
    },
    statCardTitle: {
      fontSize: 14,
      color: theme.textSecondary,
      fontFamily: 'Cairo',
      marginTop: 2,
    },
    cardGradientOverlay: {
      position: 'absolute',
      right: -40,
      top: -20,
      width: 100,
      height: 100,
      borderRadius: 50,
      opacity: 0.08,
    },
    
    // PerformanceSummaryCard styles
    container: {
        backgroundColor: theme.card,
        borderRadius: 16,
        paddingVertical: 20,
        marginBottom: 24,
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
    },
    header: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        paddingHorizontal: 20,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.text,
        fontFamily: 'Cairo',
    },
    cardsScrollView: {
        paddingHorizontal: scrollViewPadding,
        gap: 16,
    },

    // New StatInfoCard styles
    infoCard: {
        width: cardWidth,
        borderRadius: 24,
        padding: 20,
        justifyContent: 'space-between',
        minHeight: 180,
    },
    infoCardIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    infoCardValue: {
        fontSize: 24,
        fontWeight: 'bold',
        fontFamily: 'Cairo',
        textAlign: 'right',
        color: theme.text,
    },
    infoCardTitle: {
        fontSize: 14,
        color: theme.textSecondary,
        fontFamily: 'Cairo',
        textAlign: 'right',
        marginTop: 4,
    },

    // Modified SLA card style
    card: {
        width: cardWidth,
        borderRadius: 24,
        padding: 20,
        minHeight: 180,
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    onTimeCard: {
        backgroundColor: '#10B981',
    },
    lateCard: {
        backgroundColor: '#EF4444',
    },
    cardContent: {
        marginBottom: 'auto',
    },
    cardIcon: {
        marginBottom: 12,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 4,
        fontFamily: 'Cairo',
        textAlign: 'right',
    },
    projectCount: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.8)',
        fontFamily: 'Cairo',
        textAlign: 'right',
    },
    bottomSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginTop: 16,
    },
    progressSection: {
        flex: 1,
        marginRight: 12,
    },
    percentage: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 6,
        fontFamily: 'Cairo',
    },
    progressBar: {
        height: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 2,
    },
    iconSection: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    successIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    warningIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    
    // TaskList styles
    taskListContainer: {
      backgroundColor: theme.card,
      borderRadius: 16,
      overflow: 'hidden',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    taskListHeader: {
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.card,
    },
    headerTop: {
      flexDirection: 'row-reverse',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    taskListTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.text,
      fontFamily: 'Cairo',
      textAlign: 'right',
    },
    taskListSubtitle: {
      fontSize: 14,
      color: theme.textSecondary,
      fontFamily: 'Cairo',
      textAlign: 'right',
      marginTop: 2,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.inputBackground,
      borderRadius: 12,
      paddingHorizontal: 12,
      marginBottom: 16,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      height: 50,
      fontSize: 15,
      color: theme.text,
      fontFamily: 'Cairo',
      textAlign: 'right',
    },
    tabsContainer: {
      flexDirection: 'row',
      backgroundColor: theme.inputBackground,
      borderRadius: 12,
      padding: 4,
    },
    tabButton: {
      flex: 1,
    },
    tab: {
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
    },
    activeTab: {
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.textSecondary,
      fontFamily: 'Cairo',
    },
    activeTabText: {
      color: theme.primary,
    },
    taskListContent: {
      minHeight: 200,
    },
    centeredMessage: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      minHeight: 200,
    },
    loadingText: {
      marginTop: 10,
      fontSize: 15,
      color: theme.textSecondary,
      fontFamily: 'Cairo',
    },
    emptyStateContainer: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    emptyStateText: {
      marginTop: 16,
      fontSize: 16,
      color: theme.textSecondary,
      fontFamily: 'Cairo',
      textAlign: 'center',
    },
    // TicketItem styles
    ticketItemContainer: {
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      marginBottom: 16,
      borderRadius: 12,
      marginHorizontal: 16,
    },
    ticketContent: {
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    ticketHeader: {
      marginBottom: 12,
      alignItems: 'flex-end',
    },
    ticketTitleContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      marginBottom: 8,
    },
    ticketTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.text,
      fontFamily: 'Cairo',
      flex: 1,
      textAlign: 'right',
      marginRight: 8,
    },
    ticketCustomer: {
      fontSize: 14,
      color: theme.textSecondary,
      fontFamily: 'Cairo',
      marginBottom: 4,
      textAlign:"left"
    },
    ticketDate: {
      fontSize: 12,
      color: theme.subtleText,
      fontFamily: 'Cairo',
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#FFFFFF',
      fontFamily: 'Cairo',
    },
    textbadgeYellow: {color:"black"},
    badgeBlue: { backgroundColor: '#3B82F6' },
    badgeYellow: { backgroundColor: '#F59E0B' },
    badgeGreen: { backgroundColor: '#10B981' },
    badgeRed: { backgroundColor: '#EF4444' },
    badgePurple: { backgroundColor: '#8B5CF6' },
    badgeGray: { backgroundColor: '#6B7280' },
    ticketActions: {
      marginTop: 8,
      alignItems: 'flex-end',
    },
    actionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 14,
    },
    actionBadgeIcon: {
      marginRight: 6,
    },
    actionBadgeGreen: { backgroundColor: theme.success + '20' },
    actionBadgeTextGreen: { color: theme.success, fontWeight: '600', fontFamily: 'Cairo' },
    actionBadgeRed: { backgroundColor: theme.destructive + '20' },
    actionBadgeTextRed: { color: theme.destructive, fontWeight: '600', fontFamily: 'Cairo' },
    actionBadgeBlue: { backgroundColor: theme.primary + '20' },
    actionBadgeTextBlue: { color: theme.primary, fontWeight: '600', fontFamily: 'Cairo' },
  });};