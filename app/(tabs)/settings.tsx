import { usePermissions } from '@/context/PermissionsContext';
import { Theme, useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
// OPTIMIZATION: Import useMemo and useCallback
import { UseDialog } from '@/context/DialogContext';
import React, { Children, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import UpdatePhoneModal from '../../components/UpdatePhoneModal';
import { auth, db } from '../../lib/firebase';
import { User } from '../../lib/types';


const SPACING = {
  s: 8,
  m: 16,
  l: 24,
};


interface ProfileHeaderProps {
  user: Partial<User>;
  onImagePick: () => void;
  loading: boolean;
}

interface SettingsGroupProps {
  title?: string;
  children: React.ReactNode;
}

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  iconColor?: string;
  value?: string;
  onPress?: () => void;
  rightComponent?: React.ReactNode;
}


const ProfileHeader = React.memo<ProfileHeaderProps & { styles: any }>(({ user, onImagePick, loading, styles }) => (
  <View style={styles.profileSection}>
    <TouchableOpacity onPress={onImagePick} disabled={loading} style={styles.avatarContainer}>
      <Image
        source={{ uri: user.photoURL || 'https://via.placeholder.com/150' }}
        style={styles.avatar}
      />
      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#FFF" />
        </View>
      ) : (
        <View style={styles.editAvatarButton}>
          <Ionicons name="camera-outline" size={18} color="#FFF" />
        </View>
      )}
    </TouchableOpacity>
    <Text adjustsFontSizeToFit style={styles.profileName}>{user.name || 'اسم المستخدم'}</Text>
    <Text adjustsFontSizeToFit style={styles.profileRole}>{user.role || 'عضو'}</Text>
  </View>
));
ProfileHeader.displayName = 'ProfileHeader';

const SettingsGroup = React.memo<SettingsGroupProps & { styles: any }>(({ title, children, styles }) => (
  <View style={styles.groupContainer}>
    {title && <Text style={styles.groupTitle}>{title}</Text>}
    <View style={styles.groupCard}>
      {Children.map(children, (child, index) => (
        <>
          {React.isValidElement(child) ? React.cloneElement(child as React.ReactElement<any>, { styles }) : child}
          {index < Children.count(children) - 1 && <View style={styles.separator} />}
        </>
      ))}
    </View>
  </View>
));
SettingsGroup.displayName = 'SettingsGroup';

const SettingRow = React.memo<SettingRowProps & { styles: any }>(({ icon, iconColor, title, value, onPress, rightComponent, styles }) => (
  <TouchableOpacity onPress={onPress} disabled={!onPress} style={styles.settingRow}>
    <View style={[styles.iconContainer, { backgroundColor: iconColor || styles.iconContainer.backgroundColor }]}>
      <Ionicons name={icon} size={20} color={iconColor ? '#FFF' : styles.icon.color} />
    </View>
    <View style={styles.settingTextContainer}>
      <Text adjustsFontSizeToFit style={styles.settingTitle}>{title}</Text>
      {value && <Text adjustsFontSizeToFit style={styles.settingValue}>{value}</Text>}
    </View>
    {rightComponent ? rightComponent : (onPress && <Ionicons name="chevron-back" size={20} style={styles.chevron} />)}
  </TouchableOpacity>
));
SettingRow.displayName = 'SettingRow';

const SettingsPage = () => {
  const { themeName, toggleTheme, theme } = useTheme();
  const { showDialog } = UseDialog()

  const styles = useMemo(() => getStyles(theme), [theme]);
  console.log("rednedr set")
  const [invoiceData, setInvoiceData] = useState({ total: 0, count: 0 });
  const { userdoc, setUserdoc, realuserUid } = usePermissions();
  const [loading, setLoading] = useState(false);
  const [isPhoneModalVisible, setPhoneModalVisible] = useState(false);
  const router = useRouter();

  const { latestClearTimeString, formattedDate } = useMemo(() => {
    const latestClearTime = (userdoc?.lastClearTimes && userdoc.lastClearTimes.length > 0)
      ? userdoc.lastClearTimes.reduce((latest, current) => (current.seconds > latest.seconds ? current : latest))
      : null;
    
    const timeString = latestClearTime ? latestClearTime.toDate().toISOString() : new Date(0).toISOString();
    
    const dateString = latestClearTime ? new Intl.DateTimeFormat('ar-IQ', {
        year: 'numeric', month: 'long', day: 'numeric',
    }).format(latestClearTime.toDate()) : 'لا توجد تصفية سابقة';

    return { latestClearTimeString: timeString, formattedDate: dateString };
  }, [userdoc]);
  
  // --- Real-time User Data Listener ---
  useEffect(() => {
    if (!realuserUid) return;

    const userDocRef = doc(db, 'users', realuserUid);
    const unsubscribe = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        setUserdoc({ id: snapshot.id, ...snapshot.data() } as User);
      } else {
        console.log('User document does not exist');
      }
    }, (error) => {
      console.error("Error fetching user document:", error);
    });

    return () => unsubscribe();
    // OPTIMIZATION: `setUserdoc` from context should be stable, so it can be removed from dependencies.
  }, [realuserUid, setUserdoc]);

  // --- Invoice Data Listener ---
  useEffect(() => {
    if (!realuserUid) {
      setInvoiceData({ total: 0, count: 0 });
      return;
    }
    // Now this query uses the memoized `latestClearTimeString`
    const q = query(collection(db, 'invoices'), where('createdBy', '==', realuserUid), where('createdAt', '>=', latestClearTimeString));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let total = 0;
      snapshot.forEach((doc) => {
        total += doc.data().totalAmount;
      });
      setInvoiceData({ total: total, count: snapshot.size });
    }, (error) => {
      console.error("Error fetching invoices: ", error);
      showDialog({
        status: 'error',
        message: 'فشل في جلب بيانات الفواتير.',
      });
    });

    return () => unsubscribe();
  }, [ realuserUid, latestClearTimeString, showDialog]);
  
  // OPTIMIZATION: Wrap all handlers in `useCallback` to prevent them from being
  // recreated on every render. This ensures stable props for child components.
  const handleImagePick = useCallback(async () => {
    setLoading(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showDialog({
          status: 'error',
          message:"نحتاج إلى صلاحية الوصول إلى الصور لتحديث صورتك الشخصية"
        })
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || !userdoc?.id) return;
      
      const imageUri = result.assets[0].uri;
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const storage = getStorage();
      const storageRef = ref(storage, `profile_pictures/${userdoc.id}`);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      
      const userDocRef = doc(db, 'users', userdoc.id);
      await updateDoc(userDocRef, { photoURL: downloadURL });
      showDialog({
        status: 'success',
        message: 'تم تحديث الصورة الشخصية بنجاح.',
      })


    } catch (error) {
      console.error('Error uploading image: ', error);
      showDialog({
        status: 'error',
        message: 'فشل تحميل الصورة.',
      })

    } finally {
      setLoading(false);
    }
  }, [userdoc?.id, showDialog]); // Dependency on what the function needs

  const handleLogout = useCallback(() => {
    Alert.alert(
      'تسجيل الخروج', 'هل أنت متأكد؟',
      [{ text: 'إلغاء', style: 'cancel' }, { text: 'تسجيل الخروج', style: 'destructive', onPress: () => signOut(auth) }]
    );
  }, []); // No dependenciess

  const handlePhoneUpdate = useCallback(async (newPhone: string) => {
    if (!userdoc?.id || !newPhone) {
      setPhoneModalVisible(false);
      return;
    }
    setLoading(true);
    try {
      const userDocRef = doc(db, 'users', userdoc.id);
      await updateDoc(userDocRef, { phone: newPhone });
       // Again, onSnapshot will handle the state update.
      showDialog({
        status: 'success',
        message: 'تم تحديث رقم الهاتف بنجاح.',
      })
    } catch (error) {
      console.error('Error updating phone number: ', error);
      showDialog({status : "error", message:'فشل تحديث رقم الهاتف.'});
    } finally {
      setLoading(false);
      setPhoneModalVisible(false);
    }
  }, [userdoc?.id, showDialog]); // Dependency on userdoc.id

  const openPhoneModal = useCallback(() => setPhoneModalVisible(true), []);
  const closePhoneModal = useCallback(() => setPhoneModalVisible(false), []);
  const goToInvoices = useCallback(() => router.push('/invoices'), [router]);
  const goToFamily = useCallback(() => router.push('/family'), [router]);
  const goToAbout = useCallback(() => router.push('/about'), [router]);


  if (!userdoc) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={styles.loadingText.color} />
        <Text style={styles.loadingText}>جاري تحميل البيانات...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
      
      <ProfileHeader user={userdoc} onImagePick={handleImagePick} loading={loading} styles={styles} />

      {/* Wallet Card */}
      <SettingsGroup title="المحفظة" styles={styles}>
        <TouchableOpacity style={styles.invoiceCard} onPress={goToInvoices}>
            <View style={styles.invoiceCardContent}>
              <Ionicons name="receipt-outline" size={32} style={styles.invoiceIcon} />
              <View style={styles.invoiceCardText}>
                <Text style={styles.invoiceCardTitle}>فواتير الفترة الحالية</Text>
                <Text style={styles.invoiceCardSubtitle}>{`${invoiceData.count} فاتورة`} • آخر تصفية: {formattedDate}</Text>
              </View>
            </View>
            <View style={styles.invoiceCardAmountContainer}>
              <Text style={styles.invoiceCardAmount}>{`${invoiceData.total.toLocaleString()} IQD`}</Text>
              <Ionicons name="chevron-back" size={24} style={styles.chevron} />
            </View>
        </TouchableOpacity>
      </SettingsGroup>
      
      {/* Personal Info Group */}
      <SettingsGroup title="المعلومات الشخصية" styles={styles}>
        <SettingRow styles={styles} icon="person-outline" title="الاسم الكامل" value={userdoc.name || ''} iconColor="#5856D6" />
        <SettingRow styles={styles} icon="mail-outline" title="البريد الإلكتروني" value={userdoc.email || ''} iconColor="#007AFF" />
        <SettingRow styles={styles} icon="call-outline" title="رقم الهاتف" value={userdoc.phone || 'غير محدد'} onPress={openPhoneModal} iconColor="#34C759" />
        <SettingRow styles={styles} icon="people-outline" title="معرف الفريق" value={userdoc.teamId || 'غير محدد'} iconColor="#FF9500" />
      </SettingsGroup>

      {/* App Settings Group */}
      <SettingsGroup title="إعدادات التطبيق" styles={styles}>

        <SettingRow
          styles={styles}
          icon="moon-outline"
          title="الوضع المظلم"
          iconColor="#5856D6"
          rightComponent={<Switch value={themeName === 'dark'} onValueChange={toggleTheme} trackColor={{ false: '#E9E9EA', true: theme.success }} thumbColor="#FFF" />}
        />
      </SettingsGroup>

      {/* Other Group */}
      <SettingsGroup styles={styles}>
        <SettingRow styles={styles} icon="people-circle-outline" title="عائله القبس" onPress={goToFamily} iconColor="#FF69B4" />
        <SettingRow styles={styles} icon="information-circle-outline" title="حول التطبيق" onPress={goToAbout} iconColor="#00BCD4" />
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButtonRow}>
          <View style={[styles.iconContainer, { backgroundColor: theme.destructive }]}>
            <Ionicons name="log-out-outline" size={20} color="#FFF" />
          </View>
          <Text style={styles.logoutButtonText}>تسجيل الخروج</Text>
        </TouchableOpacity>
      </SettingsGroup>

      <UpdatePhoneModal
        visible={isPhoneModalVisible}
        onClose={closePhoneModal}
        onUpdate={handlePhoneUpdate}
        currentPhone={userdoc.phone || ''}
        loading={loading}
        
      />
    </ScrollView>
  );
};

// ... (getStyles function remains the same)
const getStyles = (theme: Theme) => StyleSheet.create({
  // --- Global Styles ---
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  contentContainer: {
    paddingVertical: SPACING.l,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background,
  },
  loadingText: {
    marginTop: SPACING.m,
    fontSize: 16,
    color: theme.textSecondary,
    fontFamily: 'System', // Specify a font family
  },
  chevron: {
    color: theme.textSecondary,
  },
  icon: {
    color: theme.primary,
  },

  // --- Profile Header Styles ---
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
    marginBottom: SPACING.l,
  },
  avatarContainer: {
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: theme.card,
  },
  loadingOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 60,
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: theme.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.card,
  },
  profileName: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.text,
    marginTop: SPACING.m,
    textAlign: 'center',
  },
  profileRole: {
    fontSize: 16,
    color: theme.textSecondary,
    marginTop: SPACING.s / 2,
    textAlign: 'center',
  },

  // --- Settings Group & Card Styles ---
  groupContainer: {
    marginHorizontal: SPACING.m,
    marginBottom: SPACING.l,
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: SPACING.s,
    textAlign: 'right',
    paddingHorizontal: SPACING.m,
    textTransform: 'uppercase',
  },
  groupCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  separator: {
    height: 1,
    backgroundColor: theme.separator,
    marginRight: 56, // Align with text, not icon
  },

  // --- Setting Row Styles ---
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.m,
    backgroundColor: 'transparent', // Handled by group card
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.iconBackground,
  },
  settingTextContainer: {
    flex: 1,
    marginHorizontal: SPACING.m,
    alignItems: 'flex-end',
  },
  settingTitle: {
    fontSize: 17,
    color: theme.text,
    textAlign: 'right',
  },
  settingValue: {
    fontSize: 15,
    color: theme.textSecondary,
    textAlign: 'right',
    marginTop: 2,
  },

  // --- Specific Card/Row Styles ---
  invoiceCard: {
    padding: SPACING.m,
    backgroundColor: 'transparent', // Handled by group card
  },
  invoiceCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  invoiceIcon: {
    color: theme.primary,
  },
  invoiceCardText: {
    marginHorizontal: SPACING.m,
    flex: 1,
    alignItems: 'flex-end',
  },
  invoiceCardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.text,
    textAlign: 'right',
  },
  invoiceCardSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
  invoiceCardAmountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end', // For RTL layout
    marginTop: SPACING.m,
    paddingTop: SPACING.m,
    borderTopWidth: 1,
    borderTopColor: theme.separator,
  },
  invoiceCardAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.primary,
    marginLeft: SPACING.s, // Space between amount and arrow
  },
  logoutButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.m,
  },
  logoutButtonText: {
    flex: 1,
    textAlign: 'center',
    color: theme.destructive,
    fontSize: 17,
    fontWeight: '600',
  },
});

// The final export remains the same
export default React.memo(SettingsPage);