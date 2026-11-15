import { useMemo } from 'react';
import { View } from 'react-native';
import qrcode from 'qrcode-generator';

/**
 * A QR code drawn with plain views (no native module). Each row's dark
 * modules are merged into runs to keep the view count low.
 */
export default function QrCode({ value, size = 260, level = 'M' }) {
  const rows = useMemo(() => {
    const qr = qrcode(0, level);
    qr.addData(String(value || ''), 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const out = [];
    for (let r = 0; r < n; r += 1) {
      const runs = [];
      let start = -1;
      for (let c = 0; c <= n; c += 1) {
        const dark = c < n && qr.isDark(r, c);
        if (dark && start < 0) start = c;
        if (!dark && start >= 0) {
          runs.push([start, c - start]);
          start = -1;
        }
      }
      out.push(runs);
    }
    return { n, out };
  }, [value, level]);

  // A quiet zone of 4 modules around the code, on white (scanners need it).
  const cell = size / (rows.n + 8);
  return (
    <View style={{ width: size, height: size, backgroundColor: '#FFFFFF', padding: cell * 4, borderRadius: 8 }} accessibilityLabel="QR code">
      {rows.out.map((runs, r) => (
        <View key={r} style={{ height: cell, flexDirection: 'row' }}>
          {runs.map(([c, len]) => (
            <View key={c} style={{ position: 'absolute', left: c * cell, width: len * cell + 0.5, height: cell + 0.5, backgroundColor: '#000000' }} />
          ))}
        </View>
      ))}
    </View>
  );
}
