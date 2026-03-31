// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title ConsentRegistry — Granular, purpose-limited consent for neural data
/// @notice On-chain consent management with time expiration, purpose limitation, and audit trail
/// @dev Designed for Flow EVM. Access conditions checked by Lit Protocol nodes.
contract ConsentRegistry {
    enum DataCategory {
        RAW_EEG,           // Full raw EEG traces
        PROCESSED_FEATURES, // Extracted features (band power, ERPs)
        INFERENCES,        // ML model outputs (seizure detection, etc.)
        METADATA           // Device info, session metadata
    }

    struct DataRecord {
        address owner;
        string storachaCid;        // Encrypted data on Storacha/IPFS
        string receiptCid;         // Consent receipt on Storacha/IPFS
        string dataHash;           // SHA-256 of original data
        uint8 channelCount;        // EEG channel count
        uint256 sampleRate;        // Hz
        uint256 uploadedAt;
        bool deidentified;         // Whether PII was stripped
    }

    struct ConsentGrant {
        string purpose;            // e.g., "alzheimers-research"
        uint256 grantedAt;
        uint256 expiresAt;         // 0 = no expiration
        DataCategory[] categories; // Which data types are consented
        bool active;
    }

    struct AccessLog {
        address researcher;
        uint256 accessedAt;
        string purpose;
    }

    // dataId => DataRecord
    mapping(bytes32 => DataRecord) public records;

    // dataId => researcher => ConsentGrant
    mapping(bytes32 => mapping(address => ConsentGrant)) public consents;

    // dataId => all researchers ever granted
    mapping(bytes32 => address[]) private grantedResearchers;

    // dataId => access log
    mapping(bytes32 => AccessLog[]) private accessLogs;

    // Counters
    uint256 public totalRecords;
    uint256 public totalConsents;
    uint256 public totalAccesses;

    event DataRegistered(
        bytes32 indexed dataId,
        address indexed owner,
        string cid,
        string receiptCid,
        uint8 channelCount,
        uint256 sampleRate,
        bool deidentified,
        uint256 timestamp
    );

    event ConsentGranted(
        bytes32 indexed dataId,
        address indexed owner,
        address indexed researcher,
        string purpose,
        uint256 expiresAt
    );

    event ConsentRevoked(
        bytes32 indexed dataId,
        address indexed owner,
        address indexed researcher,
        string reason
    );

    event DataAccessed(
        bytes32 indexed dataId,
        address indexed researcher,
        string purpose,
        uint256 timestamp
    );

    modifier onlyOwner(bytes32 dataId) {
        require(records[dataId].owner == msg.sender, "Not data owner");
        _;
    }

    function registerData(
        bytes32 dataId,
        string calldata storachaCid,
        string calldata receiptCid,
        string calldata dataHash,
        uint8 channelCount,
        uint256 sampleRate,
        bool deidentified
    ) external {
        require(records[dataId].owner == address(0), "Already registered");
        records[dataId] = DataRecord({
            owner: msg.sender,
            storachaCid: storachaCid,
            receiptCid: receiptCid,
            dataHash: dataHash,
            channelCount: channelCount,
            sampleRate: sampleRate,
            uploadedAt: block.timestamp,
            deidentified: deidentified
        });
        totalRecords++;
        emit DataRegistered(
            dataId, msg.sender, storachaCid, receiptCid,
            channelCount, sampleRate, deidentified, block.timestamp
        );
    }

    function grantConsent(
        bytes32 dataId,
        address researcher,
        string calldata purpose,
        uint256 expiresAt,
        DataCategory[] calldata categories
    ) external onlyOwner(dataId) {
        require(!consents[dataId][researcher].active, "Already active");
        require(categories.length > 0, "Must specify data categories");
        if (expiresAt > 0) {
            require(expiresAt > block.timestamp, "Expiration must be in future");
        }

        consents[dataId][researcher] = ConsentGrant({
            purpose: purpose,
            grantedAt: block.timestamp,
            expiresAt: expiresAt,
            categories: categories,
            active: true
        });

        grantedResearchers[dataId].push(researcher);
        totalConsents++;

        emit ConsentGranted(dataId, msg.sender, researcher, purpose, expiresAt);
    }

    function revokeConsent(
        bytes32 dataId,
        address researcher,
        string calldata reason
    ) external onlyOwner(dataId) {
        require(consents[dataId][researcher].active, "Not active");
        consents[dataId][researcher].active = false;
        emit ConsentRevoked(dataId, msg.sender, researcher, reason);
    }

    /// @notice Check if researcher has valid, non-expired consent
    /// @dev Called by Lit Protocol access control conditions
    function hasConsent(bytes32 dataId, address researcher) external view returns (bool) {
        ConsentGrant storage grant = consents[dataId][researcher];
        if (!grant.active) return false;
        if (grant.expiresAt > 0 && block.timestamp > grant.expiresAt) return false;
        return true;
    }

    /// @notice Log data access for audit trail
    function logAccess(
        bytes32 dataId,
        string calldata purpose
    ) external {
        require(this.hasConsent(dataId, msg.sender), "No valid consent");
        accessLogs[dataId].push(AccessLog({
            researcher: msg.sender,
            accessedAt: block.timestamp,
            purpose: purpose
        }));
        totalAccesses++;
        emit DataAccessed(dataId, msg.sender, purpose, block.timestamp);
    }

    function getRecord(bytes32 dataId) external view returns (
        address owner,
        string memory storachaCid,
        string memory receiptCid,
        string memory dataHash,
        uint8 channelCount,
        uint256 sampleRate,
        uint256 uploadedAt,
        bool deidentified
    ) {
        DataRecord storage r = records[dataId];
        return (r.owner, r.storachaCid, r.receiptCid, r.dataHash,
                r.channelCount, r.sampleRate, r.uploadedAt, r.deidentified);
    }

    function getConsent(bytes32 dataId, address researcher) external view returns (
        string memory purpose,
        uint256 grantedAt,
        uint256 expiresAt,
        bool active,
        bool expired
    ) {
        ConsentGrant storage g = consents[dataId][researcher];
        bool isExpired = g.expiresAt > 0 && block.timestamp > g.expiresAt;
        return (g.purpose, g.grantedAt, g.expiresAt, g.active, isExpired);
    }

    function getGrantedResearchers(bytes32 dataId) external view returns (address[] memory) {
        return grantedResearchers[dataId];
    }

    function getAccessLog(bytes32 dataId) external view returns (AccessLog[] memory) {
        return accessLogs[dataId];
    }
}
