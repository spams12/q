import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getAuth } from 'firebase/auth';
import { get, remove, ref as rtdbRef, set } from "firebase/database";
import {
    arrayUnion,
    doc,
    runTransaction,
    Timestamp,
    updateDoc
} from 'firebase/firestore';
import { Alert } from 'react-native';

import { usePermissions } from '@/context/PermissionsContext';
import { db, rtdb } from '../lib/firebase';
import { Comment, ServiceRequest, User } from '../lib/types';

const LOCATION_TASK_NAME = 'background-location-task';

/**
 * Background task to update user's location in Firebase Realtime Database.
 * This ensures dispatchers can see the technician's live location.
 */
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
        console.error('Background location task error:', error);
        return;
    }
    if (data) {
        const { locations } = data as { locations: Location.LocationObject[] };
        const auth = getAuth();
        const user = auth.currentUser;
        const {userdoc} = usePermissions()

        if (user && locations.length > 0 && userdoc) {
            const location = locations[0];
            const { latitude, longitude, speed, heading, accuracy } = location.coords;
            const locationData = {
                latitude,
                longitude,
                speed,
                heading,
                accuracy,
                timestamp: Timestamp.fromMillis(location.timestamp),
            };
            try {
                // Update the activeTechnicians branch in RTDB for live tracking
                const technicianRef = rtdbRef(rtdb, `activeTechnicians/${userdoc.id}/location`);
                await set(technicianRef, locationData);
                console.log(`RTDB Location updated for user: ${userdoc.id}`);
            } catch (e) {
                console.error("Failed to write location to RTDB from background task:", e);
            }
        }
    }
});



export const handleAcceptTask = async (
    id: string,
    userdoc: User,
    setActionLoading: (action: 'accept' | null) => void,
    onSuccess?: (taskId: string) => void // Add onSuccess callback for navigation
) => {
    if (!userdoc) return;
    setActionLoading('accept');
    try {
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        if (foregroundStatus !== 'granted') {
            Alert.alert('Permission Denied', 'Foreground location permission is required to accept the task.');
            setActionLoading(null);
            return;
        }

        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
            Alert.alert('Permission Denied', 'Background location permission is required to track your progress.');
            setActionLoading(null);
            return;
        }

        // Run Firestore transaction to update task status
        const taskTitle = await runTransaction(db, async (transaction) => {
            const docRef = doc(db, 'serviceRequests', id);
            const sfDoc = await transaction.get(docRef);
            if (!sfDoc.exists()) throw "Task document does not exist!";

            const data = sfDoc.data() as ServiceRequest;
            const newUserResponses = data.userResponses ? [...data.userResponses] : [];
            const userResponseIndex = newUserResponses.findIndex(res => res.userId === userdoc.id);

            if (userResponseIndex > -1) {
                newUserResponses[userResponseIndex].response = 'accepted';
            } else {
                newUserResponses.push({ userId: userdoc.id, userName: userdoc.name || 'Unknown', response: 'accepted', timestamp: new Date().toISOString() });
            }

            const newComment: Comment = {
                id: `${Date.now()}`,
                content: "قبلت المهمة وسأعمل عليها",
                userId: userdoc.id,
                userName: userdoc.name || 'النظام',
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

            return data.title; // Return title for RTDB
        });

        // Add task to Realtime Database for live tracking
        const technicianTaskRef = rtdbRef(rtdb, `activeTechnicians/${userdoc.id}/activeTasks/${id}`);
        await set(technicianTaskRef, {
            title: taskTitle,
            acceptedAt: Date.now(),
        });

        // Start location tracking if not already running
        const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (!isTracking) {
            await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                accuracy: Location.Accuracy.Balanced,
                timeInterval: 500,
                distanceInterval: 50,
                showsBackgroundLocationIndicator: true,
                foregroundService: {
                    notificationTitle: 'يتم تتبع موقعك',
                    notificationBody: ' يتم تتبع موقعك للمهمة الحالية',
                },
            });
        }
        
        // Call the success callback to trigger navigation
        if (onSuccess) {
            onSuccess(id);
        }

    } catch (e) {
        console.error("Failed to handle accept action: ", e);
        Alert.alert("Error", `Failed to accept the task: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        setActionLoading(null);
    }
};

/**
 * Rejects a task, updating Firestore and ensuring it's removed from RTDB.
 */
export const handleRejectTask = async (
    id: string,
    userdoc: User,
    setActionLoading: (action: 'reject' | null) => void // Corrected type
) => {
    if (!userdoc) return;
    setActionLoading('reject');
    try {
        // First, check if this task was active for the user and clean it up from RTDB
        await cleanupTaskFromRtdb(userdoc.id, id);

        // Then, update Firestore to reflect the rejection
        await runTransaction(db, async (transaction) => {
            const docRef = doc(db, 'serviceRequests', id);
            const sfDoc = await transaction.get(docRef);
            if (!sfDoc.exists()) throw "Document does not exist!";

            const data = sfDoc.data() as ServiceRequest;
            const newUserResponses = data.userResponses ? [...data.userResponses] : [];
            const userResponseIndex = newUserResponses.findIndex(res => res.userId === userdoc.id);

            if (userResponseIndex > -1) {
                newUserResponses[userResponseIndex].response = 'rejected';
            } else {
                newUserResponses.push({ userId: userdoc.id, userName: userdoc.name || 'Unknown', response: 'rejected', timestamp: new Date().toISOString() });
            }

            const newComment: Comment = {
                id: `${Date.now()}`,
                content: `رفض المستخدم ${userdoc.name} المهمة.`,
                userId: userdoc.id,
                userName: userdoc.name || 'النظام',
                timestamp: Timestamp.now(),
                isStatusChange: true,
            };

            transaction.update(docRef, {
                userResponses: newUserResponses,
                comments: arrayUnion(newComment),
                lastUpdated: Timestamp.now(),
            });
        });
        Alert.alert('تم', 'تم تسجيل رفضك للمهمة.');
    } catch (e) {
        console.error("Failed to handle reject action: ", e);
        Alert.alert('Error', 'Failed to record your rejection.');
    } finally {
        setActionLoading(null);
    }
};


/**
 * Logs the technician's arrival at the task location.
 */
export const handleLogArrival = async (
    id: string,
    userdoc: User,
    estimatedDuration: number,
    timeUnit: 'minutes' | 'hours',
    setActionLoading: (action: string | null) => void
) => {
    if (!userdoc) return;

    setActionLoading('logArrival');
    const unitText = timeUnit === 'hours' ? 'ساعة' : 'دقيقة';
    const pluralUnitText = timeUnit === 'hours' ? 'ساعات' : 'دقائق';
    const durationText = estimatedDuration === 1 ? unitText : (estimatedDuration === 2 ? (timeUnit === 'hours' ? 'ساعتان' : 'دقيقتان') : pluralUnitText);

    const arrivalComment: Comment = {
        id: `${Date.now()}-${userdoc.id}`,
        userId: userdoc.id,
        userName: userdoc.name || 'Unknown',
        timestamp: Timestamp.now(),
        content: `وصل الفني للموقع. مدة العمل المقدرة: ${estimatedDuration} ${durationText}.`,
        isStatusChange: true,
    };

    try {
        const docRef = doc(db, 'serviceRequests', id);
        await updateDoc(docRef, {
            onLocation: true,
            onLocationTimestamp: Timestamp.now(),
            estimatedTime: timeUnit === 'hours' ? estimatedDuration * 60 : estimatedDuration,
            comments: arrayUnion(arrivalComment),
            lastUpdated: Timestamp.now(),
        });
        Alert.alert("نجاح", "تم تسجيل الوصول بنجاح.");
    } catch (error) {
        console.error("Error logging arrival:", error);
        Alert.alert("خطأ", `فشل تسجيل الوصول: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        setActionLoading(null);
    }
};


/**
 * Marks a task as done by the current user.
 * This function updates Firestore and cleans up the task from Realtime Database.
 */
export const handleMarkAsDone = async (
    id: string,
    userdoc: User,
    currentServiceRequest: ServiceRequest,
    setActionLoading: (action: string | null) => void
) => {
    if (!userdoc) return;
    setActionLoading('markAsDone');
    try {
        // Step 1: Clean up the task from Realtime Database. This also stops tracking if it's the last task.
        await cleanupTaskFromRtdb(userdoc.id, id);

        // Step 2: Run Firestore transaction to update the task state.
        await runTransaction(db, async (transaction) => {
            const docRef = doc(db, 'serviceRequests', id);
            const sfDoc = await transaction.get(docRef);

            if (!sfDoc.exists()) throw "Document does not exist!";
            
            // Re-fetch the latest data inside the transaction
            const latestServiceRequest = sfDoc.data() as ServiceRequest;

            const userCompletionResponse = {
                userId: userdoc.id,
                userName: userdoc.name || 'Unknown',
                response: "completed" as const,
                timestamp: new Date().toISOString(),
            };

            const newUserResponses = [...(latestServiceRequest.userResponses || [])];
            const userResponseIndex = newUserResponses.findIndex(res => res.userId === userdoc.id);

            if (userResponseIndex > -1) {
                newUserResponses[userResponseIndex] = userCompletionResponse;
            } else {
                newUserResponses.push(userCompletionResponse);
            }

            const completionComment: Comment = {
                id: `${Date.now()}-${userdoc.id}`,
                userId: userdoc.id,
                userName: userdoc.name || 'Unknown',
                timestamp: Timestamp.now(),
                content: `أكمل ${userdoc.name} الجزء الخاص به من المهمة.`,
                isStatusChange: true,
            };

            const assignedUserIds = new Set(latestServiceRequest.assignedUsers);
            const completedUserIds = new Set(newUserResponses.filter(r => r.response === 'completed').map(r => r.userId));

            const allAssignedUsersCompleted = [...assignedUserIds].every(userId => completedUserIds.has(userId));
            
            const updatePayload: { [key: string]: any } = {
                userResponses: newUserResponses,
                comments: arrayUnion(completionComment),
                lastUpdated: Timestamp.now(),
            };

            if (allAssignedUsersCompleted) {
                updatePayload.status = "مكتمل";
                updatePayload.completionTimestamp = Timestamp.now();
            }

            transaction.update(docRef, updatePayload);
        });

        Alert.alert("نجاح", "تم تحديث حالة مهمتك بنجاح.");

    } catch (e) {
        console.error("Transaction failed: ", e);
        Alert.alert("خطأ", `فشل تحديث الحالة: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        setActionLoading(null);
    }
};


/**
 * Helper function to remove a task from a user's active list in RTDB.
 * If it's the last task, it stops location tracking and removes the user's record.
 */
const cleanupTaskFromRtdb = async (userUid: string, taskId: string) => {
    if (!userUid || !taskId) return;
  
    const taskRef = rtdbRef(rtdb, `activeTechnicians/${userUid}/activeTasks/${taskId}`);
    await remove(taskRef);
    console.log(`Removed task ${taskId} from RTDB for user ${userUid}.`);
  
    const remainingTasksRef = rtdbRef(rtdb, `activeTechnicians/${userUid}/activeTasks`);
    const snapshot = await get(remainingTasksRef);
  
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  
    if (!snapshot.exists() || !snapshot.hasChildren()) {
      console.log(`No active tasks left for user ${userUid}. Stopping tracking.`);
      if (isTracking) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        // Also remove the technician's top-level node from RTDB to keep it clean
        const technicianRef = rtdbRef(rtdb, `activeTechnicians/${userUid}`);
        await remove(technicianRef);
        console.log(`Stopped tracking and removed RTDB record for user ${userUid}.`);
      }
    }
  };