/**
 * Neural data encryption using ECIES (Elliptic Curve Integrated Encryption Scheme).
 *
 * Architecture:
 * 1. EEG data is encrypted with AES-256-CBC (symmetric)
 * 2. The AES key is encrypted with the owner's secp256k1 public key (asymmetric)
 * 3. Only the owner's private key can recover the AES key
 * 4. On consent verification (checked on-chain via Filecoin FVM), the server
 *    decrypts and re-serves the data to authorized researchers
 *
 * Production note: In a production system, this would use threshold encryption
 * or proxy re-encryption (e.g., NuCypher/Umbral) to eliminate server trust.
 * This prototype demonstrates the consent-gated access pattern.
 */

import EthCrypto from 'eth-crypto';

export interface EncryptedPayload {
  iv: string;
  ephemPublicKey: string;
  ciphertext: string;
  mac: string;
}

/**
 * Derive the public key from a private key for ECIES encryption.
 */
export function getPublicKey(privateKey: string): string {
  // Remove 0x prefix if present
  const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  return EthCrypto.publicKeyByPrivateKey(cleanKey);
}

/**
 * Encrypt neural data with a public key using ECIES.
 * The encrypted data can only be decrypted by the holder of the corresponding private key.
 */
export async function encryptNeuroData(
  publicKey: string,
  data: string
): Promise<{ encrypted: string; payload: EncryptedPayload }> {
  const encrypted = await EthCrypto.encryptWithPublicKey(publicKey, data);
  const encryptedString = EthCrypto.cipher.stringify(encrypted);
  return {
    encrypted: encryptedString,
    payload: encrypted,
  };
}

/**
 * Decrypt neural data with a private key.
 * Only succeeds if the private key matches the public key used for encryption.
 */
export async function decryptNeuroData(
  privateKey: string,
  encryptedString: string
): Promise<string> {
  const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  const encryptedObject = EthCrypto.cipher.parse(encryptedString);
  return await EthCrypto.decryptWithPrivateKey(cleanKey, encryptedObject);
}

/**
 * Create a signed attestation of a consent action.
 * The owner signs a message proving they authorized (or revoked) a specific consent grant.
 */
export async function signConsentAttestation(
  privateKey: string,
  params: {
    action: 'grant' | 'revoke';
    dataId: string;
    researcher: string;
    purpose: string;
    timestamp: number;
  }
): Promise<{ message: string; signature: string }> {
  const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  const message = [
    `NeuroConsent|${params.action}`,
    `dataId:${params.dataId}`,
    `researcher:${params.researcher}`,
    `purpose:${params.purpose}`,
    `timestamp:${params.timestamp}`,
  ].join('|');

  const messageHash = EthCrypto.hash.keccak256(message);
  const signature = EthCrypto.sign(cleanKey, messageHash);

  return { message, signature };
}

/**
 * Verify a consent attestation signature.
 */
export function verifyConsentAttestation(
  signature: string,
  message: string,
  expectedAddress: string
): boolean {
  const messageHash = EthCrypto.hash.keccak256(message);
  const recoveredAddress = EthCrypto.recover(signature, messageHash);
  return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
}

/**
 * Signature-based identity verification.
 *
 * Instead of trusting a claimed address, the requester signs a challenge message.
 * We recover the signer's address from the signature — proving they control the key.
 * This is a lightweight SIWE-style auth without full EIP-4361 (sufficient for prototype).
 *
 * Flow:
 * 1. Server generates: "NeuroCoop|access|proposalId:{id}|timestamp:{ts}"
 * 2. Requester signs with their private key
 * 3. Server recovers address from signature
 * 4. Server checks recovered address == proposal.researcher on-chain
 */
export function createAccessChallenge(proposalId: number): { message: string; timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `NeuroCoop|access|proposalId:${proposalId}|timestamp:${timestamp}`;
  return { message, timestamp };
}

export function verifyAccessSignature(
  signature: string,
  message: string
): { valid: boolean; recoveredAddress: string } {
  try {
    const messageHash = EthCrypto.hash.keccak256(message);
    const recoveredAddress = EthCrypto.recover(signature, messageHash);
    return { valid: true, recoveredAddress };
  } catch {
    return { valid: false, recoveredAddress: '' };
  }
}

/**
 * Sign an access challenge (client-side helper for demo).
 */
export function signAccessChallenge(privateKey: string, message: string): string {
  const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  const messageHash = EthCrypto.hash.keccak256(message);
  return EthCrypto.sign(cleanKey, messageHash);
}
