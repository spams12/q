import CommentSection from '@/components/CommentSection';
import { usePermissions } from '@/context/PermissionsContext';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { arrayUnion, collection, doc, getDocs, onSnapshot, runTransaction, Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { InvoiceList } from '../../components/InvoiceList';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import useFirebaseAuth from '../../hooks/use-firebase-auth';
import { db } from '../../lib/firebase';
import { Comment, Invoice, InvoiceItem, ServiceRequest, StockTransaction, User, UserStockItem } from '../../lib/types';

const { width } = Dimensions.get('window');

type NewCustomerInstallationItem = InvoiceItem & {
  type: 'newCustomerInstallation';
  deviceModel: string;
  connectorType: string[];
  numHooks: number;
  numBags: number;
};

type MaintenanceItem = InvoiceItem & {
    type: 'maintenance';
    cableLength?: number;
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

const TicketDetailPage = () => {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useFirebaseAuth();
  const { theme, themeName } = useTheme();
  const [serviceRequest, setServiceRequest] = useState<ServiceRequest | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [currentUserResponse, setCurrentUserResponse] = useState<'pending' | 'accepted' | 'rejected' | 'completed' | null>(null);
  const [slideAnim] = useState(new Animated.Value(0));
  const { userUid ,userdoc } = usePermissions();
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [subscriberIndexBeingProcessed, setSubscriberIndexBeingProcessed] = useState<number | null>(null);

  const tabs = [
    { key: 'details', title: 'التفاصيل', icon: 'document-text-outline' },
    { key: 'invoices', title: 'الفواتير', icon: 'receipt-outline' },
    ...(serviceRequest?.subscribers && serviceRequest.subscribers.length > 0 
      ? [{ key: 'subscribers', title: 'المشتركون', icon: 'people-outline' }] 
      : [])
  ];

  useEffect(() => {
    if (!id) return;

    const fetchUsers = async () => {
      const usersCollection = collection(db, 'users');
      const usersSnapshot = await getDocs(usersCollection);
      const usersList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(usersList);
    };

    fetchUsers();

    const docRef = doc(db, 'serviceRequests', id as string);
    const unsubscribe = onSnapshot(docRef, (doc) => {
      if (doc.exists()) {
        const data = { id: doc.id, ...doc.data() } as ServiceRequest;
        setServiceRequest(data);

        if (user && data.userResponses) {
          const response = data.userResponses.find(r => r.userId === userdoc.id);
          console.log("Current user response:", response);
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
  }, [id, user]);

  const switchTab = (index: number) => {
    console.log(`Switching to tab ${index}`);
    setActiveTab(index);
    Animated.spring(slideAnim, {
      toValue: index,
      useNativeDriver: true,
      tension: 68,
      friction: 8,
    }).start();
  };

  const handleAccept = async () => {
    if (!user || !id) return;

    try {
      await runTransaction(db, async (transaction) => {
        const docRef = doc(db, 'serviceRequests', id as string);
        const sfDoc = await transaction.get(docRef);
        if (!sfDoc.exists()) {
          throw "المستند غير موجود!";
        }

        const data = sfDoc.data() as ServiceRequest;
        const newUserResponses = data.userResponses ? [...data.userResponses] : [];
        const userResponseIndex = newUserResponses.findIndex(res => res.userId === user.uid);

        if (userResponseIndex > -1) {
          newUserResponses[userResponseIndex].response = 'accepted';
        } else {
          newUserResponses.push({ userId: user.uid, userName: user.displayName || 'Unknown', response: 'accepted', timestamp: Timestamp.now().toDate().toISOString() });
        }

        const newComment: Comment = {
          id: `${Date.now()}`,
          content: `قبل المستخدم ${user.displayName} المهمة.`,
          userId: user.uid,
          userName: user.displayName || 'النظام',
          createdAt: Timestamp.now(),
          timestamp: Timestamp.now(),
          isStatusChange: true,
        };

        const newStatus = data.status === 'مفتوح' ? 'قيد المعالجة' : data.status;

        transaction.update(docRef, {
          userResponses: newUserResponses,
          comments: arrayUnion(newComment),
          status: newStatus,
          lastUpdated: Timestamp.now(),
        });
      });
    } catch (e) {
      console.error("فشل في التعامل: ", e);
    }
  };

  const handleReject = async () => {
    if (!user || !id) return;

    try {
      await runTransaction(db, async (transaction) => {
        const docRef = doc(db, 'serviceRequests', id as string);
        const sfDoc = await transaction.get(docRef);
        if (!sfDoc.exists()) {
          throw "المستند غير موجود!";
        }

        const data = sfDoc.data() as ServiceRequest;
        const newUserResponses = data.userResponses ? [...data.userResponses] : [];
        const userResponseIndex = newUserResponses.findIndex(res => res.userId === user.uid);

        if (userResponseIndex > -1) {
          newUserResponses[userResponseIndex].response = 'rejected';
        } else {
          newUserResponses.push({ userId: user.uid, userName: user.displayName || 'Unknown', response: 'rejected', timestamp: Timestamp.now().toDate().toISOString() });
        }

        const newComment: Comment = {
          id: `${Date.now()}`,
          content: `رفض المستخدم ${user.displayName} المهمة.`,
          userId: user.uid,
          userName: user.displayName || 'النظام',
          createdAt: Timestamp.now(),
          timestamp: Timestamp.now(),
          isStatusChange: true,
        };

        transaction.update(docRef, {
          userResponses: newUserResponses,
          comments: arrayUnion(newComment),
          lastUpdated: Timestamp.now(),
        });
      });
    } catch (e) {
      console.error("فشل في التعامل: ", e);
    }
  };

  const handleMarkAsDone = async () => {
    if (!user || !id) return;

    try {
      await runTransaction(db, async (transaction) => {
        const docRef = doc(db, 'serviceRequests', id as string);
        const sfDoc = await transaction.get(docRef);
        if (!sfDoc.exists()) {
          throw "المستند غير موجود!";
        }

        const data = sfDoc.data() as ServiceRequest;
        const newUserResponses = data.userResponses ? [...data.userResponses] : [];
        const userResponseIndex = newUserResponses.findIndex(res => res.userId === user.uid);

        if (userResponseIndex > -1) {
          newUserResponses[userResponseIndex].response = 'completed';
        }

        const newComment: Comment = {
          id: `${Date.now()}`,
          content: `أكمل المستخدم ${user.displayName} مهمته.`,
          userId: user.uid,
          userName: user.displayName || 'النظام',
          createdAt: Timestamp.now(),
          timestamp: Timestamp.now(),
          isStatusChange: true,
        };

        const acceptedUsers = newUserResponses.filter(r => r.response === 'accepted' || r.response === 'completed');
        const allCompleted = acceptedUsers.every(r => r.response === 'completed');
        const newStatus = allCompleted ? 'مكتمل' : data.status;

        transaction.update(docRef, {
          userResponses: newUserResponses,
          comments: arrayUnion(newComment),
          status: newStatus,
          lastUpdated: Timestamp.now(),
        });
      });
    } catch (e) {
      console.error("فشل في التعامل: ", e);
    }
  };

  const handleAddComment = async (comment: Partial<Comment>) => {
    if (!id || !user) return;

    try {
      await runTransaction(db, async (transaction) => {
        const docRef = doc(db, 'serviceRequests', id as string);
        const sfDoc = await transaction.get(docRef);
        if (!sfDoc.exists()) {
          throw "المستند غير موجود!";
        }

        const data = sfDoc.data() as ServiceRequest;

        const newComment: Partial<Comment> = {
          ...comment,
          timestamp: Timestamp.now(),
        };


        transaction.update(docRef, {
          comments: arrayUnion(newComment),
          lastUpdated: Timestamp.now(),
        });
      });
    } catch (e) {
      console.error("فشل في التعامل: ", e);
    }
  };

  const getRequiredStock = (items: InvoiceItem[]): Record<string, number> => {
    const requiredStock: Record<string, number> = {};

    items.forEach(item => {
      switch (item.type) {
        case 'newCustomerInstallation':
          const installItem = item as NewCustomerInstallationItem;
          if (installItem.deviceModel) requiredStock[installItem.deviceModel] = (requiredStock[installItem.deviceModel] || 0) + 1;
          installItem.connectorType?.forEach((c: string) => requiredStock[c] = (requiredStock[c] || 0) + 1);
          if (installItem.numHooks > 0) requiredStock['hook'] = (requiredStock['hook'] || 0) + installItem.numHooks;
          if (installItem.numBags > 0) requiredStock['bag'] = (requiredStock['bag'] || 0) + installItem.numBags;
          break;
        case 'maintenance':
          const maintItem = item as MaintenanceItem;
          if (maintItem.cableLength && maintItem.cableLength > 0) {
            requiredStock['cable'] = (requiredStock['cable'] || 0) + maintItem.cableLength;
          }
          break;
      }
    });

    return requiredStock;
  };

  const handleSaveInvoice = async (items: InvoiceItem[]) => {
    if (!user || !serviceRequest) return;

    try {
      await runTransaction(db, async (transaction) => {
        const userDocRef = doc(db, 'users', user.uid);
        const serviceRequestDocRef = doc(db, 'serviceRequests', serviceRequest.id);

        const [userDoc, serviceRequestDoc] = await Promise.all([
          transaction.get(userDocRef),
          transaction.get(serviceRequestDocRef)
        ]);

        if (!userDoc.exists() || !serviceRequestDoc.exists()) {
          throw new Error("لم يتم العثور على مستند المستخدم أو طلب الخدمة!");
        }

        const currentUserData = userDoc.data() as User;
        const currentServiceRequest = serviceRequestDoc.data() as ServiceRequest;
        const userStock = currentUserData.stockItems || [];
        const requiredStock = getRequiredStock(items);
        const stockToUpdate: UserStockItem[] = JSON.parse(JSON.stringify(userStock));
        const stockTransactions: Omit<StockTransaction, 'id'>[] = [];

        const insufficientStock: string[] = [];
        for (const itemName in requiredStock) {
          const stockItem = stockToUpdate.find(s => s.itemName === itemName);
          if (!stockItem || stockItem.quantity < requiredStock[itemName]) {
            insufficientStock.push(`${itemName} (مطلوب: ${requiredStock[itemName]}, متوفر: ${stockItem?.quantity || 0})`);
          }
        }

        if (insufficientStock.length > 0) {
          Alert.alert(
            "مخزون غير كافي",
            `العناصر التالية منخفضة المخزون، لكن يمكنك المتابعة:\n${insufficientStock.join('\n')}`,
            [{ text: "موافق" }]
          );
        }

        const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);
        const newInvoiceRef = doc(collection(db, 'invoices'));
        const newInvoice: Invoice = {
          id: newInvoiceRef.id,
          linkedServiceRequestId: serviceRequest.id,
          customerName: currentServiceRequest.customerName,
          totalAmount,
          status: 'draft',
          items,
          createdAt: Timestamp.now().toDate().toISOString(),
          lastUpdated: Timestamp.now().toDate().toISOString(),
          createdBy: user.uid,
          creatorName: user.displayName || 'Unknown',
          type: 'invoice',
        };
        transaction.set(newInvoiceRef, newInvoice);

        for (const itemName in requiredStock) {
          const requiredQty = requiredStock[itemName];
          const stockItemIndex = stockToUpdate.findIndex(s => s.itemName === itemName);

          if (stockItemIndex > -1) {
            const originalQty = stockToUpdate[stockItemIndex].quantity;
            stockToUpdate[stockItemIndex].quantity -= requiredQty;
            
            const newTransaction: Omit<StockTransaction, 'id'> = {
              itemId: stockToUpdate[stockItemIndex].itemId,
              itemName: itemName,
              userId: user.uid,
              userName: user.displayName || 'غير محدد',
              type: 'reduction',
              quantity: -requiredQty,
              timestamp: Timestamp.now(),
              itemType: stockToUpdate[stockItemIndex].itemType,
              sourceId: serviceRequest.id,
            };
            stockTransactions.push(newTransaction);
          }
        }
        
        stockTransactions.forEach(tx => {
            const newTransactionRef = doc(collection(db, 'stockTransactions'));
            transaction.set(newTransactionRef, tx);
        });

        transaction.update(userDocRef, { stockItems: stockToUpdate });

        const newComment: Comment = {
          id: `${Date.now()}`,
          content: `تم إنشاء الفاتورة ${newInvoice.id} من قبل ${user.displayName}.`,
          userId: user.uid,
          userName: user.displayName || 'النظام',
          createdAt: Timestamp.now(),
          timestamp: Timestamp.now(),
          isStatusChange: true,
        };

        transaction.update(serviceRequestDocRef, {
          invoiceIds: arrayUnion(newInvoice.id),
          comments: arrayUnion(newComment),
          lastUpdated: Timestamp.now(),
        });
      });
      Alert.alert("نجح", "تم حفظ الفاتورة بنجاح!");
    } catch (e) {
      console.error("فشل في حفظ الفاتورة: ", e);
      Alert.alert("خطأ", "فشل في حفظ الفاتورة. حاول مرة أخرى.");
    }
  };

  const handleMarkSubscriberAsPaid = async (subscriberIndex: number) => {
    if (!id || !user || !userdoc.teamId) {
      Alert.alert("خطأ", "البيانات المطلوبة غير متوفرة (user team id).");
      return;
    }

    setSubscriberIndexBeingProcessed(subscriberIndex);

    try {
      await runTransaction(db, async (transaction) => {
        const requestRef = doc(db, "serviceRequests", id as string);
        const serviceRequestDoc = await transaction.get(requestRef);

        if (!serviceRequestDoc.exists()) {
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

        const invoiceRef = doc(db, "invoices", newInvoice.id);
        transaction.set(invoiceRef, newInvoice);

        const updatedSubscribers = subscribers?.map((sub, index) =>
          index === subscriberIndex ? { ...sub, isPaid: true } : sub
        ) || [];

        transaction.update(requestRef, {
          invoiceIds: arrayUnion(newInvoice.id),
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

  

  const renderTabContent = () => {
    const styles = getStyles(theme, themeName);
    switch (activeTab) {
      case 0:
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
              <View style={styles.detailItem}>
                <Ionicons name="call-outline" size={20} color={theme.textSecondary} style={styles.detailIcon} />
                <ThemedText style={styles.detailText}>{serviceRequest.customerPhone}</ThemedText>
              </View>
            </View>
            <View style={styles.detailsContainer}>
              <ThemedText style={styles.detailsTitle}>الوصف</ThemedText>
              <ThemedText style={styles.detailText}>{serviceRequest.description}</ThemedText>
            
            </View>
            <View style={styles.detailsContainer}>
              <ThemedText style={styles.detailsTitle}>التعليقات</ThemedText>
              <CommentSection
                comments={serviceRequest.comments || []}
                users={users}
                currentUserId={user?.uid || ''}
                ticketStatus={serviceRequest.status}
                userHasAccepted={currentUserResponse === 'accepted'}
                onAddComment={handleAddComment}
                ticketId={id as string}
              />
            </View>
          </>
        );
      case 1:
        return (
          <>
            <InvoiceList
              invoiceIds={serviceRequest.invoiceIds || []}
              ticketId={id as string}
              subscriberId={serviceRequest.subscriberId ?? undefined}
              onInvoiceAdded={() => {}}
            />
          </>
        );
      case 2: {
        const subscribers = serviceRequest?.subscribers as unknown as Subscriber[];
        const filteredSubscribers = subscribers
            ?.map((subscriber, index) => ({ ...subscriber, originalIndex: index }))
            .filter(subscriber =>
                !subscriberSearch ||
                subscriber.name.toLowerCase().includes(subscriberSearch.toLowerCase()) ||
                (subscriber.phone && subscriber.phone.includes(subscriberSearch))
            );
        console.log("Filtered Subscribers:", filteredSubscribers);
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
            <View style={{gap: 16}}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="ابحث عن مشترك بالاسم أو رقم الهاتف..."
                    value={subscriberSearch}
                    onChangeText={setSubscriberSearch}
                    placeholderTextColor={theme.textSecondary}
                />
                {filteredSubscribers && filteredSubscribers.length > 0 ? (
                    filteredSubscribers.map((subscriber) => {
                        const isButtonDisabled = {
                            "subscriberIndexBeingProcessed !== null": subscriberIndexBeingProcessed !== null,
                            "subscriber.isPaid": subscriber.isPaid,
                            "currentUserResponse !== 'accepted'": currentUserResponse !== "accepted",
                            isCurrentUserTaskCompleted,
                            overallTaskIsCompleted,
                        };
                        console.log(`Button disabled states for ${subscriber.name}:`, isButtonDisabled);

                        return (
                            <View key={subscriber.originalIndex} style={styles.detailsContainer}>
                                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <ThemedText style={styles.detailsTitle}>{subscriber.name}</ThemedText>
                                    <View style={[styles.badge, { backgroundColor: subscriber.isPaid ? theme.success : theme.destructive }]}>
                                        <ThemedText style={styles.badgeText}>
                                            {subscriber.isPaid ? "مدفوع" : "غير مدفوع"}
                                        </ThemedText>
                                    </View>
                                </View>
                                <View style={{gap: 4, alignItems: 'flex-end'}}>
                                    <ThemedText style={styles.detailText}>نوع الباقة: {subscriber.packageType}</ThemedText>
                                    <ThemedText style={styles.detailText}>الهاتف: {subscriber.phone}</ThemedText>
                                    <ThemedText style={styles.detailText}>السعر: {subscriber.price} د.ع</ThemedText>
                                    <ThemedText style={styles.detailText}>المنطقة: {subscriber.zoneNumber}</ThemedText>
                                </View>
                                <View style={{marginTop: 16}}>
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
                                            <ThemedText style={styles.buttonText}>تسجيل كمدفوع</ThemedText>
                                        )}
                                    </Pressable>
                                </View>
                            </View>
                        );
                    })
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
      {/* Content */}
      <ScrollView
        style={styles.contentScrollView}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
      >
        {/* Header with gradient */}
        <LinearGradient
          colors={[theme.gradientStart, theme.gradientEnd]}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back-circle-sharp" size={32} color={theme.white} />
          </Pressable>
          <View style={styles.headerContent}>
            <View style={styles.headerTop}>
              <ThemedText style={styles.headerTitle}>{serviceRequest.title}</ThemedText>
              <ThemedText style={styles.headerSubtitle}>تذكرة #{id}</ThemedText>
            </View>
            <View style={styles.badgeContainer}>
              <View style={[styles.badge, getStatusStyle(serviceRequest.status, theme)]}>
                <ThemedText style={styles.badgeText}>{serviceRequest.status}</ThemedText>
              </View>
              <View style={[styles.badge, getPriorityStyle(serviceRequest.priority, theme)]}>
                <ThemedText style={styles.badgeText}>{serviceRequest.priority}</ThemedText>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Modern Tab Bar */}
        <View style={styles.tabBarContainer}>
          <View style={styles.tabBar}>
            {/* Animated indicator - with pointerEvents="none" to prevent touch blocking */}
            <Animated.View
              style={[
                styles.tabIndicator,
                {
                  transform: [{
                    translateX: slideAnim.interpolate({
                      inputRange: [0, 1, 2],
                      outputRange: [0, width / tabs.length, (width / tabs.length) * 2],
                      extrapolate: 'clamp',
                    })
                  }],
                  width: width / tabs.length - 20,
                }
              ]}
              pointerEvents="none" // Prevents blocking touch events
            />
            
            {tabs.map((tab, index) => (
              <Pressable
                key={tab.key}
                style={styles.tab}
                onPressIn={() => {
                  console.log(`Tab ${index} pressed: ${tab.title}`);
                  switchTab(index);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
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

      {/* Action Buttons */}
      {(currentUserResponse === 'pending' || currentUserResponse === 'accepted') && (
        <LinearGradient
          colors={[theme.actionsContainerBackground, theme.card]}
          style={styles.actionsContainer}
        >
          {/* {currentUserResponse === 'pending' && (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.acceptButton]}
                onPress={handleAccept}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <ThemedText style={styles.buttonText}>قبول</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.rejectButton]}
                onPress={handleReject}
                activeOpacity={0.8}
              >
                <Ionicons name="close-circle" size={20} color="#fff" />
                <ThemedText style={styles.buttonText}>رفض</ThemedText>
              </TouchableOpacity>
            </View>
          )}
          {currentUserResponse === 'accepted' && (
            <TouchableOpacity
              style={[styles.button, styles.doneButton, styles.fullWidthButton]}
              onPress={handleMarkAsDone}
              activeOpacity={0.8}
            >
              <Ionicons name="flag" size={20} color="#fff" />
              <ThemedText style={styles.buttonText}>تم إنجاز مهمتي</ThemedText>
            </TouchableOpacity>
          )} */}
        </LinearGradient>
      )}
    </ThemedView>
  );
};

const getStatusStyle = (status: string, theme: any) => {
  switch (status) {
    case 'مفتوح': return { backgroundColor: theme.statusOpen };
    case 'قيد المعالجة': return { backgroundColor: theme.statusInProgress };
    case 'مكتمل': return { backgroundColor: theme.statusCompleted };
    case 'معلق': return { backgroundColor: theme.statusPending };
    case 'ملغي': return { backgroundColor: theme.statusCancelled };
    default: return { backgroundColor: theme.statusDefault };
  }
};

const getPriorityStyle = (priority: string, theme: any) => {
  switch (priority) {
    case 'عاجل': return { backgroundColor: theme.priorityUrgent };
    case 'مرتفع': return { backgroundColor: theme.priorityHigh };
    case 'متوسط': return { backgroundColor: theme.priorityMedium };
    case 'منخفض': return { backgroundColor: theme.priorityLow };
    default: return { backgroundColor: theme.priorityDefault };
  }
};

const getStyles = (theme: any, themeName: 'light' | 'dark') => {
  const shadowColor = theme.shadow || (themeName === 'dark' ? '#FFFFFF' : '#000000');

  return StyleSheet.create({
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
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: theme.white,
      textAlign: 'right',
      fontFamily: 'Cairo',
      padding: 10,
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
    contentScrollView: {
      flex: 1,
    },
    contentContainer: {
      paddingBottom: 0,
    },
    detailsContainer: {
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 8,
      marginBottom: 16,
      shadowColor: shadowColor,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
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
    loadingUserText: {
      textAlign: 'center',
      color: theme.textSecondary,
      fontSize: 16,
      marginTop: 20,
      fontFamily: 'Cairo',
    },
    subscribersText: {
      textAlign: 'center',
      color: theme.textSecondary,
      fontSize: 16,
      marginTop: 20,
      fontFamily: 'Cairo',
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
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
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
    },
    fullWidthButton: {
      width: '100%',
    },
    buttonText: {
      color: theme.white,
      fontWeight: 'bold',
      fontSize: 16,
      marginLeft: 8,
      fontFamily: 'Cairo',
    },
    acceptButton: {
      backgroundColor: theme.success,
    },
    rejectButton: {
      backgroundColor: theme.destructive,
    },
    doneButton: {
      backgroundColor: theme.primary,
    },
  });
};

export default TicketDetailPage;