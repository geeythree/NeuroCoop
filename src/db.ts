/**
 * Persistent storage layer using SQLite.
 *
 * Ensures the cooperative's state survives server restarts:
 * - Encrypted data references (CIDs, hashes, metadata)
 * - Registered wallet mappings
 * - Consent receipts
 * - Audit trail of all actions
 *
 * Encrypted blobs themselves stay on Storacha/IPFS — we only
 * store references and the ECIES ciphertext for cache.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import type { EncryptedUpload, ConsentReceipt } from './types.js';

export class Store {
  private db: Database.Database;

  constructor(dbPath = './data/neurocoop.db') {
    mkdirSync('./data', { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS uploads (
        data_id TEXT PRIMARY KEY,
        storacha_cid TEXT NOT NULL,
        data_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        owner TEXT NOT NULL,
        filename TEXT NOT NULL,
        channel_count INTEGER NOT NULL,
        sample_rate INTEGER NOT NULL,
        deidentified INTEGER NOT NULL DEFAULT 1,
        timestamp INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS encryption_cache (
        owner_address TEXT PRIMARY KEY,
        encrypted_data TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS wallets (
        address TEXT PRIMARY KEY,
        private_key TEXT NOT NULL,
        registered_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY,
        proposal_id INTEGER NOT NULL,
        receipt_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        details TEXT,
        tx_hash TEXT,
        success INTEGER NOT NULL DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    `);
  }

  // --- Uploads ---

  saveUpload(upload: EncryptedUpload): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO uploads (data_id, storacha_cid, data_hash, tx_hash, owner, filename, channel_count, sample_rate, deidentified, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      upload.dataId, upload.storachaCid, upload.dataHash, upload.txHash,
      upload.owner, upload.filename, upload.channelCount, upload.sampleRate,
      upload.deidentified ? 1 : 0, upload.timestamp
    );
  }

  getUpload(dataId: string): EncryptedUpload | null {
    const row = this.db.prepare('SELECT * FROM uploads WHERE data_id = ?').get(dataId) as any;
    if (!row) return null;
    return {
      dataId: row.data_id, storachaCid: row.storacha_cid, dataHash: row.data_hash,
      txHash: row.tx_hash, owner: row.owner, filename: row.filename,
      channelCount: row.channel_count, sampleRate: row.sample_rate,
      deidentified: !!row.deidentified, timestamp: row.timestamp,
    };
  }

  getAllUploads(): EncryptedUpload[] {
    const rows = this.db.prepare('SELECT * FROM uploads ORDER BY timestamp DESC').all() as any[];
    return rows.map(row => ({
      dataId: row.data_id, storachaCid: row.storacha_cid, dataHash: row.data_hash,
      txHash: row.tx_hash, owner: row.owner, filename: row.filename,
      channelCount: row.channel_count, sampleRate: row.sample_rate,
      deidentified: !!row.deidentified, timestamp: row.timestamp,
    }));
  }

  // --- Encryption Cache ---

  saveEncrypted(ownerAddress: string, encryptedData: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO encryption_cache (owner_address, encrypted_data, updated_at)
      VALUES (?, ?, datetime('now'))
    `).run(ownerAddress.toLowerCase(), encryptedData);
  }

  getEncrypted(ownerAddress: string): string | null {
    const row = this.db.prepare('SELECT encrypted_data FROM encryption_cache WHERE owner_address = ?')
      .get(ownerAddress.toLowerCase()) as any;
    return row?.encrypted_data ?? null;
  }

  // --- Wallets ---

  saveWallet(address: string, privateKey: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO wallets (address, private_key) VALUES (?, ?)
    `).run(address.toLowerCase(), privateKey);
  }

  getWallet(address: string): string | null {
    const row = this.db.prepare('SELECT private_key FROM wallets WHERE address = ?')
      .get(address.toLowerCase()) as any;
    return row?.private_key ?? null;
  }

  // --- Receipts ---

  saveReceipt(proposalId: number, receipt: ConsentReceipt): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO receipts (id, proposal_id, receipt_json) VALUES (?, ?, ?)
    `).run(receipt.receiptId, proposalId, JSON.stringify(receipt));
  }

  getReceipts(proposalId: number): ConsentReceipt[] {
    const rows = this.db.prepare('SELECT receipt_json FROM receipts WHERE proposal_id = ? ORDER BY created_at DESC')
      .all(proposalId) as any[];
    return rows.map(r => JSON.parse(r.receipt_json));
  }

  // --- Audit Log ---

  logAudit(entry: {
    actor: string;
    action: string;
    target?: string;
    details?: string;
    txHash?: string;
    success?: boolean;
  }): void {
    this.db.prepare(`
      INSERT INTO audit_log (actor, action, target, details, tx_hash, success)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      entry.actor, entry.action, entry.target ?? null,
      entry.details ?? null, entry.txHash ?? null,
      entry.success !== false ? 1 : 0
    );
  }

  getAuditLog(limit = 50): Array<{
    id: number; timestamp: string; actor: string; action: string;
    target: string | null; details: string | null; txHash: string | null; success: boolean;
  }> {
    return (this.db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit) as any[])
      .map(r => ({ ...r, success: !!r.success }));
  }

  getAuditByActor(actor: string, limit = 20): any[] {
    return this.db.prepare('SELECT * FROM audit_log WHERE actor = ? ORDER BY id DESC LIMIT ?')
      .all(actor.toLowerCase(), limit) as any[];
  }

  // --- Metrics ---

  getMetrics(): { totalUploads: number; totalReceipts: number; totalAuditEntries: number; totalWallets: number } {
    const uploads = (this.db.prepare('SELECT COUNT(*) as c FROM uploads').get() as any).c;
    const receipts = (this.db.prepare('SELECT COUNT(*) as c FROM receipts').get() as any).c;
    const audit = (this.db.prepare('SELECT COUNT(*) as c FROM audit_log').get() as any).c;
    const wallets = (this.db.prepare('SELECT COUNT(*) as c FROM wallets').get() as any).c;
    return { totalUploads: uploads, totalReceipts: receipts, totalAuditEntries: audit, totalWallets: wallets };
  }

  close(): void {
    this.db.close();
  }
}
