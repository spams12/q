import { Theme, useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
    useClearRefinements,
    useCurrentRefinements,
    useRefinementList
} from 'react-instantsearch-core';
import {
    Dimensions,
    FlatList,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
// --- THEME IMPORT: Replaced local theme with the context hook ---


// --- Interfaces ---
// The User interface now includes `uid` and an optional `photoURL`.
export interface User {
    id: string;       // Document ID (e.g., from Firestore)
    uid: string;      // Authentication ID (e.g., from Firebase Auth)
    name: string;
    photoURL?: string; // Optional URL for the user's profile picture
}

export interface Team {
    id: string;
    name: string;
}

// --- Theming & Style Helpers ---
// --- UPDATED: These helpers now accept a theme object as an argument ---
const getStatusBadgeColor = (status: string, theme: Theme) => {
    const lowerStatus = status.toLowerCase();
    switch (lowerStatus) {
        case 'open': case 'جديد': return { view: { backgroundColor: `${theme.primary}26` }, text: { color: theme.primary } }; // ~15% opacity
        case 'in progress': case 'قيد التنفيذ': return { view: { backgroundColor: `${theme.priorityHigh}26` }, text: { color: theme.priorityHigh } };
        case 'resolved': case 'مغلق': case 'completed': return { view: { backgroundColor: `${theme.success}26` }, text: { color: theme.success } };
        case 'on hold': case 'معلق': return { view: { backgroundColor: `${theme.textSecondary}26` }, text: { color: theme.textSecondary } };
        case 'rejected': case 'مرفوض': return { view: { backgroundColor: `${theme.destructive}26` }, text: { color: theme.destructive } };
        default: return { view: { backgroundColor: theme.inputBackground }, text: { color: theme.text } };
    }
};

const getPriorityColor = (priority: string, theme: Theme) => {
    switch (priority.toLowerCase()) {
        case 'high': case 'عالية': return theme.destructive;
        case 'medium': case 'متوسطة': return theme.priorityHigh;
        case 'low': case 'منخفضة': return theme.success;
        default: return theme.textSecondary;
    }
};


// --- Child Components for the Filter Modal ---

const RefinementChipSection = ({ items, refine, renderAs, title }) => {
    // Use the theme from the context
    const { theme } = useTheme();

    if (items.length === 0) {
        return <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>لا {title} يوجد عناصر.</Text>;
    }

    const ChipRenderer = ({ item }) => {
        const isSelected = item.isRefined;
        let styleProps: any = {};

        switch (renderAs) {
            case 'status':
                // --- UPDATED: Pass theme to the helper function ---
                const statusColors = getStatusBadgeColor(item.label, theme);
                styleProps = { backgroundColor: isSelected ? statusColors.view.backgroundColor : theme.inputBackground, borderColor: isSelected ? statusColors.view.backgroundColor : theme.border, textColor: isSelected ? statusColors.text.color : theme.text, };
                break;
            case 'priority':
                // --- UPDATED: Pass theme to the helper function ---
                const priorityColor = getPriorityColor(item.label, theme);
                styleProps = { backgroundColor: isSelected ? `${priorityColor}20` : theme.inputBackground, borderColor: isSelected ? priorityColor : theme.border, textColor: isSelected ? priorityColor : theme.text, };
                break;
            default:
                styleProps = { backgroundColor: isSelected ? theme.primaryTransparent : theme.inputBackground, borderColor: isSelected ? theme.primary : theme.border, textColor: isSelected ? theme.primary : theme.text, };
        }

        return (
            <TouchableOpacity
                style={[styles.modernChip, { backgroundColor: styleProps.backgroundColor, borderColor: styleProps.borderColor }]}
                onPress={() => refine(item.value)}
            >
                <Text style={[styles.chipText, { color: styleProps.textColor }]}>
                    {item.label} ({item.count})
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.chipsContainer}>
            {items.map(item => <ChipRenderer key={item.value} item={item} />)}
        </View>
    );
};

// This component now renders an Image or a fallback Avatar
const UserSelectionView = ({ items, refine, searchForItems, attribute, onBack }) => {
    // Use the theme from the context
    const { theme } = useTheme();
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        searchForItems(searchQuery);
    }, [searchQuery, searchForItems]);

    const title = attribute === 'creatorId' ? 'اختر المنشئ' : 'اختر المستخدمين المعينين';

    return (
        <>
            <View style={[styles.filterHeader, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={onBack} style={styles.headerButton}>
                    <Ionicons name="arrow-forward" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.filterTitle, { color: theme.text }]}>{title}</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={[styles.searchContainer, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
                <Ionicons name="search" size={20} color={theme.textSecondary} />
                <TextInput
                    style={[styles.searchInput, { color: theme.text }]}
                    placeholder="ابحث..."
                    placeholderTextColor={theme.placeholder}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCorrect={false}
                />
            </View>

            <FlatList
                data={items}
                keyExtractor={item => item.value}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={[styles.userItem, {
                            backgroundColor: item.isRefined ? theme.primaryTransparent : 'transparent',
                            borderColor: item.isRefined ? theme.primaryBorder : 'transparent'
                        }]}
                        onPress={() => refine(item.value)}
                    >
                        <View style={styles.userInfo}>
                            {/* Conditionally render Image or fallback Avatar */}
                            {item.photoURL ? (
                                <Image source={{ uri: item.photoURL }} style={styles.userAvatarImage} />
                            ) : (
                                <View style={[styles.userAvatar, { backgroundColor: theme.primary }]}>
                                    <Text style={[styles.userAvatarText, { color: theme.contrastText }]}>
                                        {item.label.charAt(0).toUpperCase()}
                                    </Text>
                                </View>
                            )}
                            <Text style={[styles.userName, { color: theme.text }]}>
                                {item.label} ({item.count})
                            </Text>
                        </View>
                        {item.isRefined && (
                            <View style={[styles.checkIcon, { backgroundColor: theme.primary }]}>
                                <Ionicons name="checkmark" size={16} color={theme.contrastText} />
                            </View>
                        )}
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    <View style={styles.emptyListContainer}>
                        <Ionicons name="person-outline" size={48} color={theme.textSecondary} />
                        <Text style={[styles.emptyListText, { color: theme.textSecondary }]}>لا يوجد مستخدمين</Text>
                    </View>
                }
                style={styles.usersListContainer}
            />
        </>
    );
};


// --- Main Filters Component ---

interface FiltersProps {
    isModalOpen: boolean;
    onToggleModal: () => void;
    users?: User[];
    teams?: Team[];
}

export function Filters({ isModalOpen, onToggleModal, users = [], teams = [] }: FiltersProps) {
    // Use the theme from the context
    const { theme } = useTheme();
    const { canRefine: canClear, refine: clear } = useClearRefinements();
    const { items: currentRefinements } = useCurrentRefinements();
    const { items: statusItems, refine: refineStatus } = useRefinementList({ attribute: 'status' });
    const { items: priorityItems, refine: refinePriority } = useRefinementList({ attribute: 'priority' });
    const { items: typeItems, refine: refineType } = useRefinementList({ attribute: 'type' });
    const { items: teamItems, refine: refineTeam } = useRefinementList({ attribute: 'teamId' });
    const { items: creatorItems, refine: refineCreator, searchForItems: searchCreators } = useRefinementList({ attribute: 'creatorId' });
    const { items: assignedUserItems, refine: refineAssignedUser, searchForItems: searchAssignedUsers } = useRefinementList({ attribute: 'assignedUsers' });

    // Create separate maps for `uid` and `id` lookups.
    // The maps store the entire user object to easily access name and photoURL.
    const userMapByUid = useMemo(() => new Map(users.map(u => [u.uid, u])), [users]);
    const userMapById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
    const teamMap = useMemo(() => new Map(teams.map(t => [t.id, t.name])), [teams]);

    const translateY = useSharedValue(Dimensions.get('window').height);
    const [currentView, setCurrentView] = useState('main');
    const [expandedSections, setExpandedSections] = useState({
        status: false, priority: false, type: false, team: false, users: false,
    });


    useEffect(() => {
        if (isModalOpen) {
            translateY.value = withTiming(0, { duration: 350 });
        } else {
            translateY.value = withTiming(Dimensions.get('window').height, { duration: 350 });
            setTimeout(() => setCurrentView('main'), 350);
        }
    }, [isModalOpen, translateY]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const handleReset = () => { clear(); };
    const handleBack = () => { setCurrentView('main'); };
    const toggleSection = (section) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const hasActiveFilter = (attribute: string) => {
        const refinement = currentRefinements.find(r => r.attribute === attribute);
        return refinement && refinement.refinements.length > 0;
    };

    const renderCollapsibleSection = (title: string, sectionKey: string, children: React.ReactNode, icon: React.ComponentProps<typeof Ionicons>['name']) => {
        const isActive = sectionKey === 'users'
            ? hasActiveFilter('creatorId') || hasActiveFilter('assignedUsers')
            : hasActiveFilter(sectionKey);
        return (
            <View style={[styles.sectionContainer, { backgroundColor: theme.background, borderColor: isActive ? theme.primaryBorder : theme.border, borderWidth: isActive ? 1.5 : 1, }]}>
                <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection(sectionKey)} activeOpacity={0.7}>
                    <View style={styles.sectionHeaderContent}>
                        <View style={[styles.sectionIcon, { backgroundColor: theme.primaryTransparent }]}>
                            <Ionicons name={icon} size={20} color={theme.primary} />
                        </View>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
                        {isActive && <View style={[styles.activeIndicator, { backgroundColor: theme.primary }]} />}
                    </View>
                    <Ionicons name="chevron-down" size={24} color={theme.textSecondary} style={{ transform: [{ rotate: expandedSections[sectionKey] ? '180deg' : '0deg' }] }} />
                </TouchableOpacity>
                {expandedSections[sectionKey] && <View style={styles.sectionContent}>{children}</View>}
            </View>
        );
    };

    const renderUserNavigationItem = (title: string, destination: 'creatorId' | 'assignedUsers', icon: React.ComponentProps<typeof Ionicons>['name']) => {
        const isActive = hasActiveFilter(destination);
        const count = currentRefinements.find(r => r.attribute === destination)?.refinements.length || 0;
        return (
            <TouchableOpacity style={[styles.userNavItem, { backgroundColor: isActive ? theme.primaryTransparent : theme.inputBackground, borderColor: isActive ? theme.primaryBorder : theme.border, }]} onPress={() => setCurrentView(destination)}>
                <View style={styles.userNavLeft}>
                    <View style={[styles.sectionIcon, { backgroundColor: theme.primaryTransparent }]}>
                        <Ionicons name={icon} size={20} color={theme.primary} />
                    </View>
                    <View>
                        <Text style={[styles.userNavTitle, { color: theme.text }]}>{title}</Text>
                        <Text style={[styles.userNavSubtitle, { color: theme.textSecondary }]}>
                            {count > 0 ? `تم اختيار ${count}` : 'لم يتم الاختيار'}
                        </Text>
                    </View>
                </View>
                <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
        );
    };

    const renderMainView = () => {
        const transformedTeamItems = teamItems.map(item => ({
            ...item,
            label: teamMap.get(item.label) || item.label,
        }));

        return (
            <>
                <View style={[styles.filterHeader, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity onPress={onToggleModal} style={styles.headerButton}>
                        <Ionicons name="close" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.filterTitle, { color: theme.text }]}>الفلاتر</Text>
                    <TouchableOpacity onPress={handleReset} disabled={!canClear}>
                        <Text style={[styles.resetButtonText, { color: canClear ? theme.primary : theme.textSecondary }]}>
                            اعادة تعين
                        </Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {renderCollapsibleSection("الحالة", "status", <RefinementChipSection items={statusItems} refine={refineStatus} renderAs="status" title="Status" />, "checkmark-circle-outline")}

                    {renderCollapsibleSection("النوع", "type", <RefinementChipSection items={typeItems} refine={refineType} title="Type" />, "list-outline")}
                    {renderCollapsibleSection("الأهمية", "priority", <RefinementChipSection items={priorityItems} refine={refinePriority} renderAs="priority" title="Priority" />, "flag-outline")}
                </ScrollView>
            </>
        );
    };

    const renderContent = () => {
        // This function now selects the correct map based on the attribute
        // and extracts the name and photoURL from the full user object.
        const transformUserItems = (items: any[], attribute: 'creatorId' | 'assignedUsers') => {
            const mapToUse = attribute === 'creatorId' ? userMapByUid : userMapById;
            return items.map(item => {
                const user = mapToUse.get(item.label); // item.label is the uid or id
                return {
                    ...item, // Keep original Algolia data (value, count, isRefined)
                    label: user ? user.name : item.label, // Use real name, or fallback to id
                    photoURL: user ? user.photoURL : undefined, // Add photoURL for the view
                };
            });
        };

        const transformedCreatorItems = transformUserItems(creatorItems, 'creatorId');
        const transformedAssignedUserItems = transformUserItems(assignedUserItems, 'assignedUsers');

        switch (currentView) {
            case 'main':
                return renderMainView();
            case 'creatorId':
                return <UserSelectionView items={transformedCreatorItems} refine={refineCreator} searchForItems={searchCreators} attribute="creatorId" onBack={handleBack} />;
            case 'assignedUsers':
                return <UserSelectionView items={transformedAssignedUserItems} refine={refineAssignedUser} searchForItems={searchAssignedUsers} attribute="assignedUsers" onBack={handleBack} />;
            default:
                return null;
        }
    };

    if (!isModalOpen) { return null; }

    return (
        <>
            <Pressable style={styles.backdrop} onPress={onToggleModal} />
            <Animated.View style={[styles.filterPopup, { backgroundColor: theme.background, shadowColor: theme.shadow, borderTopColor: theme.border }, animatedStyle]}>
                {renderContent()}
            </Animated.View>
        </>
    );
}

// --- Styles ---
// Styles remain unchanged as they do not contain theme colors directly
const styles = StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, zIndex: 5, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
    filterPopup: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 25, zIndex: 10, borderTopWidth: 1 },
    filterHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
    headerButton: { padding: 4 },
    filterTitle: { fontSize: 18, fontWeight: 'bold' },
    resetButtonText: { fontSize: 16, fontWeight: '600' },
    scrollContent: { padding: 16, flex: 1 },
    sectionContainer: { borderRadius: 16, marginBottom: 16, overflow: 'hidden' },
    sectionHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    sectionHeaderContent: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
    sectionIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    sectionTitle: { fontSize: 17, fontWeight: '600', textAlign: 'right' },
    activeIndicator: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
    sectionContent: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
    chipsContainer: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
    modernChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5 },
    chipText: { fontSize: 14, fontWeight: '500' },
    userNavigationContainer: { gap: 12 },
    userNavItem: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1 },
    userNavLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
    userNavTitle: { fontSize: 16, fontWeight: '600', textAlign: 'right' },
    userNavSubtitle: { fontSize: 14, textAlign: 'right' },
    searchContainer: { flexDirection: 'row-reverse', alignItems: 'center', marginHorizontal: 16, marginTop: 16, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, gap: 12 },
    searchInput: { flex: 1, height: 48, fontSize: 16, textAlign: 'right' },
    usersListContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    userItem: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
    userInfo: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
    userAvatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    userAvatarImage: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E5E5EA' },
    userAvatarText: { fontSize: 16, fontWeight: 'bold' },
    userName: { fontSize: 16, fontWeight: '600', textAlign: 'right' },
    checkIcon: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    emptyListContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
    emptyListText: { fontSize: 16, fontWeight: '500', textAlign: 'center' },
});