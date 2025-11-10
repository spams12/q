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
let locationUpdateInterval: ReturnType<typeof setInterval> | null = null;

export const setBackgroundTaskUser = (user: User) => {
  currentUserDoc = user;
};

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("Background location task error:", error);
    // Log error to Firebase for debugging
    try {
      await rtdb.ref(`locationErrors/${currentUserDoc?.id || 'unknown'}/${Date.now()}`).set({
        error: error.message || 'Unknown error',
        timestamp: Date.now(),
      });
    } catch (logError) {
      console.error("Failed to log error to RTDB:", logError);
    }
    return;
  }
  
  // Check if we have a valid user document
  if (!currentUserDoc) {
    console.warn("Background location task running without user document");
    return;
  }
  
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (locations.length > 0) {
      const location = locations[0];
      const { latitude, longitude, speed, heading, accuracy } = location.coords;
      
      // Validate location data
      if (latitude === undefined || longitude === undefined) {
        console.warn("Invalid location data received:", location);
        return;
      }
      
      const locationData = {
        latitude,
        longitude,
        speed: speed !== null ? speed : undefined,
        heading: heading !== null ? heading : undefined,
        accuracy: accuracy !== null ? accuracy : undefined,
        timestamp: location.timestamp,
      };
      
      try {
        // Update the activeTechnicians branch in RTDB for live tracking
        await rtdb.ref(`activeTechnicians/${currentUserDoc.id}/location`).set(locationData);
        console.log(`RTDB Location updated for user: ${currentUserDoc.id}`);
      } catch (e: unknown) {
        console.error(
          "Failed to write location to RTDB from background task:",
          e
        );
        // Log error to Firebase for debugging
        try {
          await rtdb.ref(`locationErrors/${currentUserDoc.id}/${Date.now()}`).set({
            error: e instanceof Error ? e.message : String(e),
            timestamp: Date.now(),
            locationData,
          });
        } catch (logError) {
          console.error("Failed to log error to RTDB:", logError);
        }
      }
    } else {
      console.warn("No locations received in background task");
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
    // Check if location services are enabled
    const isLocationEnabled = await Location.hasServicesEnabledAsync();
    if (!isLocationEnabled) {
      Alert.alert(
        "خدمة الموقع غير مفعلة",
        "يجب تفعيل خدمة الموقع في الجهاز لقبول المهمة. يرجى تفعيلها من إعدادات الجهاز."
      );
      setActionLoading(null);
      return;
    }

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

      // Check if we have proper permissions before starting tracking
      const hasPermission = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (!hasPermission) {
        console.warn("Location permission not granted, attempting to request again");
        const { status } = await Location.requestBackgroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "خطأ في الإذن",
            "لم يتم منح إذن الموقع في الخلفية. سيتم محاولة تتبع الموقع بشكل محدود."
          );
        }
      }

      try {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.Balanced, // Reduced from Highest for better battery
          timeInterval: 5000, // Increased from 500ms to 5 seconds to reduce battery drain
          distanceInterval: 10, // Reduced from 50m to 10m for more frequent updates
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: "تتبع الموقع قيد التشغيل",
            notificationBody: "جهازك يقوم بتتبع موقعك للمهمة الحالية",
          },
          pausesUpdatesAutomatically: false, // Ensure updates continue even when app is in background
        });
        console.log("Location tracking started successfully");
      } catch (startError: unknown) {
        console.error("Failed to start location tracking:", startError);
        Alert.alert(
          "خطأ في تتبع الموقع",
          `فشل في بدء تتبع الموقع: ${startError instanceof Error ? startError.message : String(startError)}. سيتم محاولة إعادة البدء تلقائيًا.`
        );
        // Try to start with less aggressive settings
        try {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000, // 10 seconds
            distanceInterval: 20, // 20 meters
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: "تتبع الموقع قيد التشغيل",
              notificationBody: "جهازك يقوم بتتبع موقعك للمهمة الحالية",
            },
          });
        } catch (fallbackError: unknown) {
          console.error("Failed to start location tracking with fallback settings:", fallbackError);
          Alert.alert(
            "خطأ في تتبع الموقع",
            `غير قادر على بدء تتبع الموقع: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}. يرجى التحقق من إعدادات الموقع في الجهاز.`
          );
        }
      }
    }
    
    // Start periodic location updates as a fallback
    startPeriodicLocationUpdates(userdoc);

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
    
    // Check if user has any remaining active tasks, if not stop periodic updates
    try {
      const snapshot = await rtdb.ref(`activeTechnicians/${userdoc.id}/activeTasks`).once('value');
      if (!snapshot.exists() || !snapshot.hasChildren()) {
        stopPeriodicLocationUpdates();
      }
    } catch (error) {
      console.error("Error checking for remaining tasks:", error);
    }
    
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
    
    // Stop periodic location updates
    stopPeriodicLocationUpdates();

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
 * Helper function to check if location tracking is active and restart if needed
 */
export const checkAndRestartLocationTracking = async (userdoc: User) => {
  if (!userdoc) return;
  
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    
    if (!isTracking) {
      console.log("Location tracking not active, attempting to restart...");
      
      // Set the user document for background task
      setBackgroundTaskUser(userdoc);
      
      // Check permissions first
      const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
      const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();
      
      if (foregroundStatus !== "granted" || backgroundStatus !== "granted") {
        console.warn("Location permissions not granted, cannot restart tracking");
        return false;
      }
      
      // Restart location tracking with optimized settings
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
        distanceInterval: 10,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "تتبع الموقع قيد التشغيل",
          notificationBody: "جهازك يقوم بتتبع موقعك للمهمة الحالية",
        },
        pausesUpdatesAutomatically: false,
      });
      
      console.log("Location tracking restarted successfully");
      return true;
    }
    
    return true;
  } catch (error) {
    console.error("Failed to check/restart location tracking:", error);
    return false;
  }
};

/**
 * Function to send periodic location updates to ensure data consistency
 */
export const startPeriodicLocationUpdates = async (userdoc: User) => {
  if (!userdoc) return;
  
  // Clear any existing interval
  if (locationUpdateInterval) {
    clearInterval(locationUpdateInterval);
  }
  
  // Set up periodic location updates every 30 seconds
  locationUpdateInterval = setInterval(async () => {
    try {
      // Check if we still have proper permissions
      const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
      if (foregroundStatus !== "granted") {
        console.warn("Foreground location permission not granted, skipping periodic update");
        return;
      }
      
      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      const { latitude, longitude, speed, heading, accuracy } = location.coords;
      
      // Validate location data
      if (latitude === undefined || longitude === undefined) {
        console.warn("Invalid location data received for periodic update");
        return;
      }
      
      const locationData = {
        latitude,
        longitude,
        speed: speed !== null ? speed : undefined,
        heading: heading !== null ? heading : undefined,
        accuracy: accuracy !== null ? accuracy : undefined,
        timestamp: location.timestamp,
        updateType: "periodic",
      };
      
      // Update the activeTechnicians branch in RTDB
      await rtdb.ref(`activeTechnicians/${userdoc.id}/location`).set(locationData);
      console.log(`Periodic location update sent for user: ${userdoc.id}`);
    } catch (error) {
      console.error("Failed to send periodic location update:", error);
      // Don't clear the interval on error, just log and continue
    }
  }, 30000); // 30 seconds
};

/**
 * Function to stop periodic location updates
 */
export const stopPeriodicLocationUpdates = () => {
  if (locationUpdateInterval) {
    clearInterval(locationUpdateInterval);
    locationUpdateInterval = null;
  }
};

/**
 * Function to verify location permissions and restart tracking if needed
 */
export const verifyAndMaintainLocationTracking = async (userdoc: User) => {
  if (!userdoc) return;
  
  try {
    // Check if location services are enabled
    const isLocationEnabled = await Location.hasServicesEnabledAsync();
    if (!isLocationEnabled) {
      console.warn("Location services are disabled");
      return false;
    }
    
    // Check foreground permissions
    const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
    if (foregroundStatus !== "granted") {
      console.warn("Foreground location permission not granted");
      return false;
    }
    
    // Check background permissions
    const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();
    if (backgroundStatus !== "granted") {
      console.warn("Background location permission not granted");
      return false;
    }
    
    // Check if background location tracking is active
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (!isTracking) {
      console.log("Location tracking not active, restarting...");
      
      // Set the user document for background task
      setBackgroundTaskUser(userdoc);
      
      // Restart location tracking
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
        distanceInterval: 10,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "تتبع الموقع قيد التشغيل",
          notificationBody: "جهازك يقوم بتتبع موقعك للمهمة الحالية",
        },
        pausesUpdatesAutomatically: false,
      });
      
      console.log("Location tracking restarted successfully");
    }
    
    return true;
  } catch (error) {
    console.error("Error verifying location tracking:", error);
    return false;
  }
};

/**
 * Helper function to remove a task from a user's active list in RTDB.
 * If it's the last task, it stops location tracking and removes the user's record.
 */
const cleanupTaskFromRtdb = async (userUid: string, taskId: string) => {
  if (!userUid || !taskId) return;

  try {
    await rtdb.ref(`activeTechnicians/${userUid}/activeTasks/${taskId}`).remove();
    console.log(`Removed task ${taskId} from RTDB for user ${userUid}.`);
  } catch (error: unknown) {
    console.error(`Failed to remove task ${taskId} from RTDB for user ${userUid}:`, error);
  }

  try {
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
  } catch (error: unknown) {
    console.error(`Error during cleanup for user ${userUid}:`, error);
  }
};