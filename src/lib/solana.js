import nacl from 'tweetnacl';
import bs58 from 'bs58';

/**
 * Verify an ed25519 signature produced by a Solana wallet over a UTF-8 message.
 * @param {string} walletBase58  base58 public key
 * @param {string} message       the exact message string that was signed
 * @param {string} signatureB58  base58-encoded signature (Phantom signMessage output)
 * @returns {boolean}
 */
export function verifyWalletSignature(walletBase58, message, signatureB58) {
  try {
    const pubkey = bs58.decode(walletBase58);
    const sig = bs58.decode(signatureB58);
    const msg = new TextEncoder().encode(message);
    if (pubkey.length !== 32) return false;
    return nacl.sign.detached.verify(msg, sig, pubkey);
  } catch {
    return false;
  }
}

/** Loose base58 pubkey sanity check (32-byte decode). */
export function isValidWallet(walletBase58) {
  try {
    return bs58.decode(walletBase58).length === 32;
  } catch {
    return false;
  }
}
