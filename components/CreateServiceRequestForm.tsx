import { usePermissions } from "@/context/PermissionsContext";
import { zodResolver } from "@hookform/resolvers/zod";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { collection, doc, getDocs, query, serverTimestamp, setDoc, Timestamp, where } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytesResumable } from "firebase/storage";
import { CheckSquare, ChevronDown, Paperclip, Plus, Square, Trash2, X, XCircle } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
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
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { useTheme } from "../context/ThemeContext";
import { db } from "../lib/firebase"; // Make sure your firebase config path is correct
import { User } from "../lib/types"; // Make sure your types path is correct

// --- INTERFACES (As per your request) ---
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

// --- MODIFIED: Added constant for types that don't need customer info ---
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
  // --- MODIFIED: Updated validation logic ---
  // Customer info is required for all types EXCEPT "جباية" and the ones in our list.
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

const SubscriberItem = React.memo(({
  subscriber,
  index,
  updateSubscriber,
  removeSubscriber,
  zones,
  packageTypes,
  isLoadingPackageTypes,
  isOnlySubscriber
}: {
  subscriber: Subscriber;
  index: number;
  updateSubscriber: (id: string, field: keyof Subscriber, value: any) => void;
  removeSubscriber: (id: string) => void;
  zones: { id: string; name: string }[];
  packageTypes: { name: string; price: string }[];
  isLoadingPackageTypes: boolean;
  isOnlySubscriber: boolean;
}) => {
  const { theme: colors } = useTheme();
  const styles = getStyles(colors);

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

  return (
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
      <FormItem>
        <Select label="منطقة المشترك" placeholder="اختر المنطقة" options={zones.map(z => ({ label: z.name, value: z.name }))} selectedValue={subscriber.zoneNumber} onValueChange={(val) => handleUpdate('zoneNumber', val)} isLoading={zones.length === 0} />
      </FormItem>
      <FormItem>
        <Select label="نوع الباقة" placeholder="اختر نوع الباقة" options={packageTypes.map(p => ({ label: p.name, value: p.name }))} selectedValue={subscriber.packageType} onValueChange={handlePackageChange} isLoading={isLoadingPackageTypes} />
      </FormItem>
      <FormItem>
        <Select label="نوع الخدمة" placeholder="اختر نوع الخدمة" options={SERVICE_TYPES.map(s => ({ label: s, value: s }))} selectedValue={subscriber.serviceType} onValueChange={(val) => handleUpdate('serviceType', val)} />
      </FormItem>
      <FormItem style={{ marginBottom: 0 }}>
        <FormLabel>السعر (IQD)</FormLabel>
        <TextInput style={styles.input} placeholder="السعر" value={subscriber.price} onChangeText={(val) => handleUpdate('price', val)} keyboardType="numeric" placeholderTextColor={colors.placeholder} />
      </FormItem>
    </View>
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

  const [isAssignModalVisible, setIsAssignModalVisible] = useState(false);
  const [tempSelectedUsers, setTempSelectedUsers] = useState<string[]>([]);
  const [assignSearchQuery, setAssignSearchQuery] = useState('');

  // MODIFIED: State for the new ticket type modal
  const [isTypeModalVisible, setIsTypeModalVisible] = useState(false);


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


  const { control, handleSubmit, formState: { errors }, watch, reset } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      title: "",
      description: "",
      type: "مشكلة",
      priority: "متوسطة",
    },
  });

  const ticketType = watch("type");

  const showCustomerInfo = ticketType !== "جباية" && !TICKET_TYPES_NO_CUSTOMER_INFO.includes(ticketType);

  const handleOpenAssignModal = () => {
    setTempSelectedUsers(selectedUserIds);
    setAssignSearchQuery('');
    setIsAssignModalVisible(true);
  };

  const handleConfirmAssignment = () => {
    setSelectedUserIds(tempSelectedUsers);
    setIsAssignModalVisible(false);
  };

  const handleToggleUserSelection = (userId: string) => {
    setTempSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const filteredUsersForModal = users.filter(user =>
    (user.name || user.email || '').toLowerCase().includes(assignSearchQuery.toLowerCase())
  );


  const handleSelectFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        const newFiles = result.assets.filter(
          (newFile) => !attachments.some((existingFile) => existingFile.uri === newFile.uri)
        );
        setAttachments((prev) => [...prev, ...newFiles]);
      }
    } catch (err) {
      console.error("Error picking documents: ", err);
    }
  };

  const handleRemoveAttachment = (uri: string) => {
    setAttachments((prev) => prev.filter((file) => file.uri !== uri));
  };

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
    setIsSubmitting(true);

    try {
      const generateNumericId = () => Math.floor(10000000 + Math.random() * 90000000).toString();
      const ticketId = generateNumericId();
      const storage = getStorage();

      const uploadedAttachments: CommentAttachment[] = await Promise.all(
        attachments.map(async (fileAsset) => {
          const uniqueFileName = `${Date.now()}_${fileAsset.name}`;
          const storageRef = ref(storage, `tickets/${ticketId}/comment-attachments/${uniqueFileName}`);
          const response = await fetch(fileAsset.uri);
          const blob = await response.blob();

          await uploadBytesResumable(storageRef, blob);
          const fileUrl = await getDownloadURL(storageRef);

          return {
            id: `attachment_${Date.now()}_${uuidv4().slice(0, 8)}`,
            fileUrl: fileUrl,
            fileName: fileAsset.name,
            fileType: getFileTypeCategory(fileAsset.mimeType),
            fileSize: fileAsset.size,
          };
        })
      );

      const timestamp = new Date().toISOString();
      const initialComment: Comment = {
        id: `comment_${Date.now()}`,
        userId: realuserUid,
        userName: userName,
        content: values.description,
        timestamp: timestamp,
        attachments: uploadedAttachments,
      };

      const ticketData: any = {
        ...(showCustomerInfo && {
          customerName: values.customerName,
          customerPhone: values.customerPhone,
          customerEmail: values.customerEmail || "",
        }),
        title: values.title,
        description: values.description,
        type: values.type,
        status: "مفتوح",
        priority: values.priority,
        date: serverTimestamp(),
        createdAt: serverTimestamp(),
        lastUpdated: timestamp,
        assignedUsers: selectedUserIds,
        creatorId: realuserUid,
        creatorName: userName,
        senttouser: false,
        deleted: false,
        comments: [initialComment],
        teamId: currentUserTeamId
      };

      if (values.type === "جباية") {
        ticketData.subscribers = subscribers.map(sub => ({
          subscriberId: sub.id, name: sub.name, phone: sub.phone,
          zoneNumber: sub.zoneNumber, packageType: sub.packageType,
          price: sub.price, serviceType: sub.serviceType, isPaid: false,
        }));
      }

      await setDoc(doc(db, "serviceRequests", ticketId), ticketData);

      reset();
      setSelectedUserIds([]);
      setSubscribers([{ id: uuidv4(), name: "", phone: "", zoneNumber: "", packageType: "", price: "", serviceType: "" }]);
      setAttachments([]);
      router.push('/(tabs)/my-requests');
      onSuccess();

    } catch (error) {
      console.error("Error adding ticket:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addSubscriber = useCallback(() => {
    setSubscribers(prev => [...prev, { id: uuidv4(), name: "", phone: "", zoneNumber: "", packageType: "", price: "", serviceType: "" }]);
  }, []);

  const removeSubscriber = useCallback((id: string) => {
    setSubscribers(prev => prev.length > 1 ? prev.filter(sub => sub.id !== id) : prev);
  }, []);

  const updateSubscriber = useCallback((id: string, field: keyof Subscriber, value: any) => {
    setSubscribers(prev => prev.map(sub =>
      sub.id === id ? { ...sub, [field]: value } : sub
    ));
  }, []);

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      {/* MODIFIED: Replaced generic Select with custom modal trigger */}
      <Controller
        control={control}
        name="type"
        render={({ field: { onChange, value } }) => (
          <>
            <FormItem>
              <FormLabel>نوع التكت</FormLabel>
              <TouchableOpacity
                style={styles.selectTrigger}
                onPress={() => setIsTypeModalVisible(true)}
              >
                <Text style={[styles.selectValueText, !value && { color: colors.placeholder }]}>
                  {value || "اختر النوع"}
                </Text>
                <ChevronDown color={styles.icon.color} size={20} />
              </TouchableOpacity>
              <FormMessage message={errors.type?.message} />
            </FormItem>

            {/* MODIFIED: New bottom sheet modal for Ticket Type selection */}
            <Modal
              animationType="slide"
              transparent={true}
              visible={isTypeModalVisible}
              onRequestClose={() => setIsTypeModalVisible(false)}
              statusBarTranslucent={true}
            >
              <View style={styles.modalContainer}>
                <Pressable style={styles.modalBackdrop} onPress={() => setIsTypeModalVisible(false)} />
                <View style={[styles.modalContent, { height: '70%' }]}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalGrabber} />
                    <Text style={styles.modalTitle}>اختر نوع التكت</Text>
                    <Pressable style={styles.modalCloseButton} onPress={() => setIsTypeModalVisible(false)}>
                      <XCircle size={30} color={colors.subtleText} />
                    </Pressable>
                  </View>

                  <FlatList
                    data={TICKET_TYPES}
                    keyExtractor={(item) => item}
                    style={styles.modalBody}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    renderItem={({ item }) => {
                      const isSelected = value === item;
                      return (
                        <Pressable
                          style={styles.userSelectItem}
                          onPress={() => {
                            onChange(item);
                            setIsTypeModalVisible(false);
                          }}
                        >
                          {isSelected ? (
                            <CheckSquare size={24} color={colors.primary} />
                          ) : (
                            <Square size={24} color={colors.border} />
                          )}
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
          <Controller control={control} name="customerName" render={({ field }) => (
            <FormItem><FormLabel>اسم العميل</FormLabel><TextInput style={styles.input} placeholder="أدخل اسم العميل" value={field.value || ''} onChangeText={field.onChange} onBlur={field.onBlur} placeholderTextColor={colors.placeholder} returnKeyType="next" /><FormMessage message={errors.customerName?.message} /></FormItem>
          )} />
          <Controller control={control} name="customerPhone" render={({ field }) => (
            <FormItem><FormLabel>رقم الهاتف</FormLabel><TextInput style={styles.input} placeholder="رقم الهاتف" value={field.value || ''} onChangeText={field.onChange} onBlur={field.onBlur} keyboardType="phone-pad" placeholderTextColor={colors.placeholder} returnKeyType="next" /><FormMessage message={errors.customerPhone?.message} /></FormItem>
          )} />
          <Controller control={control} name="customerEmail" render={({ field }) => (
            <FormItem style={{ marginBottom: 0 }}><FormLabel>العنوان او رقم الزون</FormLabel><TextInput style={styles.input} placeholder="أدخل العنوان او رقم الزون" value={field.value || ''} onChangeText={field.onChange} onBlur={field.onBlur} placeholderTextColor={colors.placeholder} returnKeyType="next" /><FormMessage message={errors.customerEmail?.message} /></FormItem>
          )} />
        </View>
      )}

      <View style={styles.card}>
        <Controller control={control} name="title" render={({ field }) => (
          <FormItem><FormLabel>عنوان التكت</FormLabel><TextInput style={styles.input} placeholder="أدخل عنوان التكت" value={field.value || ''} onChangeText={field.onChange} onBlur={field.onBlur} placeholderTextColor={colors.placeholder} returnKeyType="next" /><FormMessage message={errors.title?.message} /></FormItem>
        )} />
        <Controller control={control} name="description" render={({ field }) => (
          <FormItem><FormLabel>وصف التكت</FormLabel><TextInput style={[styles.input, styles.textArea]} placeholder="أدخل تفاصيل التكت" value={field.value || ''} onChangeText={field.onChange} onBlur={field.onBlur} multiline placeholderTextColor={colors.placeholder} returnKeyType="default" /><FormMessage message={errors.description?.message} /></FormItem>
        )} />

        <View style={styles.attachmentSection}>
          <FormLabel>المرفقات</FormLabel>
          <View style={styles.attachmentList}>
            {attachments.map((file) => (
              <View key={file.uri} style={styles.attachmentItem}>
                <Text style={styles.attachmentName} numberOfLines={1}>{file.name}</Text>
                <TouchableOpacity onPress={() => handleRemoveAttachment(file.uri)}>
                  <Trash2 color={styles.errorMessage.color} size={18} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.addButton} onPress={handleSelectFiles} disabled={isSubmitting}>
            <Paperclip color={styles.addButtonText.color} size={18} />
            <Text style={styles.addButtonText}>إضافة ملف</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <FormItem style={{ marginBottom: 0 }}>
          <FormLabel>تعيين إلى</FormLabel>
          <View style={styles.badgeContainer}>
            {selectedUserIds.length > 0 ? selectedUserIds.map(userId => {
              const user = users.find(u => u.id === userId);
              return user ? (
                <View key={userId} style={styles.badge}>
                  <Text style={styles.badgeText}>{user.name}</Text>
                  <TouchableOpacity onPressIn={() => setSelectedUserIds(prev => prev.filter(id => id !== userId))}>
                    <X color={styles.badgeIcon.color} size={14} />
                  </TouchableOpacity>
                </View>
              ) : null;
            }) : (
              <Text style={styles.placeholderText}>لم يتم تعيين أي مستخدم</Text>
            )}
          </View>
          <TouchableOpacity style={[styles.addButton, { marginTop: 8 }]} onPress={handleOpenAssignModal}>
            <Text style={styles.addButtonText}>أضف أو أزل مستخدمين</Text>
          </TouchableOpacity>
        </FormItem>
      </View>


      {ticketType === "جباية" && (
        <View>
          <Text style={styles.sectionTitle}>معلومات المشتركين</Text>
          {subscribers.map((subscriber, index) => (
            <SubscriberItem key={subscriber.id} subscriber={subscriber} index={index} updateSubscriber={updateSubscriber} removeSubscriber={removeSubscriber} zones={zones} packageTypes={packageTypes} isLoadingPackageTypes={isLoadingPackageTypes} isOnlySubscriber={subscribers.length === 1} />
          ))}
          <TouchableOpacity style={styles.addButton} onPressIn={addSubscriber}>
            <Plus color={styles.addButtonText.color} size={18} />
            <Text style={styles.addButtonText}>إضافة مشترك جديد</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* --- Assign Users Modal --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isAssignModalVisible}
        onRequestClose={() => setIsAssignModalVisible(false)}
        statusBarTranslucent={true}
      >
        <View style={styles.modalContainer}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsAssignModalVisible(false)} />
          <View style={[styles.modalContent, { height: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalGrabber} />
              <Text style={styles.modalTitle}>تعيين المهمة</Text>
              <Pressable style={styles.modalCloseButton} onPress={() => setIsAssignModalVisible(false)}>
                <XCircle size={30} color={colors.subtleText} />
              </Pressable>
            </View>

            <View style={styles.searchBarContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="ابحث عن مستخدم..."
                placeholderTextColor={colors.placeholder}
                value={assignSearchQuery}
                onChangeText={setAssignSearchQuery}
              />
            </View>

            <FlatList
              data={filteredUsersForModal}
              keyExtractor={item => item.id}
              style={styles.modalBody}
              contentContainerStyle={{ paddingBottom: 100 }}
              renderItem={({ item }) => {
                const isSelected = tempSelectedUsers.includes(item.id);
                return (
                  <Pressable style={styles.userSelectItem} onPress={() => handleToggleUserSelection(item.id)}>
                    {isSelected ? <CheckSquare size={24} color={colors.primary} /> : <Square size={24} color={colors.primary} />}
                    <Text style={styles.userSelectName}>{item.name || item.email}</Text>
                  </Pressable>
                )
              }}
            />
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalSaveButton} onPress={handleConfirmAssignment}>
                <Text style={styles.modalButtonText}>حفظ التغييرات</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.secondaryButton} onPressIn={() => router.back()} disabled={isSubmitting}>
          <Text style={styles.secondaryButtonText}>إلغاء</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPressIn={handleSubmit(handleAddTicket)} disabled={isSubmitting}>
          {isSubmitting ? <ActivityIndicator color={"#FFFFFF"} /> : <Text style={styles.primaryButtonText}>إنشاء</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAwareScrollView>
  );
}

// --- Styles (Unchanged) ---
const getStyles = (colors: any) => {
  const isLikelyDarkMode = (() => {
    // ... (unchanged)
    return false;
  })();

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

    // --- Select Dropdown Modal ---
    selectModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    selectModalContent: { backgroundColor: colors.card, borderRadius: 14, width: '95%', maxHeight: '70%', padding: 10, elevation: 10, shadowColor: colors.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
    selectItem: { paddingVertical: 16, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.background },
    selectItemText: { fontSize: 17, fontFamily: FONT_FAMILY, textAlign: 'right', color: colors.text },

    // --- Assign User Modal (Bottom Sheet) Styles ---
    modalContainer: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    modalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.1,
      shadowRadius: 5,
      elevation: 20,
    },
    modalHeader: {
      alignItems: 'center',
      paddingBottom: 16,
      paddingHorizontal: 20,
      position: 'relative',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalGrabber: {
      width: 40,
      height: 5,
      backgroundColor: colors.border,
      borderRadius: 2.5,
      marginBottom: 10,
    },
    modalTitle: {
      fontSize: 20,
      fontFamily: FONT_FAMILY,
      fontWeight: '700',
      color: colors.text,
    },
    modalCloseButton: {
      position: 'absolute',
      right: 15,
      top: 0,
      padding: 5,
    },
    searchBarContainer: {
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    searchInput: {
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      fontFamily: FONT_FAMILY,
      color: colors.text,
      textAlign: 'right',
    },
    modalBody: {},
    userSelectItem: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      paddingVertical: 15,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    userSelectName: {
      fontSize: 17,
      fontFamily: FONT_FAMILY,
      color: colors.text,
      marginRight: 15,
    },
    modalFooter: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 16,
      paddingBottom: Platform.OS === 'ios' ? 34 : 16, // Safe area for iOS
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    modalSaveButton: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontFamily: FONT_FAMILY,
      fontWeight: '700',
    },
    // --- End New Modal Styles ---

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

    badgeContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 8,
      justifyContent: 'flex-end'
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.border,
      borderRadius: 16,
      paddingVertical: 6,
      paddingHorizontal: 12,
      margin: 4,
    },
    badgeText: {
      fontSize: 14,
      fontFamily: FONT_FAMILY,
      color: colors.text,
      marginEnd: 8,
    },
    badgeIcon: {
      color: colors.text,
    },
  });
};