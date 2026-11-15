import { useRef } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

/**
 * Full-screen QR scanner. onScan(data) is called for each new code (the
 * same code isn't reported twice in a row); `status` is shown at the bottom
 * (e.g. "2 of 3 codes scanned").
 */
export default function QrScanner({ visible, onScan, onClose, status, title = 'Scan QR code' }) {
  const [permission, requestPermission] = useCameraPermissions();
  const last = useRef('');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (!data || data === last.current) return;
              last.current = data;
              onScan(data);
            }}
          />
        ) : (
          <View style={styles.center}>
            <Text style={styles.text}>DiaryByte needs the camera to scan the QR code.</Text>
            <TouchableOpacity style={styles.btn} onPress={requestPermission} accessibilityLabel="Allow camera">
              <Text style={styles.btnText}>Allow camera</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.top}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close scanner" style={styles.close}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
        </View>
        {permission?.granted ? <View style={styles.frame} pointerEvents="none" /> : null}
        {status ? (
          <View style={styles.bottom}>
            <Text style={styles.status}>{status}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 16 },
  text: { color: '#FFF', fontSize: 15, textAlign: 'center' },
  btn: { backgroundColor: '#2C6BFF', borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  top: { position: 'absolute', top: 40, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  title: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '800' },
  close: { padding: 6 },
  frame: { position: 'absolute', top: '25%', left: '12%', right: '12%', aspectRatio: 1, borderWidth: 3, borderColor: '#35C8F5', borderRadius: 18 },
  bottom: { position: 'absolute', bottom: 50, left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 12, padding: 14 },
  status: { color: '#FFF', fontSize: 15, textAlign: 'center', fontWeight: '600' },
});
