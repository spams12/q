// src/app/(tabs)/settings.tsx (or your path to the settings page)

import { UseDialog } from '@/context/DialogContext';
import { usePermissions } from '@/context/PermissionsContext';
import { Theme, useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { Timestamp, collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import React, { Children, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
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

// Helper function to format seconds into HH:MM:SS
const formatDuration = (seconds: number) => {
  if (isNaN(seconds) || seconds < 0) {
    return '00:00:00';
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
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

interface CustomDialogProps {
  visible: boolean;
  title: string;
  message: string;
  buttons: { text: string; onPress: () => void; style?: 'default' | 'destructive', isLoading?: boolean }[];
  onClose: () => void;
  styles: any;
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

const CustomDialog = ({ visible, title, message, buttons, onClose, styles }: CustomDialogProps) => {
  if (!visible) return null;

  return (
    <Modal
      transparent={true}
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <TouchableOpacity style={styles.dialogOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.dialogContainer}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogMessage}>{message}</Text>
          <View style={styles.dialogButtonContainer}>
            {buttons.slice().reverse().map((button, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dialogButton,
                  button.style === 'destructive' ? styles.destructiveButton : styles.defaultButton,
                  index > 0 && { marginRight: SPACING.m }
                ]}
                onPress={button.onPress}
                disabled={button.isLoading}
              >
                {button.isLoading ? (
                  <ActivityIndicator size="small" color={button.style === 'destructive' ? styles.destructiveButtonText.color : styles.defaultButtonText.color} />
                ) : (
                  <Text style={[
                    styles.dialogButtonText,
                    button.style === 'destructive' ? styles.destructiveButtonText : styles.defaultButtonText
                  ]}>
                    {button.text}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const SettingsPage = () => {
  const { themeName, toggleTheme, theme } = useTheme();
  const { showDialog } = UseDialog()

  const styles = useMemo(() => getStyles(theme), [theme]);
  const [invoiceData, setInvoiceData] = useState({ total: 0, count: 0 });
  const { userdoc, setUserdoc, realuserUid } = usePermissions();
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPhoneModalVisible, setPhoneModalVisible] = useState(false);
  const [isLogoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const router = useRouter();

  const [timeTrackingData, setTimeTrackingData] = useState<{ sessions: any[], totalDurationSeconds: number }>({ sessions: [], totalDurationSeconds: 0 });
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { latestClearTimeString, formattedDate } = useMemo(() => {
    const latestClearTime = (userdoc?.lastClearTimes && userdoc.lastClearTimes.length > 0)
      ? userdoc.lastClearTimes.reduce((latest, current) => (current.seconds > latest.seconds ? current : latest))
      : null;
    const timeString = latestClearTime ? latestClearTime.toDate().toISOString() : new Date(0).toISOString();
    const dateString = latestClearTime ? new Intl.DateTimeFormat('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' }).format(latestClearTime.toDate()) : 'لا توجد تصفية سابقة';
    return { latestClearTimeString: timeString, formattedDate: dateString };
  }, [userdoc]);

  // FIX: Depend on the stable user ID, not the entire userdoc object.
  // This prevents the onSnapshot listener from being re-created on every data change.
  useEffect(() => {
    if (!userdoc?.id) return;

    const userDocRef = doc(db, 'users', userdoc.id);
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
  }, [userdoc?.id, setUserdoc]);

  useEffect(() => {
    if (!realuserUid) return;

    const timeTrackingDocRef = doc(db, 'userTimeTracking', realuserUid);
    const unsubscribe = onSnapshot(timeTrackingDocRef, (snapshot) => {
      if (snapshot.exists()) {
        setTimeTrackingData(snapshot.data() as { sessions: any[], totalDurationSeconds: number });
      } else {
        setTimeTrackingData({ sessions: [], totalDurationSeconds: 0 });
        console.log("Time tracking document doesn't exist for this user yet.");
      }
    }, (error) => {
      console.error("Error fetching time tracking data:", error);
      showDialog({ status: 'error', message: 'فشل في جلب بيانات الدوام.' });
    });

    return () => unsubscribe();
  }, [realuserUid, showDialog]);


  useEffect(() => {
    if (!realuserUid) {
      setInvoiceData({ total: 0, count: 0 });
      return;
    }
    const q = query(collection(db, 'invoices'), where('createdBy', '==', realuserUid), where('createdAt', '>=', latestClearTimeString));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let total = 0;
      snapshot.forEach((doc) => {
        total += doc.data().totalAmount;
      });
      setInvoiceData({ total: total, count: snapshot.size });
    }, (error) => {
      console.error("Error fetching invoices: ", error);
      showDialog({ status: 'error', message: 'فشل في جلب بيانات الفواتير.' });
    });
    return () => unsubscribe();
  }, [realuserUid, latestClearTimeString, showDialog]);

  const isClockedIn = useMemo(() => {
    return timeTrackingData.sessions.some(session => session.logInTime && !session.logOutTime);
  }, [timeTrackingData]);

  useEffect(() => {
    const cleanupTimer = () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };

    const activeSession = timeTrackingData.sessions.find(session => session.logInTime && !session.logOutTime);

    if (activeSession) {
      cleanupTimer();
      timerIntervalRef.current = setInterval(() => {
        const now = new Date();
        const start = (activeSession.logInTime as Timestamp).toDate();
        const secondsElapsed = Math.floor((now.getTime() - start.getTime()) / 1000);
        setElapsedTime(formatDuration(secondsElapsed));
      }, 1000);
    } else {
      setElapsedTime('00:00:00');
      cleanupTimer();
    }

    return cleanupTimer;
  }, [timeTrackingData]);

  const handleRefresh = useCallback(async () => {
    if (!realuserUid) return;
    setIsRefreshing(true);
    try {
      const userDocPromise = getDoc(doc(db, 'users', realuserUid));
      const timeTrackingPromise = getDoc(doc(db, 'userTimeTracking', realuserUid));
      const invoiceQuery = query(
        collection(db, 'invoices'),
        where('createdBy', '==', realuserUid),
        where('createdAt', '>=', latestClearTimeString)
      );
      const invoiceSnapshotPromise = getDocs(invoiceQuery);

      const [userDocSnapshot, timeTrackingSnapshot, invoiceSnapshot] = await Promise.all([userDocPromise, timeTrackingPromise, invoiceSnapshotPromise]);

      if (userDocSnapshot.exists()) {
        setUserdoc({ id: userDocSnapshot.id, ...userDocSnapshot.data() } as User);
      }
      if (timeTrackingSnapshot.exists()) {
        setTimeTrackingData(timeTrackingSnapshot.data() as { sessions: any[], totalDurationSeconds: number });
      }

      let total = 0;
      invoiceSnapshot.forEach((doc) => {
        total += doc.data().totalAmount;
      });
      setInvoiceData({ total: total, count: invoiceSnapshot.size });
    } catch (error) {
      console.error("Error during refresh:", error);
      showDialog({ status: 'error', message: 'فشل تحديث البيانات.' });
    } finally {
      setIsRefreshing(false);
    }
  }, [realuserUid, latestClearTimeString, setUserdoc, showDialog]);

  const handleImagePick = useCallback(async () => {
    setIsImageUploading(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showDialog({ status: 'error', message: "نحتاج إلى صلاحية الوصول إلى الصور لتحديث صورتك الشخصية" });
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
      showDialog({ status: 'success', message: 'تم تحديث الصورة الشخصية بنجاح.' });
    } catch (error) {
      console.error('Error uploading image: ', error);
      showDialog({ status: 'error', message: 'فشل تحميل الصورة.' });
    } finally {
      setIsImageUploading(false);
    }
  }, [userdoc?.id, showDialog]);

  const showLogoutDialog = useCallback(() => setLogoutDialogVisible(true), []);

  const cancelLogout = useCallback(() => {
    if (isLoggingOut) return;
    setLogoutDialogVisible(false);
  }, [isLoggingOut]);

  const confirmLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      if (userdoc) {
        const userDocRef = doc(db, 'users', userdoc.id);
        const { data: currentToken } = await Notifications.getExpoPushTokenAsync();

        if (currentToken) {
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const existingTokens = userData.expoPushTokens?.QTM || [];
            const newTokens = existingTokens.filter((t: string) => t !== currentToken);
            if (newTokens.length < existingTokens.length) {
              await updateDoc(userDocRef, {
                'expoPushTokens.QTM': newTokens,
              });
            }
          }
        }
      }
      await signOut(auth);
    } catch (error) {
      console.error("Failed to log out:", error);
      showDialog({ status: 'error', message: 'فشل تسجيل الخروج. يرجى المحاولة مرة أخرى.' });
      setIsLoggingOut(false); // Only reset on error
      setLogoutDialogVisible(false);
    }
  }, [userdoc, showDialog]);


  const handlePhoneUpdate = useCallback(async (newPhone: string) => {
    if (!userdoc?.id || !newPhone) {
      setPhoneModalVisible(false);
      return;
    }
    setIsActionLoading(true);
    try {
      const userDocRef = doc(db, 'users', userdoc.id);
      await updateDoc(userDocRef, { phone: newPhone });
      showDialog({ status: 'success', message: 'تم تحديث رقم الهاتف بنجاح.' });
    } catch (error) {
      console.error('Error updating phone number: ', error);
      showDialog({ status: "error", message: 'فشل تحديث رقم الهاتف.' });
    } finally {
      setIsActionLoading(false);
      setPhoneModalVisible(false);
    }
  }, [userdoc?.id, showDialog]);


  const handleToggleClock = useCallback(async () => {
    if (!realuserUid) return;
    setIsActionLoading(true);
    const timeTrackingDocRef = doc(db, 'userTimeTracking', realuserUid);

    try {
      const currentSessions = [...(timeTrackingData.sessions || [])];
      const activeSessionIndex = currentSessions.findIndex(s => !s.logOutTime);

      if (activeSessionIndex !== -1) {
        // CLOCKING OUT
        currentSessions[activeSessionIndex].logOutTime = Timestamp.now();

        const totalSeconds = currentSessions.reduce((acc, session) => {
          if (session.logInTime && session.logOutTime) {
            const duration = session.logOutTime.seconds - session.logInTime.seconds;
            return acc + (duration > 0 ? duration : 0);
          }
          return acc;
        }, 0);

        await updateDoc(timeTrackingDocRef, {
          sessions: currentSessions,
          totalDurationSeconds: totalSeconds,
        });
      } else {
        // CLOCKING IN
        const newSession = { logInTime: Timestamp.now(), logOutTime: null };
        const updatedSessions = [...currentSessions, newSession];

        await setDoc(timeTrackingDocRef, {
          userId: realuserUid,
          sessions: updatedSessions,
          totalDurationSeconds: timeTrackingData.totalDurationSeconds || 0,
        }, { merge: true });
      }
    } catch (error) {
      console.error("Error updating time log:", error);
    } finally {
      setIsActionLoading(false);
    }
  }, [realuserUid, timeTrackingData]);


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
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <ProfileHeader user={userdoc} onImagePick={handleImagePick} loading={isImageUploading} styles={styles} />

        <SettingsGroup title="تسجيل الدوام" styles={styles}>
          <View style={styles.timeTrackingContainer}>
            <TouchableOpacity
              style={[styles.clockButton, isClockedIn ? styles.clockOutButton : styles.clockInButton]}
              onPress={handleToggleClock}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.clockButtonText}>
                  {isClockedIn ? 'إنهاء الدوام' : 'بدء الدوام'}
                </Text>
              )}
            </TouchableOpacity>
            <View style={styles.timersContainer}>
              <Text style={styles.timerLabel}>الوقت الإجمالي</Text>
              <Text style={styles.totalTimerText}>{formatDuration(timeTrackingData.totalDurationSeconds)}</Text>
              <Text style={styles.timerLabel}>الجلسة الحالية</Text>
              <Text style={styles.timerText}>{elapsedTime}</Text>
            </View>
          </View>
        </SettingsGroup>


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

        <SettingsGroup title="المعلومات الشخصية" styles={styles}>
          <SettingRow styles={styles} icon="person-outline" title="الاسم الكامل" value={userdoc.name || ''} iconColor="#5856D6" />
          <SettingRow styles={styles} icon="mail-outline" title="البريد الإلكتروني" value={userdoc.email || ''} iconColor="#007AFF" />
          <SettingRow styles={styles} icon="call-outline" title="رقم الهاتف" value={userdoc.phone || 'غير محدد'} onPress={openPhoneModal} iconColor="#34C759" />
          <SettingRow styles={styles} icon="people-outline" title="معرف الفريق" value={userdoc.teamId || 'غير محدد'} iconColor="#FF9500" />
        </SettingsGroup>

        <SettingsGroup title="إعدادات التطبيق" styles={styles}>
          <SettingRow
            styles={styles}
            icon="moon-outline"
            title="الوضع المظلم"
            iconColor="#5856D6"
            rightComponent={<Switch value={themeName === 'dark'} onValueChange={toggleTheme} trackColor={{ false: '#E9E9EA', true: theme.success }} thumbColor="#FFF" />}
          />
        </SettingsGroup>

        <SettingsGroup styles={styles}>
          <SettingRow styles={styles} icon="people-circle-outline" title="عائله القبس" onPress={goToFamily} iconColor="#FF69B4" />
          <SettingRow styles={styles} icon="information-circle-outline" title="حول التطبيق" onPress={goToAbout} iconColor="#00BCD4" />
          <TouchableOpacity onPress={showLogoutDialog} style={styles.logoutButtonRow}>
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
          loading={isActionLoading}
        />
      </ScrollView>

      <CustomDialog
        visible={isLogoutDialogVisible}
        title="تسجيل الخروج"
        message="هل أنت متأكد أنك تريد تسجيل الخروج؟"
        onClose={cancelLogout}
        styles={styles}
        buttons={[
          { text: 'تسجيل الخروج', onPress: confirmLogout, style: 'destructive', isLoading: isLoggingOut },
          { text: 'إلغاء', onPress: cancelLogout, style: 'default' },
        ]}
      />
    </>
  );
};

// Styles remain unchanged, so they are omitted here for brevity
const getStyles = (theme: Theme) => StyleSheet.create({
  timeTrackingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.l,
    paddingHorizontal: SPACING.m,
  },
  timersContainer: {
    alignItems: 'center',
    flex: 1,
    paddingRight: SPACING.m,
  },
  timerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: SPACING.s / 2,
  },
  totalTimerText: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.text,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.m,
  },
  timerText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.primary,
    fontVariant: ['tabular-nums'],
  },
  clockButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  clockInButton: {
    backgroundColor: theme.success,
  },
  clockOutButton: {
    backgroundColor: theme.destructive,
  },
  clockButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center'
  },
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
    fontFamily: 'System',
  },
  chevron: {
    color: theme.textSecondary,
  },
  icon: {
    color: theme.primary,
  },
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    marginRight: 56,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.m,
    backgroundColor: 'transparent',
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
  invoiceCard: {
    padding: SPACING.m,
    backgroundColor: 'transparent',
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
    justifyContent: 'flex-end',
    marginTop: SPACING.m,
    paddingTop: SPACING.m,
    borderTopWidth: 1,
    borderTopColor: theme.separator,
  },
  invoiceCardAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.primary,
    marginLeft: SPACING.s,
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
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
  },
  dialogContainer: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: SPACING.l,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  dialogTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.text,
    textAlign: 'center',
    marginBottom: SPACING.s,
  },
  dialogMessage: {
    fontSize: 16,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.l,
    lineHeight: 24,
  },
  dialogButtonContainer: {
    flexDirection: 'row-reverse',
    width: '100%',
    justifyContent: 'space-between',
  },
  dialogButton: {
    flex: 1,
    paddingVertical: SPACING.m - 4,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 48,
  },
  defaultButton: {
    backgroundColor: theme.iconBackground,
  },
  destructiveButton: {
    backgroundColor: theme.destructive,
  },
  dialogButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  defaultButtonText: {
    color: theme.text,
  },
  destructiveButtonText: {
    color: '#FFF',
  },
});

export default React.memo(SettingsPage);