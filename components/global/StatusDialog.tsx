import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useDialog } from '@/context/DialogContext';

const theme = {
  background: ['#0a0e1a', '#1a1f2e', '#0f1419'],
  primary: '#00ff7f', // Hacker green
  secondary: '#00bfff', // Tech blue
  error: '#ff4757', // Error red
  text: '#ffffff',
  textMuted: '#00ff7f',
  placeholder: 'rgba(255, 255, 255, 0.5)',
  inputBackground: 'rgba(255, 255, 255, 0.08)',
  borderColor: 'rgba(0, 191, 255, 0.3)',
} as const;

interface StatusDialogProps {
  visible: boolean;
  status: 'success' | 'error';
  message: string;
  onClose: () => void;
  buttonText?: string;
  onButtonPress?: () => void;
}

const StatusDialog = ({
  visible,
  status,
  message,
  onClose,
  buttonText,
  onButtonPress,
}: StatusDialogProps) => {
  if (!visible) {
    return null;
  }

  const isSuccess = status === 'success';
  const iconName = isSuccess ? 'checkmark-circle' : 'close-circle';
  const iconColor = isSuccess ? theme.primary : theme.error;

  const handleButtonPress = () => {
    if (onButtonPress) {
      onButtonPress();
    } else {
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent>
      <Pressable style={styles.dialogOverlay} onPress={onClose}>
        <Animated.View
          entering={FadeIn.duration(250).springify().damping(15).stiffness(120)}
          exiting={FadeOut.duration(200)}>
          <BlurView intensity={40} tint="dark" style={styles.dialogContainer}>
            <Ionicons name={iconName} size={80} color={iconColor} style={styles.dialogIcon} />
            <Text style={styles.dialogMessage}>{message}</Text>
            
            {/* Render custom button if onButtonPress is provided */}
            {onButtonPress && buttonText ? (
              <TouchableOpacity style={styles.dialogButton} onPress={handleButtonPress}>
                <Text style={styles.dialogButtonText}>{buttonText}</Text>
              </TouchableOpacity>
            ) : // Render default close button only for errors
            !isSuccess ? (
              <TouchableOpacity style={styles.dialogButton} onPress={onClose}>
                <Text style={styles.dialogButtonText}>إغلاق</Text>
              </TouchableOpacity>
            ) : null}
          </BlurView>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

export const GlobalStatusDialog = () => {
  const { dialogState, hideDialog } = useDialog();
  const { visible, status, message, buttonText, onButtonPress } = dialogState;

  // This function will be called when the primary button is pressed.
  // It executes the custom action and then hides the dialog.
  const handlePrimaryAction = () => {
    if (onButtonPress) {
      onButtonPress();
    }
    hideDialog(); // Always hide after action
  };

  return (
    <StatusDialog
      visible={visible}
      status={status}
      message={message}
      onClose={hideDialog} // Default close action
      buttonText={buttonText}
      onButtonPress={onButtonPress ? handlePrimaryAction : undefined}
    />
  );
};


const styles = StyleSheet.create({
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 14, 26, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  dialogContainer: {
    width: '100%',
    maxWidth: 320,
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 191, 255, 0.2)',
    overflow: 'hidden',
  },
  dialogIcon: {
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  dialogMessage: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 25,
  },
  dialogButton: {
    backgroundColor: theme.secondary,
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 10,
    elevation: 3,
    shadowColor: theme.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  dialogButtonText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});