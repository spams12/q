// src/firebaseConfig.ts

import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getDatabase } from "firebase/database"; // <-- Import for RTDB
import { getFirestore } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { CommentAttachment } from "./types";

const app = initializeApp(firebaseConfig);

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

const db = getFirestore(app); // This is your Firestore instance
const rtdb = getDatabase(app); // <-- Initialize and get your Realtime Database instance
const storage = getStorage(app);

// This function remains unchanged
export const uploadCommentAttachment = async (
  file: File,
  ticketId: string
): Promise<CommentAttachment> => {
  const storageRef = ref(
    storage,
    `serviceRequests/${ticketId}/comments/${file.name}`
  );
  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);
  return {
    downloadURL,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
  };
};

// Export all the services
export { auth, db, rtdb, storage };
