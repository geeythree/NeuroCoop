// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title ConsentRegistry — On-chain consent management for neural data
/// @notice Manages granular, revocable consent for encrypted neural data access
/// @dev Designed for Flow EVM. Access control conditions checked by Lit Protocol nodes.
contract ConsentRegistry {
    struct DataRecord {
        address owner;
        string storachaCid;
        string dataHash;
        uint256 uploadedAt;
    }

    mapping(bytes32 => DataRecord) public records;
    mapping(bytes32 => mapping(address => bool)) public consents;
    mapping(bytes32 => address[]) private grantedResearchers;

    event DataRegistered(
        bytes32 indexed dataId,
        address indexed owner,
        string cid,
        uint256 timestamp
    );

    event ConsentGranted(
        bytes32 indexed dataId,
        address indexed owner,
        address indexed researcher
    );

    event ConsentRevoked(
        bytes32 indexed dataId,
        address indexed owner,
        address indexed researcher
    );

    modifier onlyOwner(bytes32 dataId) {
        require(records[dataId].owner == msg.sender, "Not data owner");
        _;
    }

    function registerData(
        bytes32 dataId,
        string calldata storachaCid,
        string calldata dataHash
    ) external {
        require(records[dataId].owner == address(0), "Already registered");
        records[dataId] = DataRecord({
            owner: msg.sender,
            storachaCid: storachaCid,
            dataHash: dataHash,
            uploadedAt: block.timestamp
        });
        emit DataRegistered(dataId, msg.sender, storachaCid, block.timestamp);
    }

    function grantConsent(bytes32 dataId, address researcher) external onlyOwner(dataId) {
        require(!consents[dataId][researcher], "Already granted");
        consents[dataId][researcher] = true;
        grantedResearchers[dataId].push(researcher);
        emit ConsentGranted(dataId, msg.sender, researcher);
    }

    function revokeConsent(bytes32 dataId, address researcher) external onlyOwner(dataId) {
        require(consents[dataId][researcher], "Not granted");
        consents[dataId][researcher] = false;
        emit ConsentRevoked(dataId, msg.sender, researcher);
    }

    /// @notice Check if a researcher has consent to access data
    /// @dev Called by Lit Protocol access control conditions
    function hasConsent(bytes32 dataId, address researcher) external view returns (bool) {
        return consents[dataId][researcher];
    }

    function getRecord(bytes32 dataId) external view returns (
        address owner,
        string memory storachaCid,
        string memory dataHash,
        uint256 uploadedAt
    ) {
        DataRecord storage r = records[dataId];
        return (r.owner, r.storachaCid, r.dataHash, r.uploadedAt);
    }

    function getGrantedResearchers(bytes32 dataId) external view returns (address[] memory) {
        return grantedResearchers[dataId];
    }
}
