export type Phase = 'analysis' | 'action' | 'final';

export interface PhaseControl {
  allowed_tools?: string[];
  allow_tool_use?: boolean;
  next_phase?: Phase;
  notes?: string;
  [key: string]: unknown;
}

export interface EnvelopePayload {
  type?: string;
  content: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PhaseGatedEnvelope {
  phase: Phase;
  control: PhaseControl;
  envelope: EnvelopePayload;
  [key: string]: unknown;
}

const PHASE_ORDER: Phase[] = ['analysis', 'action', 'final'];

export function parsePhaseEnvelope(raw: string): PhaseGatedEnvelope {
  let parsed: any;

  try {
    parsed = JSON.parse(raw);
  } catch (error: any) {
    throw new Error(`Envelope must be valid JSON: ${error?.message || String(error)}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Envelope must be a JSON object.');
  }

  if (typeof parsed.phase !== 'string') {
    throw new Error('Envelope must include a string "phase" field.');
  }

  const normalizedPhase = parsed.phase.toLowerCase();
  if (!PHASE_ORDER.includes(normalizedPhase)) {
    throw new Error(`Phase "${parsed.phase}" is invalid. Use one of: ${PHASE_ORDER.join(', ')}.`);
  }

  const control = parsed.control;
  if (!control || typeof control !== 'object' || Array.isArray(control)) {
    throw new Error('Envelope must include a "control" object.');
  }

  if (control.allowed_tools !== undefined) {
    if (!Array.isArray(control.allowed_tools) || !control.allowed_tools.every((tool: any) => typeof tool === 'string')) {
      throw new Error('"control.allowed_tools" must be an array of strings when provided.');
    }
  }

  if (control.allow_tool_use !== undefined && typeof control.allow_tool_use !== 'boolean') {
    throw new Error('"control.allow_tool_use" must be a boolean when provided.');
  }

  if (control.next_phase !== undefined) {
    if (typeof control.next_phase !== 'string') {
      throw new Error('"control.next_phase" must be a string when provided.');
    }

    const normalizedNext = control.next_phase.toLowerCase();
    if (!PHASE_ORDER.includes(normalizedNext)) {
      throw new Error(`"control.next_phase" must be one of: ${PHASE_ORDER.join(', ')}.`);
    }

    control.next_phase = normalizedNext;
  }

  if (control.notes !== undefined && typeof control.notes !== 'string') {
    throw new Error('"control.notes" must be a string when provided.');
  }

  const envelope = parsed.envelope;
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error('Envelope must include an "envelope" object with the payload metadata.');
  }

  if (typeof envelope.content !== 'string') {
    throw new Error('"envelope.content" must be a string.');
  }

  if (envelope.type !== undefined && typeof envelope.type !== 'string') {
    throw new Error('"envelope.type" must be a string when provided.');
  }

  if (envelope.metadata !== undefined && (typeof envelope.metadata !== 'object' || Array.isArray(envelope.metadata))) {
    throw new Error('"envelope.metadata" must be an object when provided.');
  }

  const normalizedEnvelope: PhaseGatedEnvelope = {
    ...parsed,
    phase: normalizedPhase,
    control: { ...control },
    envelope: { ...envelope }
  };

  if (normalizedEnvelope.control.allowed_tools) {
    normalizedEnvelope.control.allowed_tools = [...normalizedEnvelope.control.allowed_tools];
  }

  return normalizedEnvelope;
}

export function validatePhaseProgression(previous: Phase | null, next: Phase): string | null {
  if (!previous) {
    return null;
  }

  if (previous === 'final' && next !== 'final') {
    return 'Cannot transition out of the "final" phase once it has been reached.';
  }

  return null;
}
