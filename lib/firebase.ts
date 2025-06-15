import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
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
  measurementId: "G-PS0BMKJKRW"
};


const app = initializeApp(firebaseConfig);

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

const db = getFirestore(app);
const storage = getStorage(app);

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

export { auth, db, storage };

