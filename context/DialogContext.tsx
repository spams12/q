import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

interface DialogState {
  visible: boolean;
  status: 'success' | 'error';
  message: string;
  buttonText?: string;
  onButtonPress?: () => void;
  duration?: number;
}

interface ShowDialogParams {
  status: 'success' | 'error';
  message: string;
  buttonText?: string;
  onButtonPress?: () => void;
  duration?: number;
}

interface DialogContextType {
  dialogState: DialogState;
  showDialog: (options: ShowDialogParams) => void;
  hideDialog: () => void;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const DialogProvider = ({ children }: { children: ReactNode }) => {
  const [dialogState, setDialogState] = useState<DialogState>({
    visible: false,
    status: 'success',
    message: '',
  });

  useEffect(() => {
    if (dialogState.visible && dialogState.duration) {
      const timer = setTimeout(() => {
        hideDialog();
      }, dialogState.duration);
      return () => clearTimeout(timer);
    }
  }, [dialogState.visible, dialogState.duration]);

  const showDialog = (options: ShowDialogParams) => {
    setDialogState({ ...options, visible: true });
  };

  const hideDialog = () => {
    setDialogState((prevState) => ({ ...prevState, visible: false }));
  };

  return (
    <DialogContext.Provider value={{ dialogState, showDialog, hideDialog }}>
      {children}
    </DialogContext.Provider>
  );
};

export const UseDialog = () => {
  const context = useContext(DialogContext);
  if (context === undefined) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};