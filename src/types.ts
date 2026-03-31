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

export const BCI_PIPELINE_STAGES: Record<DataCategory, string> = {
  [DataCategory.RAW_EEG]: 'Sensor Acquisition',
  [DataCategory.PROCESSED_FEATURES]: 'Signal Processing',
  [DataCategory.INFERENCES]: 'Model Output',
  [DataCategory.METADATA]: 'Context',
};

export enum ProposalStatus {
  Active = 0,
  Rejected = 1,
  Executed = 2,
  Expired = 3,
}

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  [ProposalStatus.Active]: 'Voting Open',
  [ProposalStatus.Rejected]: 'Rejected',
  [ProposalStatus.Executed]: 'Access Granted',
  [ProposalStatus.Expired]: 'Expired',
};

export interface CoopMember {
  address: string;
  dataId: string;
  storachaCid: string;
  channelCount: number;
  sampleRate: number;
  deidentified: boolean;
  joinedAt: number;
  active: boolean;
}

export interface Proposal {
  id: number;
  researcher: string;
  purpose: string;
  description: string;
  durationDays: number;
  categories: DataCategory[];
  votesFor: number;
  votesAgainst: number;
  totalVoters: number;
  status: ProposalStatus;
  createdAt: number;
  deadline: number;
  accessExpiresAt: number;
}

export interface CoopEvent {
  type: 'MemberJoined' | 'MemberLeft' | 'ProposalCreated' | 'VoteCast' | 'ProposalExecuted' | 'ProposalRejected';
  data: Record<string, any>;
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
  channelCount: number;
  sampleRate: number;
  deidentified: boolean;
  timestamp: number;
}

export interface ConsentReceipt {
  receiptId: string;
  issuedAt: string;
  proposalId: number;
  cooperativeContract: string;
  status: 'approved' | 'rejected' | 'expired';
  purpose: {
    purposeId: string;
    description: string;
    validUntil: string | null;
  };
  dataCategories: {
    category: string;
    description: string;
    included: boolean;
  }[];
  researcher: {
    address: string;
    accessExpires: string | null;
  };
  governance: {
    votesFor: number;
    votesAgainst: number;
    memberCountAtProposalCreation: number;
    mechanism: 'one-member-one-vote (cognitive equality)';
  };
  proofs: {
    executionTxHash: string;
    storachaCid: string;
    filecoinExplorerUrl: string;
  };
  framework: {
    neurorights: string[];
    legislation: string[];
    standards: string[];
  };
  schema: 'ISO/IEC TS 27560:2023 (cooperative extension)';
}

export interface EegMetadata {
  channelCount: number;
  sampleRate: number;
  channels: string[];
  duration: number;
  sampleCount: number;
  hasLabels: boolean;
}
