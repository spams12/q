import { auth } from '@react-native-firebase/auth';
import { useEffect, useState } from 'react';
import { auth as firebaseAuth } from '../lib/firebase';

const useFirebaseAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subscriber = firebaseAuth().onAuthStateChanged(user => {
      setUser(user);
      if (loading) {
        setLoading(false);
      }
    });
    return subscriber; // unsubscribe on unmount
  }, []);

  return { user, loading };
};

export default useFirebaseAuth;