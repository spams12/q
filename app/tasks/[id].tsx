import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useTheme } from '@/context/ThemeContext';
import { db } from '@/lib/firebase';
import { Comment, ServiceRequest } from '@/lib/types';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

const TaskDetailsScreen = () => {
  const { id } = useLocalSearchParams();
  const { theme } = useTheme();
  const router = useRouter();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (typeof id !== 'string') return;

    const docRef = doc(db, 'serviceRequests', id);
    const getRequest = async () => {
      try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setRequest({ id: docSnap.id, ...docSnap.data() } as ServiceRequest);
        } else {
          console.log('No such document!');
        }
      } catch (error) {
        console.error("Error fetching document:", error);
      } finally {
        setLoading(false);
      }
    };

    getRequest();

    const commentsRef = collection(db, 'serviceRequests', id, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const commentsData: Comment[] = [];
      querySnapshot.forEach((doc) => {
        commentsData.push({ id: doc.id, ...doc.data() } as Comment);
      });
      setComments(commentsData);
    });

    return () => unsubscribe();
  }, [id]);

  const handleAddComment = async () => {
    if (newComment.trim() === '' || typeof id !== 'string') return;

    setIsSubmitting(true);
    try {
      const commentsRef = collection(db, 'serviceRequests', id, 'comments');
      await addDoc(commentsRef, {
        text: newComment,
        userId: 'current_user_id', // Replace with actual user ID
        userName: 'Current User', // Replace with actual user name
        createdAt: serverTimestamp(),
      });
      setNewComment('');
    } catch (error) {
      console.error("Error adding comment: ", error);
      Alert.alert('Error', 'Could not add comment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
        <ThemedText>Loading task details...</ThemedText>
      </ThemedView>
    );
  }

  if (!request) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Task not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }}>
      <ThemedView style={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <ThemedText type="title" style={styles.title}>{request.title}</ThemedText>

        <View style={styles.detailsGrid}>
            <DetailItem label="Customer" value={request.customerName} />
            <DetailItem label="Phone" value={request.customerPhone} />
            <DetailItem label="Status" value={request.status} />
            <DetailItem label="Priority" value={request.priority} />
            <DetailItem label="Type" value={request.type} />
            <DetailItem label="Created At" value={formatTimestamp(request.createdAt)} />
        </View>
        
        <ThemedText style={styles.description}>{request.description}</ThemedText>

        <Section title="Comments">
          <FlatList
            data={comments}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.commentContainer}>
                <ThemedText style={styles.commentUser}>{item.userName}</ThemedText>
                <ThemedText style={styles.commentText}>{item.text}</ThemedText>
                <ThemedText style={styles.commentDate}>{formatTimestamp(item.createdAt)}</ThemedText>
              </View>
            )}
            ListEmptyComponent={<ThemedText>No comments yet.</ThemedText>}
          />
          <View style={styles.addCommentContainer}>
            <TextInput
              style={[styles.commentInput, { color: theme.text, borderColor: theme.text }]}
              placeholder="Add a comment..."
              placeholderTextColor="#888"
              value={newComment}
              onChangeText={setNewComment}
            />
            <TouchableOpacity onPress={handleAddComment} disabled={isSubmitting} style={[styles.submitButton, { backgroundColor: theme.tabActive }]}>
              {isSubmitting ? <ActivityIndicator color="#fff" /> : <Feather name="send" size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        </Section>

        <Section title="Invoices">
          {request.invoiceIds && request.invoiceIds.length > 0 ? (
            request.invoiceIds.map(invoiceId => (
              <ThemedText key={invoiceId}>Invoice ID: {invoiceId}</ThemedText>
            ))
          ) : (
            <ThemedText>No associated invoices.</ThemedText>
          )}
        </Section>
      </ThemedView>
    </ScrollView>
  );
};

const Section: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <ThemedText type="subtitle" style={styles.sectionTitle}>{title}</ThemedText>
    {children}
  </View>
);

const DetailItem: React.FC<{ label: string, value: string }> = ({ label, value }) => (
    <View style={styles.detailItem}>
        <ThemedText style={styles.detailLabel}>{label}</ThemedText>
        <ThemedText style={styles.detailValue}>{value}</ThemedText>
    </View>
);

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    padding: 20,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 1,
  },
  title: {
    marginBottom: 20,
    textAlign: 'center',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  detailItem: {
    width: '48%',
    marginBottom: 15,
  },
  detailLabel: {
    fontWeight: 'bold',
    opacity: 0.7,
  },
  detailValue: {
    fontSize: 16,
  },
  description: {
    marginBottom: 30,
    fontSize: 16,
    lineHeight: 24,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    paddingBottom: 5,
  },
  commentContainer: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 10,
  },
  commentUser: {
    fontWeight: 'bold',
  },
  commentText: {
    marginTop: 5,
  },
  commentDate: {
    marginTop: 5,
    fontSize: 12,
    color: '#888',
    textAlign: 'right',
  },
  addCommentContainer: {
    flexDirection: 'row',
    marginTop: 10,
    alignItems: 'center',
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 5,
    padding: 10,
    marginRight: 10,
  },
  submitButton: {
    padding: 10,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default TaskDetailsScreen;