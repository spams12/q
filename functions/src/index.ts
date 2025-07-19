/**
 * Import function triggers and dependencies.
 */
import {
  Expo,
  ExpoPushMessage,
  ExpoPushReceipt,
  ExpoPushSuccessTicket,
  ExpoPushTicket,
} from "expo-server-sdk";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";

// --- TYPE DEFINITIONS ---

// ... (Your existing interfaces: Comment, UserResponse, ServiceRequest, Announcement) ...
// (No changes needed for the interfaces, they are included for completeness)
interface Comment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: any;
  createdAt?: any;
  isStatusChange?: boolean;
}
interface UserResponse {
  response: string;
  timestamp: string;
  userId: string;
  userName: string;
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
  userResponses?: UserResponse[];
}

// Define the type for an Announcement, including optional fields
interface Announcement {
  head: string; // Corresponds to notification title
  body: string; // Corresponds to notification body
  assignedUsers?: string[]; // Array of user IDs to notify
  imageUrl?: string; // Optional: URL for a notification image
}

// --- INITIALIZATION ---

admin.initializeApp();
const expo = new Expo();

// --- NEW: ROBUST NOTIFICATION SENDING AND CLEANUP ---

/**
 * Fetches user tokens and creates a map to track which token belongs to which user.
 * This is crucial for cleaning up expired tokens later.
 * @param {string[]} userIds An array of user document IDs.
 * @returns {Promise<{messages: ExpoPushMessage[], tokenToUserMap: Map<string, string>}>}
 */
async function getMessagesAndTokenMap(
  userIds: string[],
  payload: { title: string; body: string; data: { [key: string]: any } }
): Promise<{
  messages: ExpoPushMessage[];
  tokenToUserMap: Map<string, string>;
}> {
  const messages: ExpoPushMessage[] = [];
  const tokenToUserMap = new Map<string, string>();

  if (!userIds || userIds.length === 0) {
    return { messages, tokenToUserMap };
  }

  const userDocs = await Promise.all(
    userIds.map((id) => admin.firestore().collection("users").doc(id).get())
  );

  for (const userDoc of userDocs) {
    if (!userDoc.exists) continue;
    const userData = userDoc.data();
    if (!userData || !Array.isArray(userData.expoPushTokens)) continue;

    for (const token of userData.expoPushTokens) {
      if (Expo.isExpoPushToken(token)) {
        messages.push({ to: token, sound: "default", ...payload });
        tokenToUserMap.set(token, userDoc.id); // Map token back to user ID
      }
    }
  }
  return { messages, tokenToUserMap };
}

/**
 * Processes push receipts to find and flag expired tokens for removal.
 * @param {ExpoPushReceipt[]} receipts The receipts for those tickets.
 * @param {Map<string, string>} ticketIdToTokenMap A map of push ticket IDs to tokens.
 * @param {Map<string, string>} tokenToUserMap A map of push tokens to user IDs.
 * @returns {Map<string, string[]>} A map of user IDs to an array of their expired tokens.
 */
function flagInvalidTokens(
  receipts: { [receiptId: string]: ExpoPushReceipt },
  ticketIdToTokenMap: Map<string, string>,
  tokenToUserMap: Map<string, string>
): Map<string, string[]> {
  const tokensToRemoveByUser = new Map<string, string[]>();

  for (const receiptId in receipts) {
    const receipt = receipts[receiptId];
    if (
      receipt.status === "error" &&
      receipt.details?.error === "DeviceNotRegistered"
    ) {
      const token = ticketIdToTokenMap.get(receiptId);
      if (token) {
        const userId = tokenToUserMap.get(token);
        if (userId) {
          if (!tokensToRemoveByUser.has(userId)) {
            tokensToRemoveByUser.set(userId, []);
          }
          tokensToRemoveByUser.get(userId)!.push(token);
          logger.log(`Flagged token ${token} for removal for user ${userId}.`);
        }
      }
    }
  }

  return tokensToRemoveByUser;
}

/**
 * Orchestrates sending notifications, handling retries, and cleaning up invalid tokens.
 * This is the new main function to call from your triggers.
 * @param {string[]} userIds Array of user IDs to notify.
 * @param {object} payload Notification content.
 * @param {string} logContext A descriptive context for logging.
 */
async function sendNotificationsAndCleanUp(
  userIds: string[],
  payload: { title: string; body: string; data: { [key: string]: any } },
  logContext: string
) {
  const { messages, tokenToUserMap } = await getMessagesAndTokenMap(
    userIds,
    payload
  );
  if (messages.length === 0) {
    logger.log(
      `No valid push tokens found for users in context: ${logContext}.`
    );
    return;
  }

  const chunks = expo.chunkPushNotifications(messages);
  const allTickets: ExpoPushTicket[] = [];
  const ticketIdToTokenMap = new Map<string, string>(); // New map
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second

  logger.log(
    `Sending ${messages.length} notifications in ${chunks.length} chunk(s) for ${logContext}.`
  );

  for (const chunk of chunks) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        allTickets.push(...tickets);

        // --- New: Map ticket IDs to tokens ---
        tickets.forEach((ticket, i) => {
          if (ticket.status === "ok") {
            const token = chunk[i].to as string;
            ticketIdToTokenMap.set(ticket.id, token);
          }
        });
        // -------------------------------------

        logger.log(`Chunk sent successfully on attempt ${attempt + 1}.`);
        break; // Success, exit retry loop for this chunk
      } catch (error) {
        logger.error(`Error sending chunk on attempt ${attempt + 1}:`, error);
        if (attempt === maxRetries - 1) {
          logger.error(
            "Chunk failed after all retries. Giving up on this chunk."
          );
        } else {
          const delay = baseDelay * Math.pow(2, attempt);
          logger.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  // --- Process receipts for cleanup ---
  const receiptIds = allTickets
    .filter((ticket): ticket is ExpoPushSuccessTicket => ticket.status === "ok")
    .map((ticket) => ticket.id);

  if (receiptIds.length === 0) {
    logger.log("No valid tickets to check for receipts.");
    return;
  }

  const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
  let allTokensToRemove = new Map<string, string[]>();

  for (const chunk of receiptIdChunks) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      const tokensToRemove = flagInvalidTokens(
        receipts,
        ticketIdToTokenMap, // Pass the new map
        tokenToUserMap
      );

      // Merge results
      tokensToRemove.forEach((tokens, userId) => {
        if (!allTokensToRemove.has(userId)) allTokensToRemove.set(userId, []);
        allTokensToRemove.get(userId)!.push(...tokens);
      });
    } catch (error) {
      logger.error("Error fetching receipts:", error);
    }
  }

  // --- Perform Firestore cleanup ---
  if (allTokensToRemove.size > 0) {
    logger.log(`Found ${allTokensToRemove.size} users with expired tokens.`);
    const cleanupPromises: Promise<any>[] = [];
    allTokensToRemove.forEach((tokens, userId) => {
      const userRef = admin.firestore().collection("users").doc(userId);
      const promise = userRef.update({
        expoPushTokens: FieldValue.arrayRemove(...tokens),
      });
      cleanupPromises.push(promise);
      logger.log(`Removing ${tokens.length} token(s) for user ${userId}.`);
    });
    await Promise.all(cleanupPromises);
    logger.log("Finished removing all flagged tokens from Firestore.");
  }
}

// --- REFACTORED TRIGGERS ---

export const sendNewRequestNotificationOnCreate = onDocumentCreated(
  { document: "serviceRequests/{requestId}", region: "europe-west1" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const data = snapshot.data() as ServiceRequest;

    await sendNotificationsAndCleanUp(
      data.assignedUsers || [],
      {
        title: `مهمة جديدة: ${data.title}`,
        body: `تم تعيين مهمة جديدة لك. النوع: ${data.type}، الأولوية: ${data.priority}. اضغط للتفاصيل.`,
        data: { type: "serviceRequest", id: snapshot.id },
      },
      "new service request"
    );
  }
);

export const serviceRequestUpdateManager = onDocumentUpdated(
  { document: "serviceRequests/{requestId}", region: "europe-west1" },
  async (event) => {
    if (!event.data) return;
    const beforeData = event.data.before.data() as ServiceRequest;
    const afterData = event.data.after.data() as ServiceRequest;
    const requestId = event.params.requestId;

    // Logic 1: Notify newly assigned users
    const newUsers = (afterData.assignedUsers || []).filter(
      (id) => !(beforeData.assignedUsers || []).includes(id)
    );
    if (newUsers.length > 0) {
      await sendNotificationsAndCleanUp(
        newUsers,
        {
          title: `لقد تم اسناد مهمة لك: ${afterData.title}`,
          body: `تم تعيينك لمهمة قائمة. النوع: ${afterData.type}. اضغط للمتابعة فوراً!`,
          data: { type: "serviceRequest", id: requestId },
        },
        "new assignees"
      );
    }

    // Logic 2: Notify on new comments
    const beforeComments = beforeData.comments || [];
    const afterComments = afterData.comments || [];
    if (afterComments.length > beforeComments.length) {
      const newComment = afterComments[afterComments.length - 1];
      if (!newComment.isStatusChange) {
        const recipients = (afterData.assignedUsers || []).filter(
          (id) => id !== newComment.userId
        );
        const body =
          newComment.content.length > 100
            ? newComment.content.substring(0, 97) + "..."
            : newComment.content;
        await sendNotificationsAndCleanUp(
          recipients,
          {
            title: `تعليق جديد على: ${afterData.title}`,
            body: `${newComment.userName}: ${body}`,
            data: { type: "serviceRequest", id: requestId },
          },
          "new comment"
        );
      }
    }

    // Logic 3: Notify creator when technician is on location
    if (!beforeData.onLocation && afterData.onLocation) {
      await sendNotificationsAndCleanUp(
        [afterData.creatorId],
        {
          title: `تحديث للمهمة: ${afterData.title}`,
          body: "الفني في الموقع الآن.",
          data: { type: "serviceRequest", id: requestId },
        },
        "technician on location"
      );
    }

    // Logic 4: Notify creator on user response
    const beforeResponses = beforeData.userResponses || [];
    const afterResponses = afterData.userResponses || [];
    if (afterResponses.length > beforeResponses.length) {
      const newResponse = afterResponses[afterResponses.length - 1];
      const responseMap: { [key: string]: string } = {
        accepted: `قبل ${newResponse.userName} المهمة.`,
        completed: `أكمل ${newResponse.userName} المهمة بنجاح.`,
      };
      const body =
        responseMap[newResponse.response.toLowerCase()] ||
        `حالة المهمة الآن "${newResponse.response}" بواسطة ${newResponse.userName}.`;

      await sendNotificationsAndCleanUp(
        [afterData.creatorId],
        {
          title: `تحديث لحالة المهمة: ${afterData.title}`,
          body: body,
          data: { type: "serviceRequest", id: requestId },
        },
        "new user response"
      );
    }
  }
);

export const sendAnnouncementNotification = onDocumentCreated(
  { document: "announcements/{announcementId}", region: "europe-west1" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const announcementData = snapshot.data() as Announcement;

    await sendNotificationsAndCleanUp(
      announcementData.assignedUsers || [],
      {
        title: announcementData.head,
        body: announcementData.body,
        data: { type: "announcement", id: snapshot.id },
      },
      "new announcement"
    );
  }
);
