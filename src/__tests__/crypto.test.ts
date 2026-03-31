import { describe, it, expect } from 'vitest';
import EthCrypto from 'eth-crypto';
import {
  getPublicKey,
  encryptNeuroData,
  decryptNeuroData,
  signConsentAttestation,
  verifyConsentAttestation,
} from '../crypto.js';

// Deterministic test identity
const IDENTITY = EthCrypto.createIdentity();
const PRIVATE_KEY = IDENTITY.privateKey;
const ADDRESS = IDENTITY.address;

describe('getPublicKey', () => {
  it('returns a valid public key from a private key', () => {
    const pubKey = getPublicKey(PRIVATE_KEY);
    expect(pubKey).toBeDefined();
    expect(typeof pubKey).toBe('string');
    // secp256k1 uncompressed public key (hex, no 04 prefix from eth-crypto)
    expect(pubKey.length).toBe(128);
  });

  it('handles 0x-prefixed private keys', () => {
    const pubKey = getPublicKey(`0x${PRIVATE_KEY}`);
    const pubKeyNoPref = getPublicKey(PRIVATE_KEY);
    expect(pubKey).toBe(pubKeyNoPref);
  });
});

describe('encryptNeuroData + decryptNeuroData', () => {
  const testData = 'timestamp,channel_fp1\n0.000,10.5\n0.004,11.2';

  it('encrypts and decrypts back to original data', async () => {
    const pubKey = getPublicKey(PRIVATE_KEY);
    const { encrypted } = await encryptNeuroData(pubKey, testData);
    const decrypted = await decryptNeuroData(PRIVATE_KEY, encrypted);
    expect(decrypted).toBe(testData);
  });

  it('produces different ciphertext for different plaintext', async () => {
    const pubKey = getPublicKey(PRIVATE_KEY);
    const { encrypted: enc1 } = await encryptNeuroData(pubKey, 'data-A');
    const { encrypted: enc2 } = await encryptNeuroData(pubKey, 'data-B');
    expect(enc1).not.toBe(enc2);
  });

  it('returns both encrypted string and payload object', async () => {
    const pubKey = getPublicKey(PRIVATE_KEY);
    const result = await encryptNeuroData(pubKey, testData);
    expect(result.encrypted).toBeDefined();
    expect(result.payload).toBeDefined();
    expect(result.payload.iv).toBeDefined();
    expect(result.payload.ephemPublicKey).toBeDefined();
    expect(result.payload.ciphertext).toBeDefined();
    expect(result.payload.mac).toBeDefined();
  });

  it('fails to decrypt with a different private key', async () => {
    const otherIdentity = EthCrypto.createIdentity();
    const pubKey = getPublicKey(PRIVATE_KEY);
    const { encrypted } = await encryptNeuroData(pubKey, testData);
    await expect(decryptNeuroData(otherIdentity.privateKey, encrypted)).rejects.toThrow();
  });
});

describe('signConsentAttestation + verifyConsentAttestation', () => {
  const attestationParams = {
    action: 'grant' as const,
    dataId: 'eeg-001',
    researcher: '0x1234567890abcdef1234567890abcdef12345678',
    purpose: 'alzheimer-biomarker-study',
    timestamp: 1700000000,
  };

  it('produces a signature and message', async () => {
    const { message, signature } = await signConsentAttestation(PRIVATE_KEY, attestationParams);
    expect(message).toContain('NeuroConsent|grant');
    expect(message).toContain('dataId:eeg-001');
    expect(signature).toBeDefined();
    expect(typeof signature).toBe('string');
  });

  it('signature verifies with correct address', async () => {
    const { message, signature } = await signConsentAttestation(PRIVATE_KEY, attestationParams);
    const isValid = verifyConsentAttestation(signature, message, ADDRESS);
    expect(isValid).toBe(true);
  });

  it('signature fails verification with wrong address', async () => {
    const { message, signature } = await signConsentAttestation(PRIVATE_KEY, attestationParams);
    const wrongAddress = '0x0000000000000000000000000000000000000000';
    const isValid = verifyConsentAttestation(signature, message, wrongAddress);
    expect(isValid).toBe(false);
  });

  it('handles 0x-prefixed private key for signing', async () => {
    const { message, signature } = await signConsentAttestation(
      `0x${PRIVATE_KEY}`,
      attestationParams
    );
    const isValid = verifyConsentAttestation(signature, message, ADDRESS);
    expect(isValid).toBe(true);
  });

  it('includes all params in the message', async () => {
    const { message } = await signConsentAttestation(PRIVATE_KEY, attestationParams);
    expect(message).toContain(`researcher:${attestationParams.researcher}`);
    expect(message).toContain(`purpose:${attestationParams.purpose}`);
    expect(message).toContain(`timestamp:${attestationParams.timestamp}`);
  });

  it('revoke action produces valid signature', async () => {
    const revokeParams = { ...attestationParams, action: 'revoke' as const };
    const { message, signature } = await signConsentAttestation(PRIVATE_KEY, revokeParams);
    expect(message).toContain('NeuroConsent|revoke');
    const isValid = verifyConsentAttestation(signature, message, ADDRESS);
    expect(isValid).toBe(true);
  });
});
