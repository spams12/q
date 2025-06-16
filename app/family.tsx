import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useTheme } from '@/context/ThemeContext';
import { db } from '@/lib/firebase';
import { User } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';

type GroupedUsers = {
  title: string;
  data: User[];
};

interface FamilyMemberCardProps {
  user: User;
}

const FamilyMemberCard: React.FC<FamilyMemberCardProps> = ({ user }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  const getInitials = (name: string) => {
    const names = name.split(' ');
    const firstName = names[0] || '';
    const lastName = names.length > 1 ? names[names.length - 1] : '';
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return null;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7}>
      <View style={styles.cardContent}>
        <View style={styles.avatarSection}>
          {user.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.initialsContainer]}>
              <ThemedText style={styles.initialsText}>
                {getInitials(user.name)}
              </ThemedText>
            </View>
          )}
          <View style={styles.statusIndicator} />
        </View>
        
        <View style={styles.userInfo}>
          <ThemedText style={styles.name}>{user.name}</ThemedText>
          <View style={styles.contactRow}>
            <Ionicons name="mail-outline" size={14} color={theme.icon} />
            <ThemedText style={styles.email}>{user.email}</ThemedText>
          </View>
          {user.phone && (
            <View style={styles.contactRow}>
              <Ionicons name="call-outline" size={14} color={theme.icon} />
              <ThemedText style={styles.phone}>{formatPhoneNumber(user.phone)}</ThemedText>
            </View>
          )}
        </View>
        
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="chevron-forward" size={20} color={"gray"} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

export default function FamilyScreen() {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [groupedUsers, setGroupedUsers] = useState<GroupedUsers[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const hierarchyDocRef = doc(db, 'settings', 'roleHierarchy');
        const hierarchyDoc = await getDoc(hierarchyDocRef);
        let roleHierarchyMap: { [key: string]: number } = {};
        if (hierarchyDoc.exists()) {
          const data = hierarchyDoc.data();
          if (data && data.hierarchy) {
            roleHierarchyMap = data.hierarchy;
          }
        }

        const usersCollection = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollection);
        const usersList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));

        const groups: { [key: string]: User[] } = usersList.reduce((acc, user) => {
          const role = user.role || 'Unassigned';
          if (!acc[role]) {
            acc[role] = [];
          }
          acc[role].push(user);
          return acc;
        }, {} as { [key: string]: User[] });

        const sortedSections = Object.keys(groups)
          .sort((a, b) => (roleHierarchyMap[a] ?? 99) - (roleHierarchyMap[b] ?? 99))
          .map(role => ({
            title: role,
            data: groups[role].sort((a, b) => a.name.localeCompare(b.name)),
          }));

        setGroupedUsers(sortedSections);
      } catch (error) {
        console.error("Error fetching data: ", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.tint} />
        <ThemedText style={styles.loadingText}>جاري التحميل...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SectionList
        sections={groupedUsers}
        renderItem={({ item }) => <FamilyMemberCard user={item} />}
        keyExtractor={item => item.id}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
            <View style={styles.sectionBadge}>
              <ThemedText style={styles.sectionCount}>
                {groupedUsers.find(g => g.title === title)?.data.length || 0}
              </ThemedText>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />
    </ThemedView>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.text,
  },
  listContent: {
    paddingBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent',
    marginTop: 16,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.text,
    textTransform: 'capitalize',
  },
  sectionBadge: {
    backgroundColor: theme.tint,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 16,
    backgroundColor: theme.card,
    ...Platform.select({
      ios: {
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
        shadowColor: theme.shadow,
      },
    }),
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatarSection: {
    position: 'relative',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 16,
  },
  initialsContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.tint,
  },
  initialsText: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '600',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 18,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: theme.card,
  },
  userInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  email: {
    fontSize: 14,
    color: theme.icon,
    marginLeft: 6,
    flex: 1,
  },
  phone: {
    fontSize: 14,
    color: theme.icon,
    marginLeft: 6,
    fontVariant: ['tabular-nums'],
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: theme.background,
    marginLeft: 8,
  },
});