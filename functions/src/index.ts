/**
 * Import function triggers and dependencies.
 */
import { Expo, ExpoPushMessage } from "expo-server-sdk";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";

// Initialize the Firebase Admin SDK to access Firestore.
admin.initializeApp();

// Initialize the Expo SDK.
const expo = new Expo();

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
          // Optional: You could add logic here to remove invalid tokens from Firestore.
        }
      }
    } else {
      logger.log(`No valid push tokens found for user: ${userDoc.id}`);
    }
  }

  return messages;
}


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

  const data = snapshot.data();
  // Ensure assignedUsers is an array, defaulting to empty if it doesn't exist.
  const assignedUsers: string[] = data.assignedUsers || [];

  if (assignedUsers.length === 0) {
    logger.log("No users were assigned on creation, no notifications to send.");
    return;
  }

  logger.log(`New service request created. Notifying users: ${assignedUsers.join(", ")}`);

  // Use the helper function to build the notification messages.
  const messages = await getNotificationMessagesForUsers(assignedUsers, {
    title: `مهمة جديدة: ${data.title}`,
    body: `تم تعيين مهمة جديدة لك. النوع: ${data.type}، الأولوية: ${data.priority}. اضغط للتفاصيل.`,
    data: { type: "serviceRequest", id: snapshot.id },
  });

  if (messages.length > 0) {
    logger.log(`Preparing to send ${messages.length} push notifications.`);
    const chunks = expo.chunkPushNotifications(messages);
    try {
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
      logger.log("Push notifications sent successfully for new document.");
    } catch (error) {
      logger.error("Error sending push notifications for new document:", error);
    }
  }
});


/**
 * Cloud Function that triggers when a service request is updated.
 * It sends a notification ONLY to users who were newly added to the assignment.
 */
export const sendNewRequestNotificationOnUpdate = onDocumentUpdated({ document: "serviceRequests/{requestId}", region: "europe-west1" }, async (event) => {
  if (!event.data) {
    logger.log("No data associated with the update event, exiting.");
    return;
  }
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  if (!beforeData || !afterData) {
    logger.log("Missing before or after data in update event, exiting.");
    return;
  }

  // Ensure arrays exist, default to empty.
  const beforeUsers: string[] = beforeData.assignedUsers || [];
  const afterUsers: string[] = afterData.assignedUsers || [];

  // Determine which users are newly assigned by filtering.
  const newUsers = afterUsers.filter((userId) => !beforeUsers.includes(userId));

  if (newUsers.length === 0) {
    logger.log("No new users were assigned in this update.");
    return;
  }

  logger.log(`Service request updated. Notifying newly assigned users: ${newUsers.join(", ")}`);

  // Use the helper function to build messages for the new users.
  const messages = await getNotificationMessagesForUsers(newUsers, {
    title: `لقد تم اسناد مهمة لك: ${afterData.title}`,
    body: `تم تعيينك لمهمة قائمة. النوع: ${afterData.type}. اضغط للمتابعة فوراً!`,
    data: { type: "serviceRequest", id: event.params.requestId },
  });

  if (messages.length > 0) {
    logger.log(`Preparing to send ${messages.length} push notifications to new assignees.`);
    const chunks = expo.chunkPushNotifications(messages);
    try {
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
      logger.log("Push notifications sent successfully for updated document.");
    } catch (error) {
      logger.error("Error sending push notifications for updated document:", error);
    }
  }
});