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

// Every delete goes through confirmDelete. The app mounts DeleteConfirmHost,
// which registers itself here and shows one popup for all of them (asking
// for the delete password when that is turned on in Settings).
let deleteHost = null;
export function registerDeleteHost(show) {
  deleteHost = show;
  return () => {
    if (deleteHost === show) deleteHost = null;
  };
}

export function confirmDelete(title, message, onConfirm) {
  if (deleteHost) deleteHost({ title, message, onConfirm });
  else confirmAction(title, message, 'Delete', onConfirm);
}
