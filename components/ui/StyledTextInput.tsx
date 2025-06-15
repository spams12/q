import { Colors } from '@/constants/Colors';
import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, useColorScheme, View } from 'react-native';


interface StyledTextInputProps extends TextInputProps {
  label: string;
}

const StyledTextInput: React.FC<StyledTextInputProps> = ({ label, ...props }) => {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const styles = StyleSheet.create({
    container: {
      marginBottom: 16,
    },
    label: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.card,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.icon,
      fontSize: 16,
      color: colors.text,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.icon}
        {...props}
      />
    </View>
  );
};

export default StyledTextInput;