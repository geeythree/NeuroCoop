export interface DataRecord {
  dataId: string;
  owner: string;
  storachaCid: string;
  dataHash: string;
  uploadedAt: number;
}

export interface ConsentEvent {
  type: 'DataRegistered' | 'ConsentGranted' | 'ConsentRevoked';
  dataId: string;
  owner: string;
  researcher?: string;
  cid?: string;
  timestamp: number;
  txHash: string;
  blockNumber: number;
}

export interface EncryptedUpload {
  dataId: string;
  storachaCid: string;
  dataHash: string;
  txHash: string;
  owner: string;
  filename: string;
  timestamp: number;
}

export interface DecryptResult {
  success: boolean;
  data?: string;
  error?: string;
  dataId: string;
  researcher: string;
}
