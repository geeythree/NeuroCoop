# NeuroCoop — Submission Summary

## The Problem

Brain-computer interface devices are proliferating — yet every consent model we have
was designed for individual, one-time data transactions. Neural data breaks three
assumptions that underpin current consent law:

1. **The scale problem**: A single user's EEG data is scientifically worthless.
   Research requires pooled data from hundreds of users. Individual consent becomes
   meaningless when the unit of value is the collective.

2. **The comprehension problem**: Consent forms cannot explain what inferences will
   be drawn from raw EEG. Users cannot meaningfully assess whether a request for
   "motor imagery data" will expose their cognitive load, emotional regulation, or
   predisposition to neurological conditions.

3. **The control problem**: Once data is shared, users permanently lose the ability
   to revoke it or redirect its use. There is no mechanism to say "I consented to
   Alzheimer's research but not cognitive enhancement profiling."

## The Solution

NeuroCoop is a neural data cooperative protocol where BCI users collectively govern
their pooled de-identified EEG data. Governance is on-chain — researchers submit
proposals, members vote (one member, one vote — cognitive equality), and access is
enforced by a smart contract deployed on Filecoin FVM.

## Technical Architecture

**Governance Layer (Filecoin FVM)**
NeuroCoop.sol is deployed on Filecoin Calibration (chain ID 314159). All consent
decisions are immutable on-chain. Access control is enforced cryptographically —
researchers must prove identity via signature to access approved data.

**Storage Layer (Storacha)**
EEG data is encrypted with ECIES (secp256k1 + AES-256-CBC) before upload to
Storacha. Content-addressed CIDs are registered on-chain, binding every governance
vote to specific Filecoin-pinned data. Approved researchers receive W3C UCAN
delegations — cryptographically signed, time-bounded capability proofs from the
cooperative's Storacha space.

**Cognition Layer (Venice AI)**
Before voting opens, Venice AI (llama-3.3-70b, zero data retention) analyses each
proposal for ethics, risk, and alignment with Neurorights Foundation principles.
Members who lack neuroscience expertise see plain-language risk assessments, red
flags, and alignment scores across the five neurorights dimensions. Raw neural
signals never leave the server — only statistical metadata is sent.

**Signal Processing**
EEG frequency band power (delta/theta/alpha/beta/gamma) is extracted via multi-scale
successive difference analysis — a genuine signal processing technique implemented
in pure TypeScript. Statistical de-identification uses Laplace noise injection.

**Consent Receipts**
Approved proposals generate ISO/IEC TS 27560:2023 consent receipts anchored to
Filecoin transaction hashes — a portable, verifiable record of collective consent.

## Why This Matters

Chile became the first country to constitutionally protect neurorights in 2021.
Colorado (2024) and California (2024) have passed neural data privacy laws.
UNESCO issued a global normative framework for neurotechnology ethics in November
2025. IEEE P7700 is in development. The regulatory moment is here — and no
decentralised infrastructure exists to support it.

NeuroCoop demonstrates that collective neural data governance is technically
feasible today, using the Protocol Labs stack as the trust layer.
