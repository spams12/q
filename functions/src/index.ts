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

interface FileAttachment {
  name: string;
  type: string;
  url: string;
}

interface Comment {
  id: string;
  userId: string; // Can be Firestore Document ID
  userName: string;
  content: string;
  timestamp: any;
  createdAt?: any;
  isStatusChange?: boolean;
}
interface UserResponse {
  response: string;
  timestamp: string;
  userId: string; // Can be Firestore Document ID
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
  assignedUsers?: string[]; // Can be a mix of UIDs and Document IDs
  attachments?: string[];
  comments?: Comment[];
  creatorId: string; // This is the user's Auth UID
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
  assignedUsers?: string[]; // Can be a mix of UIDs and Document IDs
  imageUrls?: string[];
  fileAttachments?: FileAttachment[];
}

// --- NEW SCALABLE NOTIFICATION SCHEMA ---
/**
 * Represents a notification document stored in a user's subcollection.
 * Path: /users/{userId}/notifications/{notificationId}
 */
interface UserSpecificNotification {
  title: string;
  body: string;
  data: { [key: string]: any };
  createdAt: FieldValue;
  isRead: boolean;
  readAt: FieldValue | null;
  imageUrls?: string[];
  fileAttachments?: FileAttachment[];
}

// --- INITIALIZATION ---
admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

// --- HELPER FUNCTIONS ---

/**
 * REFACTORED: Creates a separate notification document for EACH recipient.
 * This is the "fan-out on write" pattern, which is highly scalable for querying.
 * @returns A map of userId to their new notification document ID.
 */
async function createFanOutNotificationDocuments(
  userIds: string[],
  payload: {
    title: string;
    body: string;
    data: { [key: string]: any };
    imageUrls?: string[];
    fileAttachments?: FileAttachment[];
  }
): Promise<Map<string, string>> {
  if (!userIds || userIds.length === 0) {
    logger.log("No users provided, skipping notification document creation.");
    return new Map();
  }

  const batch = db.batch();
  const userToNotificationIdMap = new Map<string, string>();

  // This function expects `userIds` to be Firestore Document IDs.
  // The orchestrator function is responsible for resolving them.
  for (const userId of userIds) {
    const userNotificationsRef = db
      .collection("users")
      .doc(userId)
      .collection("notifications");
    const notificationDocRef = userNotificationsRef.doc();

    const notificationData: UserSpecificNotification = {
      title: payload.title,
      body: payload.body,
      data: payload.data,
      createdAt: FieldValue.serverTimestamp(),
      isRead: false,
      readAt: null,
      imageUrls: payload.imageUrls || [],
      fileAttachments: payload.fileAttachments || [],
    };

    batch.set(notificationDocRef, notificationData);
    userToNotificationIdMap.set(userId, notificationDocRef.id);
  }

  try {
    await batch.commit();
    logger.log(
      `Successfully fanned out notifications to ${userIds.length} users.`
    );
    return userToNotificationIdMap;
  } catch (error) {
    logger.error("Error creating fan-out notification documents:", error);
    return new Map();
  }
}

/**
 * RESTORED: Fetches user tokens and groups messages.
 * This version handles an input array (`userIdentifiers`) that can contain BOTH
 * Firestore Document IDs and Firebase Auth UIDs, as per your requirement.
 */
async function getMessagesAndTokenMap(
  userIdentifiers: string[],
  payload: { title: string; body: string; data: { [key: string]: any } }
): Promise<{
  messagesByProject: Map<string, ExpoPushMessage[]>;
  tokenToUserMap: Map<string, string>; // Maps token -> user Document ID
  userDocIdMap: Map<string, string>; // Maps identifier (UID or DocID) -> user Document ID
}> {
  const messagesByProject = new Map<string, ExpoPushMessage[]>();
  const tokenToUserMap = new Map<string, string>();
  const userDocIdMap = new Map<string, string>();

  if (!userIdentifiers || userIdentifiers.length === 0) {
    return { messagesByProject, tokenToUserMap, userDocIdMap };
  }

  const usersRef = admin.firestore().collection("users");
  const uniqueUserDocs = new Map<string, admin.firestore.DocumentSnapshot>();

  // Query by both document ID and 'uid' field to handle both identifier types
  const docIdQuery = usersRef
    .where(admin.firestore.FieldPath.documentId(), "in", userIdentifiers)
    .get();
  const uidQuery = usersRef.where("uid", "in", userIdentifiers).get();
  const [docIdSnapshot, uidSnapshot] = await Promise.all([
    docIdQuery,
    uidQuery,
  ]);

  // Merge results, ensuring no duplicates
  docIdSnapshot.forEach((doc) => uniqueUserDocs.set(doc.id, doc));
  uidSnapshot.forEach((doc) => uniqueUserDocs.set(doc.id, doc));

  // Build the map for resolving original identifiers to document IDs
  uniqueUserDocs.forEach((doc) => {
    const data = doc.data();
    if (data && data.uid) {
      userDocIdMap.set(data.uid, doc.id);
    }
    userDocIdMap.set(doc.id, doc.id); // Map doc ID to itself
  });

  for (const userDoc of uniqueUserDocs.values()) {
    if (!userDoc.exists) continue;
    const userData = userDoc.data();
    if (!userData || !userData.expoPushTokens) continue;

    const userTokensMap = userData.expoPushTokens;
    if (
      typeof userTokensMap !== "object" ||
      userTokensMap === null ||
      Array.isArray(userTokensMap)
    ) {
      continue;
    }

    for (const [projectId, tokenArray] of Object.entries(userTokensMap)) {
      if (!Array.isArray(tokenArray)) {
        continue;
      }
      if (!messagesByProject.has(projectId)) {
        messagesByProject.set(projectId, []);
      }
      const projectMessages = messagesByProject.get(projectId)!;
      for (const token of tokenArray) {
        if (Expo.isExpoPushToken(token)) {
          projectMessages.push({ to: token, sound: "default", ...payload });
          tokenToUserMap.set(token, userDoc.id); // Map the token to the Document ID
        }
      }
    }
  }
  return { messagesByProject, tokenToUserMap, userDocIdMap };
}

/**
 * Processes push receipts to find and flag expired tokens for removal.
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
        }
      }
    }
  }
  return tokensToRemoveByUser;
}

/**
 * REFACTORED: Main orchestrator using the fan-out strategy and flexible identifiers.
 */
async function sendNotificationsAndCleanUp(
  userIdentifiers: string[], // Can be a mix of UIDs and Doc IDs
  payload: {
    title: string;
    body: string;
    data: { [key: string]: any };
    imageUrls?: string[];
    fileAttachments?: FileAttachment[];
  },
  logContext: string
) {
  if (!userIdentifiers || userIdentifiers.length === 0) {
    logger.log(`No users to notify for ${logContext}.`);
    return;
  }

  // 1. Resolve all identifiers (UIDs and Doc IDs) to get user tokens AND a definitive list of User Document IDs.
  const { messagesByProject, tokenToUserMap, userDocIdMap } =
    await getMessagesAndTokenMap(userIdentifiers, {
      title: payload.title,
      body: payload.body,
      data: payload.data, // The base data for the push
    });

  if (messagesByProject.size === 0) {
    logger.log(
      `No valid push tokens found for users in context: ${logContext}.`
    );
    // Still proceed to create in-app notifications even if no push tokens exist
  }

  // 2. Get the unique list of Firestore Document IDs for the recipients.
  const recipientDocIds = [...new Set(userDocIdMap.values())];

  // 3. Create user-specific notification documents using the resolved Document IDs.
  const userToNotificationIdMap = await createFanOutNotificationDocuments(
    recipientDocIds,
    payload
  );

  if (userToNotificationIdMap.size === 0) {
    logger.error(
      `Failed to create notification documents for ${logContext}. Aborting send.`
    );
    return;
  }

  // 4. Add the specific notification ID to each user's push message payload.
  messagesByProject.forEach((messages) => {
    messages.forEach((message) => {
      const token = message.to as string;
      const userId = tokenToUserMap.get(token); // This is a Doc ID
      if (userId) {
        const notificationId = userToNotificationIdMap.get(userId);
        if (notificationId) {
          message.data = { ...(message.data || {}), notificationId };
        }
      }
    });
  });

  // 5. Send notifications and clean up tokens (this logic remains the same).
  if (messagesByProject.size === 0) {
    logger.log(
      `No push tokens to send for ${logContext}, but in-app notifications were created.`
    );
    return;
  }

  const allTickets: ExpoPushTicket[] = [];
  const ticketIdToTokenMap = new Map<string, string>();
  const tokenToProjectMap = new Map<string, string>();
  const maxRetries = 3;
  const baseDelay = 1000;

  logger.log(`Sending notifications for ${logContext}.`);

  for (const [projectId, messages] of messagesByProject.entries()) {
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
              tokenToProjectMap.set(token, projectId);
            }
          });
          break;
        } catch (error) {
          logger.error(`Error sending chunk on attempt ${attempt + 1}:`, error);
          if (attempt < maxRetries - 1) {
            await new Promise((resolve) =>
              setTimeout(resolve, baseDelay * Math.pow(2, attempt))
            );
          }
        }
      }
    }
  }

  const receiptIds = allTickets
    .filter((ticket): ticket is ExpoPushSuccessTicket => ticket.status === "ok")
    .map((ticket) => ticket.id);

  if (receiptIds.length === 0) return;

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
      tokensToRemove.forEach((tokens, userId) => {
        const existing = allTokensToRemoveByUser.get(userId) || [];
        allTokensToRemoveByUser.set(userId, [...existing, ...tokens]);
      });
    } catch (error) {
      logger.error("Error fetching receipts:", error);
    }
  }

  if (allTokensToRemoveByUser.size > 0) {
    const cleanupPromises = Array.from(allTokensToRemoveByUser.entries()).map(
      ([userId, tokens]) => {
        const userRef = db.collection("users").doc(userId);
        const updates: { [key: string]: FieldValue } = {};
        for (const token of tokens) {
          const projectId = tokenToProjectMap.get(token);
          if (projectId) {
            updates[`expoPushTokens.${projectId}`] =
              FieldValue.arrayRemove(token);
          }
        }
        return userRef.update(updates);
      }
    );
    await Promise.all(cleanupPromises);
    logger.log("Finished removing flagged tokens from Firestore.");
  }
}

// --- FIRESTORE TRIGGERS ---

export const sendNewRequestNotificationOnCreate = onDocumentCreated(
  { document: "serviceRequests/{requestId}", region: "us-central1" },
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
  { document: "serviceRequests/{requestId}", region: "us-central1" },
  async (event) => {
    if (!event.data) return;
    const beforeData = event.data.before.data() as ServiceRequest;
    const afterData = event.data.after.data() as ServiceRequest;
    const requestId = event.params.requestId;

    // --- Notify newly assigned users ---
    const newUsers = (afterData.assignedUsers || []).filter(
      (id) => !(beforeData.assignedUsers || []).includes(id)
    );
    if (newUsers.length > 0) {
      await sendNotificationsAndCleanUp(
        newUsers, // This can be a mix of IDs, our helper function handles it
        {
          title: `لقد تم اسناد مهمة لك: ${afterData.title}`,
          body: `تم تعيينك لمهمة قائمة. النوع: ${afterData.type}. اضغط للمتابعة فوراً!`,
          data: { type: "serviceRequest", id: requestId },
        },
        "new assignees"
      );
    }

    // --- Notify about new comments ---
    const beforeComments = beforeData.comments || [];
    const afterComments = afterData.comments || [];
    if (afterComments.length > beforeComments.length) {
      // This logic correctly gets the last comment even if multiple were added in one update.
      const newComment = afterComments[afterComments.length - 1];
      const specialAcceptComment = "قبلت المهمة وسأعمل عليها.";

      // If the comment is the special acceptance message, do not send a notification.
      if (newComment.content === specialAcceptComment) {
        logger.log(
          `Skipping notification for auto-comment: "${newComment.content}"`
        );
      } else if (!newComment.isStatusChange) {
        // For all other regular comments, send a notification.
        // To prevent a user from getting a notification for their own comment, we must
        // identify them by both their Firestore Document ID and their Auth UID.
        const commenterDocId = newComment.userId;
        let commenterUid: string | null = null;

        // Fetch the commenter's user document using their Doc ID to find their Auth UID.
        try {
          const userDoc = await db
            .collection("users")
            .doc(commenterDocId)
            .get();
          if (userDoc.exists) {
            commenterUid = userDoc.data()?.uid ?? null;
          }
        } catch (error) {
          logger.error(
            `Failed to fetch user doc for commenter ${commenterDocId} to resolve UID.`,
            error
          );
        }

        const allPotentialRecipients: string[] = [
          ...(afterData.assignedUsers || []),
          afterData.creatorId,
        ];

        const recipients = [...new Set(allPotentialRecipients)].filter(
          (recipientId) => {
            if (recipientId === commenterDocId) return false; // Filter by Doc ID
            if (commenterUid && recipientId === commenterUid) return false; // Filter by UID
            return true;
          }
        );

        const body =
          newComment.content.length > 100
            ? newComment.content.substring(0, 97) + "..."
            : newComment.content;

        if (recipients.length > 0) {
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
    }

    // --- Notify creator that technician is on location ---
    if (!beforeData.onLocation && afterData.onLocation) {
      await sendNotificationsAndCleanUp(
        [afterData.creatorId], // `creatorId` is a UID, our helper handles it
        {
          title: `تحديث للمهمة: ${afterData.title}`,
          body: "الفني في الموقع الآن.",
          data: { type: "serviceRequest", id: requestId },
        },
        "technician on location"
      );
    }

    // --- Notify creator about new user responses (e.g., 'accepted', 'completed') ---
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
        [afterData.creatorId], // `creatorId` is a UID, our helper handles it
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
  { document: "announcements/{announcementId}", region: "us-central1" },
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
        imageUrls: announcementData.imageUrls,
        fileAttachments: announcementData.fileAttachments,
      },
      "new announcement"
    );
  }
);
