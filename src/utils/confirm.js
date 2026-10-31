import { Alert, Platform } from 'react-native';

// Alert.alert shows no buttons on web (react-native-web), so confirm there
// with the browser dialog instead.
export function confirmAction(title, message, actionLabel, onConfirm) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

export function confirmDelete(title, message, onConfirm) {
  confirmAction(title, message, 'Delete', onConfirm);
}
