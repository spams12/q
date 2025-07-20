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
interface Announcement {
  head: string;
  body: string;
  assignedUsers?: string[];
  imageUrl?: string;
}

// --- INITIALIZATION ---
admin.initializeApp();
const expo = new Expo();

// --- ROBUST NOTIFICATION SENDING AND CLEANUP ---

/**
 * [MODIFIED] Fetches user tokens and groups the resulting messages by Expo Project ID.
 * This prevents mixing tokens from different projects in the same API request.
 * @param {string[]} userIdentifiers An array of user identifiers.
 * @param {object} payload The notification payload.
 * @returns {Promise<{
 *   messagesByProject: Map<string, ExpoPushMessage[]>,
 *   tokenToUserMap: Map<string, string>
 * }>} An object containing messages grouped by project ID and a map of tokens to user IDs.
 */
async function getMessagesAndTokenMap(
  userIdentifiers: string[],
  payload: { title: string; body: string; data: { [key: string]: any } }
): Promise<{
  messagesByProject: Map<string, ExpoPushMessage[]>;
  tokenToUserMap: Map<string, string>;
}> {
  const messagesByProject = new Map<string, ExpoPushMessage[]>();
  const tokenToUserMap = new Map<string, string>();

  if (!userIdentifiers || userIdentifiers.length === 0) {
    return { messagesByProject, tokenToUserMap };
  }

  const usersRef = admin.firestore().collection("users");
  const uniqueUserDocs = new Map<string, admin.firestore.DocumentSnapshot>();

  const docIdQuery = usersRef
    .where(admin.firestore.FieldPath.documentId(), "in", userIdentifiers)
    .get();
  const uidQuery = usersRef.where("uid", "in", userIdentifiers).get();
  const [docIdSnapshot, uidSnapshot] = await Promise.all([
    docIdQuery,
    uidQuery,
  ]);

  docIdSnapshot.forEach((doc) => uniqueUserDocs.set(doc.id, doc));
  uidSnapshot.forEach((doc) => uniqueUserDocs.set(doc.id, doc));

  for (const userDoc of uniqueUserDocs.values()) {
    if (!userDoc.exists) continue;
    const userData = userDoc.data();
    if (!userData) continue;

    const userTokensMap = userData.expoPushTokens;

    if (
      typeof userTokensMap !== "object" ||
      userTokensMap === null ||
      Array.isArray(userTokensMap)
    ) {
      logger.warn(
        `User ${userDoc.id} has expoPushTokens in an unexpected format. Expected a map.`,
        userTokensMap
      );
      continue;
    }

    // Iterate over project IDs and their corresponding token arrays
    for (const [projectId, tokenArray] of Object.entries(userTokensMap)) {
      if (!Array.isArray(tokenArray)) {
        logger.warn(
          `Expected an array of tokens for project ${projectId} for user ${userDoc.id}, but got something else.`,
          tokenArray
        );
        continue;
      }

      // Ensure a message array exists for this project ID
      if (!messagesByProject.has(projectId)) {
        messagesByProject.set(projectId, []);
      }
      const projectMessages = messagesByProject.get(projectId)!;

      for (const token of tokenArray) {
        if (Expo.isExpoPushToken(token)) {
          projectMessages.push({ to: token, sound: "default", ...payload });
          tokenToUserMap.set(token, userDoc.id);
        } else {
          logger.warn(
            `Invalid token format found for user ${userDoc.id}:`,
            token
          );
        }
      }
    }
  }

  return { messagesByProject, tokenToUserMap };
}

/**
 * Processes push receipts to find and flag expired tokens for removal.
 * (No changes needed in this function)
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
 * [MODIFIED] Orchestrates sending notifications by project, handling retries,
 * and cleaning up invalid tokens from the correct map field in Firestore.
 * @param {string[]} userIds Array of user IDs to notify.
 * @param {object} payload Notification content.
 * @param {string} logContext A descriptive context for logging.
 */
async function sendNotificationsAndCleanUp(
  userIds: string[],
  payload: { title: string; body: string; data: { [key: string]: any } },
  logContext: string
) {
  const { messagesByProject, tokenToUserMap } = await getMessagesAndTokenMap(
    userIds,
    payload
  );

  if (messagesByProject.size === 0) {
    logger.log(
      `No valid push tokens found for users in context: ${logContext}.`
    );
    return;
  }

  const allTickets: ExpoPushTicket[] = [];
  const ticketIdToTokenMap = new Map<string, string>();
  const tokenToProjectMap = new Map<string, string>(); // To track which project a token belongs to
  const maxRetries = 3;
  const baseDelay = 1000;

  let totalMessages = 0;
  messagesByProject.forEach((messages) => (totalMessages += messages.length));
  logger.log(
    `Sending ${totalMessages} notifications across ${messagesByProject.size} project(s) for ${logContext}.`
  );

  // Iterate over each project and send its notifications separately
  for (const [projectId, messages] of messagesByProject.entries()) {
    logger.log(
      `Processing ${messages.length} notifications for project: ${projectId}`
    );
    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const tickets = await expo.sendPushNotificationsAsync(chunk);
          allTickets.push(...tickets);

          tickets.forEach((ticket, i) => {
            if (ticket.status === "ok") {
              const token = (chunk[i] as ExpoPushMessage).to as string;
              ticketIdToTokenMap.set(
                (ticket as ExpoPushSuccessTicket).id,
                token
              );
              // Also map the token to its project for easy cleanup later
              tokenToProjectMap.set(token, projectId);
            }
          });

          logger.log(
            `Chunk for project ${projectId} sent successfully on attempt ${
              attempt + 1
            }.`
          );
          break; // Success, exit retry loop
        } catch (error) {
          logger.error(
            `Error sending chunk for project ${projectId} on attempt ${
              attempt + 1
            }:`,
            error
          );
          if (attempt === maxRetries - 1) {
            logger.error(
              `Chunk for ${projectId} failed after all retries. Giving up on this chunk.`
            );
          } else {
            const delay = baseDelay * Math.pow(2, attempt);
            logger.log(`Retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
    }
  }

  const receiptIds = allTickets
    .filter((ticket): ticket is ExpoPushSuccessTicket => ticket.status === "ok")
    .map((ticket) => ticket.id);

  if (receiptIds.length === 0) {
    logger.log("No successful tickets to check for receipts.");
    return;
  }

  const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
  let allTokensToRemoveByUser = new Map<string, string[]>();

  for (const chunk of receiptIdChunks) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      const tokensToRemove = flagInvalidTokens(
        receipts,
        ticketIdToTokenMap,
        tokenToUserMap
      );
      // Merge results into the main map
      tokensToRemove.forEach((tokens, userId) => {
        if (!allTokensToRemoveByUser.has(userId)) {
          allTokensToRemoveByUser.set(userId, []);
        }
        allTokensToRemoveByUser.get(userId)!.push(...tokens);
      });
    } catch (error) {
      logger.error("Error fetching receipts:", error);
    }
  }

  if (allTokensToRemoveByUser.size > 0) {
    logger.log(
      `Found ${allTokensToRemoveByUser.size} users with expired tokens to remove.`
    );
    const cleanupPromises: Promise<any>[] = [];
    allTokensToRemoveByUser.forEach((tokens, userId) => {
      const userRef = admin.firestore().collection("users").doc(userId);
      const updates: { [key: string]: FieldValue } = {};

      // Group tokens by project to build the correct update payload
      for (const token of tokens) {
        const projectId = tokenToProjectMap.get(token);
        if (projectId) {
          const fieldPath = `expoPushTokens.${projectId}`;
          // Use FieldValue.arrayRemove on the specific nested array
          updates[fieldPath] = FieldValue.arrayRemove(token);
        }
      }

      if (Object.keys(updates).length > 0) {
        cleanupPromises.push(userRef.update(updates));
        logger.log(
          `Removing tokens for user ${userId} from relevant projects.`
        );
      }
    });

    await Promise.all(cleanupPromises);
    logger.log("Finished removing all flagged tokens from Firestore.");
  }
}

// --- REFACTORED TRIGGERS ---
// (No changes needed in your triggers)

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
