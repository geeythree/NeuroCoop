import { randomUUID } from 'crypto';
import { DataCategory, DATA_CATEGORY_LABELS, type ConsentReceipt } from './types.js';

/**
 * Generate a W3C-style consent receipt (based on ISO/IEC TS 27560:2023).
 * Machine-readable, cryptographically verifiable, stored on Storacha.
 */
export function generateConsentReceipt(params: {
  dataId: string;
  dataOwner: string;
  researcher: string;
  purpose: string;
  purposeDescription: string;
  categories: DataCategory[];
  expiresAt: number; // unix timestamp, 0 = no expiration
  deidentified: boolean;
  txHash: string;
  storachaCid: string;
  contractAddress: string;
}): ConsentReceipt {
  const expiresIso = params.expiresAt > 0
    ? new Date(params.expiresAt * 1000).toISOString()
    : null;

  return {
    receiptId: randomUUID(),
    issuedAt: new Date().toISOString(),
    dataId: params.dataId,
    dataOwner: params.dataOwner,
    status: 'active',
    purpose: [
      {
        purposeId: params.purpose,
        description: params.purposeDescription,
        consentGiven: true,
        validUntil: expiresIso,
      },
    ],
    dataCategories: Object.values(DataCategory)
      .filter((v): v is DataCategory => typeof v === 'number')
      .map((cat) => ({
        category: DATA_CATEGORY_LABELS[cat],
        description: getCategoryDescription(cat),
        included: params.categories.includes(cat),
        deidentified: params.deidentified,
      })),
    recipient: {
      address: params.researcher,
      accessExpires: expiresIso,
    },
    rights: {
      access: true,
      export: true,
      deletion: true,
      withdrawConsent: true,
    },
    proofs: {
      consentTxHash: params.txHash,
      storachaCid: params.storachaCid,
      flowExplorerUrl: `https://evm-testnet.flowscan.io/tx/${params.txHash}`,
    },
    schema: 'ISO/IEC TS 27560:2023 (simplified)',
  };
}

function getCategoryDescription(cat: DataCategory): string {
  switch (cat) {
    case DataCategory.RAW_EEG:
      return 'Full raw EEG traces with all channels at original sample rate';
    case DataCategory.PROCESSED_FEATURES:
      return 'Extracted features: band power (alpha, beta, theta, delta), event-related potentials';
    case DataCategory.INFERENCES:
      return 'Machine learning model outputs: seizure detection, cognitive state classification';
    case DataCategory.METADATA:
      return 'Session metadata: device info, electrode configuration, recording duration';
  }
}

/**
 * Validate consent receipt structure.
 */
export function validateReceipt(receipt: ConsentReceipt): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!receipt.receiptId) errors.push('Missing receiptId');
  if (!receipt.issuedAt) errors.push('Missing issuedAt');
  if (!receipt.dataId) errors.push('Missing dataId');
  if (!receipt.dataOwner) errors.push('Missing dataOwner');
  if (!receipt.purpose?.length) errors.push('No purpose specified');
  if (!receipt.dataCategories?.length) errors.push('No data categories');
  if (!receipt.recipient?.address) errors.push('No recipient address');
  if (!receipt.proofs?.consentTxHash) errors.push('Missing consent transaction hash');

  return { valid: errors.length === 0, errors };
}
