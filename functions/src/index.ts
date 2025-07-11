/**
 * Import function triggers and dependencies.
 */
import { Expo, ExpoPushMessage } from "expo-server-sdk";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";

// --- TYPE DEFINITIONS ---

interface Comment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: any;
  createdAt?: any;
  isStatusChange?: boolean;
}

interface ServiceRequest {
  onLocation: boolean;
  id: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  title: string;
  description: string;
  type: string;
  status: string;
  priority: string;
  date: string;
  createdAt: Timestamp;
  lastUpdated: string;
  assignedUsers?: string[];
  attachments?: string[];
  comments?: Comment[];
  creatorId: string;
  creatorName: string;
  subscribers?: string[];
  subscriberId?: string | null;
  invoiceIds?: string[];
  completionTimestamp?: any;
  onLocationTimestamp?: any;
  estimatedTime?: number;
}

// Define the type for an Announcement, including optional fields
interface Announcement {
  head: string;          // Corresponds to notification title
  body: string;          // Corresponds to notification body
  assignedUsers?: string[]; // Array of user IDs to notify
  imageUrl?: string;     // Optional: URL for a notification image
}


// --- INITIALIZATION ---

// Initialize the Firebase Admin SDK to access Firestore.
admin.initializeApp();

// Initialize the Expo SDK.
const expo = new Expo();


// --- HELPER FUNCTIONS ---

/**
 * A reusable helper function to gather all valid push tokens for a list of user IDs
 * and prepare them for sending.
 * @param {string[]} userIds - An array of user DOCUMENT IDs.
 * @param {object} payload - The notification content.
 * @param {string} payload.title - The title of the notification.
 * @param {string} payload.body - The body of the notification.
 * @param {object} payload.data - The data payload for the notification.
 * @return {Promise<ExpoPushMessage[]>} A promise that resolves to an array of messages
 * ready to be sent by the Expo SDK.
 */
async function getNotificationMessagesForUsers(
  userIds: string[],
  payload: { title: string; body: string; data: { [key: string]: any } }
): Promise<ExpoPushMessage[]> {
  const messages: ExpoPushMessage[] = [];

  // Fetch all user documents in parallel for efficiency.
  const userDocs = await Promise.all(
    userIds.map((id) => admin.firestore().collection("users").doc(id).get())
  );

  for (const userDoc of userDocs) {
    if (!userDoc.exists) {
      logger.warn("User document not found for userId:", userDoc.id);
      continue;
    }

    const userData = userDoc.data();
    if (!userData) {
      logger.warn("User data is empty for userId:", userDoc.id);
      continue;
    }

    // Get the array of push tokens from the user's document.
    const { expoPushTokens } = userData;

    // Check if expoPushTokens is a valid, non-empty array.
    if (Array.isArray(expoPushTokens) && expoPushTokens.length > 0) {
      // Iterate through all tokens for the user (for multi-device support).
      for (const pushToken of expoPushTokens) {
        if (Expo.isExpoPushToken(pushToken)) {
          // If the token is valid, create a message for it.
          messages.push({
            to: pushToken,
            sound: "default",
            title: payload.title,
            body: payload.body,
            data: payload.data,
          });
        } else {
          logger.warn(`Invalid Expo push token found for user ${userDoc.id}:`, pushToken);
        }
      }
    } else {
      logger.log(`No valid push tokens found for user: ${userDoc.id}`);
    }
  }

  return messages;
}


/**
 * Helper function to send notifications in chunks.
 * @param {ExpoPushMessage[]} messages - Array of messages to send.
 * @param {string} logContext - A string describing the context for logging.
 */
async function sendNotifications(messages: ExpoPushMessage[], logContext: string) {
    if (messages.length === 0) {
        return;
    }
    logger.log(`Preparing to send ${messages.length} push notifications for ${logContext}.`);
    const chunks = expo.chunkPushNotifications(messages);
    try {
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
      logger.log(`Push notifications sent successfully for ${logContext}.`);
    } catch (error)      {
      logger.error(`Error sending push notifications for ${logContext}:`, error);
    }
}


// --- SERVICE REQUEST TRIGGERS ---

/**
 * Cloud Function that triggers when a new service request is created.
 * It sends a notification to all initially assigned users.
 */
export const sendNewRequestNotificationOnCreate = onDocumentCreated({ document: "serviceRequests/{requestId}", region: "europe-west1" }, async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    logger.log("No data associated with the creation event, exiting.");
    return;
  }

  const data = snapshot.data() as ServiceRequest;
  const assignedUsers: string[] = data.assignedUsers || [];

  if (assignedUsers.length === 0) {
    logger.log("No users were assigned on creation, no notifications to send.");
    return;
  }

  logger.log(`New service request created. Notifying users: ${assignedUsers.join(", ")}`);

  const messages = await getNotificationMessagesForUsers(assignedUsers, {
    title: `مهمة جديدة: ${data.title}`,
    body: `تم تعيين مهمة جديدة لك. النوع: ${data.type}، الأولوية: ${data.priority}. اضغط للتفاصيل.`,
    data: { type: "serviceRequest", id: snapshot.id },
  });

  await sendNotifications(messages, "new service request");
});


/**
 * Cloud Function that triggers when a service request is updated.
 */
export const serviceRequestUpdateManager = onDocumentUpdated({ document: "serviceRequests/{requestId}", region: "europe-west1" }, async (event) => {
  if (!event.data) {
    logger.log("No data associated with the update event, exiting.");
    return;
  }
  const beforeData = event.data.before.data() as ServiceRequest;
  const afterData = event.data.after.data() as ServiceRequest;
  const requestId = event.params.requestId;

  if (!beforeData || !afterData) {
    logger.log("Missing before or after data in update event, exiting.");
    return;
  }

  // --- Logic for newly assigned users ---
  const beforeUsers: string[] = beforeData.assignedUsers || [];
  const afterUsers: string[] = afterData.assignedUsers || [];
  const newUsers = afterUsers.filter((userId) => !beforeUsers.includes(userId));

  if (newUsers.length > 0) {
    logger.log(`Service request updated. Notifying newly assigned users: ${newUsers.join(", ")}`);
    const messages = await getNotificationMessagesForUsers(newUsers, {
      title: `لقد تم اسناد مهمة لك: ${afterData.title}`,
      body: `تم تعيينك لمهمة قائمة. النوع: ${afterData.type}. اضغط للمتابعة فوراً!`,
      data: { type: "serviceRequest", id: requestId },
    });
    await sendNotifications(messages, "new assignees");
  }

  // --- Logic for new comments ---
  const beforeComments: Comment[] = beforeData.comments || [];
  const afterComments: Comment[] = afterData.comments || [];

  if (afterComments.length > beforeComments.length) {
    const newComment = afterComments[afterComments.length - 1];
    if (newComment.isStatusChange === true) {
      logger.log("A new comment was detected, but it was a status change. No notification will be sent.");
    } else {
      const allAssignedUsers: string[] = afterData.assignedUsers || [];
      const recipients = allAssignedUsers.filter(userId => userId !== newComment.userId);

      if (recipients.length > 0) {
        logger.log(`New comment on ticket ${requestId}. Notifying users: ${recipients.join(", ")}`);
        const bodyContent = newComment.content.length > 100
            ? newComment.content.substring(0, 97) + "..."
            : newComment.content;

        const messages = await getNotificationMessagesForUsers(recipients, {
          title: `تعليق جديد على: ${afterData.title}`,
          body: `${newComment.userName}: ${bodyContent}`,
          data: { type: "serviceRequest", id: requestId },
        });
        await sendNotifications(messages, "new comment");
      } else {
          logger.log("New comment was added, but no other users are assigned to notify.");
      }
    }
  }
});


// --- ANNOUNCEMENT TRIGGER ---

/**
 * Cloud Function that triggers when a new announcement is created.
 * It sends a notification to all users in the `assignedUsers` array.
 */
export const sendAnnouncementNotification = onDocumentCreated({ document: "announcements/{announcementId}", region: "europe-west1" }, async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    logger.log("No data associated with the announcement creation event, exiting.");
    return;
  }

  const announcementData = snapshot.data() as Announcement;
  // Ensure assignedUsers is an array, defaulting to empty if it doesn't exist.
  const assignedUsers: string[] = announcementData.assignedUsers || [];

  if (assignedUsers.length === 0) {
    logger.log("New announcement created, but no users were assigned. No notifications to send.");
    return;
  }

  logger.log(`New announcement received. Notifying users: ${assignedUsers.join(", ")}`);

  // NOTE: The 'imageUrl' from the announcement is not used here because the
  // current Expo-based notification helper ('getNotificationMessagesForUsers') does
  // not support rich notifications with images out-of-the-box.
  if (announcementData.imageUrl) {
    logger.log(`Image URL found but will be ignored by this function: ${announcementData.imageUrl}`);
  }

  // Use the existing helper function to build the notification messages.
  const messages = await getNotificationMessagesForUsers(assignedUsers, {
    title: announcementData.head,
    body: announcementData.body,
    data: { type: "announcement", id: snapshot.id }, // Add data for client-side routing
  });

  // Use the reusable sendNotifications helper to send the messages.
  await sendNotifications(messages, "new announcement");
});