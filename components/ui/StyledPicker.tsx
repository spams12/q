import { Colors } from '@/constants/Colors';
import React, { useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

interface PickerItem {
  label: string;
  value: string | number;
}

interface StyledPickerProps {
  label: string;
  selectedValue: string | number | undefined;
  onValueChange: (value: string | number) => void;
  items: PickerItem[];
  placeholder?: string;
}

const StyledPicker: React.FC<StyledPickerProps> = ({ label, selectedValue, onValueChange, items, placeholder = "Select an option" }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const selectedLabel = items.find(item => item.value === selectedValue)?.label || placeholder;

  const styles = StyleSheet.create({
    label: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    pickerButton: {
      backgroundColor: colors.card,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.icon,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    pickerButtonText: {
      fontSize: 16,
      color: colors.text,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 20,
      width: '80%',
      maxHeight: '60%',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    modalHeader: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 20,
      color: colors.text,
      textAlign: 'center',
    },
    itemContainer: {
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: colors.icon,
    },
    itemText: {
      fontSize: 18,
      color: colors.text,
      textAlign: 'center',
    },
    closeButton: {
      marginTop: 20,
      backgroundColor: colors.tint,
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
    },
    closeButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: 'bold',
    },
  });

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.pickerButton} onPress={() => setModalVisible(true)}>
        <Text style={styles.pickerButtonText}>{selectedLabel}</Text>
        <Ionicons name="chevron-down" size={20} color={colors.icon} />
      </TouchableOpacity>

      <Modal
        transparent={true}
        visible={modalVisible}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
        statusBarTranslucent={Platform.OS === 'android'}
        
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeader}>{label}</Text>
            <FlatList
              data={items}
              keyExtractor={(item) => item.value.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.itemContainer}
                  onPress={() => {
                    onValueChange(item.value);
                    setModalVisible(false);
                  }}
                >
                  <Text style={styles.itemText}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

export default StyledPicker;