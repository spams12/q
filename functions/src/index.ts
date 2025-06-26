/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { Expo } from "expo-server-sdk";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";

admin.initializeApp();

const expo = new Expo();

export const sendNewRequestNotificationOnUpdate = onDocumentUpdated({ document: "serviceRequests/{requestId}", region: "europe-west1" }, async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  const snapshot = event.data?.after;

  if (!beforeData || !afterData || !snapshot) {
    logger.log("No data associated with the event");
    return;
  }

  const beforeUsers = beforeData.assignedUsers || [];
  const afterUsers = afterData.assignedUsers || [];

  if (!Array.isArray(beforeUsers) || !Array.isArray(afterUsers)) {
    logger.log("assignedUsers is not an array.");
    return;
  }

  const newUsers = afterUsers.filter((userId: string) => !beforeUsers.includes(userId));

  if (newUsers.length === 0) {
    logger.log("No new users assigned.");
    return;
  }

  const messages = [];
  for (const userId of newUsers) {
    try {
      const userDoc = await admin.firestore().collection("users").doc(userId).get();
      if (!userDoc.exists) {
        logger.error("User document not found for userId:", userId);
        continue;
      }

      const userData = userDoc.data();
      if (!userData) {
        logger.error("User data is empty for userId:", userId);
        continue;
      }

      const { expoPushToken } = userData;

      if (expoPushToken && Expo.isExpoPushToken(expoPushToken)) {
        messages.push({
          to: expoPushToken,
          sound: "default" as const,
          title: ` ${afterData.title} لقد تم ارسال مهمة لك `,
          body: `تم تعيين مهمه جديده لك ${afterData.type} نوعها ${afterData.priority} وهي بدرجة خطورة ${afterData.title} اضغط للذهاب اليها فوراً !`,
          data: { type: "serviceRequest", id: snapshot.id },
        });
        logger.log(`Prepared notification for user: ${userId}`);
      } else {
        logger.error("Invalid or missing Expo push token for userId:", userId);
      }
    } catch (error) {
      logger.error(`Error processing user ${userId}:`, error);
    }
  }

  if (messages.length > 0) {
    try {
      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
      logger.log("Push notifications sent successfully.");
    } catch (error) {
      logger.error("Error sending push notifications:", error);
    }
  }
});


export const sendNewRequestNotificationOnCreate = onDocumentCreated({ document: "serviceRequests/{requestId}", region: "europe-west1" }, async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    logger.log("No data associated with the creation event");
    return;
  }

  const data = snapshot.data();
  const newUsers = data.assignedUsers || [];

  if (!Array.isArray(newUsers) || newUsers.length === 0) {
    logger.log("No new users assigned or assignedUsers is not an array.");
    return;
  }

  const messages = [];
  for (const userId of newUsers) {
    try {
      const userDoc = await admin.firestore().collection("users").doc(userId).get();
      if (!userDoc.exists) {
        logger.error("User document not found for userId:", userId);
        continue;
      }

      const userData = userDoc.data();
      if (!userData) {
        logger.error("User data is empty for userId:", userId);
        continue;
      }

      const { expoPushToken } = userData;

      if (expoPushToken && Expo.isExpoPushToken(expoPushToken)) {
        messages.push({
          to: expoPushToken,
          sound: "default" as const,
          title: ` ${data.title} لقد تم ارسال مهمة لك `,
          body: `تم تعيين مهمه جديده لك ${data.type} نوعها ${data.priority} وهي بدرجة خطورة ${data.title} اضغط للذهاب اليها فوراً !`,
          data: { type: "serviceRequest", id: snapshot.id },
        });
        logger.log(`Prepared notification for user: ${userId}`);
      } else {
        logger.error("Invalid or missing Expo push token for userId:", userId);
      }
    } catch (error) {
      logger.error(`Error processing user ${userId}:`, error);
    }
  }

  if (messages.length > 0) {
    try {
      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
      logger.log("Push notifications sent successfully for new document.");
    } catch (error) {
      logger.error("Error sending push notifications for new document:", error);
    }
  }
});
