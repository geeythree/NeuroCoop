# Security & Limitations

NeuroCoop is a hackathon prototype. This document honestly describes its security model, known limitations, and what would need to change for production use with real neural data.

---

## Key Custody

**Current:** Private keys are passed directly in API requests (e.g., `POST /join` includes the user's private key in the request body). The server holds keys in memory during encryption/decryption operations.

**Limitation:** This is a fundamental trust violation in a production system. The server can read, copy, or misuse any private key it receives.

**Production requirement:**
- SIWE (Sign-In With Ethereum) or WalletConnect for authentication -- the server never sees private keys
- Threshold encryption (e.g., Shamir's Secret Sharing) or proxy re-encryption (e.g., NuCypher/Umbral) so the server cannot decrypt data unilaterally
- Hardware wallet support for key management

---

## Privacy Pipeline

**Current:** The `deidentifyEeg()` function applies:
1. PII column removal (pattern-matched column names)
2. Laplace noise injection with a configurable epsilon parameter
3. Channel value clipping to a bounded range
4. Timestamp anonymization (relative offsets)

**What this is NOT:** This is **not** formal differential privacy (DP). The README and code previously used the term "differential privacy" loosely. Here is what is missing for true DP:

| DP Requirement | Current Status |
|---|---|
| **Sensitivity calibration** | Not implemented. Sensitivity is hardcoded to 1.0 regardless of the actual query or data range. True DP requires computing the sensitivity (maximum change in output from changing one record) for each specific query. |
| **Privacy budget accounting** | Not implemented. Each call to `deidentifyEeg()` consumes privacy budget, but there is no tracking. Repeated queries on the same data degrade privacy without bound. |
| **Composition theorems** | Not applied. Sequential or parallel composition of multiple DP mechanisms requires formal analysis to bound total privacy loss. |
| **Post-processing invariance** | Not verified. Downstream operations on the noisy data may not preserve DP guarantees. |
| **Formal privacy guarantee** | None. There is no provable bound on the probability of re-identifying an individual from the output. |

**What it actually provides:** Statistical noise injection that makes exact value recovery harder but provides no formal privacy guarantee. This is a common prototype technique but should not be relied upon for real neural data.

**Production requirement:**
- Sensitivity analysis per query type
- Global privacy budget tracker (epsilon accounting across all queries)
- Composition analysis for multi-query workflows
- Formal DP library (e.g., Google DP, OpenDP, or IBM diffprivlib)
- Independent privacy audit

---

## Persistence

**Current:** All state is held in memory:
- Encrypted data cache (Map in `index.ts`)
- Member list
- Proposal state (partially on-chain, partially cached)
- Consent receipts

**Limitation:** Server restart loses all cached data. The on-chain state (membership, votes, proposals) survives, but the encrypted data references become dangling pointers.

**Production requirement:**
- Persistent database (PostgreSQL or SQLite) for encrypted data cache, member metadata, and receipt history
- Event sourcing from on-chain events to rebuild state on restart
- Backup strategy for encrypted data (not just CIDs)

---

## Access Control

**Current:** Researcher identity is verified by Ethereum address. The contract checks that the proposal was approved and that the researcher address matches. However:

- No wallet signature authentication -- the server trusts the address provided in the request body
- No proof that the caller actually controls the claimed address
- No rate limiting on data access requests

**Production requirement:**
- SIWE authentication: researcher must sign a challenge with their wallet to prove address ownership
- Rate limiting and audit logging for all data access
- Per-proposal access tokens with expiration

---

## Storacha (Decentralized Storage)

**Current:** Encrypted data is uploaded to Storacha (IPFS/Filecoin). The upload path works, but:

- Reads from Storacha gateways are unreliable and slow
- The server falls back to an in-memory cache when Storacha reads fail
- No pinning guarantee -- data may become unavailable if not accessed

**Production requirement:**
- Redundant pinning across multiple IPFS providers
- Local persistent cache as first-tier fallback
- Health checks and monitoring for data availability
- Content verification (hash check) on retrieval

---

## Smart Contract

**Current:** The Solidity contract handles membership, proposals, voting, and access control on Flow EVM Testnet.

- Not audited by a security firm
- No quorum requirements (a single vote can decide a proposal if only one member votes)
- No proposal amendment mechanism
- No emergency pause or admin override
- No upgrade path (contract is immutable once deployed)

**Production requirement:**
- Professional security audit
- Quorum and supermajority thresholds
- Timelock on proposal execution
- Upgradeable proxy pattern (e.g., OpenZeppelin UUPS)
- Emergency pause mechanism with multi-sig governance

---

## What Would Need to Change for Real Neural Data

Neural data is uniquely sensitive -- it can reveal cognitive states, emotional patterns, neurological conditions, and potentially thoughts. Handling real neural data in production would require:

1. **Regulatory compliance**: HIPAA (if U.S. health data), GDPR (if EU subjects), plus emerging neurodata regulations (Chile, Colorado, California)
2. **IRB/Ethics board review**: Any research use of real neural data needs institutional review
3. **Formal differential privacy**: With mathematically proven bounds, not just noise injection
4. **End-to-end encryption**: The server should never see plaintext neural data
5. **Secure enclaves**: Consider TEE (Trusted Execution Environment) for data processing
6. **Data minimization**: Only collect and retain what is necessary for the stated purpose
7. **Right to deletion**: Members must be able to fully remove their data, including from decentralized storage
8. **Incident response plan**: Procedure for data breaches involving neural data
9. **Consent withdrawal**: Mechanism to revoke consent and ensure data is no longer accessible, even for approved proposals

---

*This document is part of the NeuroCoop project's commitment to honest technical communication. Overstating security properties in a neural data system would be irresponsible.*
