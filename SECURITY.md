# Security & Limitations

NeuroCoop is a hackathon prototype. This document describes the **current** security model accurately — including what has been implemented and what remains aspirational.

---

## Custody Model: Operator-Held Keys (Custodial Demo)

**Current:** NeuroCoop uses a custodial key model.

- Users register their wallet once via `POST /wallet/register` (private key stored in SQLite)
- All subsequent calls use nonce-based signature authentication (`GET /auth/nonce/:address` + signature)
- Private keys are **not transmitted in requests** after initial registration
- However, keys are stored server-side in SQLite — the operator can sign on behalf of users and decrypt their data

**What this means:** The nonce auth system proves *who is calling the API*, but users are trusting the operator with their private keys. This is a custodial model — similar to an exchange holding user funds.

**Production requirement:**
- Non-custodial: users sign and broadcast transactions directly from their wallet (MetaMask/WalletConnect)
- The server would never see private keys at all
- Threshold encryption (Shamir's Secret Sharing) or proxy re-encryption (NuCypher/Umbral) for data access

---

## Authentication

**Current (implemented):**
- `POST /wallet/register` — one-time key registration into SQLite
- `GET /auth/nonce/:address` — issues a 32-byte random nonce with 5-minute TTL
- All mutation endpoints (`/join`, `/proposal`, `/vote`, `/execute`) accept `{ address, nonce, signature }`
- Server recovers signer address from signature and verifies it matches the claimed address
- Nonces are one-time use (deleted after verification)
- Legacy `{ privateKey }` in request body still accepted for backwards compatibility

**`/decrypt` — mandatory signature:**
- Researcher must get a challenge from `GET /challenge/:proposalId`
- Must provide `{ signature, message }` — not just claiming the address
- Researcher addresses are public on-chain; without mandatory signature, any caller who knows the address could impersonate the researcher
- Signature is **required** (not optional) for data access

**Production requirement:**
- Replace server-side key storage with SIWE (EIP-4361) + WalletConnect
- Users sign transactions locally; server only validates on-chain state

---

## Privacy Pipeline

**Current (implemented):**
- PII column removal (pattern-matched headers: patient, name, id, dob, ssn, email, phone, address)
- Laplace noise injection (configurable ε, default ε=1.0)
- Channel value clipping to physiological range (±500 μV)
- Timestamp conversion to relative offsets
- ECIES secp256k1 encryption (eth-crypto: AES-256-CBC + ephemeral key)

**What this is NOT:** Formal differential privacy (DP).

| DP Requirement | Current Status |
|---|---|
| **Sensitivity calibration** | Not implemented. Sensitivity hardcoded to 1.0 regardless of query or data range. |
| **Privacy budget accounting** | Not implemented. No epsilon tracking across repeated queries on the same data. |
| **Composition theorems** | Not applied. Sequential queries degrade privacy without bound. |
| **Formal privacy guarantee** | None. No provable re-identification bound. |

**What it actually provides:** Statistical noise that makes exact value recovery harder, but provides no mathematically proven privacy guarantee.

**Production requirement:**
- Per-query sensitivity analysis
- Global epsilon budget tracker
- Formal DP library (Google DP, OpenDP, or IBM diffprivlib)
- Independent privacy audit before handling real neural data

---

## Persistence

**Current (implemented):**
- SQLite via `better-sqlite3` (`./data/neurocoop.db`)
- Tables: `uploads`, `encryption_cache`, `wallets`, `receipts`, `audit_log`
- On-chain state (membership, votes, proposals) persists independently on Filecoin FVM
- Server restart does not lose member data or audit trail

**Remaining gap:**
- Encrypted data stored as ECIES ciphertext in `encryption_cache` — decryptable by the operator (custodial model, as above)
- No backup strategy for the SQLite database

---

## Decentralized Storage (Storacha / IPFS)

**Current (implemented):**
- Encrypted data uploaded to Storacha (IPFS/Filecoin) on join
- CID registered on-chain for verifiability
- Consent receipts uploaded as JSON blobs after proposal approval

**Known limitations:**
- IPFS gateway reads are unreliable — server falls back to SQLite cache when retrieval fails
- No pinning guarantee — data may become unavailable if not accessed
- No redundant pinning across multiple providers

**Production requirement:**
- Redundant pinning (multiple providers)
- Health checks on CID availability
- Content hash verification on retrieval

---

## Smart Contract (NeuroCoop.sol)

**Current (implemented):**
- ReentrancyGuard on all state-changing functions
- 50% quorum (QUORUM_BPS = 5000) enforced on-chain
- Time-bounded access (accessExpiresAt set on-chain)
- Duplicate data hash prevention (usedDataHashes mapping)
- O(1) `activeProposalCount` tracking (no O(n) gas-bomb loops)
- `expireProposal()` — anyone can expire a dead proposal to maintain accurate count

**Known limitations:**
- Not audited by a security firm
- No upgrade path (immutable once deployed)
- No emergency pause mechanism
- No multi-sig governance for `onlyDeployer` functions
- `votingPeriod` changeable by deployer unilaterally (centralization risk)

**Production requirement:**
- Professional security audit
- OpenZeppelin UUPS upgradeable proxy
- Multi-sig (Gnosis Safe) for governance parameters
- Timelock on sensitive parameter changes

---

## Access Control

**Current (implemented):**
- `hasAccess()` verified on-chain — approval status and expiry are contract-enforced
- Mandatory signature on `/decrypt` — proves requester controls the claimed address
- Address match verified against on-chain `proposal.researcher`
- All access attempts logged to audit trail

**Remaining gap:**
- No per-proposal access tokens with rotation
- Rate limiting is applied globally (`@fastify/rate-limit`), but no per-proposal or per-researcher rate limits on `/decrypt`

---

## Right to Deletion

**Not implemented.**

IPFS is content-addressed and immutable. Data pinned to Storacha cannot be deleted at the protocol level. Members can be removed from the cooperative (on-chain state), but their data CID persists on IPFS.

**Production requirement:**
- Deletion is an access control problem, not a storage problem: revoke the decryption key
- Threshold encryption (Shamir's) would allow key revocation without re-uploading data
- Users must be informed of this limitation before joining

---

## Cognition Module (Venice AI)

**Current (implemented):**
- Only anonymized metadata and proposal descriptions sent to Venice AI
- Raw EEG signals never transmitted to external services
- Venice AI provides zero data retention (per their API terms)
- All three endpoints (`/cognition/analyze-proposal`, `/cognition/neural-insights`, `/cognition/governance-health`) degrade gracefully if API key is absent

**Limitation:**
- Venice AI's zero-data-retention guarantee is contractual, not cryptographic
- A TEE (Trusted Execution Environment) would provide hardware-level proof

---

## What Would Need to Change for Real Neural Data

Neural data can reveal cognitive states, emotional patterns, neurological conditions, and potentially thoughts. Before using NeuroCoop with real BCI data in production:

1. **Non-custodial key management** — users sign locally, server never sees private keys
2. **Formal differential privacy** — mathematically proven bounds, not Laplace noise
3. **Threshold encryption** — server cannot decrypt data unilaterally
4. **TEE for AI processing** — hardware proof that AI only sees anonymized metadata
5. **Regulatory compliance** — HIPAA (U.S. health data), GDPR (EU subjects), Colorado HB 24-1058, California SB 1223
6. **IRB/Ethics board review** — any research use of real neural data requires institutional review
7. **Right to deletion** — key revocation mechanism
8. **Smart contract audit** — independent security firm review
9. **Incident response plan** — breach procedure for neural data

---

*This document reflects the state of the codebase as of the hackathon submission. Overstating security properties for neural data would be irresponsible — and unnecessary. The prototype demonstrates a credible architecture; the gaps above are a clear engineering roadmap, not fundamental flaws.*
