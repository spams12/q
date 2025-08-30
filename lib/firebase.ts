import auth from '@react-native-firebase/auth';
import database from '@react-native-firebase/database';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import { CommentAttachment } from './types';

const db = firestore();
const rtdb = database();
const firebaseStorage = storage();

export const uploadCommentAttachment = async (
  filePath: string,
  ticketId: string
): Promise<CommentAttachment> => {
  const fileName = filePath.split('/').pop() || 'unknown';
  const storageRef = firebaseStorage.ref(
    `serviceRequests/${ticketId}/comments/${fileName}`
  );
  await storageRef.putFile(filePath);
  const downloadURL = await storageRef.getDownloadURL();

  // Note: @react-native-firebase/storage doesn't easily provide file size or type.
  // This will need to be handled differently, perhaps by passing them as arguments
  // or using another library to get file stats before uploading.
  // For now, we'll return placeholders.
  return {
    downloadURL,
    fileName: fileName,
    fileSize: 0, // Placeholder
    fileType: 'application/octet-stream', // Placeholder
  };
};

export { auth, db, rtdb, firebaseStorage as storage };
