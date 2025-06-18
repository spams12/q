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
import { onDocumentCreated } from "firebase-functions/v2/firestore";

admin.initializeApp();

const expo = new Expo();

export const sendNewRequestNotification = onDocumentCreated("serviceRequests/{requestId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    logger.log("No data associated with the event");
    return;
  }
  const data = snapshot.data();
  const { assignedUsers } = data;

  if (!assignedUsers || !Array.isArray(assignedUsers) || assignedUsers.length === 0) {
    logger.log("No assigned users for this service request.");
    return;
  }

  const messages = [];
  for (const userId of assignedUsers) {
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
          title: "New Service Request",
          body: "You have been assigned a new service request.",
          data: { requestId: snapshot.id },
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
