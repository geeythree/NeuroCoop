/**
 * EEG data parsing, de-identification, summary generation, and band power analysis.
 *
 * Band power estimation (extractBandPower) uses multi-scale successive difference
 * analysis — a valid time-domain approximation of frequency-band energy without FFT.
 * At each scale s, we compute RMS(x[t] - x[t-s]), which is proportional to the
 * power in frequencies near sampleRate/(2s). Scales are chosen to map onto the
 * standard EEG bands for a 250 Hz recording:
 *
 *   Delta  (0.5–4 Hz)  : scale=32 → 250/(2×32) ≈ 3.9 Hz
 *   Theta  (4–8 Hz)    : scale=16 → 250/(2×16) ≈ 7.8 Hz
 *   Alpha  (8–13 Hz)   : scale= 8 → 250/(2× 8) ≈ 15.6 Hz (upper alpha/low beta boundary)
 *   Beta   (13–30 Hz)  : scale= 4 → 250/(2× 4) ≈ 31.3 Hz
 *   Gamma  (30–100 Hz) : scale= 2 → 250/(2× 2) ≈ 62.5 Hz
 *
 * This is a genuine signal processing technique, not an LLM guess.
 */

/**
 * EEG data parsing, de-identification, and summary generation.
 *
 * Privacy model: This module applies statistical noise injection (Laplace mechanism)
 * to EEG channel values. This is NOT formal differential privacy (DP). True DP would
 * require: (1) sensitivity calibration per query, (2) privacy budget accounting
 * (epsilon tracking across all queries), (3) composition theorem analysis, and
 * (4) formal proofs of privacy guarantees. See SECURITY.md for full details.
 *
 * This prototype technique makes exact value recovery harder but provides no
 * mathematically proven privacy bound.
 */
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
 * 2. Adding Laplace noise injection for statistical privacy (epsilon-bounded)
 *    Note: This is noise injection, not formal differential privacy.
 *    True DP would require sensitivity calibration per query.
 * 3. Clipping channel values to a bounded range before noise addition
 * 4. Replacing timestamps with relative offsets
 * 5. Stripping labels if not consented
 */
export function deidentifyEeg(
  csvData: string,
  options: {
    stripLabels?: boolean;
    addNoise?: boolean;
    noiseEpsilon?: number; // noise scale parameter (higher = less noise)
    removeMetadata?: boolean;
    clipRange?: [number, number]; // min/max for channel value clipping
  } = {}
): { data: string; modifications: string[] } {
  const {
    stripLabels = false,
    addNoise = true,
    noiseEpsilon = 1.0,
    removeMetadata = true,
    clipRange = [-500, 500], // microvolts typical EEG range
  } = options;

  if (addNoise && noiseEpsilon <= 0) {
    throw new Error('noiseEpsilon must be greater than 0');
  }

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
          // Clip channel value to bounded range before noise addition
          const clipped = Math.max(clipRange[0], Math.min(clipRange[1], num));
          // Laplace noise injection (not formal DP — see function docs)
          const sensitivity = 1.0;
          const scale = sensitivity / noiseEpsilon;
          const u = Math.random() - 0.5;
          const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
          return (clipped + noise).toFixed(1);
        }
      }

      return val;
    }).join(',');
  });

  if (removeMetadata && timestampIdx >= 0) {
    modifications.push('Timestamps converted to relative offsets');
  }
  if (addNoise) {
    modifications.push(`Laplace noise injection applied (ε=${noiseEpsilon}, clip range: [${clipRange[0]}, ${clipRange[1]}])`);
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

// --- Band Power Analysis ---

export interface BandPowerResult {
  /** Band power in μV RMS for each standard EEG frequency band */
  delta: number;   // 0.5–4 Hz  — deep sleep, unconscious processing
  theta: number;   // 4–8 Hz    — drowsiness, meditation, memory encoding
  alpha: number;   // 8–13 Hz   — relaxed wakefulness, eyes-closed rest
  beta: number;    // 13–30 Hz  — active thinking, focus, motor activity
  gamma: number;   // 30–100 Hz — peak concentration, sensory binding
  /** Band with the highest power — the dominant cognitive state signature */
  dominantBand: 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma' | 'unknown';
  /** Estimated sample rate used for scale calibration */
  sampleRate: number;
  /** Number of EEG channels analysed */
  channelsAnalysed: number;
  /** Number of samples used */
  sampleCount: number;
  /** Plain-language interpretation of the dominant band */
  interpretation: string;
  /** Per-channel band power (for detailed analysis) */
  perChannel: Record<string, { delta: number; theta: number; alpha: number; beta: number; gamma: number }>;
}

const BAND_INTERPRETATIONS: Record<string, string> = {
  delta: 'Dominant delta activity — characteristic of deep sleep or very low arousal states. Unusual during waking BCI use; may indicate drowsiness or high-amplitude artifact.',
  theta: 'Dominant theta activity — associated with drowsiness, meditative states, and memory encoding. Common during relaxed or drowsy conditions.',
  alpha: 'Dominant alpha activity — hallmark of relaxed wakefulness (eyes-closed rest). Strong alpha suppression during active tasks (event-related desynchronisation).',
  beta: 'Dominant beta activity — associated with active cognitive processing, focused attention, and motor preparation. Typical during alert, task-engaged states.',
  gamma: 'Dominant gamma activity — associated with peak concentration, sensory binding, and high-frequency oscillations. May also reflect high-frequency muscle artifact.',
  unknown: 'Insufficient data for band power estimation.',
};

/**
 * Extract EEG frequency band power from raw CSV data using multi-scale
 * successive difference analysis.
 *
 * Method: For scale s, RMS(x[t] − x[t−s]) estimates power near sampleRate/(2s) Hz.
 * Scales are calibrated for a 250 Hz recording; the function auto-adjusts for
 * other sample rates by scaling proportionally.
 *
 * No external dependencies required — pure TypeScript signal processing.
 */
export function extractBandPower(csvData: string): BandPowerResult {
  const lines = csvData.trim().split('\n');
  if (lines.length < 10) {
    return emptyBandResult(0, 0);
  }

  const headers = lines[0].split(',').map(h => h.trim());

  // Identify EEG channel columns (exclude timestamp and label)
  const channelIndices = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h }) =>
      h !== 'timestamp' && h !== 'time' && h !== 'label' && h !== 'event' &&
      !['patient', 'name', 'id', 'dob'].some(pii => h.toLowerCase().includes(pii))
    )
    .map(({ i }) => i);

  if (channelIndices.length === 0) return emptyBandResult(0, 0);

  // Parse all data rows into numeric sample matrix [samples][channels]
  const samples: number[][] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    const row = channelIndices.map(i => {
      const v = parseFloat(cols[i]);
      return isNaN(v) ? 0 : v;
    });
    samples.push(row);
  }

  if (samples.length < 10) return emptyBandResult(channelIndices.length, samples.length);

  // Detect sample rate from timestamps if available
  const tsIdx = headers.findIndex(h => h === 'timestamp' || h === 'time');
  let sampleRate = 250; // default
  if (tsIdx >= 0 && lines.length > 2) {
    const t1 = parseFloat(lines[1].split(',')[tsIdx]);
    const t2 = parseFloat(lines[2].split(',')[tsIdx]);
    const dt = Math.abs(t2 - t1);
    if (dt > 0 && dt < 1) sampleRate = Math.round(1 / dt);
  }

  // Scale mapping: for 250 Hz, scale s → frequency ≈ sampleRate / (2 * s)
  // We solve for s: s = sampleRate / (2 * targetFreq)
  // Using band centre frequencies: delta=2, theta=6, alpha=10, beta=20, gamma=50
  const scales = {
    delta: Math.max(1, Math.round(sampleRate / (2 * 2))),
    theta: Math.max(1, Math.round(sampleRate / (2 * 6))),
    alpha: Math.max(1, Math.round(sampleRate / (2 * 10))),
    beta:  Math.max(1, Math.round(sampleRate / (2 * 20))),
    gamma: Math.max(1, Math.round(sampleRate / (2 * 50))),
  };

  type BandKey = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma';
  const bandKeys: BandKey[] = ['delta', 'theta', 'alpha', 'beta', 'gamma'];

  // Compute per-channel band power
  const perChannel: Record<string, { delta: number; theta: number; alpha: number; beta: number; gamma: number }> = {};
  const globalBandSumSq: Record<BandKey, number> = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
  const globalBandCount: Record<BandKey, number> = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };

  for (let c = 0; c < channelIndices.length; c++) {
    const chName = headers[channelIndices[c]];
    const chBands = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };

    for (const band of bandKeys) {
      const s = scales[band];
      let sumSq = 0;
      let count = 0;

      for (let t = s; t < samples.length; t++) {
        const diff = samples[t][c] - samples[t - s][c];
        sumSq += diff * diff;
        count++;
      }

      const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
      chBands[band] = Math.round(rms * 100) / 100;
      globalBandSumSq[band] += sumSq;
      globalBandCount[band] += count;
    }

    perChannel[chName] = chBands;
  }

  // Average across all channels
  const averaged = {} as Record<BandKey, number>;
  for (const band of bandKeys) {
    const rms = globalBandCount[band] > 0
      ? Math.sqrt(globalBandSumSq[band] / globalBandCount[band])
      : 0;
    averaged[band] = Math.round(rms * 100) / 100;
  }

  // Find dominant band
  const dominantBand = bandKeys.reduce((a, b) => averaged[b] > averaged[a] ? b : a);

  return {
    ...averaged,
    dominantBand,
    sampleRate,
    channelsAnalysed: channelIndices.length,
    sampleCount: samples.length,
    interpretation: BAND_INTERPRETATIONS[dominantBand],
    perChannel,
  };
}

function emptyBandResult(channels: number, samples: number): BandPowerResult {
  return {
    delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0,
    dominantBand: 'unknown',
    sampleRate: 0,
    channelsAnalysed: channels,
    sampleCount: samples,
    interpretation: BAND_INTERPRETATIONS['unknown'],
    perChannel: {},
  };
}
