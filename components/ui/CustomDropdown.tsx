import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    FlatList,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { Theme, useTheme } from "@/context/ThemeContext";

export interface DropdownItem {
  label: string;
  value: any;
}

interface CustomDropdownProps {
  items: DropdownItem[];
  onValueChange: (value: any) => void;
  selectedValue?: any;
  placeholder?: string;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({
  items,
  onValueChange,
  selectedValue,
  placeholder = "Select an option",
}) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [modalVisible, setModalVisible] = useState(false);

  const selectedItem = items.find((item) => item.value === selectedValue);

  const handleSelect = (item: DropdownItem) => {
    onValueChange(item.value);
    setModalVisible(false);
  };

  return (
    <>
      <Pressable
        style={styles.dropdownButton}
        onPress={() => setModalVisible(true)}
      >
        <Text style={selectedItem ? styles.selectedValueText : styles.placeholderText}>
          {selectedItem ? selectedItem.label : placeholder}
        </Text>
        <Feather
          name="chevron-down"
          size={20}
          color={theme.placeholder}
        />
      </Pressable>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalView}>
            <FlatList
              data={items}
              keyExtractor={(item) => item.value.toString()}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.optionButton}
                  onPress={() => handleSelect(item)}
                >
                  <Text style={styles.optionText}>{item.label}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    dropdownButton: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.inputBackground,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === "android" ? 12 : 14,
      height: 50,
    },
    selectedValueText: {
      fontSize: 16,
      color: theme.text,
      textAlign: "right",
    },
    placeholderText: {
      fontSize: 16,
      color: theme.placeholder,
      textAlign: "right",
    },
    modalBackdrop: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    modalView: {
      width: "80%",
      maxHeight: "60%",
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 10,
    },
    optionButton: {
      padding: 15,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    optionText: {
      fontSize: 16,
      color: theme.text,
      textAlign: "right",
    },
  });

export default CustomDropdown;