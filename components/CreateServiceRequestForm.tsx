import { usePermissions } from "@/context/PermissionsContext";
import { zodResolver } from "@hookform/resolvers/zod";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { collection, doc, getDocs, query, serverTimestamp, setDoc, Timestamp, where } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytesResumable } from "firebase/storage";
import {
  ArrowLeftCircle,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Circle,
  Image,
  Network,
  Paperclip,
  Plus,
  ShieldCheck,
  Square,
  Trash2,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import "react-native-get-random-values"; // Required for uuid
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { useTheme } from "../context/ThemeContext";
import { db } from "../lib/firebase"; // Make sure your firebase config path is correct
import { User } from "../lib/types"; // Make sure your types path is correct

// --- INTERFACES ---
export interface Comment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: Timestamp | string;
  attachments?: CommentAttachment[];
  isStatusChange?: boolean;
  oldStatus?: string;
  newStatus?: string;
}

export interface CommentAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string; // image, video, document, etc.
  fileSize?: number;
}

// --- CONSTANTS ---
const TICKET_TYPES_NO_CUSTOMER_INFO = ["مشكلة", "طلب", "استفسار", "اقتراح"];

const formSchema = z.object({
  subscriberId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().optional(),
  title: z.string().min(3, { message: "العنوان يجب أن يكون أكثر من 3 أحرف" }),
  description: z.string().min(5, { message: "الوصف يجب أن يكون أكثر من 5 أحرف" }),
  type: z.string().min(1, { message: "يرجى اختيار نوع الخدمة" }),
  priority: z.string().min(1, { message: "يرجى تحديد الأولوية" }),
  subscribers: z.array(
    z.object({
      name: z.string().min(2, { message: "اسم المشترك يجب أن يكون أكثر من حرفين" }),
      phone: z.string().min(4, { message: "رقم هاتف المشترك غير صالح" }),
      zoneNumber: z.string().min(1, { message: "يرجى اختيار منطقة المشترك" }),
      packageType: z.string().min(1, { message: "يرجى اختيار نوع الباقة" }),
      price: z.string().min(1, { message: "السعر مطلوب" }),
      serviceType: z.string().min(1, { message: "يرجى اختيار نوع الخدمة" }),
    })
  ).optional(),
}).superRefine((data, ctx) => {
  const customerInfoIsRequired =
    data.type !== "جباية" && !TICKET_TYPES_NO_CUSTOMER_INFO.includes(data.type);

  if (customerInfoIsRequired) {
    if (!data.customerName || data.customerName.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerName"],
        message: "اسم العميل يجب أن يكون أكثر من حرفين",
      });
    }
    if (!data.customerPhone || data.customerPhone.length < 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerPhone"],
        message: "رقم الهاتف غير صالح",
      });
    }
  }
});


type FormValues = z.infer<typeof formSchema>;

interface Subscriber {
  id: string;
  name: string;
  phone: string;
  zoneNumber: string;
  packageType: string;
  price: string;
  serviceType: string;
  isPaid?: boolean;
}

const SERVICE_TYPES = ["وايرلس", "المشروع الوطني", "فايبر اكس"] as const;
const TICKET_TYPES = [
  "صيانة رئيسية", "تنصيب مشترك", "صيانة مشترك", "تغيير زون المشترك",
  "مشكلة في التفعيل", "جباية", "شكوى", "مشكلة", "طلب", "استفسار", "اقتراح"
];

interface CreateServiceRequestFormProps {
  onSuccess: () => void;
  users: User[];
  selectedUserIds: string[];
  setSelectedUserIds: React.Dispatch<React.SetStateAction<string[]>>;
}

const FONT_FAMILY = 'Cairo';

// --- HELPER & GENERIC COMPONENTS (Unchanged) ---
const FormItem = ({ children, style }: { children: React.ReactNode, style?: object }) => {
  const { theme: colors } = useTheme();
  const styles = getStyles(colors);
  return <View style={[styles.formItem, style]}>{children}</View>;
};

const FormLabel = ({ children }: { children: string }) => {
  const { theme: colors } = useTheme();
  const styles = getStyles(colors);
  return <Text style={styles.label}>{children}</Text>;
};

const FormMessage = ({ message }: { message?: string }) => {
  const { theme: colors } = useTheme();
  const styles = getStyles(colors);
  return message ? <Text style={styles.errorMessage}>{message}</Text> : null;
};

const Select = ({ label, options, selectedValue, onValueChange, placeholder, disabled, isLoading }: {
  label?: string;
  options: { label: string; value: string }[];
  selectedValue?: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  isLoading?: boolean;
}) => {
  const { theme: colors } = useTheme();
  const styles = getStyles(colors);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const selectedLabel = options.find(opt => opt.value === selectedValue)?.label || placeholder;

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpen = () => {
    if (!disabled && !isLoading) {
      setSearchQuery("");
      setModalVisible(true);
    }
  };

  const handleClose = () => {
    setModalVisible(false);
    setSearchQuery("");
  };

  const handleSelect = (value: string) => {
    onValueChange(value);
    handleClose();
  };

  return (
    <View>
      {label && <FormLabel>{label}</FormLabel>}
      <TouchableOpacity
        style={[styles.selectTrigger, disabled && styles.disabledInput]}
        onPressIn={handleOpen}
        disabled={disabled || isLoading}
      >
        <Text style={[styles.selectValueText, !selectedValue && { color: colors.placeholder }]}>{selectedLabel}</Text>
        {isLoading ? <ActivityIndicator size="small" color={styles.icon.color} /> : <ChevronDown color={styles.icon.color} size={20} />}
      </TouchableOpacity>
      <Modal
        transparent={true}
        visible={modalVisible}
        onRequestClose={handleClose}
        animationType="fade"
        statusBarTranslucent={Platform.OS === 'android'}
      >
        <Pressable style={styles.modalOverlay} onPressIn={handleClose}>
          <View style={styles.selectModalContent} onStartShouldSetResponder={() => true}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {filteredOptions.map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={styles.selectItem}
                  onPress={() => handleSelect(option.value)}
                >
                  <Text style={styles.selectItemText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

// --- MODIFIED: SubscriberItem Component ---
const SubscriberItem = React.memo(({
  subscriber,
  index,
  updateSubscriber,
  removeSubscriber,
  zones,
  packageTypes,
  isLoadingPackageTypes,
  isOnlySubscriber,
  ticketType,
}: {
  subscriber: Subscriber;
  index: number;
  updateSubscriber: (id: string, field: keyof Subscriber, value: any) => void;
  removeSubscriber: (id: string) => void;
  zones: { id: string; name: string }[];
  packageTypes: { name: string; price: string }[];
  isLoadingPackageTypes: boolean;
  isOnlySubscriber: boolean;
  ticketType: string;
}) => {
  const { theme: colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();

  const [isZoneModalVisible, setZoneModalVisible] = useState(false);
  const [zoneSearchQuery, setZoneSearchQuery] = useState("");
  const [isPackageModalVisible, setPackageModalVisible] = useState(false);
  const [packageSearchQuery, setPackageSearchQuery] = useState("");

  const handleUpdate = useCallback((field: keyof Subscriber, value: string) => {
    updateSubscriber(subscriber.id, field, value);
  }, [subscriber.id, updateSubscriber]);

  const handlePackageChange = useCallback((packageName: string) => {
    const selectedPackage = packageTypes.find(p => p.name === packageName);
    if (selectedPackage) {
      updateSubscriber(subscriber.id, 'packageType', packageName);
      updateSubscriber(subscriber.id, 'price', selectedPackage.price.toString());
    } else {
      updateSubscriber(subscriber.id, 'packageType', packageName);
    }
  }, [subscriber.id, updateSubscriber, packageTypes]);

  const handleRemove = useCallback(() => {
    removeSubscriber(subscriber.id);
  }, [subscriber.id, removeSubscriber]);

  const filteredZones = zones.filter(zone =>
    zone.name.toLowerCase().includes(zoneSearchQuery.toLowerCase())
  );

  const filteredPackages = packageTypes.filter(pkg =>
    pkg.name.toLowerCase().includes(packageSearchQuery.toLowerCase())
  );

  return (
    <>
      <View style={[styles.card, styles.subscriberCard]}>
        <View style={styles.subscriberHeader}>
          <Text style={styles.subscriberTitle}>مشترك {index + 1}</Text>
          {!isOnlySubscriber && (
            <TouchableOpacity style={styles.removeButton} onPressIn={handleRemove}>
              <X color={styles.removeButtonIcon.color} size={18} />
            </TouchableOpacity>
          )}
        </View>
        <FormItem>
          <FormLabel>اسم المشترك</FormLabel>
          <TextInput style={styles.input} placeholder="أدخل اسم المشترك" value={subscriber.name} onChangeText={(val) => handleUpdate('name', val)} placeholderTextColor={colors.placeholder} />
        </FormItem>
        <FormItem>
          <FormLabel>رقم هاتف المشترك</FormLabel>
          <TextInput style={styles.input} placeholder="أدخل رقم الهاتف" value={subscriber.phone} onChangeText={(val) => handleUpdate('phone', val)} keyboardType="phone-pad" placeholderTextColor={colors.placeholder} />
        </FormItem>
        {/* MODIFIED: Zone Selector */}
        <FormItem>
          <FormLabel>منطقة المشترك</FormLabel>
          <TouchableOpacity
            style={[styles.selectTrigger, zones.length === 0 && styles.disabledInput]}
            onPress={() => setZoneModalVisible(true)}
            disabled={zones.length === 0}>
            <Text style={[styles.selectValueText, !subscriber.zoneNumber && { color: colors.placeholder }]}>
              {subscriber.zoneNumber || "اختر المنطقة"}
            </Text>
            {zones.length === 0 ? <ActivityIndicator size="small" color={styles.icon.color} /> : <ChevronDown color={styles.icon.color} size={20} />}
          </TouchableOpacity>
        </FormItem>
        {/* MODIFIED: Package Selector */}
        <FormItem>
          <FormLabel>نوع الباقة</FormLabel>
          <TouchableOpacity
            style={[styles.selectTrigger, isLoadingPackageTypes && styles.disabledInput]}
            onPress={() => setPackageModalVisible(true)}
            disabled={isLoadingPackageTypes}>
            <Text style={[styles.selectValueText, !subscriber.packageType && { color: colors.placeholder }]}>
              {subscriber.packageType || "اختر نوع الباقة"}
            </Text>
            {isLoadingPackageTypes ? <ActivityIndicator size="small" color={styles.icon.color} /> : <ChevronDown color={styles.icon.color} size={20} />}
          </TouchableOpacity>
        </FormItem>
        {/* MODIFIED: Conditional Service Type */}
        {ticketType !== 'جباية' && (
          <FormItem>
            <Select
              label="نوع الخدمة"
              placeholder="اختر نوع الخدمة"
              options={SERVICE_TYPES.map(s => ({ label: s, value: s }))}
              selectedValue={subscriber.serviceType}
              onValueChange={(val) => handleUpdate('serviceType', val)} />
          </FormItem>
        )}
        <FormItem style={{ marginBottom: 0 }}>
          <FormLabel>السعر (IQD)</FormLabel>
          <TextInput style={styles.input} placeholder="السعر" value={subscriber.price} onChangeText={(val) => handleUpdate('price', val)} keyboardType="numeric" placeholderTextColor={colors.placeholder} />
        </FormItem>
      </View>

      {/* ADDED: Zone Selection Modal */}
      <Modal animationType="slide" transparent={true} visible={isZoneModalVisible} onRequestClose={() => setZoneModalVisible(false)} statusBarTranslucent={true}>
        <View style={styles.modalContainer}>
          <Pressable style={styles.modalBackdrop} onPress={() => setZoneModalVisible(false)} />
          <View style={[styles.modalContent, { height: '70%' }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalGrabber} />
              <Text style={styles.modalTitle}>اختر المنطقة</Text>
              <Pressable style={styles.modalCloseButton} onPress={() => setZoneModalVisible(false)}><XCircle size={30} color={colors.subtleText} /></Pressable>
            </View>
            <View style={styles.searchBarContainer}>
              <TextInput style={styles.searchInput} placeholder="ابحث عن منطقة..." placeholderTextColor={colors.placeholder} value={zoneSearchQuery} onChangeText={setZoneSearchQuery} />
            </View>
            <FlatList
              data={filteredZones}
              keyExtractor={(item) => item.id}
              style={styles.modalBody}
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              renderItem={({ item }) => {
                const isSelected = subscriber.zoneNumber === item.name;
                return (
                  <Pressable style={styles.userSelectItem} onPress={() => {
                    handleUpdate('zoneNumber', item.name);
                    setZoneModalVisible(false);
                    setZoneSearchQuery("");
                  }}>
                    {isSelected ? (<CheckSquare size={24} color={colors.primary} />) : (<Square size={24} color={colors.border} />)}
                    <Text style={styles.userSelectName}>{item.name}</Text>
                  </Pressable>
                );
              }} />
          </View>
        </View>
      </Modal>

      {/* ADDED: Package Selection Modal */}
      <Modal animationType="slide" transparent={true} visible={isPackageModalVisible} onRequestClose={() => setPackageModalVisible(false)} statusBarTranslucent={true}>
        <View style={styles.modalContainer}>
          <Pressable style={styles.modalBackdrop} onPress={() => setPackageModalVisible(false)} />
          <View style={[styles.modalContent, { height: '70%' }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalGrabber} />
              <Text style={styles.modalTitle}>اختر نوع الباقة</Text>
              <Pressable style={styles.modalCloseButton} onPress={() => setPackageModalVisible(false)}><XCircle size={30} color={colors.subtleText} /></Pressable>
            </View>
            <View style={styles.searchBarContainer}>
              <TextInput style={styles.searchInput} placeholder="ابحث عن باقة..." placeholderTextColor={colors.placeholder} value={packageSearchQuery} onChangeText={setPackageSearchQuery} />
            </View>
            <FlatList
              data={filteredPackages}
              keyExtractor={(item) => item.name}
              style={styles.modalBody}
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              renderItem={({ item }) => {
                const isSelected = subscriber.packageType === item.name;
                return (
                  <Pressable style={styles.userSelectItem} onPress={() => {
                    handlePackageChange(item.name);
                    setPackageModalVisible(false);
                    setPackageSearchQuery("");
                  }}>
                    {isSelected ? (<CheckSquare size={24} color={colors.primary} />) : (<Square size={24} color={colors.border} />)}
                    <Text style={styles.userSelectName}>{item.name}</Text>
                  </Pressable>
                );
              }} />
          </View>
        </View>
      </Modal>
    </>
  );
});

SubscriberItem.displayName = 'SubscriberItem';


// --- MAIN FORM COMPONENT ---
export default function CreateServiceRequestForm({
  onSuccess,
  users,
  selectedUserIds,
  setSelectedUserIds
}: CreateServiceRequestFormProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { userName, realuserUid, currentUserTeamId } = usePermissions()
  const { theme: colors } = useTheme();
  const styles = getStyles(colors);

  const [subscribers, setSubscribers] = useState<Subscriber[]>([
    { id: uuidv4(), name: "", phone: "", zoneNumber: "", packageType: "", price: "", serviceType: "" }
  ]);
  const [zones, setZones] = useState<{ id: string; name: string }[]>([]);
  const [packageTypes, setPackageTypes] = useState<{ name: string; price: string }[]>([]);
  const [isLoadingPackageTypes, setIsLoadingPackageTypes] = useState(true);
  const [attachments, setAttachments] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [uploadProgress, setUploadProgress] = useState({
    progress: 0,
    totalFiles: 0,
    currentFile: 0,
    statusMessage: "",
  });
  const [isTypeModalVisible, setIsTypeModalVisible] = useState(false);

  // --- MODIFIED: UNIFIED ASSIGNMENT MODAL STATE ---
  type AssignmentOption = 'admin' | 'noc' | 'team' | 'specific_team';
  type AssignModalView = 'options' | 'assign_user' | 'assign_team' | 'confirm_admin' | 'confirm_noc';

  const [isAssignmentModalVisible, setIsAssignmentModalVisible] = useState(false);
  const [assignModalView, setAssignModalView] = useState<AssignModalView>('options');
  const [modalSearchQuery, setModalSearchQuery] = useState('');

  // Main form state for assignment
  const [assignmentOption, setAssignmentOption] = useState<AssignmentOption>('team');
  const [selectedTransferTeamId, setSelectedTransferTeamId] = useState<string | null>(null);

  // Temporary state for the modal
  const [tempAssignmentOption, setTempAssignmentOption] = useState<AssignmentOption>(assignmentOption);
  const [tempSelectedUserIds, setTempSelectedUserIds] = useState<string[]>(selectedUserIds);
  const [tempSelectedTransferTeamId, setTempSelectedTransferTeamId] = useState<string | null>(selectedTransferTeamId);

  const [allTeams, setAllTeams] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);

  useEffect(() => {
    const fetchPackageTypes = async () => {
      if (!currentUserTeamId) return;
      try {
        setIsLoadingPackageTypes(true);
        const q = query(collection(db, "invoice-settings"), where("teamId", "==", currentUserTeamId));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          setPackageTypes(data.packageTypes || []);
        }
      } catch (error) { console.error("Error fetching package types:", error); }
      finally { setIsLoadingPackageTypes(false); }
    };
    fetchPackageTypes();
  }, [currentUserTeamId]);

  useEffect(() => {
    const fetchZones = async () => {
      if (!currentUserTeamId) return;
      try {
        const q = query(collection(db, "zones"), where("teamId", "==", currentUserTeamId));
        const snapshot = await getDocs(q);
        const zonesData = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })) as { id: string, name: string }[];
        setZones(zonesData.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (error) { console.error("Error fetching zones:", error); }
    };
    fetchZones();
  }, [currentUserTeamId]);

  useEffect(() => {
    const fetchAllTeams = async () => {
      try {
        setIsLoadingTeams(true);
        const teamsSnapshot = await getDocs(collection(db, "teams"));
        const teamsData = teamsSnapshot.docs
          .map(doc => ({ id: doc.id, name: doc.data().name as string }))
          .filter(team => team.id !== currentUserTeamId); // Don't allow transfer to self
        setAllTeams(teamsData.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (error) { console.error("Error fetching teams:", error); }
      finally { setIsLoadingTeams(false); }
    };
    fetchAllTeams();
  }, [currentUserTeamId]);

  const { control, handleSubmit, formState: { errors }, watch, reset } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: "", customerPhone: "", customerEmail: "", title: "",
      description: "", type: "مشكلة", priority: "متوسطة",
    },
  });

  const ticketType = watch("type");
  const showCustomerInfo = ticketType !== "جباية" && !TICKET_TYPES_NO_CUSTOMER_INFO.includes(ticketType);

  // --- MODIFIED: ASSIGNMENT MODAL HANDLERS ---
  const handleOpenAssignmentModal = () => {
    setTempAssignmentOption(assignmentOption);
    setTempSelectedUserIds(selectedUserIds);
    setTempSelectedTransferTeamId(selectedTransferTeamId);
    setAssignModalView('options');
    setModalSearchQuery('');
    setIsAssignmentModalVisible(true);
  };

  const handleConfirmAssignment = () => {
    setAssignmentOption(tempAssignmentOption);
    setSelectedUserIds(tempSelectedUserIds);
    setSelectedTransferTeamId(tempSelectedTransferTeamId);
    setIsAssignmentModalVisible(false);
  };

  const handleCancelAssignment = () => {
    setIsAssignmentModalVisible(false);
    // Reset to initial view after a short delay to avoid UI flicker
    setTimeout(() => {
      setAssignModalView('options');
      setModalSearchQuery('');
    }, 300);
  };

  const handleToggleTempUserSelection = (userId: string) => {
    setTempSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectTempTeam = (teamId: string) => {
    setTempSelectedTransferTeamId(teamId);
  };

  const filteredUsersForModal = users.filter(user =>
    (user.name || user.email || '').toLowerCase().includes(modalSearchQuery.toLowerCase())
  );

  const filteredTeamsForModal = allTeams.filter(team =>
    team.name.toLowerCase().includes(modalSearchQuery.toLowerCase())
  );

  const getAssignmentSummary = () => {
    switch (assignmentOption) {
      case 'admin':
        return 'إلى قسم الإدارة (Administration)';
      case 'noc':
        return 'إلى قسم العمليات (Operation Center)';
      case 'specific_team':
        const teamName = allTeams.find(t => t.id === selectedTransferTeamId)?.name;
        return teamName ? `إلى فريق: ${teamName}` : 'يرجى اختيار فريق';
      case 'team':
      default:
        if (selectedUserIds.length > 0) {
          return `إلى ${selectedUserIds.length} مستخدمين محددين في فريقك`;
        }
        return 'إلى جميع أعضاء فريقك';
    }
  };

  const getModalTitle = () => {
    switch (assignModalView) {
      case 'assign_user': return 'تعيين إلى مستخدمين';
      case 'assign_team': return 'نقل إلى فريق';
      case 'confirm_admin': return 'تأكيد الإسناد للإدارة';
      case 'confirm_noc': return 'تأكيد الإسناد للعمليات';
      case 'options': default: return 'إسناد المهمة';
    }
  };

  const handleSelectFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: true });
      if (!result.canceled) {
        const newFiles = result.assets.filter((newFile) => !attachments.some((existingFile) => existingFile.uri === newFile.uri));
        setAttachments((prev) => [...prev, ...newFiles]);
      }
    } catch (err) { console.error("Error picking documents: ", err); }
  };

  const handleSelectMedia = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        alert('Sorry, we need camera roll permissions to make this work!');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, allowsMultipleSelection: true, quality: 1 });
      if (!result.canceled) {
        const newFiles = result.assets.map(asset => ({
          uri: asset.uri, name: asset.fileName || asset.uri.split('/').pop() || `image-${Date.now()}.jpg`,
          size: asset.fileSize || undefined, mimeType: asset.mimeType,
        })).filter((newFile) => !attachments.some((existingFile) => existingFile.uri === newFile.uri));
        setAttachments((prev) => [...prev, ...newFiles]);
      }
    } catch (err) { console.error("Error picking media: ", err); }
  };

  const handleRemoveAttachment = (uri: string) => { setAttachments((prev) => prev.filter((file) => file.uri !== uri)); };
  const getFileTypeCategory = (mimeType?: string): string => {
    if (!mimeType) return 'document';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    return 'document';
  };

  const handleAddTicket = async (values: FormValues) => {
    if (!realuserUid || !userName) {
      console.error("Authentication error: User UID or Name is missing.");
      return;
    }
    if (assignmentOption === 'specific_team' && !selectedTransferTeamId) {
      Alert.alert("خطأ", "يرجى اختيار فريق لنقل التذكرة إليه.");
      return;
    }
    const totalFiles = attachments.length;
    setIsSubmitting(true);
    setUploadProgress({
      progress: 0, totalFiles: totalFiles, currentFile: 0,
      statusMessage: totalFiles > 0 ? "Preparing to upload..." : "Creating ticket...",
    });

    try {
      const generateNumericId = () => Math.floor(10000000 + Math.random() * 90000000).toString();
      const ticketId = generateNumericId();
      const storage = getStorage();
      const uploadedAttachments: CommentAttachment[] = [];
      for (let i = 0; i < attachments.length; i++) {
        const fileAsset = attachments[i];
        const uploadedFileCount = i;
        const uniqueFileName = `${Date.now()}_${fileAsset.name}`;
        const storageRef = ref(storage, `tickets/${ticketId}/comment-attachments/${uniqueFileName}`);
        const response = await fetch(fileAsset.uri);
        const blob = await response.blob();
        const uploadTask = uploadBytesResumable(storageRef, blob);
        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const currentFileProgress = snapshot.bytesTransferred / snapshot.totalBytes;
              const overallProgress = (uploadedFileCount + currentFileProgress) / totalFiles;
              setUploadProgress(prev => ({
                ...prev, progress: overallProgress, currentFile: i + 1,
                statusMessage: `جاري رفع ${i + 1} من ${totalFiles}...`,
              }));
            },
            (error) => { console.error("فشل الرفع", fileAsset.name, error); reject(error); },
            async () => {
              const progressAfterCompletion = (uploadedFileCount + 1) / totalFiles;
              setUploadProgress(prev => ({ ...prev, progress: progressAfterCompletion }));
              const fileUrl = await getDownloadURL(uploadTask.snapshot.ref);
              uploadedAttachments.push({
                id: `attachment_${Date.now()}_${uuidv4().slice(0, 8)}`,
                fileUrl, fileName: fileAsset.name, fileType: getFileTypeCategory(fileAsset.mimeType), fileSize: fileAsset.size,
              });
              resolve();
            }
          );
        });
      }
      setUploadProgress(prev => ({ ...prev, progress: 1, statusMessage: "جاري انشاء التكت...", }));
      const timestamp = new Date().toISOString();
      const initialComment: Comment = {
        id: `comment_${Date.now()}`, userId: realuserUid, userName: userName,
        timestamp: timestamp, attachments: uploadedAttachments,
      };
      let department: string | null = null;
      let assignedUserList: string[] = [];
      let ticketTeamIds: string[] = [];
      const adminNocTeamId = 'rksVERdOIwdF4cDaioLb';
      if (assignmentOption === 'admin') {
        department = 'Administration';
        const ids = new Set<string>();
        if (currentUserTeamId) ids.add(currentUserTeamId);
        ids.add(adminNocTeamId);
        ticketTeamIds = Array.from(ids);
      } else if (assignmentOption === 'noc') {
        department = 'Operation Center';
        const ids = new Set<string>();
        if (currentUserTeamId) ids.add(currentUserTeamId);
        ids.add(adminNocTeamId);
        ticketTeamIds = Array.from(ids);
      } else if (assignmentOption === 'team') {
        if (currentUserTeamId) { ticketTeamIds = [currentUserTeamId]; }
        assignedUserList = selectedUserIds;
      } else if (assignmentOption === 'specific_team') {
        const ids = new Set<string>();
        if (currentUserTeamId) { ids.add(currentUserTeamId); }
        if (selectedTransferTeamId) { ids.add(selectedTransferTeamId); }
        ticketTeamIds = Array.from(ids);
      }
      const ticketData: any = {
        ...(showCustomerInfo && {
          customerName: values.customerName, customerPhone: values.customerPhone,
          customerEmail: values.customerEmail || "",
        }),
        title: values.title, description: values.description, type: values.type, status: "مفتوح",
        priority: values.priority, date: serverTimestamp(), createdAt: serverTimestamp(), lastUpdated: timestamp,
        assignedUsers: assignedUserList, creatorId: realuserUid, creatorName: userName, senttouser: false, deleted: false,
        comments: uploadedAttachments.length > 0 ? [initialComment] : [], teamId: ticketTeamIds
      };
      if (department) { ticketData.department = department; }
      if (values.type === "جباية") {
        ticketData.subscribers = subscribers.map(sub => ({
          subscriberId: sub.id, name: sub.name, phone: sub.phone, zoneNumber: sub.zoneNumber,
          packageType: sub.packageType, price: sub.price, serviceType: sub.serviceType, isPaid: false,
        }));
      }
      await setDoc(doc(db, "serviceRequests", ticketId), ticketData);
      reset();
      setSelectedUserIds([]);
      setSelectedTransferTeamId(null);
      setAssignmentOption('team');
      setSubscribers([{ id: uuidv4(), name: "", phone: "", zoneNumber: "", packageType: "", price: "", serviceType: "" }]);
      setAttachments([]);
      onSuccess();
      router.replace('/(tabs)');
    } catch (error) { console.error("Error adding ticket:", error); }
    finally { setIsSubmitting(false); }
  };

  const addSubscriber = useCallback(() => { setSubscribers(prev => [...prev, { id: uuidv4(), name: "", phone: "", zoneNumber: "", packageType: "", price: "", serviceType: "" }]); }, []);
  const removeSubscriber = useCallback((id: string) => { setSubscribers(prev => prev.length > 1 ? prev.filter(sub => sub.id !== id) : prev); }, []);
  const updateSubscriber = useCallback((id: string, field: keyof Subscriber, value: any) => { setSubscribers(prev => prev.map(sub => sub.id === id ? { ...sub, [field]: value } : sub)); }, []);

  return (
    <>
      <KeyboardAwareScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <Controller control={control} name="type" render={({ field: { onChange, value } }) => (
          <>
            <FormItem>
              <FormLabel>نوع التكت</FormLabel>
              <TouchableOpacity style={styles.selectTrigger} onPress={() => setIsTypeModalVisible(true)}>
                <Text style={[styles.selectValueText, !value && { color: colors.placeholder }]}>{value || "اختر النوع"}</Text>
                <ChevronDown color={styles.icon.color} size={20} />
              </TouchableOpacity>
              <FormMessage message={errors.type?.message} />
            </FormItem>
            <Modal animationType="slide" transparent={true} visible={isTypeModalVisible} onRequestClose={() => setIsTypeModalVisible(false)} statusBarTranslucent={true}>
              <View style={styles.modalContainer}>
                <Pressable style={styles.modalBackdrop} onPress={() => setIsTypeModalVisible(false)} />
                <View style={[styles.modalContent, { height: '70%' }]}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalGrabber} />
                    <Text style={styles.modalTitle}>اختر نوع التكت</Text>
                    <Pressable style={styles.modalCloseButton} onPress={() => setIsTypeModalVisible(false)}><XCircle size={30} color={colors.subtleText} /></Pressable>
                  </View>
                  <FlatList data={TICKET_TYPES} keyExtractor={(item) => item} style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}
                    renderItem={({ item }) => {
                      const isSelected = value === item;
                      return (
                        <Pressable style={styles.userSelectItem} onPress={() => { onChange(item); setIsTypeModalVisible(false); }}>
                          {isSelected ? (<CheckSquare size={24} color={colors.primary} />) : (<Square size={24} color={colors.border} />)}
                          <Text style={styles.userSelectName}>{item}</Text>
                        </Pressable>
                      );
                    }}
                  />
                </View>
              </View>
            </Modal>
          </>
        )}
        />

        {showCustomerInfo && (
          <View style={styles.card}>
            <Controller control={control} name="customerName" render={({ field }) => (<FormItem><FormLabel>اسم العميل</FormLabel><TextInput style={styles.input} placeholder="أدخل اسم العميل" value={field.value || ''} onChangeText={field.onChange} onBlur={field.onBlur} placeholderTextColor={colors.placeholder} returnKeyType="next" /><FormMessage message={errors.customerName?.message} /></FormItem>)} />
            <Controller control={control} name="customerPhone" render={({ field }) => (<FormItem><FormLabel>رقم الهاتف</FormLabel><TextInput style={styles.input} placeholder="رقم الهاتف" value={field.value || ''} onChangeText={field.onChange} onBlur={field.onBlur} keyboardType="phone-pad" placeholderTextColor={colors.placeholder} returnKeyType="next" /><FormMessage message={errors.customerPhone?.message} /></FormItem>)} />
            <Controller control={control} name="customerEmail" render={({ field }) => (<FormItem style={{ marginBottom: 0 }}><FormLabel>العنوان او رقم الزون</FormLabel><TextInput style={styles.input} placeholder="أدخل العنوان او رقم الزون" value={field.value || ''} onChangeText={field.onChange} onBlur={field.onBlur} placeholderTextColor={colors.placeholder} returnKeyType="next" /><FormMessage message={errors.customerEmail?.message} /></FormItem>)} />
          </View>
        )}

        <View style={styles.card}>
          <Controller control={control} name="title" render={({ field }) => (<FormItem><FormLabel>عنوان التكت</FormLabel><TextInput style={styles.input} placeholder="أدخل عنوان التكت" value={field.value || ''} onChangeText={field.onChange} onBlur={field.onBlur} placeholderTextColor={colors.placeholder} returnKeyType="next" /><FormMessage message={errors.title?.message} /></FormItem>)} />
          <Controller control={control} name="description" render={({ field }) => (<FormItem><FormLabel>وصف التكت</FormLabel><TextInput style={[styles.input, styles.textArea]} placeholder="أدخل تفاصيل التكت" value={field.value || ''} onChangeText={field.onChange} onBlur={field.onBlur} multiline placeholderTextColor={colors.placeholder} returnKeyType="default" /><FormMessage message={errors.description?.message} /></FormItem>)} />
          <View style={styles.attachmentSection}>
            <FormLabel>المرفقات</FormLabel>
            <View style={styles.attachmentList}>
              {attachments.map((file) => (
                <View key={file.uri} style={styles.attachmentItem}><Text style={styles.attachmentName} numberOfLines={1}>{file.name}</Text><TouchableOpacity onPress={() => handleRemoveAttachment(file.uri)}><Trash2 color={styles.errorMessage.color} size={18} /></TouchableOpacity></View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[styles.addButton, { flex: 1 }]} onPress={handleSelectFiles} disabled={isSubmitting}><Paperclip color={styles.addButtonText.color} size={18} /><Text style={styles.addButtonText}>إضافة ملف</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.addButton, { flex: 1 }]} onPress={handleSelectMedia} disabled={isSubmitting}><Image color={styles.addButtonText.color} size={18} /><Text style={styles.addButtonText}>إضافة صورة</Text></TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <FormLabel>إسناد المهمة إلى</FormLabel>
          <View style={styles.assignmentSummaryContainer}>
            <Text style={styles.assignmentSummaryText}>{getAssignmentSummary()}</Text>
          </View>
          <TouchableOpacity style={[styles.addButton, { marginTop: 12 }]} onPress={handleOpenAssignmentModal}>
            <Text style={styles.addButtonText}>تحديد جهة الإسناد</Text>
          </TouchableOpacity>
        </View>

        {/* MODIFIED: Passing ticketType prop */}
        {ticketType === "جباية" && (
          <View>
            <Text style={styles.sectionTitle}>معلومات المشتركين</Text>
            {subscribers.map((subscriber, index) => (
              <SubscriberItem
                key={subscriber.id}
                subscriber={subscriber}
                index={index}
                updateSubscriber={updateSubscriber}
                removeSubscriber={removeSubscriber}
                zones={zones}
                packageTypes={packageTypes}
                isLoadingPackageTypes={isLoadingPackageTypes}
                isOnlySubscriber={subscribers.length === 1}
                ticketType={ticketType}
              />
            ))}
            <TouchableOpacity style={styles.addButton} onPressIn={addSubscriber}><Plus color={styles.addButtonText.color} size={18} /><Text style={styles.addButtonText}>إضافة مشترك جديد</Text></TouchableOpacity>
          </View>
        )}

        {/* --- MODIFIED: ASSIGNMENT MODAL --- */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={isAssignmentModalVisible}
          onRequestClose={handleCancelAssignment}
          statusBarTranslucent={true}
        >
          <View style={styles.modalContainer}>
            <Pressable style={styles.modalBackdrop} onPress={handleCancelAssignment} />
            <View style={[styles.modalContent, { height: '85%' }]}>
              <View style={styles.modalHeader}>
                {assignModalView !== 'options' && (
                  <Pressable style={styles.modalBackButton} onPress={() => setAssignModalView('options')}>
                    <ArrowLeftCircle size={30} color={colors.subtleText} />
                  </Pressable>
                )}
                <View style={styles.modalGrabber} />
                <Text style={styles.modalTitle}>{getModalTitle()}</Text>
                <Pressable style={styles.modalCloseButton} onPress={handleCancelAssignment}>
                  <XCircle size={30} color={colors.subtleText} />
                </Pressable>
              </View>

              <View style={[styles.modalBody, { flex: 1 }]}>
                {assignModalView === 'options' && (
                  <ScrollView>
                    <View style={styles.modalOptionsContainer}>
                      <TouchableOpacity style={styles.mainOptionButton} onPress={() => { setTempAssignmentOption('team'); setAssignModalView('assign_user'); }}>
                        <UserPlus size={24} color={colors.primary} /><Text style={styles.mainOptionButtonText}>إسناد إلى مستخدم محدد بالفريق</Text><ChevronRight size={22} color={colors.subtleText} />
                      </TouchableOpacity>
                      {currentUserTeamId === 'rksVERdOIwdF4cDaioLb' &&
                        <TouchableOpacity style={styles.mainOptionButton} onPress={() => { setTempAssignmentOption('specific_team'); setAssignModalView('assign_team'); }}>
                          <Users size={24} color={colors.primary} /><Text style={styles.mainOptionButtonText}>نقل إلى فريق آخر</Text><ChevronRight size={22} color={colors.subtleText} />
                        </TouchableOpacity>
                      }
                      <TouchableOpacity style={styles.mainOptionButton} onPress={() => { setTempAssignmentOption('admin'); setAssignModalView('confirm_admin'); }}>
                        <ShieldCheck size={24} color={colors.primary} /><Text style={styles.mainOptionButtonText}>إسناد إلى قسم الإدارة</Text><ChevronRight size={22} color={colors.subtleText} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.mainOptionButton} onPress={() => { setTempAssignmentOption('noc'); setAssignModalView('confirm_noc'); }}>
                        <Network size={24} color={colors.primary} /><Text style={styles.mainOptionButtonText}>إسناد إلى قسم العمليات (FOC)</Text><ChevronRight size={22} color={colors.subtleText} />
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                )}

                {assignModalView === 'assign_user' && (
                  <>
                    <View style={styles.searchBarContainer}><TextInput style={styles.searchInput} placeholder="ابحث عن مستخدم..." placeholderTextColor={colors.placeholder} value={modalSearchQuery} onChangeText={setModalSearchQuery} /></View>
                    <FlatList data={filteredUsersForModal} keyExtractor={item => item.id} contentContainerStyle={{ paddingBottom: 20 }}
                      renderItem={({ item }) => {
                        const isSelected = tempSelectedUserIds.includes(item.id);
                        return (<Pressable style={styles.userSelectItem} onPress={() => handleToggleTempUserSelection(item.id)}>{isSelected ? <CheckSquare size={24} color={colors.primary} /> : <Square size={24} color={colors.border} />}<Text style={styles.userSelectName}>{item.name || item.email}</Text></Pressable>)
                      }} />
                  </>
                )}

                {assignModalView === 'assign_team' && (
                  <>
                    <View style={styles.searchBarContainer}><TextInput style={styles.searchInput} placeholder="ابحث عن فريق..." placeholderTextColor={colors.placeholder} value={modalSearchQuery} onChangeText={setModalSearchQuery} /></View>
                    <FlatList data={filteredTeamsForModal} keyExtractor={item => item.id} contentContainerStyle={{ paddingBottom: 20 }}
                      ListEmptyComponent={isLoadingTeams ? <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} /> : <Text style={styles.placeholderText}>لا توجد فرق متاحة</Text>}
                      renderItem={({ item }) => {
                        const isSelected = tempSelectedTransferTeamId === item.id;
                        return (<Pressable style={styles.userSelectItem} onPress={() => handleSelectTempTeam(item.id)}>{isSelected ? (<CheckCircle2 size={24} color={colors.primary} />) : (<Circle size={24} color={colors.border} />)}<Text style={styles.userSelectName}>{item.name}</Text></Pressable>);
                      }} />
                  </>
                )}

                {assignModalView === 'confirm_admin' && (
                  <View style={styles.confirmationView}>
                    <ShieldCheck size={60} color={colors.primary} />
                    <Text style={styles.confirmationText}>
                      سيتم إسناد هذه المهمة إلى قسم الإدارة.
                    </Text>
                    <Text style={styles.confirmationQuestion}>هل أنت متأكد من المتابعة؟</Text>
                  </View>
                )}

                {assignModalView === 'confirm_noc' && (
                  <View style={styles.confirmationView}>
                    <Network size={60} color={colors.primary} />
                    <Text style={styles.confirmationText}>
                      سيتم إسناد هذه المهمة إلى قسم العمليات (FOC).
                    </Text>
                    <Text style={styles.confirmationQuestion}>هل أنت متأكد من المتابعة؟</Text>
                  </View>
                )}
              </View>

              {/* --- MODIFICATION: FOOTER MOVED AND MODIFIED --- */}
              {assignModalView !== 'options' && (
                <View style={[styles.modalFooter, { paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }]}>
                  <TouchableOpacity style={styles.modalSaveButton} onPress={handleConfirmAssignment}>
                    <Text style={styles.modalButtonText}>حفظ التغيرات</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.secondaryButton} onPressIn={() => router.back()} disabled={isSubmitting}><Text style={styles.secondaryButtonText}>إلغاء</Text></TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPressIn={handleSubmit(handleAddTicket)} disabled={isSubmitting}><Text style={styles.primaryButtonText}>إنشاء</Text></TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>

      <Modal transparent={true} visible={isSubmitting} animationType="fade">
        <View style={styles.progressOverlay}><View style={styles.progressContainer}><Text style={styles.progressTitle}>جاري إنشاء التذكرة</Text><ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} /><Text style={styles.progressStatusText} numberOfLines={1}>{uploadProgress.statusMessage}</Text><View style={styles.progressBarBackground}><View style={[styles.progressBarFill, { width: `${uploadProgress.progress * 100}%` }]} /></View><Text style={styles.progressPercentageText}>{`${Math.round(uploadProgress.progress * 100)}%`}</Text></View></View>
      </Modal>
    </>
  );
}

// --- Styles (Unchanged) ---
const getStyles = (colors: any) => {
  const isLikelyDarkMode = (() => { return false; })();
  const visibleErrorColor = isLikelyDarkMode ? '#F87171' : '#DC2626';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    contentContainer: { padding: 16, paddingBottom: 48 },
    card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: colors.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 3 },
    formItem: { marginBottom: 20 },
    label: { fontSize: 16, fontFamily: FONT_FAMILY, fontWeight: '600', color: colors.text, marginBottom: 8, textAlign: 'right' },
    input: { backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: FONT_FAMILY, color: colors.text, textAlign: 'right' },
    disabledInput: { backgroundColor: colors.background, opacity: 0.7 },
    textArea: { minHeight: 120, textAlignVertical: 'top', paddingTop: 12 },
    errorMessage: { color: visibleErrorColor, fontSize: 14, fontFamily: FONT_FAMILY, marginTop: 6, textAlign: 'right' },
    selectTrigger: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14 },
    selectValueText: { fontSize: 16, fontFamily: FONT_FAMILY, color: colors.text },
    icon: { color: colors.subtleText },
    placeholderText: { color: colors.placeholder, fontSize: 14, fontFamily: FONT_FAMILY, textAlign: 'right', paddingVertical: 4 },
    selectModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    selectModalContent: { backgroundColor: colors.card, borderRadius: 14, width: '95%', maxHeight: '70%', padding: 10, elevation: 10, shadowColor: colors.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
    selectItem: { paddingVertical: 16, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.background },
    selectItemText: { fontSize: 17, fontFamily: FONT_FAMILY, textAlign: 'right', color: colors.text },

    // --- MODAL STYLES (MERGED AND ENHANCED) ---
    modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject },
    modalContent: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 20 },
    modalHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
    modalGrabber: { position: 'absolute', top: 8, width: 50, height: 5, backgroundColor: colors.border, borderRadius: 2.5, alignSelf: 'center' },
    modalTitle: { fontSize: 20, fontFamily: FONT_FAMILY, fontWeight: '700', color: colors.text, marginTop: 10, textAlign: 'center' },
    modalCloseButton: { position: 'absolute', left: 16, top: 12, padding: 5 }, // Positioned left for RTL back on right
    modalBackButton: { position: 'absolute', right: 16, top: 12, padding: 5 }, // Positioned right for RTL
    searchBarContainer: { paddingHorizontal: 16, paddingVertical: 10 },
    searchInput: { backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: FONT_FAMILY, color: colors.text, textAlign: 'right' },
    modalBody: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },
    userSelectItem: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
    userSelectName: { fontSize: 17, fontFamily: FONT_FAMILY, color: colors.text, marginRight: 15 },
    // --- MODIFICATION: REMOVED HARDCODED PADDINGBOTTOM ---
    modalFooter: { padding: 16, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
    modalSaveButton: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    modalButtonText: { color: '#FFFFFF', fontSize: 16, fontFamily: FONT_FAMILY, fontWeight: '700' },

    // --- MODIFIED: ASSIGNMENT STYLES ---
    assignmentSummaryContainer: { backgroundColor: colors.inputBackground, borderRadius: 10, padding: 14, marginTop: 8, borderWidth: 1, borderColor: colors.border, },
    assignmentSummaryText: { fontSize: 16, fontFamily: FONT_FAMILY, color: colors.text, textAlign: 'right', },
    modalOptionsContainer: { flexDirection: 'column', gap: 12, paddingVertical: 10 },
    mainOptionButton: { flexDirection: 'row-reverse', alignItems: 'center', padding: 16, backgroundColor: colors.inputBackground, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, gap: 12, },
    mainOptionButtonText: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'right', fontFamily: FONT_FAMILY, },
    confirmationView: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 20, minHeight: 300 },
    confirmationText: { fontSize: 16, color: colors.subtleText, textAlign: 'center', lineHeight: 24, fontFamily: FONT_FAMILY, },
    confirmationQuestion: { fontSize: 18, fontWeight: 'bold', color: colors.text, textAlign: 'center', fontFamily: FONT_FAMILY, },

    sectionTitle: { fontSize: 20, fontFamily: FONT_FAMILY, fontWeight: '700', color: colors.text, marginBottom: 12, textAlign: 'right' },
    subscriberCard: { borderColor: colors.primary, borderWidth: 1, padding: 16, marginBottom: 16, backgroundColor: colors.blueTint },
    subscriberHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    subscriberTitle: { fontSize: 18, fontFamily: FONT_FAMILY, fontWeight: '600', color: colors.text },
    removeButton: { padding: 6, borderRadius: 20, backgroundColor: colors.redTint },
    removeButtonIcon: { color: visibleErrorColor },
    addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, paddingVertical: 12, borderRadius: 10, marginTop: 8, borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed' },
    addButtonText: { color: colors.primary, fontSize: 16, fontFamily: FONT_FAMILY, fontWeight: '600', marginStart: 8 },
    buttonContainer: { flexDirection: 'row', marginTop: 24, gap: 12 },
    primaryButton: { flex: 1, backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontFamily: FONT_FAMILY, fontWeight: '700' },
    secondaryButton: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    secondaryButtonText: { color: colors.text, fontSize: 16, fontFamily: FONT_FAMILY, fontWeight: '700' },
    attachmentSection: { marginTop: 0, marginBottom: 0, },
    attachmentList: { marginTop: 8, marginBottom: 12, flexDirection: 'column', gap: 8, },
    attachmentItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.background, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, },
    attachmentName: { flex: 1, fontSize: 14, fontFamily: FONT_FAMILY, color: colors.text, textAlign: 'left', marginRight: 10, },

    progressOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32, },
    progressContainer: { backgroundColor: colors.card, borderRadius: 14, padding: 24, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 10, },
    progressTitle: { fontSize: 20, fontFamily: FONT_FAMILY, fontWeight: '700', color: colors.text, marginBottom: 8, },
    progressStatusText: { fontSize: 14, fontFamily: FONT_FAMILY, color: colors.subtleText, marginBottom: 16, textAlign: 'center', minHeight: 20, },
    progressBarBackground: { width: '100%', height: 10, backgroundColor: colors.inputBackground, borderRadius: 5, overflow: 'hidden', marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    progressBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 5, },
    progressPercentageText: { fontSize: 14, fontFamily: FONT_FAMILY, fontWeight: '600', color: colors.text, },
  });
};