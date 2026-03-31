import { describe, it, expect } from 'vitest';
import { generateCoopReceipt } from '../receipt.js';
import { DataCategory, ProposalStatus, type Proposal } from '../types.js';

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 0,
    researcher: '0xaBcDeF1234567890aBcDeF1234567890aBcDeF12',
    purpose: 'alzheimer-biomarker-study',
    description: 'Longitudinal EEG analysis for early Alzheimer biomarkers',
    durationDays: 90,
    categories: [DataCategory.PROCESSED_FEATURES, DataCategory.INFERENCES],
    votesFor: 3,
    votesAgainst: 1,
    totalVoters: 4,
    status: ProposalStatus.Executed,
    createdAt: 1700000000,
    deadline: 1700604800,
    accessExpiresAt: 1707776000,
    ...overrides,
  };
}

const DEFAULT_PARAMS = {
  proposal: makeProposal(),
  executionTxHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  storachaCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
  contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
};

describe('generateCoopReceipt', () => {
  it('produces a receipt with all required fields', () => {
    const receipt = generateCoopReceipt(DEFAULT_PARAMS);
    expect(receipt.receiptId).toBeDefined();
    expect(receipt.issuedAt).toBeDefined();
    expect(receipt.proposalId).toBe(0);
    expect(receipt.cooperativeContract).toBe(DEFAULT_PARAMS.contractAddress);
    expect(receipt.status).toBe('approved');
    expect(receipt.purpose).toBeDefined();
    expect(receipt.dataCategories).toBeDefined();
    expect(receipt.researcher).toBeDefined();
    expect(receipt.governance).toBeDefined();
    expect(receipt.proofs).toBeDefined();
    expect(receipt.framework).toBeDefined();
    expect(receipt.schema).toBeDefined();
  });

  it('has a valid UUID as receiptId', () => {
    const receipt = generateCoopReceipt(DEFAULT_PARAMS);
    // UUID v4 pattern
    expect(receipt.receiptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('has a valid ISO timestamp', () => {
    const receipt = generateCoopReceipt(DEFAULT_PARAMS);
    const parsed = new Date(receipt.issuedAt);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('references correct ISO/IEC schema', () => {
    const receipt = generateCoopReceipt(DEFAULT_PARAMS);
    expect(receipt.schema).toBe('ISO/IEC TS 27560:2023 (cooperative extension)');
  });

  it('includes purpose from proposal', () => {
    const receipt = generateCoopReceipt(DEFAULT_PARAMS);
    expect(receipt.purpose.purposeId).toBe('alzheimer-biomarker-study');
    expect(receipt.purpose.description).toContain('Alzheimer');
  });

  it('sets validUntil from accessExpiresAt', () => {
    const receipt = generateCoopReceipt(DEFAULT_PARAMS);
    expect(receipt.purpose.validUntil).not.toBeNull();
    const parsed = new Date(receipt.purpose.validUntil!);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('sets validUntil to null when accessExpiresAt is 0', () => {
    const receipt = generateCoopReceipt({
      ...DEFAULT_PARAMS,
      proposal: makeProposal({ accessExpiresAt: 0 }),
    });
    expect(receipt.purpose.validUntil).toBeNull();
  });

  it('lists all four data categories', () => {
    const receipt = generateCoopReceipt(DEFAULT_PARAMS);
    expect(receipt.dataCategories).toHaveLength(4);
    const categoryNames = receipt.dataCategories.map(c => c.category);
    expect(categoryNames).toContain('Raw EEG Traces');
    expect(categoryNames).toContain('Processed Features');
    expect(categoryNames).toContain('ML Inferences');
    expect(categoryNames).toContain('Session Metadata');
  });

  it('marks included categories correctly based on proposal', () => {
    const receipt = generateCoopReceipt(DEFAULT_PARAMS);
    const included = receipt.dataCategories.filter(c => c.included);
    expect(included).toHaveLength(2);
    const includedNames = included.map(c => c.category);
    expect(includedNames).toContain('Processed Features');
    expect(includedNames).toContain('ML Inferences');
  });

  it('populates researcher address and access expiry', () => {
    const receipt = generateCoopReceipt(DEFAULT_PARAMS);
    expect(receipt.researcher.address).toBe(DEFAULT_PARAMS.proposal.researcher);
    expect(receipt.researcher.accessExpires).not.toBeNull();
  });

  it('populates governance fields correctly', () => {
    const receipt = generateCoopReceipt(DEFAULT_PARAMS);
    expect(receipt.governance.votesFor).toBe(3);
    expect(receipt.governance.votesAgainst).toBe(1);
    expect(receipt.governance.memberCountAtProposalCreation).toBe(4);
    expect(receipt.governance.mechanism).toBe('one-member-one-vote (cognitive equality)');
  });

  it('populates proofs with tx hash and CID', () => {
    const receipt = generateCoopReceipt(DEFAULT_PARAMS);
    expect(receipt.proofs.executionTxHash).toBe(DEFAULT_PARAMS.executionTxHash);
    expect(receipt.proofs.storachaCid).toBe(DEFAULT_PARAMS.storachaCid);
    expect(receipt.proofs.flowExplorerUrl).toContain(DEFAULT_PARAMS.executionTxHash);
  });

  it('includes neurorights framework references', () => {
    const receipt = generateCoopReceipt(DEFAULT_PARAMS);
    expect(receipt.framework.neurorights.length).toBeGreaterThan(0);
    expect(receipt.framework.neurorights.some(r => r.includes('Mental Privacy'))).toBe(true);
  });

  it('includes legislation references', () => {
    const receipt = generateCoopReceipt(DEFAULT_PARAMS);
    expect(receipt.framework.legislation.length).toBeGreaterThan(0);
    expect(receipt.framework.legislation.some(l => l.includes('Chile'))).toBe(true);
    expect(receipt.framework.legislation.some(l => l.includes('Colorado'))).toBe(true);
    expect(receipt.framework.legislation.some(l => l.includes('California'))).toBe(true);
  });

  it('includes standards references', () => {
    const receipt = generateCoopReceipt(DEFAULT_PARAMS);
    expect(receipt.framework.standards.length).toBeGreaterThan(0);
    expect(receipt.framework.standards.some(s => s.includes('UNESCO'))).toBe(true);
    expect(receipt.framework.standards.some(s => s.includes('IEEE'))).toBe(true);
  });

  it('generates unique receipt IDs', () => {
    const receipt1 = generateCoopReceipt(DEFAULT_PARAMS);
    const receipt2 = generateCoopReceipt(DEFAULT_PARAMS);
    expect(receipt1.receiptId).not.toBe(receipt2.receiptId);
  });
});
