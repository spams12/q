import CreateServiceRequestForm from '@/components/CreateServiceRequestForm';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { User } from '../lib/types';

export default function CreateServiceRequestScreen() {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]); 
  useEffect(() => {
    const fetchUsers = async () => {
      const usersCollection = collection(db, 'users');
      const usersSnapshot = await getDocs(usersCollection);
      const usersList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(usersList);
    };

    fetchUsers();
  }, []);

  const handleSuccess = () => {
    console.log('Service request created successfully');
    // In a real app, you would navigate the user away or show a success message.
  };

  return (
    <View style={{ flex: 1 }}>
      <CreateServiceRequestForm
        users={users}
        onSuccess={handleSuccess}
        selectedUserIds={selectedUserIds}
        setSelectedUserIds={setSelectedUserIds}
      />
    </View>
  );
}