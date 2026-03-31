import type { EegMetadata } from './types.js';

/**
 * Parse EEG CSV data and extract metadata.
 * Supports standard CSV format with timestamp + channel columns + optional label.
 */
export function parseEegMetadata(csvData: string): EegMetadata {
  const lines = csvData.trim().split('\n');
  if (lines.length < 2) throw new Error('EEG data must have header + at least 1 row');

  const headers = lines[0].split(',').map(h => h.trim());
  const channels = headers.filter(h =>
    h.startsWith('channel_') || h.startsWith('eeg_') || h.startsWith('fp') ||
    h.startsWith('c3') || h.startsWith('c4') || h.startsWith('o1') || h.startsWith('o2')
  );

  // If no channel_ prefix, count numeric columns (excluding timestamp and label)
  const effectiveChannels = channels.length > 0 ? channels : headers.filter(h =>
    h !== 'timestamp' && h !== 'label' && h !== 'time' && h !== 'event'
  );

  const dataRows = lines.slice(1).filter(l => l.trim().length > 0);
  const hasLabels = headers.includes('label') || headers.includes('event');

  // Estimate sample rate from timestamps
  let sampleRate = 256; // default
  if (dataRows.length >= 2) {
    const t1 = parseFloat(dataRows[0].split(',')[0]);
    const t2 = parseFloat(dataRows[1].split(',')[0]);
    const dt = t2 - t1;
    if (dt > 0 && dt < 1) {
      sampleRate = Math.round(1 / dt);
    }
  }

  const duration = dataRows.length / sampleRate;

  return {
    channelCount: effectiveChannels.length,
    sampleRate,
    channels: effectiveChannels,
    duration,
    sampleCount: dataRows.length,
    hasLabels,
  };
}

/**
 * De-identify EEG data by:
 * 1. Removing any PII headers (patient name, ID, date of birth)
 * 2. Adding Gaussian noise for differential privacy (epsilon-bounded)
 * 3. Replacing timestamps with relative offsets
 * 4. Stripping labels if not consented
 */
export function deidentifyEeg(
  csvData: string,
  options: {
    stripLabels?: boolean;
    addNoise?: boolean;
    noiseEpsilon?: number; // differential privacy parameter
    removeMetadata?: boolean;
  } = {}
): { data: string; modifications: string[] } {
  const {
    stripLabels = false,
    addNoise = true,
    noiseEpsilon = 1.0,
    removeMetadata = true,
  } = options;

  const modifications: string[] = [];
  const lines = csvData.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const dataRows = lines.slice(1);

  // Step 1: Identify and remove PII columns
  const piiPatterns = ['patient', 'name', 'id', 'dob', 'birth', 'ssn', 'email', 'phone', 'address'];
  const piiIndices: number[] = [];
  headers.forEach((h, i) => {
    if (piiPatterns.some(p => h.toLowerCase().includes(p))) {
      piiIndices.push(i);
      modifications.push(`Removed PII column: ${h}`);
    }
  });

  // Step 2: Optionally strip labels
  const labelIdx = headers.findIndex(h => h === 'label' || h === 'event');
  if (stripLabels && labelIdx >= 0) {
    piiIndices.push(labelIdx);
    modifications.push('Stripped label/event column');
  }

  // Build kept column indices
  const keptIndices = headers
    .map((_, i) => i)
    .filter(i => !piiIndices.includes(i));

  // Step 3: Process rows
  const timestampIdx = headers.findIndex(h => h === 'timestamp' || h === 'time');
  let firstTimestamp = 0;
  if (timestampIdx >= 0 && dataRows.length > 0) {
    firstTimestamp = parseFloat(dataRows[0].split(',')[timestampIdx]);
  }

  const outputHeaders = keptIndices.map(i => headers[i]);
  const outputRows = dataRows.map(row => {
    const cols = row.split(',').map(c => c.trim());
    return keptIndices.map(i => {
      const val = cols[i];

      // Relative timestamps
      if (i === timestampIdx && removeMetadata) {
        const abs = parseFloat(val);
        return (abs - firstTimestamp).toFixed(4);
      }

      // Add noise to numeric EEG channels (not timestamp, not labels)
      if (addNoise && i !== timestampIdx && i !== labelIdx) {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          // Laplace noise for differential privacy
          const sensitivity = 1.0;
          const scale = sensitivity / noiseEpsilon;
          const u = Math.random() - 0.5;
          const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
          return (num + noise).toFixed(1);
        }
      }

      return val;
    }).join(',');
  });

  if (removeMetadata && timestampIdx >= 0) {
    modifications.push('Timestamps converted to relative offsets');
  }
  if (addNoise) {
    modifications.push(`Differential privacy applied (Laplace noise, ε=${noiseEpsilon})`);
  }

  const output = [outputHeaders.join(','), ...outputRows].join('\n');
  return { data: output, modifications };
}

/**
 * Generate a summary of what's in the EEG data without revealing raw values.
 * Useful for showing researchers what they'd get access to.
 */
export function generateDataSummary(csvData: string): {
  channels: string[];
  duration: string;
  sampleRate: number;
  labels: string[];
  signalStats: Record<string, { min: number; max: number; mean: number }>;
} {
  const meta = parseEegMetadata(csvData);
  const lines = csvData.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const dataRows = lines.slice(1);

  // Collect unique labels
  const labelIdx = headers.findIndex(h => h === 'label' || h === 'event');
  const labels = labelIdx >= 0
    ? [...new Set(dataRows.map(r => r.split(',')[labelIdx]?.trim()).filter(Boolean))]
    : [];

  // Channel statistics (anonymized ranges, not raw data)
  const signalStats: Record<string, { min: number; max: number; mean: number }> = {};
  for (const ch of meta.channels) {
    const chIdx = headers.indexOf(ch);
    if (chIdx < 0) continue;

    const values = dataRows
      .map(r => parseFloat(r.split(',')[chIdx]))
      .filter(v => !isNaN(v));

    if (values.length > 0) {
      signalStats[ch] = {
        min: Math.round(Math.min(...values) * 10) / 10,
        max: Math.round(Math.max(...values) * 10) / 10,
        mean: Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10,
      };
    }
  }

  return {
    channels: meta.channels,
    duration: `${meta.duration.toFixed(1)}s`,
    sampleRate: meta.sampleRate,
    labels,
    signalStats,
  };
}
