// src/firebaseConfig.ts

import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getDatabase } from "firebase/database"; // <-- Import for RTDB
import { getFirestore } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { CommentAttachment } from "./types";

const firebaseConfig = {
  apiKey: "AIzaSyBHErhfhQHFURogL_WENFXy8ajwwQ7Zw_E",
  authDomain: "react-57a14.firebaseapp.com",
  projectId: "react-57a14",
  storageBucket: "react-57a14.appspot.com",
  messagingSenderId: "769253344130",
  appId: "1:769253344130:web:2b7358461ebc505b19059b",
  measurementId: "G-PS0BMKJKRW",
  databaseURL: "https://react-57a14-default-rtdb.europe-west1.firebasedatabase.app/", 
};


const app = initializeApp(firebaseConfig);

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

const db = getFirestore(app); // This is your Firestore instance
const rtdb = getDatabase(app); // <-- Initialize and get your Realtime Database instance
const storage = getStorage(app);

// This function remains unchanged
export const uploadCommentAttachment = async (file: File, ticketId: string): Promise<CommentAttachment> => {
  const storageRef = ref(storage, `serviceRequests/${ticketId}/comments/${file.name}`);
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

