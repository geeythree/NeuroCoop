# Roadmap — upcoming additions

NeuroCoop is a hackathon-grade prototype. This document lists **planned additions** toward a production-ready neural data cooperative—not commitments with dates, but the engineering and governance work required before real users and real neural data.

---

## Phase 1 — Trust & identity

| Addition | Why |
|----------|-----|
| **Non-custodial wallets** — MetaMask / WalletConnect; users sign txs locally | Server must not hold private keys for production |
| **SIWE (EIP-4361)** or equivalent for session identity | Standard wallet-based auth |
| **Remove server-side key storage** (replace SQLite wallet table with address-only + signature verification for off-chain actions) | Aligns custody model with “user control” |
| **Short-lived access tokens** for sensitive endpoints | Reduce replay and session hijack risk |

---

## Phase 2 — Data access & cryptography

| Addition | Why |
|----------|-----|
| **Threshold encryption or proxy re-encryption** (e.g. Umbral-class patterns) | So no single server can decrypt all member data |
| **Client-side or TEE-bound decryption** for approved researchers | Cuts “server reads everything” trust |
| **Category enforcement** — only serve data classes approved in the on-chain proposal | Purpose limitation in code, not only in UI |
| **Mandatory retrieval integrity** — CID + hash verification on every read | Already started; make policy + monitoring |

---

## Phase 3 — Privacy & science

| Addition | Why |
|----------|-----|
| **Formal DP** (OpenDP / Google DP–class) *or* narrow claims to “noise + de-ID” with documented limits | Honest guarantees vs re-identification |
| **Privacy budget & sensitivity per query** | Required for formal DP |
| **Clinical / legal review** of pipelines for regulated jurisdictions | Neural data often sits under HIPAA-like or state neural-privacy rules |

---

## Phase 4 — Chain & governance

| Addition | Why |
|----------|-----|
| **Independent smart contract audit** before mainnet | Standard for value-bearing or sensitive governance |
| **Multisig or DAO** for deployer-only parameters (e.g. voting period) | “Collective” story should match ops |
| **Upgrade strategy** (immutable vs timelocked proxy) | Explicit operational choice |

---

## Phase 5 — Storage & operations

| Addition | Why |
|----------|-----|
| **Pinning SLA** — multi-provider pinning, health checks | IPFS content can disappear without guarantees |
| **Managed DB** (e.g. PostgreSQL) with backups, encryption at rest, replication | SQLite is a single-node demo default |
| **Deletion story** — key revocation + policy; avoid promising “erase IPFS bytes” | IPFS is content-addressed; control = keys + legal retention |
| **Observability** — metrics, tracing, alerting, on-call runbooks | Production operability |

---

## Phase 6 — AI (Cognition Engine)

| Addition | Why |
|----------|-----|
| **Provider DPAs / zero-retention contracts** in writing | Third-party AI for governance-adjacent text |
| **Graceful degradation** when Venice (or successor) is down | Governance must not depend solely on LLM availability |
| **Clear UX** — AI assists; cooperative vote remains binding | Avoid over-trust in automated scores |

---

## Phase 7 — Security program

| Addition | Why |
|----------|-----|
| **Penetration test**, SAST, dependency scanning in CI | Baseline assurance |
| **Incident response** — breach process, user notification, key rotation | Required for sensitive data |
| **Bug bounty** (post-stabilization) | Community finding of issues |

---

## Phase 8 — Product & compliance

| Addition | Why |
|----------|-----|
| **Terms of Service, Privacy Policy, DPA** as applicable | Trust and legal clarity |
| **Exportable, versioned consent receipts** | Regulatory and user expectations |
| **Support channel** | Real deployments need human escalation |

---

For **current** limitations and what is already implemented, see [SECURITY.md](SECURITY.md).
