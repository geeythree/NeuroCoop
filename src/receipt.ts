import { randomUUID } from 'crypto';
import { DataCategory, DATA_CATEGORY_LABELS, type ConsentReceipt, type Proposal } from './types.js';

/**
 * Generate a cooperative consent receipt for an approved research proposal.
 * Based on ISO/IEC TS 27560:2023, extended for collective governance.
 */
export function generateCoopReceipt(params: {
  proposal: Proposal;
  executionTxHash: string;
  storachaCid: string;
  contractAddress: string;
}): ConsentReceipt {
  const { proposal } = params;
  const expiresIso = proposal.accessExpiresAt > 0
    ? new Date(proposal.accessExpiresAt * 1000).toISOString()
    : null;

  return {
    receiptId: randomUUID(),
    issuedAt: new Date().toISOString(),
    proposalId: proposal.id,
    cooperativeContract: params.contractAddress,
    status: 'approved',
    purpose: {
      purposeId: proposal.purpose,
      description: proposal.description,
      validUntil: expiresIso,
    },
    dataCategories: Object.values(DataCategory)
      .filter((v): v is DataCategory => typeof v === 'number')
      .map((cat) => ({
        category: DATA_CATEGORY_LABELS[cat],
        description: getCategoryDescription(cat),
        included: proposal.categories.includes(cat),
      })),
    researcher: {
      address: proposal.researcher,
      accessExpires: expiresIso,
    },
    governance: {
      votesFor: proposal.votesFor,
      votesAgainst: proposal.votesAgainst,
      totalMembers: proposal.totalVoters,
      mechanism: 'one-member-one-vote (cognitive equality)',
    },
    proofs: {
      executionTxHash: params.executionTxHash,
      storachaCid: params.storachaCid,
      flowExplorerUrl: `https://evm-testnet.flowscan.io/tx/${params.executionTxHash}`,
    },
    framework: {
      neurorights: [
        'Mental Privacy (Neurorights Foundation Principle #1)',
        'Free Will — collective consent is revocable',
        'Fair Access — one member, one vote',
      ],
      legislation: [
        'Chile Constitution Art. 19 No. 1 (2021)',
        'Colorado HB 24-1058 (Aug 2024)',
        'California SB 1223 (Sep 2024)',
      ],
      standards: [
        'UNESCO Recommendation on Neurotechnology Ethics (Nov 2025)',
        'IEEE P7700 (in development)',
        'ICA Cooperative Principles (1844–present)',
      ],
    },
    schema: 'ISO/IEC TS 27560:2023 (cooperative extension)',
  };
}

function getCategoryDescription(cat: DataCategory): string {
  switch (cat) {
    case DataCategory.RAW_EEG:
      return 'Full raw EEG traces at original sample rate';
    case DataCategory.PROCESSED_FEATURES:
      return 'Extracted features: band power, event-related potentials';
    case DataCategory.INFERENCES:
      return 'ML model outputs: seizure detection, cognitive state';
    case DataCategory.METADATA:
      return 'Device info, electrode config, session duration';
  }
}
