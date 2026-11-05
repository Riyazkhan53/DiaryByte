import { createSecret } from './secret';

// The Personal Vault's 6-digit combination, as a salted SHA-256 hash. It is
// synced, like the vault's items, so every device asks for the same code.
// Set, changed or removed in Settings.
export const VAULT_CODE_LENGTH = 6;
export const vaultCode = createSecret('@diarybyte_vault_code', { collection: 'vaultlock', id: 'vault-code' });
export const isVaultCode = (value) => new RegExp(`^\\d{${VAULT_CODE_LENGTH}}$`).test(value);
