import { createSecret } from './secret';

// "Password to confirm delete": kept on this device only (not synced), as a
// salted SHA-256 hash. When it is on, every delete asks for the password.
const guard = createSecret('@diarybyte_delete_guard');

export const loadDeleteGuard = () => guard.load();
export const deleteGuardEnabled = () => guard.enabled();
export const subscribeDeleteGuard = (fn) => guard.subscribe(fn);
export const checkDeletePassword = (password) => guard.check(password);
/** Turn the password on (or change it). */
export const setDeletePassword = (password) => guard.set(password);
/** Turn it off (forgets the password). */
export const clearDeletePassword = () => guard.clear();
