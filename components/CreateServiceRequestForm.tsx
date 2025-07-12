import { usePermissions } from "@/context/PermissionsContext";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { ChevronDown, Plus, X } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
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
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { useTheme } from "../context/ThemeContext";
import { db } from "../lib/firebase"; // Make sure your firebase config path is correct
import { User } from "../lib/types"; // Make sure your types path is correct

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
    if (data.type !== "جباية") { // Changed to match new value
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

// --- INTERFACES (Unchanged) ---
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


// --- CONSTANTS & HELPERS ---
const FONT_FAMILY = 'Cairo';

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
                    <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                        
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

// --- SUBSCRIBER ITEM COMPONENT ---
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
    console.log('Found package:', selectedPackage);
    
    if (selectedPackage) {
        updateSubscriber(subscriber.id, 'packageType', packageName);
        // Convert number to string for TextInput
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
                <TextInput
                    style={styles.input}
                    placeholder="أدخل اسم المشترك"
                    value={subscriber.name}
                    onChangeText={(val) => handleUpdate('name', val)}
                    placeholderTextColor={colors.placeholder}
                    keyboardType="default"
                    returnKeyType="next"
                    blurOnSubmit={false}
                />
            </FormItem>
            <FormItem>
                <FormLabel>رقم هاتف المشترك</FormLabel>
                <TextInput
                    style={styles.input}
                    placeholder="أدخل رقم الهاتف"
                    value={subscriber.phone}
                    onChangeText={(val) => handleUpdate('phone', val)}
                    keyboardType="phone-pad"
                    placeholderTextColor={colors.placeholder}
                    returnKeyType="next"
                    blurOnSubmit={false}
                />
            </FormItem>
            <FormItem>
                <Select
                    label="منطقة المشترك"
                    placeholder="اختر المنطقة"
                    options={zones.map(z => ({ label: z.name, value: z.name }))}
                    selectedValue={subscriber.zoneNumber}
                    onValueChange={(val) => handleUpdate('zoneNumber', val)}
                    isLoading={zones.length === 0}
                />
            </FormItem>
            <FormItem>
                <Select
                    label="نوع الباقة"
                    placeholder="اختر نوع الباقة"
                    options={packageTypes.map(p => ({ label: p.name, value: p.name }))}
                    selectedValue={subscriber.packageType}
                    onValueChange={handlePackageChange}
                    isLoading={isLoadingPackageTypes}
                />
            </FormItem>
            <FormItem>
                <Select
                    label="نوع الخدمة"
                    placeholder="اختر نوع الخدمة"
                    options={SERVICE_TYPES.map(s => ({ label: s, value: s }))}
                    selectedValue={subscriber.serviceType}
                    onValueChange={(val) => handleUpdate('serviceType', val)}
                />
            </FormItem>
            <FormItem style={{ marginBottom: 0 }}>
                <FormLabel>السعر (IQD)</FormLabel>
                <TextInput
                    style={styles.input}
                    placeholder="السعر"
                    value={subscriber.price}
                    onChangeText={(val) => handleUpdate('price', val)}
                    keyboardType="numeric"
                    placeholderTextColor={colors.placeholder}
                    returnKeyType="done"
                    blurOnSubmit={false}
                />
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

const handleAddTicket = async (values: FormValues) => {
  if (!realuserUid) return;
  setIsSubmitting(true);
  
  try {
    // Generate 8-digit numeric ID
    const generateNumericId = () => {
      return Math.floor(10000000 + Math.random() * 90000000).toString();
    };
    
    const ticketId = generateNumericId();
    
    const ticketData: any = {
      customerName: values.customerName,
      customerEmail: values.customerEmail || "",
      customerPhone: values.customerPhone,
      title: values.title,
      description: values.description,
      type: values.type,
      status: "مفتوح",
      priority: values.priority,
      date: serverTimestamp(),
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
      assignedUsers: selectedUserIds,
      creatorId: realuserUid,
      creatorName: userName || "",
      senttouser: false,
    };

    if (values.type === "جباية") { // Matched to new value
      ticketData.subscribers = subscribers.map(sub => ({
        subscriberId: sub.id,
        name: sub.name,
        phone: sub.phone,
        zoneNumber: sub.zoneNumber,
        packageType: sub.packageType,
        price: sub.price,
        serviceType: sub.serviceType,
        isPaid: false,
      }));
    }

    // Use doc() with custom ID instead of addDoc()
    await setDoc(doc(db, "serviceRequests", ticketId), ticketData);
    
    reset();
    setSelectedUserIds([]);
    setSubscribers([{ id: uuidv4(), name: "", phone: "", zoneNumber: "", packageType: "", price: "", serviceType: "" }]);
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
        <Controller
            control={control}
            name="type"
            render={({ field }) => (
                <FormItem>
                    <Select
                        label="نوع التكت"
                        placeholder="اختر النوع"
                        options={TICKET_TYPES.map(t => ({ label: t, value: t }))}
                        selectedValue={field.value}
                        onValueChange={field.onChange}
                    />
                    <FormMessage message={errors.type?.message} />
                </FormItem>
            )}
        />
         {ticketType !== "جباية" && (
            <View style={styles.card}>
                <Controller control={control} name="customerName" render={({ field }) => (
                    <FormItem>
                        <FormLabel>اسم العميل</FormLabel>
                        <TextInput 
                          style={styles.input} 
                          placeholder="أدخل اسم العميل" 
                          value={field.value || ''} 
                          onChangeText={field.onChange} 
                          onBlur={field.onBlur}
                          placeholderTextColor={colors.placeholder}
                          keyboardType="default"
                          returnKeyType="next"
                        />
                        <FormMessage message={errors.customerName?.message} />
                    </FormItem>
                )} />
                <Controller control={control} name="customerPhone" render={({ field }) => (
                    <FormItem>
                        <FormLabel>رقم الهاتف</FormLabel>
                        <TextInput 
                          style={styles.input} 
                          placeholder="رقم الهاتف" 
                          value={field.value || ''} 
                          onChangeText={field.onChange} 
                          onBlur={field.onBlur}
                          keyboardType="phone-pad"
                          placeholderTextColor={colors.placeholder}
                          returnKeyType="next"
                        />
                        <FormMessage message={errors.customerPhone?.message} />
                    </FormItem>
                )} />
                <Controller control={control} name="customerEmail" render={({ field }) => (
                    <FormItem style={{ marginBottom: 0 }}>
                        <FormLabel>العنوان او رقم الزون</FormLabel>
                        <TextInput 
                          style={styles.input} 
                          placeholder="أدخل العنوان او رقم الزون" 
                          value={field.value || ''} 
                          onChangeText={field.onChange} 
                          onBlur={field.onBlur}
                          placeholderTextColor={colors.placeholder}
                          returnKeyType="next"
                        />
                        <FormMessage message={errors.customerEmail?.message} />
                    </FormItem>
                )} />
            </View>
        )}
        <View style={styles.card}>
          
            <Controller control={control} name="title" render={({ field }) => (
                <FormItem>
                    <FormLabel>عنوان التكت</FormLabel>
                    <TextInput 
                      style={styles.input} 
                      placeholder="أدخل عنوان التكت" 
                      value={field.value || ''} 
                      onChangeText={field.onChange} 
                      onBlur={field.onBlur}
                      placeholderTextColor={colors.placeholder}
                      returnKeyType="next"
                    />
                    <FormMessage message={errors.title?.message} />
                </FormItem>
            )} />
            <Controller control={control} name="description" render={({ field }) => (
                <FormItem style={{ marginBottom: 0 }}>
                    <FormLabel>وصف التكت</FormLabel>
                    <TextInput 
                      style={[styles.input, styles.textArea]} 
                      placeholder="أدخل تفاصيل التكت" 
                      value={field.value || ''} 
                      onChangeText={field.onChange} 
                      onBlur={field.onBlur}
                      multiline
                      placeholderTextColor={colors.placeholder}
                      returnKeyType="default"
                     />
                    <FormMessage message={errors.description?.message} />
                </FormItem>
            )} />
        </View>
       

        

        {/* <View style={styles.card}>
            <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                    <FormItem>
                        <Select
                            label="الأولوية"
                            placeholder="اختر الأولوية"
                            options={PRIORITIES.map(p => ({ label: p, value: p }))}
                            selectedValue={field.value}
                            onValueChange={field.onChange}
                        />
                         <FormMessage message={errors.priority?.message} />
                    </FormItem>
                )}
            />

            <FormItem style={{ marginBottom: 0 }}>
                <FormLabel>تعيين إلى</FormLabel>
                 <View style={styles.badgeContainer}>
                    {selectedUserIds.map(userId => {
                        const user = users.find(u => u.id === userId);
                        return user ? (
                            <View key={userId} style={styles.badge}>
                                <Text style={styles.badgeText}>{user.name}</Text>
                                <TouchableOpacity onPressIn={() => setSelectedUserIds(prev => prev.filter(id => id !== userId))}>
                                    <X color={styles.badgeIcon.color} size={14} />
                                </TouchableOpacity>
                            </View>
                        ) : null;
                    })}
                </View>
                <Select
                    placeholder="أضف مستخدم"
                    options={users
                        .filter(u => !selectedUserIds.includes(u.id))
                        .map(u => ({ label: u.name, value: u.id }))
                    }
                    onValueChange={(value) => {
                        if (value && !selectedUserIds.includes(value)) {
                            setSelectedUserIds(prev => [...prev, value]);
                        }
                    }}
                />
            </FormItem>
        </View> */}

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
                    />
                 ))}
                 <TouchableOpacity style={styles.addButton} onPressIn={addSubscriber}>
                     <Plus color={styles.addButtonText.color} size={18} />
                     <Text style={styles.addButtonText}>إضافة مشترك جديد</Text>
                 </TouchableOpacity>
            </View>
        )}
        
        <View style={styles.buttonContainer}>
             <TouchableOpacity style={styles.secondaryButton} onPressIn={() => router.back()} disabled={isSubmitting}>
                <Text style={styles.secondaryButtonText}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPressIn={handleSubmit(handleAddTicket)} disabled={isSubmitting}>
                {isSubmitting ? <ActivityIndicator color={styles.primaryButtonText.color} /> : <Text style={styles.primaryButtonText}>إنشاء</Text>}
            </TouchableOpacity>
        </View>

    </KeyboardAwareScrollView>
  );
}
const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 48,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  formItem: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontFamily: FONT_FAMILY,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  input: {
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
    writingDirection: 'ltr',
  },
  disabledInput: {
      backgroundColor: colors.background,
      opacity: 0.7,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  errorMessage: {
    color: colors.error,
    fontSize: 14,
    fontFamily: FONT_FAMILY,
    marginTop: 6,
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  // --- Custom Select Styles ---
  selectTrigger: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  selectValueText: {
      fontSize: 16,
      fontFamily: FONT_FAMILY,
      color: colors.text,
  },
  icon: {
      color: colors.subtleText,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 14,
    width: '95%',
    maxHeight: '70%',
    padding: 10,
    elevation: 10,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  selectItem: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  selectItemText: {
    fontSize: 17,
    fontFamily: FONT_FAMILY,
    textAlign: 'right',
    color: colors.text,
  },
  searchInput: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    fontSize: 16,
    fontFamily: FONT_FAMILY,
    color: colors.text,
    backgroundColor: colors.background,
    textAlign: 'right',
  },
  // --- Badge Styles ---
  badgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
    // Handle RTL spacing for badges
    marginRight: 0,
    marginLeft: -4,
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
    marginEnd: 8, // RTL support
  },
  badgeIcon: {
      color: colors.white,
  },
  // --- Subscriber Styles ---
  sectionTitle: {
      fontSize: 20,
      fontFamily: FONT_FAMILY,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 12,
      textAlign: 'right',
      writingDirection: 'ltr',
  },
  subscriberCard: {
      borderColor: colors.primary,
      borderWidth: 1,
      padding: 16,
      marginBottom: 16,
      backgroundColor: colors.blueTint,
  },
  subscriberHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
  },
  subscriberTitle: {
      fontSize: 18,
      fontFamily: FONT_FAMILY,
      fontWeight: '600',
      color: colors.text,
  },
  removeButton: {
      padding: 6,
      borderRadius: 20,
      backgroundColor: colors.redTint,
  },
  removeButtonIcon: {
      color: colors.error,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  addButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontFamily: FONT_FAMILY,
    fontWeight: '600',
    marginStart: 8, // RTL support
  },
  // --- Action Buttons ---
  buttonContainer: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
  },
});