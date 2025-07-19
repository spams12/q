import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

// --- Interfaces ---
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  lastLogin: any;
  status: string;
  teamId?: string;
  photoURL?: string;
  createdAt?: any;
  phone?: string;
  stockItems?: any[];
  lastClearTimes: any[];
  uid: string;
  expoPushTokens: any[];
}

interface DateRange {
  start: Date | null;
  end: Date | null;
}

interface FilterDialogProps {
  isVisible: boolean;
  onClose: () => void;
  selectedPriority: string | null;
  setSelectedPriority: (priority: string | null) => void;
  availablePriorities: string[];
  selectedType: string | null;
  setSelectedType: (type: string | null) => void;
  availableTypes: string[]; // This will be ignored in favor of hardcoded types
  selectedStatus: string | null;
  setSelectedStatus: (status: string | null) => void;
  availableStatuses: string[];
  selectedCreator: string | null;
  setSelectedCreator: (creatorId: string | null) => void;
  selectedAssignedUsers: string[];
  setSelectedAssignedUsers: (userIds: string[]) => void;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  users: User[];
  clearFilters: () => void;
  showStatus?: boolean;
  context?: 'tasks' | 'tickets'; // MODIFICATION: Added context prop
}

// --- Hardcoded Data ---
const HARDCODED_TYPES = [
  "صيانة رئيسية",
  "تنصيب مشترك",
  "صيانة مشترك",
  "تغيير زون المشترك",
  "مشكلة في التفعيل",
  "جباية",
  "شكوى",
  "مشكلة",
  "طلب",
  "استفسار",
  "اقتراح",
];

const PREDEFINED_DATES = [
  { label: 'آخر يوم', value: 'day' },
  { label: 'آخر أسبوع', value: 'week' },
  { label: 'آخر شهر', value: 'month' },
  { label: 'آخر 6 أشهر', value: '6months' },
  { label: 'آخر سنة', value: 'year' },
];


// --- Component ---
const FilterDialog: React.FC<FilterDialogProps> = ({
  isVisible,
  onClose,
  selectedPriority,
  setSelectedPriority,
  availablePriorities = [],
  selectedType,
  setSelectedType,
  // availableTypes is ignored
  selectedStatus,
  setSelectedStatus,
  availableStatuses = [],
  selectedCreator,
  setSelectedCreator,
  selectedAssignedUsers,
  setSelectedAssignedUsers,
  dateRange,
  setDateRange,
  users = [],
  clearFilters,
  showStatus = true,
  context = 'tickets', // MODIFICATION: Added default value for context
}) => {
  const { theme } = useTheme();
  const translateY = useSharedValue(Dimensions.get('window').height);

  const [currentView, setCurrentView] = useState<'main' | 'creator' | 'assigned'>('main');
  const [searchQuery, setSearchQuery] = useState('');

  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    priority: true,
    type: true,
    status: true,
    users: true,
    date: false,
  });

  // Animation for the dialog
  useEffect(() => {
    if (isVisible) {
      translateY.value = withTiming(0, { duration: 350 });
    } else {
      translateY.value = withTiming(Dimensions.get('window').height, { duration: 350 });
      setTimeout(() => setCurrentView('main'), 350);
    }
  }, [isVisible, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleBack = () => {
    setCurrentView('main');
    setSearchQuery('');
  };

  /**
   * This function logs all currently selected filters to the console
   * and then calls the original `onClose` function passed in props.
   */
  const handleCloseAndLog = () => {
    console.log("--- Applied Filters ---");
    console.log("Priority:", selectedPriority || "None");
    if (context !== 'tasks') {
      console.log("Type:", selectedType || "None");
    }
    if (showStatus) {
      console.log("Status:", selectedStatus || "None");
    }
    console.log("Creator UID:", selectedCreator || "None");
    if (context !== 'tasks') {
      console.log("Assigned User IDs:", selectedAssignedUsers);
    }
    console.log("Date Range:", {
      start: dateRange.start ? dateRange.start.toISOString() : null,
      end: dateRange.end ? dateRange.end.toISOString() : null,
    });
    console.log("-----------------------");

    // Call the original function to close the dialog
    onClose();
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleAssignedUser = (userId: string) => {
    const newSelection = selectedAssignedUsers.includes(userId)
      ? selectedAssignedUsers.filter(id => id !== userId)
      : [...selectedAssignedUsers, userId];
    setSelectedAssignedUsers(newSelection);
  };

  const handleSelectCreator = (userUid: string | null) => {
    setSelectedCreator(selectedCreator === userUid ? null : userUid);
    handleBack();
  };

  const handlePredefinedDateSelect = (period: string) => {
    const end = new Date();
    const start = new Date();
    end.setHours(23, 59, 59, 999); // Set end to end of today
    start.setHours(0, 0, 0, 0); // Set start to beginning of the day

    switch (period) {
      case 'day':
        start.setDate(end.getDate() - 1);
        break;
      case 'week':
        start.setDate(end.getDate() - 7);
        break;
      case 'month':
        start.setMonth(end.getMonth() - 1);
        break;
      case '6months':
        start.setMonth(end.getMonth() - 6);
        break;
      case 'year':
        start.setFullYear(end.getFullYear() - 1);
        break;
      default:
        return;
    }
    setDateRange({ start, end });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high': case 'عالية': return '#FF4444';
      case 'medium': case 'متوسطة': return '#FF9500';
      case 'low': case 'منخفضة': return '#34C759';
      default: return theme.primary;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'open': case 'جديدة': return '#007AFF';
      case 'in-progress': case 'قيد التنفيذ': return '#FF9500';
      case 'resolved': case 'تم حلها': return '#34C759';
      case 'closed': case 'مغلقة': return '#8E8E93';
      default: return theme.primary;
    }
  };

  const renderCollapsibleSection = (
    title: string,
    sectionKey: string,
    children: React.ReactNode,
    hasActiveFilter: boolean,
    icon?: string
  ) => (
    <View style={[styles.sectionContainer, {
      backgroundColor: theme.background,
      borderColor: hasActiveFilter ? theme.primary + '40' : theme.border,
      borderWidth: hasActiveFilter ? 2 : 1
    }]}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => toggleSection(sectionKey)}
        activeOpacity={0.7}
      >
        <View style={styles.sectionHeaderContent}>
          {icon && (
            <View style={[styles.sectionIcon, { backgroundColor: theme.primary + '15' }]}>
              <Ionicons name={icon as any} size={20} color={theme.primary} />
            </View>
          )}
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
          {hasActiveFilter && (
            <View style={[styles.activeCount, { backgroundColor: theme.primary }]}>
              <Text style={styles.activeCountText}>•</Text>
            </View>
          )}
        </View>
        <View style={[styles.chevronContainer, {
          backgroundColor: expandedSections[sectionKey] ? theme.primary + '15' : 'transparent',
          transform: [{ rotate: expandedSections[sectionKey] ? '180deg' : '0deg' }]
        }]}>
          <Ionicons
            name="chevron-down"
            size={20}
            color={expandedSections[sectionKey] ? theme.primary : theme.text80}
          />
        </View>
      </TouchableOpacity>

      {expandedSections[sectionKey] && (
        <Animated.View style={styles.sectionContent}>
          {children}
        </Animated.View>
      )}
    </View>
  );

  const renderFilterChips = (items: string[], selectedItem: string | null, onSelect: (item: string | null) => void, getColor?: (item: string) => string) => (
    <View style={styles.chipsContainer}>
      {items.map(item => {
        const isSelected = selectedItem === item;
        const chipColor = getColor ? getColor(item) : theme.primary;

        return (
          <TouchableOpacity
            key={item}
            style={[
              styles.modernChip,
              {
                backgroundColor: isSelected ? chipColor + '15' : theme.background,
                borderColor: isSelected ? chipColor : theme.border,
                borderWidth: isSelected ? 2 : 1,
              }
            ]}
            onPress={() => onSelect(selectedItem === item ? null : item)}
            activeOpacity={0.8}
          >
            <Text style={[
              styles.chipText,
              {
                color: isSelected ? chipColor : theme.text,
                fontWeight: isSelected ? '600' : '500'
              }
            ]}>
              {item}
            </Text>
            {isSelected && (
              <View style={[styles.chipIndicator, { backgroundColor: chipColor }]} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderUserNavigationItem = (title: string, destination: 'creator' | 'assigned', icon: string) => {
    const getSelectionText = () => {
      if (destination === 'creator' && selectedCreator) {
        // MODIFICATION: Use item.uid to find the creator's name
        return users.find(u => u.uid === selectedCreator)?.name || 'تم اختيار 1';
      }
      if (destination === 'assigned' && selectedAssignedUsers.length > 0) {
        return `تم اختيار ${selectedAssignedUsers.length}`;
      }
      return 'لم يتم الاختيار';
    };

    const hasActiveFilter = (destination === 'creator' && !!selectedCreator) ||
      (destination === 'assigned' && selectedAssignedUsers.length > 0);

    return (
      <TouchableOpacity
        style={[styles.userNavItem, {
          backgroundColor: hasActiveFilter ? theme.primary + '8' : theme.background,
          borderColor: hasActiveFilter ? theme.primary + '40' : theme.border
        }]}
        onPress={() => setCurrentView(destination)}
        activeOpacity={0.7}
      >
        <View style={styles.userNavLeft}>
          <View style={[styles.sectionIcon, { backgroundColor: theme.primary + '15' }]}>
            <Ionicons name={icon as any} size={20} color={theme.primary} />
          </View>
          <View>
            <Text style={[styles.userNavTitle, { color: theme.text }]}>{title}</Text>
            <Text style={[styles.userNavSubtitle, { color: theme.text80 }]}>
              {getSelectionText()}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-back" size={20} color={theme.text80} />
      </TouchableOpacity>
    );
  };

  const renderMainView = () => (
    <>
      <View style={[styles.filterHeader, { borderBottomColor: theme.border }]}>
        <View style={styles.headerStart}>
          <TouchableOpacity onPress={handleCloseAndLog} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.headerCenter}>
          <Text style={[styles.filterTitle, { color: theme.text }]}>الفلاتر</Text>
        </View>

        <View style={styles.headerEnd}>
          <TouchableOpacity onPress={clearFilters} style={styles.resetButton}>
            <Text style={[styles.resetButtonText, { color: theme.primary }]}>إعادة تعيين</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {renderCollapsibleSection(
          "الأهمية",
          "priority",
          renderFilterChips(availablePriorities, selectedPriority, setSelectedPriority, getPriorityColor),
          !!selectedPriority,
          "flag"
        )}

        {renderCollapsibleSection(
          "النوع",
          "type",
          renderFilterChips(HARDCODED_TYPES, selectedType, setSelectedType),
          !!selectedType,
          "list"
        )}

        {context !== 'tasks' && showStatus && renderCollapsibleSection(
          "الحالة",
          "status",
          renderFilterChips(availableStatuses, selectedStatus, setSelectedStatus, getStatusColor),
          !!selectedStatus,
          "checkmark-circle"
        )}

        {renderCollapsibleSection(
          "المستخدمون",
          "users",
          <View style={styles.userNavigationContainer}>
            {renderUserNavigationItem("المنشئ", "creator", "person")}
            {/* MODIFICATION: Conditionally render Assigned Users based on context */}
            {context !== 'tasks' && renderUserNavigationItem("المستخدمون المعينون", "assigned", "people")}
          </View>,
          !!(selectedCreator || selectedAssignedUsers.length > 0),
          "people"
        )}

        {renderCollapsibleSection(
          "النطاق الزمني",
          "date",
          <View style={styles.dateContainer}>
            <View style={styles.chipsContainer}>
              {PREDEFINED_DATES.map(({ label, value }) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.modernChip, { backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }]}
                  onPress={() => handlePredefinedDateSelect(value)}
                >
                  <Text style={[styles.chipText, { color: theme.text }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.separator} />
            {(dateRange.start || dateRange.end) ? (
              <View style={[styles.dateRangeDisplay, {
                backgroundColor: theme.primary + '10',
                borderColor: theme.primary + '30'
              }]}>
                <View style={styles.dateInfo}>
                  <Text style={[styles.dateLabel, { color: theme.text80 }]}>النطاق المحدد</Text>
                  <Text style={[styles.dateRangeText, { color: theme.text }]}>
                    {dateRange.start?.toLocaleDateString('ar-EG') || '...'} - {dateRange.end?.toLocaleDateString('ar-EG') || '...'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setDateRange({ start: null, end: null })}
                  style={styles.clearDateButton}
                >
                  <Ionicons name="close-circle" size={22} color={theme.primary} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.emptyDateContainer, { borderColor: theme.border }]}>
                <Ionicons name="calendar" size={24} color={theme.text80} />
                <Text style={[styles.emptyDateText, { color: theme.text80 }]}>
                  لم يتم تحديد نطاق زمني
                </Text>
              </View>
            )}
          </View>,
          !!(dateRange.start || dateRange.end),
          "calendar"
        )}
      </ScrollView>
    </>
  );

  const renderUserSelectionView = () => {
    const isCreatorView = currentView === 'creator';
    const filteredUsers = users.filter(user =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <>
        <View style={[styles.filterHeader, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-forward" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.filterTitle, { color: theme.text }]}>
            {isCreatorView ? 'اختر المنشئ' : 'اختر المستخدمين المعينين'}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={[styles.searchContainer, {
          backgroundColor: theme.background,
          borderColor: theme.border
        }]}>
          <Ionicons name="search" size={20} color={theme.text80} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="ابحث عن المستخدمين..."
            placeholderTextColor={theme.text80}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <FlatList
          data={filteredUsers}
          keyExtractor={item => item.id} // Using item.id for the key is fine
          renderItem={({ item }) => {
            // MODIFICATION: Use item.uid for creator, item.id for assigned users
            const isSelected = isCreatorView
              ? selectedCreator === item.uid
              : selectedAssignedUsers.includes(item.id);

            return (
              <TouchableOpacity
                style={[styles.userItem, {
                  backgroundColor: isSelected ? theme.primary + '10' : theme.background,
                  borderColor: isSelected ? theme.primary + '40' : theme.border
                }]}
                onPress={() => {
                  // MODIFICATION: Pass item.uid for creator, item.id for assigned users
                  isCreatorView ? handleSelectCreator(item.uid) : toggleAssignedUser(item.id);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.userInfo}>
                  <View style={[styles.userAvatar, { backgroundColor: theme.primary }]}>
                    <Text style={styles.userAvatarText}>
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.userDetails}>
                    <Text style={[styles.userName, { color: theme.text }]}>{item.name}</Text>
                    <Text style={[styles.userRole, { color: theme.text80 }]}>{item.role}</Text>
                  </View>
                </View>
                {isSelected && (
                  <View style={[styles.checkIcon, { backgroundColor: theme.primary }]}>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyListContainer}>
              <Ionicons name="person-outline" size={48} color={theme.text80} />
              <Text style={[styles.emptyListText, { color: theme.text80 }]}>
                لم يتم العثور على مستخدمين
              </Text>
            </View>
          }
          style={styles.usersListContainer}
          showsVerticalScrollIndicator={false}
        />
      </>
    );
  };

  if (!isVisible) return null;

  return (
    <>
      <Pressable style={styles.backdrop} onPress={handleCloseAndLog} />
      <Animated.View style={[styles.filterPopup, { backgroundColor: theme.background }, animatedStyle]}>
        {currentView === 'main' ? renderMainView() : renderUserSelectionView()}
      </Animated.View>
    </>
  );
};

// --- Styles (no changes) ---
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 5,
  },
  filterPopup: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 25,
    zIndex: 10,
  },
  filterHeader: {
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    minHeight: 70,
  },
  headerStart: { // Renamed from headerLeft
    flex: 1,
    alignItems: 'flex-end',
  },
  headerCenter: {
    flex: 2,
    alignItems: 'center',
  },
  headerEnd: { // Renamed from headerRight
    flex: 1,
    alignItems: 'flex-end',
  },
  headerSpacer: {
    flex: 1,
  },
  filterTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  resetButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    marginRight: -8, // Adjust for RTL
    marginLeft: 16,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionContainer: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row-reverse', // RTL
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  sectionHeaderContent: {
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    gap: 12,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'right', // RTL
  },
  activeCount: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8, // RTL
  },
  activeCountText: {
    fontSize: 12,
    color: '#fff',
    textAlign: 'center',
  },
  chevronContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  chipsContainer: {
    flexDirection: 'row-reverse', // RTL
    flexWrap: 'wrap',
    gap: 12,
  },
  modernChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '500',
    writingDirection: 'rtl'
  },
  chipIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  userNavigationContainer: {
    gap: 12,
  },
  userNavItem: {
    flexDirection: 'row-reverse', // RTL
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  userNavLeft: { // Actually on the right in RTL
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    gap: 12,
  },
  userNavTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'right', // RTL
  },
  userNavSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'right', // RTL
  },
  dateContainer: {
    minHeight: 60,
  },
  separator: {
    height: 16,
  },
  dateRangeDisplay: {
    flexDirection: 'row-reverse', // RTL
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  dateInfo: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'right', // RTL
  },
  dateRangeText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'right', // RTL
  },
  clearDateButton: {
    padding: 4,
  },
  emptyDateContainer: {
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyDateText: {
    fontSize: 15,
    fontWeight: '500',
  },
  // User Selection Styles
  searchContainer: {
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    margin: 20,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'right', // RTL
    writingDirection: 'rtl',
  },
  usersListContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  userItem: {
    flexDirection: 'row-reverse', // RTL
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  userInfo: {
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'right', // RTL
  },
  userRole: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'right', // RTL
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  emptyListText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default FilterDialog;