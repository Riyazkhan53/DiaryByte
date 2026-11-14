// Web and iOS: AsyncStorage has no per-row size limit there, so there is
// nothing to recover. Android uses oversizeRecovery.native.js.
export async function readOversizedValue(_key) {
  return null;
}
