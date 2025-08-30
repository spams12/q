import CommentSection from '@/components/CommentSection';
import { usePermissions } from '@/context/PermissionsContext';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, { Extrapolate, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InvoiceList } from '../../components/InvoiceList';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import useFirebaseAuth from '../../hooks/use-firebase-auth';
import { db, storage } from '../../lib/firebase';
import { getPriorityBadgeColor, getStatusBadgeColor } from '../../lib/styles';
import { Comment, Invoice, ServiceRequest, User } from '../../lib/types';
// --- NEW: Import the action handlers from the service file ---
import { UseDialog } from '@/context/DialogContext';
import * as Haptics from 'expo-haptics';
import { handleAcceptTask, handleLogArrival, handleMarkAsDone, handleRejectTask } from '../../hooks/taskar';

// --- KEYBOARD AVOIDANCE HOOK ---
// This hook is excellent and remains unchanged.
const useKeyboardSpacer = (insets: any) => {
    const screenHeight = Dimensions.get('window').height;
    const threshold = screenHeight * 0.02;
    const effectiveBottomInset = insets.bottom > threshold ? insets.bottom : 0;
    const height = useSharedValue(effectiveBottomInset);
    useKeyboardHandler({
        onMove: (e) => {
            "worklet";
            height.value = Math.max(e.height, effectiveBottomInset);
        },
    }, [effectiveBottomInset]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            height: height.value,
        };
    }, []);

    return animatedStyle;
};


const { width } = Dimensions.get('window');
const formatDateTime = (timestamp: FirebaseFirestoreTypes.Timestamp | undefined) => { // Added type for timestamp
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate();
    return date.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};


interface Subscriber {
    subscriberId: string;
    name: string;
    phone: string;
    packageType: string;
    price: string;
    zoneNumber: string;
    isPaid: boolean;
}

// A more generic type for attachments from different sources
interface AttachmentAsset {
    uri: string;
    name: string;
    size?: number;
    mimeType?: string;
}

const TicketDetailPage = () => {
    const { showDialog } = UseDialog()

    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();
    const id = params.id as string;
    const showActions = params.showActions

    const router = useRouter();
    const { user } = useFirebaseAuth();
    const { theme, themeName } = useTheme();
    const getTypePriaroityTextStyle = useCallback((type: string) => {
        switch (type?.toLowerCase()) {
            case 'request':
            case 'متوسطة':
                return { color: theme.text };
            default:
                return { color: theme.text };
        }
    }, [theme]);
    const getTypePillTextStyle = useCallback((type: string) => {
        switch (type?.toLowerCase()) {
            case 'request':
            case 'طلب':
                return { color: theme.text };
            case 'complaint':
            case 'شكوى':
                return { color: theme.destructive };
            case 'suggestion':
            case 'اقتراح':
                return { color: theme.success };
            default:
                return { color: theme.text };
        }
    }, [theme]);
    const getTypePillStyle = useCallback((type: string) => {
        switch (type?.toLowerCase()) {
            case 'request':
            case 'طلب':
                return {
                    backgroundColor: theme.statusDefault,
                    borderColor: theme.primary,
                };
            case 'complaint':
            case 'شكوى':
                return {
                    backgroundColor: theme.redTint,
                    borderColor: theme.destructive,
                };
            case 'suggestion':
            case 'اقتراح':
                return {
                    backgroundColor: theme.lightGray,
                    borderColor: theme.success,
                };
            default:
                return { backgroundColor: theme.statusDefault };
        }
    }, [theme]);

    const copyToClipboard = (text: string) => {
        Clipboard.setStringAsync(text);

        Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success
        );
    };

    const handlePhonePress = (phoneNumber: string) => {
        if (phoneNumber) {
            Linking.openURL(`tel:${phoneNumber}`);
        }
    };
    const [serviceRequest, setServiceRequest] = useState<ServiceRequest | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState(0);
    const [currentUserResponse, setCurrentUserResponse] = useState<'pending' | 'accepted' | 'rejected' | 'completed' | null>(null);
    const slideAnim = useSharedValue(0);

    const { userdoc } = usePermissions();
    const scrollViewRef = useRef<ScrollView>(null);
    const scrollIsAtBottom = useRef(false);
    const [subscriberSearch, setSubscriberSearch] = useState("");
    const [subscriberIndexBeingProcessed, setSubscriberIndexBeingProcessed] = useState<number | null>(null);
    const [isArrivalLogVisible, setIsArrivalLogVisible] = useState(false);
    const [estimatedDuration, setEstimatedDuration] = useState('');
    const [timeUnit, setTimeUnit] = useState<'minutes' | 'hours'>('minutes');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [isAssignedToCurrentUser, setIsAssignedToCurrentUser] = useState(false);

    const [newComment, setNewComment] = useState('');
    const [attachments, setAttachments] = useState<AttachmentAsset[]>([]);
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [isAttachmentMenuVisible, setIsAttachmentMenuVisible] = useState(false);

    const [shouldScrollAfterSubmit, setShouldScrollAfterSubmit] = useState(false);

    const keyboardSpacerStyle = useKeyboardSpacer(insets);

    const tabs = [
        { key: 'details', title: 'التفاصيل', icon: 'document-text-outline' },
        { key: 'invoices', title: 'الفواتير', icon: 'receipt-outline' },
        { key: 'comments', title: 'التعليقات', icon: 'chatbubble-ellipses-outline' },
        ...(serviceRequest?.subscribers && serviceRequest.subscribers.length > 0
            ? [{ key: 'subscribers', title: 'المشتركون', icon: 'people-outline' }]
            : [])
    ];

    const activeTabKey = tabs[activeTab]?.key;

    useEffect(() => {
        if (!id) return;

        const fetchUsers = async () => {
            const usersCollection = db.collection('users');
            const usersSnapshot = await usersCollection.get();
            const usersList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
            setUsers(usersList);
        };

        fetchUsers();

        const docRef = db.collection('serviceRequests').doc(id as string);
        const unsubscribe = docRef.onSnapshot((doc) => {
            if (doc.exists) {
                const data = { id: doc.id, ...doc.data() } as ServiceRequest;
                setServiceRequest(data);

                if (userdoc) {
                    setIsAssignedToCurrentUser(data.assignedUsers?.includes(userdoc.id) ?? false);
                    const response = data.userResponses?.find(r => r.userId === userdoc.id);
                    setCurrentUserResponse(response ? response.response : 'pending');
                } else {
                    setCurrentUserResponse('pending');
                }
            } else {
                setError('لم يتم العثور على المستند!');
            }
            setLoading(false);
        }, (err) => {
            console.error(err);
            setError('فشل في جلب المستند.');
            setLoading(false);
        });

        return () => unsubscribe();
    }, [id, user, userdoc]);

    useEffect(() => {
        if (isSubmittingComment) {
            setShouldScrollAfterSubmit(true);
        }
    }, [isSubmittingComment]);

    useEffect(() => {
        if (activeTabKey !== 'comments') return;

        if (shouldScrollAfterSubmit) {
            scrollViewRef.current?.scrollToEnd({ animated: true });
            setShouldScrollAfterSubmit(false);
        }
        else if (scrollIsAtBottom.current) {
            setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 300);
        }
    }, [serviceRequest?.comments, activeTabKey, shouldScrollAfterSubmit]);

    const switchTab = (index: number) => {
        setActiveTab(index);
        slideAnim.value = withSpring(index, {
            stiffness: 100,
            damping: 10,
        });
    };

    const animatedTabIndicatorStyle = useAnimatedStyle(() => {
        const translateX = interpolate(
            slideAnim.value,
            tabs.map((_, i) => i),
            tabs.map((_, i) => (width / tabs.length) * i),
            Extrapolate.CLAMP
        );
        return {
            transform: [{ translateX }],
            width: width / tabs.length - 20,
        };
    });

    // --- Business logic functions are removed from here ---
    // handleAccept, handleReject, handleMarkAsDone, handleLogArrival are now in taskActions.ts

    const handleAddComment = async (comment: Partial<Comment>) => {
        if (!id || !user || !userdoc) return;
        try {
            const newCommentData: Comment = {
                id: `${Date.now()}-${userdoc.id}`,
                userId: userdoc.id,
                userName: userdoc.name || 'Unknown',
                timestamp: firestore.Timestamp.now(),
                ...comment,
            };
            await db.collection('serviceRequests').doc(id as string).update({
                comments: firestore.FieldValue.arrayUnion(newCommentData),
                lastUpdated: firestore.Timestamp.now(),
            });
        } catch (e) {
            console.error("Failed to add comment: ", e);
            showDialog({ status: "error", message: "فشل في إرسال التعليق." })
        }
    };


    const handlePickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            showDialog({ status: "error", message: "يرجى السماح بالوصول إلى الصور." })
            return;
        }

        try {
            let result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.All,
                quality: 1,
                allowsMultipleSelection: true,
            });

            if (!result.canceled && result.assets) {
                const newAssets: AttachmentAsset[] = result.assets.map(asset => ({
                    uri: asset.uri,
                    name: asset.fileName || `file_${Date.now()}`,
                    size: asset.fileSize,
                    mimeType: asset.mimeType,
                }));
                setAttachments(prev => [...prev, ...newAssets]);
                setIsAttachmentMenuVisible(false);
            }
        } catch (err) {
            console.error('Error picking image:', err);
            Alert.alert('Error', `Could not pick image: ${err.message}`);
        }
    };

    const handlePickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                multiple: true,
            });

            if (!result.canceled && result.assets) {
                const newAssets: AttachmentAsset[] = result.assets.map(asset => ({
                    uri: asset.uri,
                    name: asset.name,
                    size: asset.size,
                    mimeType: asset.mimeType,
                }));
                setAttachments(prev => [...prev, ...newAssets]);
                setIsAttachmentMenuVisible(false);
            }
        } catch (err) {
            console.error('Error picking document:', err);
        }
    };

    const handleShareLocation = async () => {
        if (!userdoc) return;

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission denied', 'Permission to access location was denied');
            return;
        }

        try {
            const location = await Location.getCurrentPositionAsync({});
            const newCommentData = {
                id: `comment_${Date.now()}`,
                location: {
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                },
                timestamp: firestore.Timestamp.now(),
                userId: userdoc.id,
                userName: userdoc.name,
            };
            await handleAddComment(newCommentData);
            setIsAttachmentMenuVisible(false);
        } catch (error) {
            console.error('Failed to get location:', error);
            Alert.alert("خطأ", "فشل في الحصول على الموقع.");
        }
    };

    const handleCommentSubmit = async () => {
        if ((!newComment.trim() && attachments.length === 0) || !userdoc) return;

        setIsSubmittingComment(true);
        const commentToSave = newComment;
        const attachmentsToSave = attachments;

        setNewComment('');
        setAttachments([]);

        try {
            const uploadedAttachments = [];
            const timestamp = Date.now();

            if (attachmentsToSave.length > 0) {
                for (const asset of attachmentsToSave) {
                    const attachmentId = `attachment_${timestamp}_${Math.random().toString(36).substring(2, 9)}`;
                    const storageRef = storage().ref(`tickets/${id}/comment-attachments/${attachmentId}_${asset.name}`);
                    await storageRef.putFile(asset.uri);
                    const fileUrl = await storageRef.getDownloadURL();

                    uploadedAttachments.push({
                        id: attachmentId,
                        fileUrl: fileUrl,
                        fileName: asset.name,
                        fileType: asset.mimeType ? asset.mimeType.split('/')[0] : 'unknown',
                        fileSize: asset.size,
                    });
                }
            }

            const newCommentData = {
                id: `comment_${timestamp}`,
                content: commentToSave.trim(),
                attachments: uploadedAttachments,
                timestamp: firestore.Timestamp.now(),
                userId: userdoc.id,
                userName: userdoc.name,
            };

            await handleAddComment(newCommentData);

        } catch (error) {
            console.error('Failed to submit comment:', error);
            Alert.alert("خطأ", "فشل في إرسال التعليق.");
            setNewComment(commentToSave);
            setAttachments(attachmentsToSave);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const handleMarkSubscriberAsPaid = async (subscriberIndex: number) => {
        if (!id || !user || !userdoc?.teamId) {
            Alert.alert("خطأ", "البيانات المطلوبة غير متوفرة (user team id).");
            return;
        }

        setSubscriberIndexBeingProcessed(subscriberIndex);

        try {
            await db.runTransaction(async (transaction) => {
                const requestRef = db.collection("serviceRequests").doc(id as string);
                const serviceRequestDoc = await transaction.get(requestRef);

                if (!serviceRequestDoc.exists) {
                    throw new Error("لم يتم العثور على طلب الخدمة.");
                }

                const currentServiceRequest = serviceRequestDoc.data() as ServiceRequest;
                const subscribers = currentServiceRequest.subscribers as unknown as Subscriber[];
                const subscriber = subscribers?.[subscriberIndex];

                if (!subscriber) {
                    throw new Error("لم يتم العثور على المشترك.");
                }

                if (subscriber.isPaid) {
                    throw new Error("هذا المشترك مسجل كمدفوع بالفعل.");
                }

                const price = parseFloat(String(subscriber.price)?.replace(/,/g, "") || "0");
                const newInvoice: Invoice = {
                    id: `${Date.now()}_${id}_${subscriberIndex}`,
                    linkedServiceRequestId: id as string,
                    customerName: subscriber.name,
                    items: [
                        {
                            description: `اشتراك: ${subscriber.packageType} - ${subscriber.name}`,
                            quantity: 1,
                            unitPrice: price,
                            totalPrice: price,
                            id: `item_sub_${Date.now()}_${subscriberIndex}`,
                            type: "subscriptionRenewal",
                        },
                    ],
                    totalAmount: price,
                    status: "pending",
                    createdBy: userdoc.uid,
                    creatorName: userdoc?.name || user.email || "النظام",
                    createdAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    type: "invoice",
                    teamId: userdoc.teamId,
                    teamCreatorId: null,
                    subscriberId: subscriber.subscriberId,
                    notes: "فاتورة اشتراك",
                };

                const invoiceRef = db.collection("invoices").doc(newInvoice.id);
                transaction.set(invoiceRef, newInvoice);

                const updatedSubscribers = subscribers?.map((sub, index) =>
                    index === subscriberIndex ? { ...sub, isPaid: true } : sub
                ) || [];

                transaction.update(requestRef, {
                    invoiceIds: firestore.FieldValue.arrayUnion(newInvoice.id),
                    subscribers: updatedSubscribers,
                    lastUpdated: new Date().toISOString(),
                });
            });

            Alert.alert("نجاح", "تم تسجيل اشتراك كمدفوع وإنشاء الفاتورة.");
        } catch (error) {
            console.error("Error marking subscriber as paid:", error);
            Alert.alert("خطأ", `فشل في تسجيل الاشتراك كمدفوع: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setSubscriberIndexBeingProcessed(null);
        }
    };


    const styles = getStyles(theme, themeName);

    if (loading) {
        return (
            <ThemedView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.primary} />
                    <ThemedText style={styles.loadingText}>جاري التحميل...</ThemedText>
                </View>
            </ThemedView>
        );
    }

    if (error) {
        return (
            <ThemedView style={styles.container}>
                <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle-outline" size={48} color={theme.destructive} />
                    <ThemedText style={styles.errorText}>خطأ: {error}</ThemedText>
                </View>
            </ThemedView>
        );
    }

    if (!serviceRequest) {
        return (
            <ThemedView style={styles.container}>
                <View style={styles.errorContainer}>
                    <Ionicons name="document-outline" size={48} color={theme.textSecondary} />
                    <ThemedText style={styles.errorText}>لم يتم العثور على التذكرة.</ThemedText>
                </View>
            </ThemedView>
        );
    }
    const isNotCreator = (userdoc?.uid && serviceRequest?.creatorId)
        ? userdoc.uid !== serviceRequest.creatorId
        : true;

    const isDisabled =
        serviceRequest.status === 'مكتمل' ||
        serviceRequest.status === 'مغلق' ||
        (showActions === 'true' && (
            currentUserResponse === 'completed' ||
            currentUserResponse === 'rejected' ||
            (isNotCreator ? currentUserResponse !== 'accepted' : false)
        ));

    const renderTabContent = () => {
        switch (activeTabKey) {
            case 'details':
                return (
                    <>
                        <View style={styles.detailsContainer}>
                            <ThemedText style={styles.detailsTitle}>تفاصيل العميل</ThemedText>
                            <View style={styles.detailItem}>
                                <Ionicons name="person-outline" size={20} color={theme.textSecondary} style={styles.detailIcon} />
                                <ThemedText style={styles.detailText}>{serviceRequest.customerName}</ThemedText>
                            </View>
                            <View style={styles.detailItem}>
                                <Ionicons name="location-outline" size={20} color={theme.textSecondary} style={styles.detailIcon} />
                                <ThemedText style={styles.detailText}>{serviceRequest.customerEmail}</ThemedText>
                            </View>
                            <Pressable style={styles.detailItem} onPress={() => serviceRequest.customerPhone && handlePhonePress(serviceRequest.customerPhone)}>
                                <Ionicons name="call-outline" size={20} color={theme.textSecondary} style={styles.detailIcon} />
                                <ThemedText style={styles.detailText}>{serviceRequest.customerPhone}</ThemedText>
                                <Ionicons name="call" size={20} color={theme.primary} style={{ marginHorizontal: 10 }} />
                            </Pressable>
                            <View style={styles.detailItem}>
                                <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} style={styles.detailIcon} />
                                <ThemedText style={styles.detailText}>
                                    {formatDateTime(serviceRequest.createdAt)}
                                </ThemedText>
                            </View>
                        </View>
                        <View style={styles.detailsContainer}>
                            <ThemedText style={styles.detailsTitle}>الوصف</ThemedText>
                            <ThemedText style={styles.detailText}>{serviceRequest.description}</ThemedText>
                        </View>
                    </>
                );
            case 'invoices':
                return (
                    <>
                        <InvoiceList
                            invoiceIds={serviceRequest.invoiceIds || []}
                            ticketId={id as string}
                            subscriberId={serviceRequest.subscriberId ?? undefined}
                            onInvoiceAdded={() => { }}
                        />
                    </>
                );
            case 'comments':
                return (
                    <CommentSection
                        comments={serviceRequest.comments || []}
                        users={users}
                        currentUserId={userdoc?.id || ''}
                    />
                );
            case 'subscribers': {
                const subscribers = serviceRequest?.subscribers as unknown as Subscriber[];
                const filteredSubscribers = subscribers
                    ?.map((subscriber, index) => ({ ...subscriber, originalIndex: index }))
                    .filter(subscriber =>
                        !subscriberSearch ||
                        subscriber.name.toLowerCase().includes(subscriberSearch.toLowerCase()) ||
                        (subscriber.phone && subscriber.phone.includes(subscriberSearch))
                    );
                const isCurrentUserTaskCompleted = currentUserResponse === 'completed';
                const overallTaskIsCompleted = serviceRequest.status === 'مكتمل';

                if ((!subscribers || subscribers.length === 0) && !loading) {
                    return (
                        <View style={styles.detailsContainer}>
                            <ThemedText style={{ textAlign: 'center', color: theme.textSecondary, padding: 20 }}>
                                لا يوجد مشتركين مضافين لهذا الطلب.
                            </ThemedText>
                        </View>
                    );
                }

                return (
                    <View style={{ gap: 16 }}>
                        <TextInput
                            style={styles.searchInput}
                            placeholder="ابحث عن مشترك بالاسم أو رقم الهاتف..."
                            value={subscriberSearch}
                            onChangeText={setSubscriberSearch}
                            placeholderTextColor={theme.textSecondary}
                        />
                        {filteredSubscribers && filteredSubscribers.length > 0 ? (
                            filteredSubscribers.map((subscriber) => (
                                <View key={subscriber.originalIndex} style={styles.detailsContainer}>
                                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <ThemedText style={styles.detailsTitle}>{subscriber.name}</ThemedText>
                                        <View style={[styles.badge, { backgroundColor: subscriber.isPaid ? theme.success : theme.destructive }]}>
                                            <ThemedText style={styles.badgeText}>
                                                {subscriber.isPaid ? "مدفوع" : "غير مدفوع"}
                                            </ThemedText>
                                        </View>
                                    </View>
                                    <View style={{ gap: 4, alignItems: 'flex-end' }}>
                                        <ThemedText style={styles.detailText}>نوع الباقة: {subscriber.packageType}</ThemedText>
                                        <Pressable style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }} onPress={() => handlePhonePress(subscriber.phone)}>
                                            <ThemedText style={styles.detailText}>الهاتف: {subscriber.phone}</ThemedText>
                                            <Ionicons name="call-outline" size={18} color={theme.primary} />
                                        </Pressable>
                                        <ThemedText style={styles.detailText}>السعر: {subscriber.price} د.ع</ThemedText>
                                        <ThemedText style={styles.detailText}>المنطقة: {subscriber.zoneNumber}</ThemedText>
                                    </View>
                                    <View style={{ marginTop: 16 }}>
                                        <Pressable
                                            style={[styles.button, styles.fullWidthButton, { backgroundColor: theme.primary }, (subscriberIndexBeingProcessed !== null || subscriber.isPaid || currentUserResponse !== "accepted" || isCurrentUserTaskCompleted || overallTaskIsCompleted) && { opacity: 0.5 }]}
                                            onPress={() => handleMarkSubscriberAsPaid(subscriber.originalIndex)}
                                            disabled={
                                                subscriberIndexBeingProcessed !== null ||
                                                subscriber.isPaid ||
                                                currentUserResponse !== "accepted" ||
                                                isCurrentUserTaskCompleted ||
                                                overallTaskIsCompleted
                                            }
                                        >
                                            {subscriberIndexBeingProcessed === subscriber.originalIndex ? (
                                                <ActivityIndicator color="#fff" />
                                            ) : (
                                                <ThemedText style={styles.buttonText} adjustsFontSizeToFit numberOfLines={1}>تسجيل كمدفوع</ThemedText>
                                            )}
                                        </Pressable>
                                    </View>
                                </View>
                            ))
                        ) : (
                            <ThemedText style={{ textAlign: 'center', color: theme.textSecondary, marginTop: 20 }}>
                                لا توجد نتائج مطابقة للبحث.
                            </ThemedText>
                        )}
                    </View>
                );
            }
            default:
                return null;
        }
    };

    return (
        <ThemedView style={styles.container}>
            <ScrollView
                ref={scrollViewRef}
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                stickyHeaderIndices={[1]}
                keyboardShouldPersistTaps="handled"
                onScroll={({ nativeEvent }) => {
                    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
                    scrollIsAtBottom.current = isAtBottom;
                }}
                scrollEventThrottle={16}
            >
                <LinearGradient
                    colors={[theme.gradientStart, theme.gradientEnd]}
                    style={styles.headerGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <Pressable onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back-circle-sharp" size={40} color={theme.white} />
                    </Pressable>
                    <View style={styles.headerContent}>
                        <View style={styles.headerTop}>
                            <ThemedText style={styles.headerTitle}>{serviceRequest.title}</ThemedText>
                            <Pressable style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }} onPress={() => copyToClipboard(id as string)}>
                                <ThemedText style={styles.headerSubtitle}>#{id}</ThemedText>
                                <Ionicons name="copy-outline" size={22} color={theme.white} style={{ opacity: 0.8 }} />
                            </Pressable>
                        </View>
                        <View style={styles.badgeContainer}>
                            <View style={[styles.badge, getStatusBadgeColor(serviceRequest.status).view]}>
                                <ThemedText style={[styles.badgeText, getStatusBadgeColor(serviceRequest.status).text]}>{serviceRequest.status}</ThemedText>
                            </View>
                            <View style={[styles.badge, getPriorityBadgeColor(serviceRequest.priority)]}>
                                <ThemedText style={[styles.badgeText, getTypePriaroityTextStyle(serviceRequest.priority)]}>{serviceRequest.priority}</ThemedText>
                            </View>
                            <View style={[styles.badge, getTypePillStyle(serviceRequest.type)]}>
                                <ThemedText style={[styles.badgeText, getTypePillTextStyle(serviceRequest.type)]}>
                                    {serviceRequest.type}
                                </ThemedText>
                            </View>

                            {isAssignedToCurrentUser &&
                                (currentUserResponse === 'pending' || currentUserResponse === 'accepted') &&
                                serviceRequest.status !== 'مكتمل' &&
                                serviceRequest.status !== 'مغلق' &&
                                (
                                    <>
                                        <View style={{ height: 1, backgroundColor: '#ccc', width: "100%", marginTop: 15 }} />
                                        <View style={styles.actionsContainer}>

                                            {currentUserResponse === 'pending' && (
                                                <View style={{ marginTop: 16, flexDirection: 'row' }}>
                                                    <Pressable
                                                        style={[styles.button, styles.acceptButton, actionLoading === 'accept' && { opacity: 0.7 }]}
                                                        onPress={() => userdoc && handleAcceptTask(id, userdoc, setActionLoading)}
                                                        disabled={!!actionLoading}
                                                    >
                                                        {actionLoading === 'accept' ? (
                                                            <ActivityIndicator color="#fff" />
                                                        ) : (
                                                            <>
                                                                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                                                                <ThemedText style={styles.buttonText} adjustsFontSizeToFit numberOfLines={1}>قبول المهمه</ThemedText>
                                                            </>
                                                        )}
                                                    </Pressable>
                                                </View>
                                            )}

                                            {currentUserResponse === 'accepted' && !serviceRequest.onLocation && (
                                                <View style={{ marginTop: 16, flexDirection: 'row' }}>
                                                    <Pressable
                                                        style={[styles.button, { backgroundColor: theme.primary || '#007bff' }, !!actionLoading && { opacity: 0.7 }]}
                                                        onPress={() => setIsArrivalLogVisible(true)}
                                                        disabled={!!actionLoading}
                                                    >
                                                        <Ionicons name="location-outline" size={20} color="#fff" />
                                                        <ThemedText style={styles.buttonText} adjustsFontSizeToFit numberOfLines={1}>وصلت الى الموقع</ThemedText>
                                                    </Pressable>
                                                </View>
                                            )}

                                            {currentUserResponse === 'accepted' && serviceRequest.onLocation && (
                                                <View style={styles.buttonRow}>
                                                    <Pressable
                                                        style={[styles.button, styles.doneButton, actionLoading === 'markAsDone' && { opacity: 0.7 }]}
                                                        onPress={() => userdoc && serviceRequest && handleMarkAsDone(id, userdoc, serviceRequest, setActionLoading)}
                                                        disabled={!!actionLoading}
                                                    >
                                                        {actionLoading === 'markAsDone' ? (
                                                            <ActivityIndicator color="#fff" />
                                                        ) : (
                                                            <>
                                                                <Ionicons name="flag" size={20} color="#fff" />
                                                                <ThemedText style={styles.buttonText} adjustsFontSizeToFit numberOfLines={1}>انتهت المهمه</ThemedText>
                                                            </>
                                                        )}
                                                    </Pressable>
                                                    <Pressable
                                                        style={[styles.button, styles.rejectButton, actionLoading === 'reject' && { opacity: 0.7 }]}
                                                        onPress={() => userdoc && handleRejectTask(id, userdoc, setActionLoading)}
                                                        disabled={!!actionLoading}
                                                    >
                                                        {actionLoading === 'reject' ? (
                                                            <ActivityIndicator color="#fff" />
                                                        ) : (
                                                            <>
                                                                <Ionicons name="close-circle" size={20} color="#fff" />
                                                                <ThemedText style={styles.buttonText} adjustsFontSizeToFit numberOfLines={1}>فشلت المهمه</ThemedText>
                                                            </>
                                                        )}
                                                    </Pressable>
                                                </View>
                                            )}
                                        </View>
                                    </>
                                )}
                        </View>
                    </View>
                </LinearGradient>

                <View style={styles.tabBarContainer}>
                    <View style={styles.tabBar}>
                        <Animated.View
                            style={[
                                styles.tabIndicator,
                                animatedTabIndicatorStyle
                            ]}
                            pointerEvents="none"
                        />
                        {tabs.map((tab, index) => (
                            <Pressable
                                key={tab.key}
                                style={styles.tab}
                                onPress={() => switchTab(index)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Ionicons
                                    name={tab.icon as any}
                                    size={20}
                                    color={activeTab === index ? theme.primary : theme.textSecondary}
                                />
                                <ThemedText
                                    style={[
                                        styles.tabText,
                                        activeTab === index && styles.activeTabText
                                    ]}
                                >
                                    {tab.title}
                                </ThemedText>
                            </Pressable>
                        ))}
                    </View>
                </View>

                <View style={styles.contentContainer}>
                    {renderTabContent()}
                </View>
            </ScrollView>

            {activeTabKey === 'comments' && (
                <View style={styles.inputSection}>
                    {attachments.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attachmentPreviewContainer}>
                            {attachments.map((file, index) => (
                                <View key={index} style={styles.attachmentPill}>
                                    <Ionicons name={file.mimeType?.startsWith('image/') ? 'image-outline' : 'document-outline'} size={16} color="white" />
                                    <Text style={styles.attachmentText} numberOfLines={1}>{file.name}</Text>
                                    <TouchableOpacity onPress={() => setAttachments(prev => prev.filter((_, i) => i !== index))} style={styles.removeAttachment}>
                                        <Ionicons name="close" size={16} color="white" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>
                    )}
                    <View style={styles.inputContainer}>
                        <TouchableOpacity onPress={() => setIsAttachmentMenuVisible(p => !p)} disabled={isDisabled} style={[styles.iconButton, isDisabled && styles.disabledButton]}>
                            <Ionicons name={isAttachmentMenuVisible ? "close" : "add"} size={24} color={isDisabled ? theme.placeholder : theme.primary} />
                        </TouchableOpacity>

                        {isAttachmentMenuVisible && (
                            <>
                                <TouchableOpacity onPress={handlePickImage} disabled={isDisabled} style={[styles.iconButton, isDisabled && styles.disabledButton]}>
                                    <Ionicons name="image-outline" size={24} color={isDisabled ? theme.placeholder : theme.primary} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handlePickDocument} disabled={isDisabled} style={[styles.iconButton, isDisabled && styles.disabledButton]}>
                                    <Ionicons name="document-attach-outline" size={24} color={isDisabled ? theme.placeholder : theme.primary} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleShareLocation} disabled={isDisabled} style={[styles.iconButton, isDisabled && styles.disabledButton]}>
                                    <Ionicons name="location-outline" size={24} color={isDisabled ? theme.placeholder : theme.primary} />
                                </TouchableOpacity>
                            </>
                        )}

                        <TextInput
                            style={[styles.input, { textAlign: 'right' }, isDisabled && styles.disabledInput]}
                            value={newComment}
                            onChangeText={setNewComment}
                            placeholder={isDisabled ? 'المحادثة مغلقة' : 'أضف تعليقاً...'}
                            placeholderTextColor={theme.placeholder}
                            onFocus={() => setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 300)}
                        />
                        <TouchableOpacity
                            onPress={handleCommentSubmit}
                            disabled={isDisabled || (!newComment.trim() && attachments.length === 0)}
                            style={[styles.sendButton, (isDisabled || (!newComment.trim() && attachments.length === 0)) && styles.disabledSendButton]}
                        >
                            {isSubmittingComment ? (
                                <ActivityIndicator size="small" color={theme.white} />
                            ) : (
                                <Ionicons name="send" size={20} color={theme.white} />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <Animated.View style={keyboardSpacerStyle} />

            <Modal
                animationType="slide"
                transparent={true}
                visible={isArrivalLogVisible}
                onRequestClose={() => setIsArrivalLogVisible(false)}
                statusBarTranslucent={Platform.OS === 'android'}

            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardAvoidingContainer}
                >
                    <View style={styles.centeredView}>
                        <View style={styles.modalView}>
                            <ThemedText style={styles.modalText}>تسجيل الوصول للموقع</ThemedText>
                            <ThemedText style={{ textAlign: 'right', width: '100%', marginBottom: 8, color: theme.textSecondary }}>مدة العمل المقدرة</ThemedText>
                            <TextInput
                                style={styles.searchInput}
                                placeholder="مثال: 30"
                                keyboardType="numeric"
                                value={estimatedDuration}
                                onChangeText={setEstimatedDuration}
                                placeholderTextColor={theme.textSecondary}
                            />
                            <View style={styles.timeUnitSelector}>
                                <Pressable
                                    style={[styles.timeUnitButton, timeUnit === 'minutes' && styles.timeUnitButtonSelected]}
                                    onPress={() => setTimeUnit('minutes')}
                                >
                                    <ThemedText style={[styles.timeUnitButtonText, timeUnit === 'minutes' && styles.timeUnitButtonTextSelected]}>دقائق</ThemedText>
                                </Pressable>
                                <Pressable
                                    style={[styles.timeUnitButton, timeUnit === 'hours' && styles.timeUnitButtonSelected]}
                                    onPress={() => setTimeUnit('hours')}
                                >
                                    <ThemedText style={[styles.timeUnitButtonText, timeUnit === 'hours' && styles.timeUnitButtonTextSelected]}>ساعات</ThemedText>
                                </Pressable>
                            </View>
                            <View style={styles.buttonRow}>
                                <Pressable
                                    style={[styles.button, styles.rejectButton, { flex: 1, marginHorizontal: 4 }]}
                                    onPress={() => setIsArrivalLogVisible(false)}
                                >
                                    <ThemedText style={styles.buttonText} adjustsFontSizeToFit numberOfLines={1}>إلغاء</ThemedText>
                                </Pressable>
                                <Pressable
                                    style={[styles.button, styles.acceptButton, { flex: 1, marginHorizontal: 4 }, actionLoading === 'logArrival' && { opacity: 0.7 }]}
                                    onPress={() => {
                                        const duration = parseInt(estimatedDuration, 10);
                                        if (isNaN(duration) || duration <= 0) {
                                            Alert.alert("خطأ", "الرجاء إدخال مدة زمنية صالحة.");
                                            return;
                                        }
                                        if (userdoc) {
                                            handleLogArrival(id, userdoc, duration, timeUnit, setActionLoading)
                                                .then(() => {
                                                    setIsArrivalLogVisible(false);
                                                    setEstimatedDuration('');
                                                });
                                        }
                                    }}
                                    disabled={actionLoading === 'logArrival'}
                                >
                                    {actionLoading === 'logArrival' ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <ThemedText style={styles.buttonText} adjustsFontSizeToFit numberOfLines={1}>تأكيد</ThemedText>
                                    )}
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </ThemedView>
    );
};

// Styles remain unchanged. I'm providing them again for completeness.
const getStyles = (theme: any, themeName: 'light' | 'dark') => {
    const shadowColor = theme.shadow || (themeName === 'dark' ? '#FFFFFF' : '#000000');
    return StyleSheet.create({
        keyboardAvoidingContainer: {
            flex: 1,
        },
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        backButton: {
            position: 'absolute',
            top: 50,
            left: 15,
            zIndex: 10,
        },
        loadingContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        loadingText: {
            fontSize: 18,
            color: theme.textSecondary,
            fontFamily: 'Cairo',
        },
        errorContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
        },
        errorText: {
            fontSize: 16,
            color: theme.textSecondary,
            textAlign: 'center',
            marginTop: 16,
            fontFamily: 'Cairo',
        },
        headerGradient: {
            paddingTop: 60,
            paddingBottom: 24,
            paddingHorizontal: 20,
        },
        headerContent: {
            alignItems: 'flex-end',
        },
        headerTop: {
            alignItems: 'flex-end',
            marginBottom: 16,
            padding: 15
        },
        headerTitle: {
            fontSize: 28,
            fontWeight: 'bold',
            color: theme.white,
            textAlign: 'right',
            fontFamily: 'Cairo',
            padding: 10,
            lineHeight: 32,
        },
        headerSubtitle: {
            fontSize: 16,
            color: theme.white,
            opacity: 0.8,
            marginTop: 4,
            fontFamily: 'Cairo',
        },
        badgeContainer: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
        },
        badge: {
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 20,
            marginLeft: 8,
            marginBottom: 8,
            shadowColor: shadowColor,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
        },
        badgeText: {
            color: theme.white,
            fontWeight: '600',
            fontSize: 12,
            fontFamily: 'Cairo',
        },
        tabBarContainer: {
            backgroundColor: theme.card,
            shadowColor: shadowColor,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 5,
        },
        tabBar: {
            flexDirection: 'row',
            position: 'relative',
            paddingVertical: 8,
        },
        tabIndicator: {
            position: 'absolute',
            bottom: 0,
            height: 3,
            backgroundColor: theme.primary,
            borderRadius: 2,
            marginHorizontal: 10,
        },
        tab: {
            flex: 1,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12,
            paddingHorizontal: 8,
        },
        tabText: {
            fontSize: 12,
            fontWeight: '600',
            color: theme.textSecondary,
            marginTop: 4,
            textAlign: 'center',
            fontFamily: 'Cairo',
        },
        activeTabText: {
            color: theme.primary,
        },
        contentContainer: {
            padding: 10,
        },
        detailsContainer: {
            backgroundColor: theme.card,
            borderRadius: 12,
            marginBottom: 16,
            shadowColor: shadowColor,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 2,
            padding: 15
        },
        detailsTitle: {
            fontSize: 18,
            fontWeight: 'bold',
            marginBottom: 12,
            textAlign: 'right',
            color: theme.text,
        },
        detailItem: {
            flexDirection: 'row-reverse',
            alignItems: 'center',
            marginBottom: 8,
        },
        detailIcon: {
            marginLeft: 10,
        },
        detailText: {
            fontSize: 16,
            color: theme.textSecondary,
            textAlign: 'right',
            flex: 1,
        },
        searchInput: {
            height: 50,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 16,
            backgroundColor: theme.card,
            color: theme.text,
            fontSize: 16,
            textAlign: 'right',
            fontFamily: 'Cairo',
        },
        actionsContainer: {
            borderRadius: 12,
            width: '100%',

        },
        buttonRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: 16,
            marginTop: 16,
        },
        button: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            paddingHorizontal: 20,
            borderRadius: 12,
            shadowColor: shadowColor,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
            minWidth: 120,
            flex: 1,
        },
        fullWidthButton: {
            width: '100%',
        },
        buttonText: {
            color: theme.white,
            fontSize: 16,
            fontWeight: 'bold',
            marginLeft: 8,
            fontFamily: 'Cairo',
            flexShrink: 1,
        },
        acceptButton: {
            backgroundColor: theme.success,
        },
        rejectButton: {
            backgroundColor: theme.destructive,
        },
        doneButton: {
            backgroundColor: theme.success,
        },
        centeredView: {
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: 'rgba(0,0,0,0.5)',
        },
        modalView: {
            margin: 20,
            backgroundColor: theme.card,
            borderRadius: 20,
            padding: 35,
            alignItems: "center",
            shadowColor: "#000",
            shadowOffset: {
                width: 0,
                height: 2
            },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 5,
            width: '90%',
        },
        modalText: {
            marginBottom: 15,
            textAlign: "center",
            fontSize: 20,
            fontWeight: 'bold',
            color: theme.text,
        },
        timeUnitSelector: {
            flexDirection: 'row-reverse',
            marginVertical: 16,
        },
        timeUnitButton: {
            flex: 1,
            padding: 12,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 8,
            alignItems: 'center',
            marginHorizontal: 4,
        },
        timeUnitButtonSelected: {
            backgroundColor: theme.primary,
            borderColor: theme.primary,
        },
        timeUnitButtonText: {
            color: theme.text,
        },
        timeUnitButtonTextSelected: {
            color: theme.white,
            fontWeight: 'bold',
        },
        inputSection: {
            backgroundColor: theme.card,
            borderTopWidth: 1,
            borderTopColor: theme.border,
        },
        attachmentPreviewContainer: {
            paddingHorizontal: 16,
            paddingTop: 8,
            maxHeight: 60
        },
        attachmentPill: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.primary,
            borderRadius: 20,
            paddingVertical: 8,
            paddingHorizontal: 12,
            marginRight: 8,
            maxWidth: 200,
        },
        attachmentText: {
            color: theme.white,
            fontSize: 12,
            marginHorizontal: 6,
            flex: 1,
        },
        removeAttachment: {
            padding: 2,
        },
        inputContainer: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 8,
            gap: 8,
        },
        input: {
            flex: 1,
            backgroundColor: theme.inputBackground,
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingTop: Platform.OS === 'ios' ? 12 : 8,
            paddingBottom: Platform.OS === 'ios' ? 12 : 8,
            fontSize: 16,
            color: theme.text,
            maxHeight: 100,
            borderWidth: 1,
            borderColor: theme.border,
        },
        disabledInput: {
            backgroundColor: theme.border,
        },
        iconButton: {
            padding: 8,
        },
        sendButton: {
            backgroundColor: theme.primary,
            borderRadius: 20,
            width: 40,
            height: 40,
            justifyContent: 'center',
            alignItems: 'center',
        },
        disabledButton: {
            opacity: 0.5,
        },
        disabledSendButton: {
            backgroundColor: theme.border,
        },
    });
};

export default TicketDetailPage;