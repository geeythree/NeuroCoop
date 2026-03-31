// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title NeuroCoop — Neural Data Cooperative Protocol
/// @notice Collective governance of neural data: members pool de-identified EEG data,
///         researchers propose studies, members vote on access.
/// @dev Deployed on Flow EVM. Implements one-member-one-vote (cognitive equality).
///
/// Aligned with:
/// - Neurorights Foundation 5 Rights (Yuste et al.)
/// - Chile Constitution Art. 19 No. 1 (2021)
/// - Colorado HB 24-1058 (Aug 2024)
/// - UNESCO Recommendation on Neurotechnology Ethics (Nov 2025)
/// - IEEE P7700 (in development)
contract NeuroCoop {
    // --- Data Categories (BCI pipeline stages) ---
    enum DataCategory {
        RAW_EEG,            // Stage 1: Direct sensor acquisition
        PROCESSED_FEATURES, // Stage 2: Band power, ERPs, filtered signals
        INFERENCES,         // Stage 3: ML model outputs (seizure detection, etc.)
        METADATA            // Stage 4: Device info, session context
    }

    enum ProposalStatus {
        Active,
        Approved,
        Rejected,
        Executed,
        Expired
    }

    // --- Structs ---
    struct Member {
        bytes32 dataId;        // Reference to encrypted data on Storacha
        string storachaCid;    // IPFS CID of encrypted EEG data
        string dataHash;       // SHA-256 of original data
        uint8 channelCount;
        uint256 sampleRate;
        bool deidentified;
        uint256 joinedAt;
        bool active;
    }

    struct Proposal {
        address researcher;
        string purpose;         // e.g., "alzheimers-biomarker-study"
        string description;     // Human-readable description
        uint256 durationDays;   // Access duration after approval
        DataCategory[] categories;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 totalVoters;    // Snapshot of member count at creation
        ProposalStatus status;
        uint256 createdAt;
        uint256 deadline;       // Voting deadline
        uint256 accessExpiresAt; // Set when executed
    }

    // --- State ---
    mapping(address => Member) public members;
    address[] public memberList;
    uint256 public memberCount;

    Proposal[] public proposals;
    // proposalId => voter => voted
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    uint256 public votingPeriod = 86400; // 24 hours default (configurable for demo)

    // --- Events ---
    event MemberJoined(address indexed member, bytes32 dataId, string cid, uint256 timestamp);
    event MemberLeft(address indexed member, uint256 timestamp);

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed researcher,
        string purpose,
        uint256 durationDays,
        uint256 deadline
    );

    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 votesFor,
        uint256 votesAgainst
    );

    event ProposalExecuted(uint256 indexed proposalId, address indexed researcher, uint256 accessExpiresAt);
    event ProposalRejected(uint256 indexed proposalId);

    // --- Modifiers ---
    modifier onlyMember() {
        require(members[msg.sender].active, "Not an active member");
        _;
    }

    // --- Member Functions ---

    /// @notice Join the cooperative by contributing encrypted EEG data
    function joinCooperative(
        bytes32 dataId,
        string calldata storachaCid,
        string calldata dataHash,
        uint8 channelCount,
        uint256 sampleRate,
        bool deidentified
    ) external {
        require(!members[msg.sender].active, "Already a member");

        members[msg.sender] = Member({
            dataId: dataId,
            storachaCid: storachaCid,
            dataHash: dataHash,
            channelCount: channelCount,
            sampleRate: sampleRate,
            deidentified: deidentified,
            joinedAt: block.timestamp,
            active: true
        });

        memberList.push(msg.sender);
        memberCount++;

        emit MemberJoined(msg.sender, dataId, storachaCid, block.timestamp);
    }

    /// @notice Leave the cooperative (data stays encrypted, access revoked)
    function leaveCooperative() external onlyMember {
        members[msg.sender].active = false;
        memberCount--;
        emit MemberLeft(msg.sender, block.timestamp);
    }

    // --- Proposal Functions ---

    /// @notice Researcher submits a research proposal
    function submitProposal(
        string calldata purpose,
        string calldata description,
        uint256 durationDays,
        DataCategory[] calldata categories
    ) external {
        require(durationDays > 0 && durationDays <= 365, "Duration: 1-365 days");
        require(categories.length > 0, "Must specify data categories");
        require(memberCount > 0, "No members in cooperative");

        proposals.push();
        uint256 proposalId = proposals.length - 1;
        Proposal storage p = proposals[proposalId];

        p.researcher = msg.sender;
        p.purpose = purpose;
        p.description = description;
        p.durationDays = durationDays;
        p.categories = categories;
        p.totalVoters = memberCount;
        p.status = ProposalStatus.Active;
        p.createdAt = block.timestamp;
        p.deadline = block.timestamp + votingPeriod;

        emit ProposalCreated(proposalId, msg.sender, purpose, durationDays, p.deadline);
    }

    /// @notice Member casts a vote on a proposal (1 member = 1 vote)
    function vote(uint256 proposalId, bool support) external onlyMember {
        require(proposalId < proposals.length, "Invalid proposal");
        Proposal storage p = proposals[proposalId];
        require(p.status == ProposalStatus.Active, "Proposal not active");
        require(block.timestamp <= p.deadline, "Voting period ended");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        hasVoted[proposalId][msg.sender] = true;

        if (support) {
            p.votesFor++;
        } else {
            p.votesAgainst++;
        }

        emit VoteCast(proposalId, msg.sender, support, p.votesFor, p.votesAgainst);
    }

    /// @notice Execute a proposal after voting period ends
    function executeProposal(uint256 proposalId) external {
        require(proposalId < proposals.length, "Invalid proposal");
        Proposal storage p = proposals[proposalId];
        require(p.status == ProposalStatus.Active, "Not active");

        // Check if majority voted for
        bool approved = p.votesFor > p.votesAgainst && p.votesFor > 0;

        if (approved) {
            p.status = ProposalStatus.Executed;
            p.accessExpiresAt = block.timestamp + (p.durationDays * 1 days);
            emit ProposalExecuted(proposalId, p.researcher, p.accessExpiresAt);
        } else {
            p.status = ProposalStatus.Rejected;
            emit ProposalRejected(proposalId);
        }
    }

    // --- Access Control ---

    /// @notice Check if a researcher has access via an approved proposal
    function hasAccess(uint256 proposalId) external view returns (bool) {
        if (proposalId >= proposals.length) return false;
        Proposal storage p = proposals[proposalId];
        if (p.status != ProposalStatus.Executed) return false;
        if (block.timestamp > p.accessExpiresAt) return false;
        return true;
    }

    // --- View Functions ---

    function getProposal(uint256 proposalId) external view returns (
        address researcher,
        string memory purpose,
        string memory description,
        uint256 durationDays,
        uint256 votesFor,
        uint256 votesAgainst,
        uint256 totalVoters,
        ProposalStatus status,
        uint256 createdAt,
        uint256 deadline,
        uint256 accessExpiresAt
    ) {
        Proposal storage p = proposals[proposalId];
        return (
            p.researcher, p.purpose, p.description, p.durationDays,
            p.votesFor, p.votesAgainst, p.totalVoters,
            p.status, p.createdAt, p.deadline, p.accessExpiresAt
        );
    }

    function proposalCount() external view returns (uint256) {
        return proposals.length;
    }

    function getMember(address addr) external view returns (
        bytes32 dataId,
        string memory storachaCid,
        uint8 channelCount,
        uint256 sampleRate,
        bool deidentified,
        uint256 joinedAt,
        bool active
    ) {
        Member storage m = members[addr];
        return (m.dataId, m.storachaCid, m.channelCount, m.sampleRate, m.deidentified, m.joinedAt, m.active);
    }

    function getMemberList() external view returns (address[] memory) {
        return memberList;
    }

    /// @notice Set voting period (for demo purposes — would be governance-controlled in production)
    function setVotingPeriod(uint256 _seconds) external {
        votingPeriod = _seconds;
    }
}
