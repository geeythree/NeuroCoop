// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @dev Inlined ReentrancyGuard from OpenZeppelin v5.x to avoid import issues in Remix
abstract contract ReentrancyGuard {
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private _status;

    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        if (_status == ENTERED) revert ReentrancyGuardReentrantCall();
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        _status = NOT_ENTERED;
    }
}

/// @title NeuroCoop — Neural Data Cooperative Protocol
/// @notice Collective governance of neural data: members pool de-identified EEG data,
///         researchers propose studies, members vote on access.
/// @dev Deployed on Flow EVM. Implements one-member-one-vote (cognitive equality).
///
/// Security: ReentrancyGuard on all state-changing functions, deployer-only governance,
/// quorum enforcement, duplicate data prevention, front-running protection on leave.
///
/// Aligned with:
/// - Neurorights Foundation 5 Rights (Yuste et al.)
/// - Chile Constitution Art. 19 No. 1 (2021)
/// - Colorado HB 24-1058 (Aug 2024)
/// - UNESCO Recommendation on Neurotechnology Ethics (Nov 2025)
/// - IEEE P7700 (in development)
contract NeuroCoop is ReentrancyGuard {
    // --- Data Categories (BCI pipeline stages) ---
    enum DataCategory {
        RAW_EEG,            // Stage 1: Direct sensor acquisition
        PROCESSED_FEATURES, // Stage 2: Band power, ERPs, filtered signals
        INFERENCES,         // Stage 3: ML model outputs (seizure detection, etc.)
        METADATA            // Stage 4: Device info, session context
    }

    enum ProposalStatus {
        Active,
        Rejected,
        Executed,
        Expired
    }

    // --- Structs ---
    struct Member {
        bytes32 dataId;
        string storachaCid;
        string dataHash;
        uint8 channelCount;
        uint256 sampleRate;
        bool deidentified;
        uint256 joinedAt;
        bool active;
    }

    struct Proposal {
        address researcher;
        string purpose;
        string description;
        uint256 durationDays;
        DataCategory[] categories;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 totalVoters;
        ProposalStatus status;
        uint256 createdAt;
        uint256 deadline;
        uint256 accessExpiresAt;
    }

    // --- State ---
    address public deployer;
    mapping(address => Member) public members;
    address[] public memberList;
    uint256 public memberCount;

    Proposal[] public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(bytes32 => bool) private usedDataHashes;

    uint256 public votingPeriod = 86400;
    uint256 public constant MIN_VOTING_PERIOD = 300;
    uint256 public constant MAX_VOTING_PERIOD = 604800;
    uint256 public constant QUORUM_BPS = 5000;

    // --- Events ---
    event MemberJoined(address indexed member, bytes32 dataId, string cid, uint256 timestamp);
    event MemberLeft(address indexed member, uint256 timestamp);
    event ProposalCreated(uint256 indexed proposalId, address indexed researcher, string purpose, uint256 durationDays, uint256 deadline);
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 votesFor, uint256 votesAgainst);
    event ProposalExecuted(uint256 indexed proposalId, address indexed researcher, uint256 accessExpiresAt);
    event ProposalRejected(uint256 indexed proposalId);
    event VotingPeriodUpdated(uint256 oldPeriod, uint256 newPeriod);

    // --- Modifiers ---
    modifier onlyMember() {
        require(members[msg.sender].active, "Not an active member");
        _;
    }

    modifier onlyDeployer() {
        require(msg.sender == deployer, "Not deployer");
        _;
    }

    constructor() {
        deployer = msg.sender;
    }

    // --- Member Functions ---

    function joinCooperative(
        bytes32 dataId,
        string calldata storachaCid,
        string calldata dataHash,
        uint8 channelCount,
        uint256 sampleRate,
        bool deidentified
    ) external nonReentrant {
        require(!members[msg.sender].active, "Already a member");
        require(bytes(storachaCid).length > 0, "Empty CID");
        require(bytes(dataHash).length > 0, "Empty hash");

        bytes32 hashKey = keccak256(abi.encodePacked(dataHash));
        require(!usedDataHashes[hashKey], "Duplicate data hash");
        usedDataHashes[hashKey] = true;

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

    function leaveCooperative() external onlyMember nonReentrant {
        for (uint256 i = 0; i < proposals.length; i++) {
            if (proposals[i].status == ProposalStatus.Active && block.timestamp <= proposals[i].deadline) {
                require(hasVoted[i][msg.sender], "Must vote on active proposals before leaving");
            }
        }
        members[msg.sender].active = false;
        memberCount--;
        emit MemberLeft(msg.sender, block.timestamp);
    }

    // --- Proposal Functions ---

    function submitProposal(
        string calldata purpose,
        string calldata description,
        uint256 durationDays,
        DataCategory[] calldata categories
    ) external nonReentrant {
        require(bytes(purpose).length > 0, "Empty purpose");
        require(bytes(description).length > 0, "Empty description");
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

    function vote(uint256 proposalId, bool support) external onlyMember nonReentrant {
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

    function executeProposal(uint256 proposalId) external nonReentrant {
        require(proposalId < proposals.length, "Invalid proposal");
        Proposal storage p = proposals[proposalId];
        require(p.status == ProposalStatus.Active, "Not active");

        uint256 totalVotes = p.votesFor + p.votesAgainst;
        uint256 quorumRequired = (p.totalVoters * QUORUM_BPS) / 10000;
        if (quorumRequired == 0) quorumRequired = 1;

        bool quorumMet = totalVotes >= quorumRequired;
        bool majorityFor = p.votesFor > p.votesAgainst && p.votesFor > 0;

        if (quorumMet && majorityFor) {
            p.status = ProposalStatus.Executed;
            p.accessExpiresAt = block.timestamp + (p.durationDays * 1 days);
            emit ProposalExecuted(proposalId, p.researcher, p.accessExpiresAt);
        } else {
            p.status = ProposalStatus.Rejected;
            emit ProposalRejected(proposalId);
        }
    }

    // --- Access Control ---

    function hasAccess(uint256 proposalId, address requester) external view returns (bool) {
        if (proposalId >= proposals.length) return false;
        Proposal storage p = proposals[proposalId];
        if (requester != p.researcher) return false;
        if (p.status != ProposalStatus.Executed) return false;
        if (block.timestamp > p.accessExpiresAt) return false;
        return true;
    }

    // --- Governance ---

    function setVotingPeriod(uint256 _seconds) external onlyDeployer {
        require(_seconds >= MIN_VOTING_PERIOD && _seconds <= MAX_VOTING_PERIOD, "Period out of bounds");
        uint256 oldPeriod = votingPeriod;
        votingPeriod = _seconds;
        emit VotingPeriodUpdated(oldPeriod, _seconds);
    }

    // --- View Functions ---

    function getProposal(uint256 proposalId) external view returns (
        address researcher, string memory purpose, string memory description,
        uint256 durationDays, uint256 votesFor, uint256 votesAgainst,
        uint256 totalVoters, ProposalStatus status, uint256 createdAt,
        uint256 deadline, uint256 accessExpiresAt
    ) {
        Proposal storage p = proposals[proposalId];
        return (p.researcher, p.purpose, p.description, p.durationDays,
                p.votesFor, p.votesAgainst, p.totalVoters, p.status,
                p.createdAt, p.deadline, p.accessExpiresAt);
    }

    function proposalCount() external view returns (uint256) {
        return proposals.length;
    }

    function getMember(address addr) external view returns (
        bytes32 dataId, string memory storachaCid, uint8 channelCount,
        uint256 sampleRate, bool deidentified, uint256 joinedAt, bool active
    ) {
        Member storage m = members[addr];
        return (m.dataId, m.storachaCid, m.channelCount, m.sampleRate,
                m.deidentified, m.joinedAt, m.active);
    }

    function getMemberList() external view returns (address[] memory) {
        return memberList;
    }

    function getActiveMembers() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < memberList.length; i++) {
            if (members[memberList[i]].active) count++;
        }
        address[] memory active = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < memberList.length; i++) {
            if (members[memberList[i]].active) {
                active[idx] = memberList[i];
                idx++;
            }
        }
        return active;
    }

    function getProposalCategories(uint256 proposalId) external view returns (DataCategory[] memory) {
        require(proposalId < proposals.length, "Invalid proposal");
        return proposals[proposalId].categories;
    }
}
