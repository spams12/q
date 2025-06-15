import CommentSection from '@/components/CommentSection';
import { usePermissions } from '@/context/PermissionsContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { arrayUnion, collection, doc, getDocs, onSnapshot, runTransaction, Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Animated, Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { InvoiceList } from '../../components/InvoiceList';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import useFirebaseAuth from '../../hooks/use-firebase-auth';
import { db, uploadCommentAttachment } from '../../lib/firebase';
import { Comment, Invoice, InvoiceItem, MaintenanceItem, NewCustomerInstallationItem, ServiceRequest, StockTransaction, User, UserStockItem } from '../../lib/types';

const { width } = Dimensions.get('window');

const TicketDetailPage = () => {
  const { id } = useLocalSearchParams();
  const { user } = useFirebaseAuth();
  const [serviceRequest, setServiceRequest] = useState<ServiceRequest | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [currentUserResponse, setCurrentUserResponse] = useState<'pending' | 'accepted' | 'rejected' | 'completed' | null>(null);
  const [slideAnim] = useState(new Animated.Value(0));
  const { userUid } = usePermissions();

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
          const response = data.userResponses.find(r => r.userId === user.uid);
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
          newUserResponses.push({ userId: user.uid, response: 'accepted', timestamp: Timestamp.now() });
        }

        const newComment: Comment = {
          id: `${Date.now()}`,
          content: `قبل المستخدم ${user.displayName} المهمة.`,
          userId: user.uid,
          userName: user.displayName || 'النظام',
          createdAt: Timestamp.now(),
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
          newUserResponses.push({ userId: user.uid, response: 'rejected', timestamp: Timestamp.now() });
        }

        const newComment: Comment = {
          id: `${Date.now()}`,
          content: `رفض المستخدم ${user.displayName} المهمة.`,
          userId: user.uid,
          userName: user.displayName || 'النظام',
          createdAt: Timestamp.now(),
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

        if (comment.attachments && comment.attachments.length > 0) {
          const attachmentPromises = (comment.attachments as any[]).map(file =>
            uploadCommentAttachment(file, id as string)
          );
          const uploadedAttachments = await Promise.all(attachmentPromises);
          newComment.attachments = uploadedAttachments;
        }

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
          installItem.connectorType?.forEach(c => requiredStock[c] = (requiredStock[c] || 0) + 1);
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
          const stockItem = stockToUpdate.find(s => s.name === itemName);
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
          serviceRequestId: serviceRequest.id,
          customerId: currentServiceRequest.customerId,
          customerName: currentServiceRequest.customerName,
          issueDate: Timestamp.now(),
          dueDate: Timestamp.now(),
          totalAmount,
          status: 'draft',
          items,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        transaction.set(newInvoiceRef, newInvoice);

        for (const itemName in requiredStock) {
          const requiredQty = requiredStock[itemName];
          const stockItemIndex = stockToUpdate.findIndex(s => s.name === itemName);

          if (stockItemIndex > -1) {
            const originalQty = stockToUpdate[stockItemIndex].quantity;
            stockToUpdate[stockItemIndex].quantity -= requiredQty;
            
            const newTransaction: Omit<StockTransaction, 'id'> = {
              stockItemId: stockToUpdate[stockItemIndex].stockItemId,
              stockItemName: itemName,
              userId: user.uid,
              userName: user.displayName || 'غير محدد',
              type: 'out',
              quantityChange: -requiredQty,
              newQuantity: stockToUpdate[stockItemIndex].quantity,
              date: Timestamp.now(),
              serviceRequestId: serviceRequest.id,
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
          <Ionicons name="alert-circle-outline" size={48} color="#F44336" />
          <ThemedText style={styles.errorText}>خطأ: {error}</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!serviceRequest) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="document-outline" size={48} color="#666" />
          <ThemedText style={styles.errorText}>لم يتم العثور على التذكرة.</ThemedText>
        </View>
      </ThemedView>
    );
  }

  

  const renderTabContent = () => {
    switch (activeTab) {
      case 0:
        return (
          <>
            <View style={styles.detailsContainer}>
              <ThemedText style={styles.detailsTitle}>تفاصيل العميل</ThemedText>
              <View style={styles.detailItem}>
                <Ionicons name="person-outline" size={20} color="#666" style={styles.detailIcon} />
                <ThemedText style={styles.detailText}>{serviceRequest.customerName}</ThemedText>
              </View>
              <View style={styles.detailItem}>
                <Ionicons name="location-outline" size={20} color="#666" style={styles.detailIcon} />
                <ThemedText style={styles.detailText}>{serviceRequest.customerEmail}</ThemedText>
              </View>
              <View style={styles.detailItem}>
                <Ionicons name="call-outline" size={20} color="#666" style={styles.detailIcon} />
                <ThemedText style={styles.detailText}>{serviceRequest.customerPhone}</ThemedText>
              </View>
            </View>
            <View style={styles.detailsContainer}>
              <ThemedText style={styles.detailsTitle}>الوصف</ThemedText>
              <ThemedText style={styles.detailText}>{serviceRequest.description}</ThemedText>
                  <CommentSection
              comments={serviceRequest.comments || []}
              users={users}
              currentUserId={userUid}
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
      case 2:
        return <ThemedText style={styles.subscribersText}>محتوى المشتركين</ThemedText>;
      default:
        return null;
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header with gradient */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTop}>
            <ThemedText style={styles.headerTitle}>{serviceRequest.title}</ThemedText>
            <ThemedText style={styles.headerSubtitle}>تذكرة #{id}</ThemedText>
          </View>
          <View style={styles.badgeContainer}>
            <View style={[styles.badge, getStatusStyle(serviceRequest.status)]}>
              <ThemedText style={styles.badgeText}>{serviceRequest.status}</ThemedText>
            </View>
            <View style={[styles.badge, getPriorityStyle(serviceRequest.priority)]}>
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
              color={activeTab === index ? '#667eea' : '#666'}
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

      {/* Content */}
      <ScrollView style={styles.contentScrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.contentContainer}>
          {renderTabContent()}
        </View>
      </ScrollView>

      {/* Action Buttons */}
      {(currentUserResponse === 'pending' || currentUserResponse === 'accepted') && (
        <LinearGradient
          colors={['rgba(255,255,255,0.95)', '#ffffff']}
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

const getStatusStyle = (status: string) => {
  switch (status) {
    case 'مفتوح': return { backgroundColor: '#4CAF50' };
    case 'قيد المعالجة': return { backgroundColor: '#FFC107' };
    case 'مكتمل': return { backgroundColor: '#2196F3' };
    case 'معلق': return { backgroundColor: '#9E9E9E' };
    case 'ملغي': return { backgroundColor: '#F44336' };
    default: return { backgroundColor: '#E0E0E0' };
  }
};

const getPriorityStyle = (priority: string) => {
  switch (priority) {
    case 'عاجل': return { backgroundColor: '#F44336' };
    case 'مرتفع': return { backgroundColor: '#FF9800' };
    case 'متوسط': return { backgroundColor: '#FFC107' };
    case 'منخفض': return { backgroundColor: '#4CAF50' };
    default: return { backgroundColor: '#E0E0E0' };
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
    fontFamily: 'System',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    fontFamily: 'System',
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
    color: '#ffffff',
    textAlign: 'right',
    fontFamily: 'System',
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
    fontFamily: 'System',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  badgeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
    fontFamily: 'System',
  },
  tabBarContainer: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
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
    backgroundColor: '#667eea',
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
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
    fontFamily: 'System',
  },
  activeTabText: {
    color: '#667eea',
  },
  contentScrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 0,
  },
  detailsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
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
    color: '#333',
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
    color: '#555',
    textAlign: 'right',
    flex: 1,
  },
  loadingUserText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 16,
    marginTop: 20,
    fontFamily: 'System',
  },
  subscribersText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 16,
    marginTop: 20,
    fontFamily: 'System',
  },
  actionsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
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
    shadowColor: '#000',
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
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
    fontFamily: 'System',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#F44336',
  },
  doneButton: {
    backgroundColor: '#2196F3',
  },
});

export default TicketDetailPage;