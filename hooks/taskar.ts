import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Alert } from "react-native";

import firestore from "@react-native-firebase/firestore";
import { db, rtdb } from "../lib/firebase";
import { Comment, ServiceRequest, User } from "../lib/types";

const LOCATION_TASK_NAME = "background-location-task";

/**
 * Background task to update user's location in Firebase Realtime Database.
 * This ensures dispatchers can see the technician's live location.
 */
// Store the current user document for the background task
let currentUserDoc: User | null = null;

export const setBackgroundTaskUser = (user: User) => {
  currentUserDoc = user;
};

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("Background location task error:", error);
    return;
  }
  if (data && currentUserDoc) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (locations.length > 0) {
      const location = locations[0];
      const { latitude, longitude, speed, heading, accuracy } = location.coords;
      const locationData = {
        latitude,
        longitude,
        speed,
        heading,
        accuracy,
        timestamp: location.timestamp,
      };
      try {
        // Update the activeTechnicians branch in RTDB for live tracking
        await rtdb.ref(`activeTechnicians/${currentUserDoc.id}/location`).set(locationData);
        console.log(`RTDB Location updated for user: ${currentUserDoc.id}`);
      } catch (e) {
        console.error(
          "Failed to write location to RTDB from background task:",
          e
        );
      }
    }
  }
});

export const handleAcceptTask = async (
  id: string,
  userdoc: User,
  setActionLoading: (action: "accept" | null) => void,
  onSuccess?: (taskId: string) => void // Add onSuccess callback for navigation
) => {
  if (!userdoc) return;
  setActionLoading("accept");
  try {
    const { status: foregroundStatus } =
      await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== "granted") {
      Alert.alert(
        "طلب إذن الموقع",
        "يجب تفعيل إذن الوصول إلى الموقع لقبول المهمة. يرجى تفعيله من إعدادات الجهاز."
      );
      setActionLoading(null);
      return;
    }

    const { status: backgroundStatus } =
      await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== "granted") {
      Alert.alert(
        "طلب إذن الموقع في الخلفية",
        "يجب تفعيل إذن الوصول إلى الموقع في الخلفية لتتبع تقدملك. يرجى تفعيله من إعدادات الجهاز."
      );
      setActionLoading(null);
      return;
    }

    // Run Firestore transaction to update task status
    const taskTitle = await db.runTransaction(async (transaction) => {
      const docRef = db.doc(`serviceRequests/${id}`);
      const sfDoc = await transaction.get(docRef);
      if (!sfDoc.exists) throw "Task document does not exist!";

      const data = sfDoc.data() as ServiceRequest;
      const newUserResponses = data.userResponses
        ? [...data.userResponses]
        : [];
      const userResponseIndex = newUserResponses.findIndex(
        (res) => res.userId === userdoc.id
      );

      if (userResponseIndex > -1) {
        newUserResponses[userResponseIndex].response = "accepted";
      } else {
        newUserResponses.push({
          userId: userdoc.id,
          userName: userdoc.name || "Unknown",
          response: "accepted",
          timestamp: new Date().toISOString(),
        });
      }

      const newComment: Comment = {
        id: `${Date.now()}`,
        content: "قبلت المهمة وسأعمل عليها",
        userId: userdoc.id,
        userName: userdoc.name || "النظام",
        timestamp: new Date(),
        isStatusChange: true,
      };

      const newStatus = data.status === "مفتوح" ? "قيد المعالجة" : data.status;

      transaction.update(docRef, {
        userResponses: newUserResponses,
        comments: firestore.FieldValue.arrayUnion(newComment),
        status: newStatus,
        lastUpdated: new Date(),
      });

      return data.title; // Return title for RTDB
    });

    // Add task to Realtime Database for live tracking
    await rtdb.ref(`activeTechnicians/${userdoc.id}/activeTasks/${id}`).set({
      title: taskTitle,
      acceptedAt: Date.now(),
    });

    // Start location tracking if not already running
    const isTracking = await Location.hasStartedLocationUpdatesAsync(
      LOCATION_TASK_NAME
    );
    if (!isTracking) {
      // Set the user document for background task
      setBackgroundTaskUser(userdoc);

      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 500,
        distanceInterval: 50,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "تتبع الموقع قيد التشغيل",
          notificationBody: "جهازك يقوم بتتبع موقعك للمهمة الحالية",
        },
      });
    }

    // Call the success callback to trigger navigation
    if (onSuccess) {
      onSuccess(id);
    }
  } catch (e) {
    console.error("Failed to handle accept action: ", e);
    Alert.alert(
      "خطأ في قبول المهمة",
      `حدث خطأ أثناء قبول المهمة: ${e instanceof Error ? e.message : String(e)}\nيرجى المحاولة مرة أخرى أو التواصل مع الدعم الفني.`
    );
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
  setActionLoading: (action: "reject" | null) => void // Corrected type
) => {
  if (!userdoc) return;
  setActionLoading("reject");
  try {
    await cleanupTaskFromRtdb(userdoc.id, id);

    // Then, update Firestore to reflect the rejection
    await db.runTransaction(async (transaction) => {
      const docRef = db.doc(`serviceRequests/${id}`);
      const sfDoc = await transaction.get(docRef);
      if (!sfDoc.exists) throw "Document does not exist!";

      const data = sfDoc.data() as ServiceRequest;
      const newUserResponses = data.userResponses
        ? [...data.userResponses]
        : [];
      const userResponseIndex = newUserResponses.findIndex(
        (res) => res.userId === userdoc.id
      );

      if (userResponseIndex > -1) {
        newUserResponses[userResponseIndex].response = "rejected";
      } else {
        newUserResponses.push({
          userId: userdoc.id,
          userName: userdoc.name || "Unknown",
          response: "rejected",
          timestamp: new Date().toISOString(),
        });
      }

      // Remove user from assignedUsers array
      const newAssignedUsers = (data.assignedUsers || []).filter(
        (userId) => userId !== userdoc.id
      );

      const newComment: Comment = {
        id: `${Date.now()}`,
        content: `رفض المستخدم ${userdoc.name} المهمة.`,
        userId: userdoc.id,
        userName: userdoc.name || "النظام",
        timestamp: new Date(),
        isStatusChange: true,
      };

      transaction.update(docRef, {
        userResponses: newUserResponses,
        comments: firestore.FieldValue.arrayUnion(newComment),
        lastUpdated: new Date(),
        assignedUsers: newAssignedUsers,
      });
    });
    Alert.alert("تم رفض المهمة", "تم تسجيل رفضك للمهمة بنجاح.");
  } catch (e) {
    console.error("Failed to handle reject action: ", e);
    Alert.alert("خطأ", "فشل تسجيل رفضك للمهمة. يرجى المحاولة مرة أخرى.");
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
  timeUnit: "minutes" | "hours",
  setActionLoading: (action: string | null) => void
) => {
  if (!userdoc) return;

  setActionLoading("logArrival");
  const unitText = timeUnit === "hours" ? "ساعة" : "دقيقة";
  const pluralUnitText = timeUnit === "hours" ? "ساعات" : "دقائق";
  const durationText =
    estimatedDuration === 1
      ? unitText
      : estimatedDuration === 2
      ? timeUnit === "hours"
        ? "ساعتان"
        : "دقيقتان"
      : pluralUnitText;

  const arrivalComment: Comment = {
    id: `${Date.now()}-${userdoc.id}`,
    userId: userdoc.id,
    userName: userdoc.name || "Unknown",
    timestamp: new Date(),
    content: `وصل الفني للموقع. مدة العمل المقدرة: ${estimatedDuration} ${durationText}.`,
    isStatusChange: true,
  };

  try {
    const docRef = db.doc(`serviceRequests/${id}`);
    await docRef.update({
      onLocation: true,
      onLocationTimestamp: new Date(),
      estimatedTime:
        timeUnit === "hours" ? estimatedDuration * 60 : estimatedDuration,
      comments: firestore.FieldValue.arrayUnion(arrivalComment),
      lastUpdated: new Date(),
    });
    Alert.alert("تسجيل الوصول", "تم تسجيل وصولك إلى موقع المهمة بنجاح.");
  } catch (error) {
    console.error("Error logging arrival:", error);
    Alert.alert(
      "خطأ في تسجيل الوصول",
      `فشل تسجيل الوصول إلى موقع المهمة: ${
        error instanceof Error ? error.message : String(error)
      }\nيرجى التأكد من اتصالك بالإنترنت والمحاولة مرة أخرى.`
    );
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
  setActionLoading("markAsDone");
  try {
    // Step 1: Clean up the task from Realtime Database. This also stops tracking if it's the last task.
    await cleanupTaskFromRtdb(userdoc.id, id);

    // Step 2: Run Firestore transaction to update the task state.
    await db.runTransaction(async (transaction) => {
      const docRef = db.doc(`serviceRequests/${id}`);
      const sfDoc = await transaction.get(docRef);

      if (!sfDoc.exists) throw "Document does not exist!";

      // Re-fetch the latest data inside the transaction
      const latestServiceRequest = sfDoc.data() as ServiceRequest;

      const userCompletionResponse = {
        userId: userdoc.id,
        userName: userdoc.name || "Unknown",
        response: "completed" as const,
        timestamp: new Date().toISOString(),
      };

      const newUserResponses = [...(latestServiceRequest.userResponses || [])];
      const userResponseIndex = newUserResponses.findIndex(
        (res) => res.userId === userdoc.id
      );

      if (userResponseIndex > -1) {
        newUserResponses[userResponseIndex] = userCompletionResponse;
      } else {
        newUserResponses.push(userCompletionResponse);
      }

      const completionComment: Comment = {
        id: `${Date.now()}-${userdoc.id}`,
        userId: userdoc.id,
        userName: userdoc.name || "Unknown",
        timestamp: new Date(),
        content: `أكمل ${userdoc.name} الجزء الخاص به من المهمة.`,
        isStatusChange: true,
      };

      const assignedUserIds = new Set(latestServiceRequest.assignedUsers);
      const completedUserIds = new Set(
        newUserResponses
          .filter((r) => r.response === "completed")
          .map((r) => r.userId)
      );

      const allAssignedUsersCompleted = [...assignedUserIds].every((userId) =>
        completedUserIds.has(userId)
      );

      const updatePayload: { [key: string]: any } = {
        userResponses: newUserResponses,
        comments: firestore.FieldValue.arrayUnion(completionComment),
        lastUpdated: new Date(),
      };

      if (allAssignedUsersCompleted) {
        updatePayload.status = "مكتمل";
        updatePayload.completionTimestamp = new Date();
      }

      transaction.update(docRef, updatePayload);
    });

    Alert.alert("تحديث الحالة", "تم تحديث حالة مهمتك إلى 'مكتمل' بنجاح.");
  } catch (e) {
    console.error("Transaction failed: ", e);
    Alert.alert(
      "خطأ في تحديث الحالة",
      `فشل تحديث حالة المهمة: ${e instanceof Error ? e.message : String(e)}\nيرجى المحاولة مرة أخرى أو التواصل مع الإدارة.`
    );
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

  await rtdb.ref(`activeTechnicians/${userUid}/activeTasks/${taskId}`).remove();
  console.log(`Removed task ${taskId} from RTDB for user ${userUid}.`);

  const snapshot = await rtdb.ref(`activeTechnicians/${userUid}/activeTasks`).once('value');

  const isTracking = await Location.hasStartedLocationUpdatesAsync(
    LOCATION_TASK_NAME
  );

  if (!snapshot.exists() || !snapshot.hasChildren()) {
    console.log(`No active tasks left for user ${userUid}. Stopping tracking.`);
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      // Also remove the technician's top-level node from RTDB to keep it clean
      await rtdb.ref(`activeTechnicians/${userUid}`).remove();
      console.log(
        `Stopped tracking and removed RTDB record for user ${userUid}.`
      );
    }
  }
};