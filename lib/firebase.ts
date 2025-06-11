import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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

export { auth, db };

