import { FontAwesome } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="home" size={size} color={color} />
          ),
          // header: () => <CustomHeader title="Home" />,
        }}
      />
      <Tabs.Screen
        name="my-requests"
        options={{
          title: 'التكتات التي انشئتها',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="list-alt" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}