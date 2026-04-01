/**
 * Cognition Module — AI-powered neural data governance intelligence.
 *
 * Addresses the "Cognition" pillar of PL Genesis NeuroTech track
 * (Cognition × Coordination × Computation):
 *
 * - Research proposal ethics analysis: before the cooperative votes,
 *   Venice AI flags risks, scores alignment with Neurorights principles,
 *   and surfaces concerns members may not have technical expertise to spot.
 *
 * - Neural signal insights: metadata-only analysis (no raw data ever sent
 *   to the AI) of EEG recording characteristics to help members understand
 *   what they're sharing.
 *
 * - Governance health: cooperative participation analytics with actionable
 *   recommendations to prevent plutocracy drift or voter apathy.
 *
 * Privacy-preserving by design: Venice AI operates with zero data retention
 * and processes only anonymized proposal descriptions and statistical summaries
 * — never raw neural signals.
 */

export interface ProposalAnalysis {
  ethicsScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  concerns: string[];
  strengths: string[];
  recommendation: 'approve' | 'scrutinize' | 'reject';
  reasoning: string;
  alignmentScore: {
    neurorights: number;
    mentalPrivacy: number;
    freeWill: number;
    fairAccess: number;
    protectionFromBias: number;
  };
  redFlags: string[];
}

export interface NeuralInsights {
  patterns: string[];
  researchValue: 'low' | 'medium' | 'high';
  sensitivityLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendedCategories: string[];
  privacyRisk: string;
  cognitiveStatesDetected: string[];
}

export interface GovernanceHealth {
  participationRate: number;
  concentrationRisk: string;
  approvalBias: string;
  recommendations: string[];
  healthScore: number;
  warnings: string[];
}

const VENICE_BASE_URL = process.env.VENICE_BASE_URL ?? 'https://api.venice.ai/api/v1';
const MODEL = process.env.VENICE_MODEL ?? 'llama-3.3-70b';

const VENICE_TIMEOUT_MS = 30_000;

async function callVenice(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VENICE_TIMEOUT_MS);

  try {
    const resp = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 900,
        temperature: 0.15,
        venice_parameters: { enable_web_search: 'off', include_venice_system_prompt: false },
      }),
      signal: controller.signal,
    });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Venice API ${resp.status}: ${text}`);
  }

  const data = await resp.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timeout);
  }
}

function extractJSON(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    // Try stripping trailing commas (common LLM mistake)
    try {
      return JSON.parse(match[0].replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
}

/**
 * Analyze a research proposal for ethics, risk, and alignment with Neurorights principles.
 *
 * This is called before the cooperative votes, giving members AI-assisted intelligence
 * about proposals that may use technical language to obscure harmful intent.
 */
export async function analyzeProposal(
  apiKey: string,
  proposal: {
    purpose: string;
    description: string;
    durationDays: number;
    categories: string[];
    researcher: string;
  }
): Promise<ProposalAnalysis> {
  const system = `You are a neurotechnology ethics AI advisor. You evaluate research proposals \
requesting access to pooled EEG/BCI data from a democratic neural data cooperative.

Your task is to protect cooperative members — who may not have neuroscience or legal expertise — \
by identifying risks they might miss. Apply the Neurorights Foundation's five rights:
1. Mental Privacy — protection from unauthorized access to neural data
2. Personal Identity — protection from manipulation of personal identity
3. Free Will — protection from cognitive manipulation
4. Fair Access — equitable access to neurotechnology benefits
5. Protection from Bias — protection from discriminatory neural data uses

Respond ONLY with a valid JSON object. No markdown, no explanation outside the JSON.`;

  const user = `Evaluate this research proposal for neural data access:

Purpose: "${proposal.purpose}"
Description: "${proposal.description}"
Duration: ${proposal.durationDays} days
Requested data categories: ${proposal.categories.join(', ')}

Return this exact JSON structure:
{
  "ethicsScore": <integer 0-100>,
  "riskLevel": "<low|medium|high|critical>",
  "concerns": ["<specific concern>"],
  "strengths": ["<genuine strength>"],
  "recommendation": "<approve|scrutinize|reject>",
  "reasoning": "<2-3 sentence plain-language summary for cooperative members>",
  "alignmentScore": {
    "neurorights": <0-100>,
    "mentalPrivacy": <0-100>,
    "freeWill": <0-100>,
    "fairAccess": <0-100>,
    "protectionFromBias": <0-100>
  },
  "redFlags": ["<specific red flag phrase from description, or empty array>"]
}`;

  try {
    const raw = await callVenice(apiKey, system, user);
    const parsed = extractJSON(raw);
    if (parsed && typeof parsed.ethicsScore === 'number') {
      return parsed as ProposalAnalysis;
    }
  } catch (err) {
    console.warn('[cognition] analyzeProposal failed:', err instanceof Error ? err.message : err);
  }

  return {
    ethicsScore: 50,
    riskLevel: 'medium',
    concerns: ['AI analysis unavailable — manual review required before voting'],
    strengths: [],
    recommendation: 'scrutinize',
    reasoning: 'Automated ethics analysis could not complete. Cooperative members should review the proposal manually before voting.',
    alignmentScore: { neurorights: 50, mentalPrivacy: 50, freeWill: 50, fairAccess: 50, protectionFromBias: 50 },
    redFlags: [],
  };
}

/**
 * Generate cognitive insights from EEG metadata only — no raw neural data is ever sent.
 *
 * Helps cooperative members understand what their data actually reveals about their
 * cognitive states before deciding whether to share it with researchers.
 */
export async function generateNeuralInsights(
  apiKey: string,
  eegSummary: {
    channels: string[];
    duration: string;
    sampleRate: number;
    labels: string[];
    signalStats: Record<string, { min: number; max: number; mean: number }>;
  }
): Promise<NeuralInsights> {
  const system = `You are a neuroscience AI assistant. You analyze EEG recording metadata \
(statistical summaries only — no raw data) to help non-expert BCI users understand \
what information their neural recordings contain and what cognitive states might be inferred.

Be honest about sensitivity. Neural data with labeled cognitive states is highly sensitive \
and can reveal mental health conditions, attention disorders, emotional regulation, and more.

Respond ONLY with valid JSON.`;

  const user = `Analyze this EEG recording summary to help the owner understand what they're sharing:

Channels: ${eegSummary.channels.join(', ')} (${eegSummary.channels.length} channels)
Recording duration: ${eegSummary.duration}
Sample rate: ${eegSummary.sampleRate} Hz
Labeled states in recording: ${eegSummary.labels.length > 0 ? eegSummary.labels.join(', ') : 'none'}
Signal amplitude ranges (μV): ${JSON.stringify(eegSummary.signalStats)}

Return this JSON:
{
  "patterns": ["<what this recording likely captures, in plain language>"],
  "researchValue": "<low|medium|high>",
  "sensitivityLevel": "<low|medium|high|critical>",
  "recommendedCategories": ["<safest data categories to share for this recording>"],
  "privacyRisk": "<one sentence plain-language privacy risk>",
  "cognitiveStatesDetected": ["<cognitive states that may be inferred from the labeled data>"]
}`;

  try {
    const raw = await callVenice(apiKey, system, user);
    const parsed = extractJSON(raw);
    if (parsed && parsed.sensitivityLevel) {
      return parsed as NeuralInsights;
    }
  } catch (err) {
    console.warn('[cognition] generateNeuralInsights failed:', err instanceof Error ? err.message : err);
  }

  return {
    patterns: ['Multi-channel EEG with labeled cognitive states'],
    researchValue: 'medium',
    sensitivityLevel: 'high',
    recommendedCategories: ['Processed Features', 'ML Inferences'],
    privacyRisk: 'EEG recordings with labeled states carry moderate re-identification risk and can reveal cognitive patterns.',
    cognitiveStatesDetected: eegSummary.labels,
  };
}

/**
 * Assess the health of cooperative governance.
 *
 * Detects: voter apathy, approval rate anomalies, concentration risk,
 * and recommends governance improvements before they become problems.
 */
export async function assessGovernanceHealth(
  apiKey: string,
  stats: {
    memberCount: number;
    proposalCount: number;
    approvedCount: number;
    rejectedCount: number;
    averageVotesPerProposal: number;
  }
): Promise<GovernanceHealth> {
  const participationRate = stats.proposalCount > 0 && stats.memberCount > 0
    ? Math.min(100, Math.round((stats.averageVotesPerProposal / stats.memberCount) * 100))
    : 0;

  const approvalRate = stats.proposalCount > 0
    ? Math.round((stats.approvedCount / stats.proposalCount) * 100)
    : 0;

  const system = `You are a cooperative governance expert. You evaluate the democratic health \
of a neural data cooperative using quantitative indicators. Your goal is to flag early warning \
signs before they become structural problems (plutocracy drift, rubber-stamping, voter apathy).

Respond ONLY with valid JSON.`;

  const user = `Evaluate this neural data cooperative's governance health:

Members: ${stats.memberCount}
Total proposals voted on: ${stats.proposalCount}
Approved: ${stats.approvedCount} (${approvalRate}%)
Rejected: ${stats.rejectedCount}
Average votes per proposal: ${stats.averageVotesPerProposal.toFixed(1)} of ${stats.memberCount} members (${participationRate}% participation)

Return this JSON:
{
  "participationRate": ${participationRate},
  "concentrationRisk": "<description of vote concentration risk>",
  "approvalBias": "<is the approval rate healthy, suspiciously high, or too low?>",
  "recommendations": ["<actionable recommendation>"],
  "healthScore": <integer 0-100>,
  "warnings": ["<warning if any governance red flag detected, else empty array>"]
}`;

  try {
    const raw = await callVenice(apiKey, system, user);
    const parsed = extractJSON(raw);
    if (parsed && typeof parsed.healthScore === 'number') {
      return { ...parsed, participationRate } as GovernanceHealth;
    }
  } catch (err) {
    console.warn('[cognition] assessGovernanceHealth failed:', err instanceof Error ? err.message : err);
  }

  return {
    participationRate,
    concentrationRisk: 'Unable to assess — AI analysis unavailable',
    approvalBias: approvalRate > 90 ? 'Suspiciously high approval rate' : approvalRate < 10 ? 'Very low approval rate' : 'Within normal range',
    recommendations: ['Ensure quorum requirements are enforced', 'Encourage broader member participation'],
    healthScore: participationRate > 60 ? 75 : 45,
    warnings: participationRate < 30 ? ['Low voter participation may undermine cooperative legitimacy'] : [],
  };
}
