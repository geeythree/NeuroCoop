export enum DataCategory {
  RAW_EEG = 0,
  PROCESSED_FEATURES = 1,
  INFERENCES = 2,
  METADATA = 3,
}

export const DATA_CATEGORY_LABELS: Record<DataCategory, string> = {
  [DataCategory.RAW_EEG]: 'Raw EEG Traces',
  [DataCategory.PROCESSED_FEATURES]: 'Processed Features',
  [DataCategory.INFERENCES]: 'ML Inferences',
  [DataCategory.METADATA]: 'Session Metadata',
};

export interface DataRecord {
  dataId: string;
  owner: string;
  storachaCid: string;
  receiptCid: string;
  dataHash: string;
  channelCount: number;
  sampleRate: number;
  uploadedAt: number;
  deidentified: boolean;
}

export interface ConsentGrant {
  purpose: string;
  grantedAt: number;
  expiresAt: number;
  categories: DataCategory[];
  active: boolean;
  expired: boolean;
}

export interface ConsentReceipt {
  receiptId: string;
  issuedAt: string;
  dataId: string;
  dataOwner: string;
  status: 'active' | 'revoked' | 'expired';
  purpose: {
    purposeId: string;
    description: string;
    consentGiven: boolean;
    validUntil: string | null;
  }[];
  dataCategories: {
    category: string;
    description: string;
    included: boolean;
    deidentified: boolean;
  }[];
  recipient: {
    address: string;
    accessExpires: string | null;
  };
  rights: {
    access: boolean;
    export: boolean;
    deletion: boolean;
    withdrawConsent: boolean;
  };
  proofs: {
    consentTxHash: string;
    storachaCid: string;
    flowExplorerUrl: string;
  };
  schema: 'ISO/IEC TS 27560:2023 (simplified)';
}

export interface ConsentEvent {
  type: 'DataRegistered' | 'ConsentGranted' | 'ConsentRevoked' | 'DataAccessed';
  dataId: string;
  owner?: string;
  researcher?: string;
  purpose?: string;
  expiresAt?: number;
  reason?: string;
  cid?: string;
  timestamp: number;
  txHash: string;
  blockNumber: number;
}

export interface EncryptedUpload {
  dataId: string;
  storachaCid: string;
  receiptCid: string;
  dataHash: string;
  txHash: string;
  owner: string;
  filename: string;
  channelCount: number;
  sampleRate: number;
  deidentified: boolean;
  timestamp: number;
}

export interface EegMetadata {
  channelCount: number;
  sampleRate: number;
  channels: string[];
  duration: number;
  sampleCount: number;
  hasLabels: boolean;
}
