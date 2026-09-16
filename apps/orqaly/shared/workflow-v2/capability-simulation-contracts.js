// Server-only mirrors of the bounded AxWise synthetic simulation wire contract.
// These pure checks provide no source-access or model-execution authority.
import { z } from 'zod';
import { Buffer } from 'node:buffer';
import { canonicalHash, canonicalJson, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import {
  CapabilityIdSchema as Id,
  CapabilitySha256Schema as Sha,
  CapabilityUuidSchema as Uuid,
  CorpusArtifactRefV1Schema as Ref,
  TranscriptCorpusV1Schema,
  capabilityText as text,
  capabilityInteger as integer,
  capabilityUtf8,
  exactUtf8Span,
  assertUnique,
  refineCapability,
} from './capability-source-contracts.js';

const equal = (left, right) => canonicalJson(left) === canonicalJson(right);
const must = (value, message = 'Simulation identity mismatch') => {
  if (!value) throw new TypeError(message);
};
const Country = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .nullable();
const Locality = text(1, 500).nullable();
export const SIMULATION_METHOD = 'axwise.simulate.bounded.v1';
export const SIMULATION_SAMPLING_PROFILE = 'hash_uniform_v1';
const LIMITATIONS = [
  'All participants and responses are synthetic, not human testimony.',
  'Sampling is reproducible; model-generated text is not guaranteed to repeat.',
  'This cohort does not establish population prevalence, customer demand or predictive accuracy.',
  'Personality vectors use a versioned illustrative uniform profile, not measured population traits.',
];
export function simulationLimitations(mode) {
  must(['scenario_only', 'source_grounded'].includes(mode));
  return [
    ...LIMITATIONS,
    mode === 'scenario_only'
      ? 'No external grounding was requested or applied.'
      : 'Grounding records selected source passages; it does not verify simulated responses as real-world facts.',
  ];
}
export const SimulationQuestionV1Schema = z
  .object({ questionId: Id, text: text(1, 1000) })
  .strict();
export const SimulationScenarioV1Schema = z
  .object({
    id: Id,
    description: text(1, 4000),
    targetAudience: text(1, 4000),
    problem: text(1, 4000),
  })
  .strict();
export const SimulationStakeholderV1Schema = refineCapability(
  z
    .object({
      stakeholderId: Id,
      label: text(1, 500),
      description: text(1, 4000),
      participantCount: integer(1, 3),
      countryCode: Country,
      locality: Locality,
      questions: z.array(SimulationQuestionV1Schema).min(1).max(6),
    })
    .strict(),
  (value) => {
    assertUnique(value.questions.map((question) => question.questionId));
    must(value.locality === null || value.countryCode !== null);
  }
);
export const SimulationGroundingRequestV1Schema = refineCapability(
  z
    .object({
      mode: z.enum(['scenario_only', 'source_grounded']),
      sourceArtifacts: z.array(Ref).max(4),
    })
    .strict(),
  (value) => {
    assertUnique(value.sourceArtifacts.map((ref) => ref.artifactId));
    must((value.mode === 'source_grounded') === Boolean(value.sourceArtifacts.length));
    must(
      value.sourceArtifacts.every((ref) =>
        ['research', 'qualitative_analysis', 'transcript_corpus', 'simulation'].includes(ref.kind)
      )
    );
  }
);
export const SimulationSamplingV1Schema = z
  .object({
    seed: integer(0, Number.MAX_SAFE_INTEGER),
    profileVersion: z.literal('hash_uniform_v1'),
  })
  .strict();
export const SimulationRequestV1Schema = refineCapability(
  z
    .object({
      requested: z.literal(true),
      scenario: SimulationScenarioV1Schema,
      stakeholders: z.array(SimulationStakeholderV1Schema).min(1).max(4),
      grounding: SimulationGroundingRequestV1Schema,
      sampling: SimulationSamplingV1Schema,
      responseStyle: z.enum(['realistic', 'optimistic', 'critical', 'mixed']),
      generationProfile: z.literal('bounded_v1'),
    })
    .strict(),
  (value) => {
    assertUnique(value.stakeholders.map((group) => group.stakeholderId));
    const scenario = value.scenario;
    const texts = [
      scenario.id,
      scenario.description,
      scenario.targetAudience,
      scenario.problem,
      ...value.stakeholders.flatMap((group) => [
        group.label,
        group.description,
        group.locality ?? '',
        ...group.questions.map((question) => question.text),
      ]),
    ];
    must(texts.reduce((total, item) => total + capabilityUtf8(item).length, 0) <= 64_000);
  }
);
const oceanFields = [
  'openness',
  'conscientiousness',
  'extraversion',
  'agreeableness',
  'neuroticism',
];
export const SimulationOceanV1Schema = z
  .object(Object.fromEntries(oceanFields.map((field) => [field, integer(0, 1_000_000)])))
  .strict();
const slotShape = {
  participantId: Uuid,
  stakeholderId: Id,
  slotIndex: integer(1, 3),
  countryCode: Country,
  locality: Locality,
  oceanMicros: SimulationOceanV1Schema,
};
export const SimulationSlotV1Schema = z.object(slotShape).strict();
export const SimulationParticipantV1Schema = z
  .object({
    ...slotShape,
    displayName: text(3, 120),
    biography: text(40, 2000),
    motivations: z.array(text(1, 500)).min(2).max(8),
    painPoints: z.array(text(1, 500)).min(2).max(8),
    communicationStyle: text(10, 1000),
    origin: z.literal('synthetic'),
  })
  .strict();
export const SimulationAnswerV1Schema = z.object({ questionId: Id, text: text(20, 4000) }).strict();
export const SimulationInterviewV1Schema = z
  .object({ participantId: Uuid, answers: z.array(SimulationAnswerV1Schema).min(1).max(6) })
  .strict();
export const SimulationCandidateV1Schema = z
  .object({
    participants: z.array(SimulationParticipantV1Schema).min(1).max(12),
    interviews: z.array(SimulationInterviewV1Schema).min(1).max(12),
  })
  .strict();
const referenceShape = {
  artifact: Ref,
  entryKind: z.enum(['claim', 'quote']),
  entryId: Sha,
  textSha256: Sha,
};
export const SimulationGroundingReferenceV1Schema = z.object(referenceShape).strict();
export const SimulationGroundingPassageV1Schema = refineCapability(
  z.object({ ...referenceShape, text: text(1, 8000) }).strict(),
  (value) => {
    must(sha256Hex(value.text) === value.textSha256);
  }
);
function boundUuid(kind, operationId, ...parts) {
  const bytes = Buffer.from(
    canonicalHash({ namespace: 'axwise.simulation.v1', kind, operationId, parts }).slice(0, 32),
    'hex'
  );
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function simulationPlan(rawRequest, { operationId }) {
  const request = SimulationRequestV1Schema.parse(rawRequest),
    identity = Uuid.parse(operationId),
    slots = [];
  for (const stakeholder of request.stakeholders)
    for (let slotIndex = 1; slotIndex <= stakeholder.participantCount; slotIndex++) {
      const oceanMicros = {};
      for (const trait of oceanFields) {
        const sample = canonicalHash({
          profile: request.sampling.profileVersion,
          seed: request.sampling.seed,
          stakeholderId: stakeholder.stakeholderId,
          slotIndex,
          trait,
        });
        // Match Python's exact 64-bit modulo, not lossy JavaScript number parsing.
        oceanMicros[trait] = 300_000 + Number(BigInt('0x' + sample.slice(0, 16)) % 400_001n);
      }
      slots.push(
        SimulationSlotV1Schema.parse({
          participantId: boundUuid('participant', identity, stakeholder.stakeholderId, slotIndex),
          stakeholderId: stakeholder.stakeholderId,
          slotIndex,
          countryCode: stakeholder.countryCode,
          locality: stakeholder.locality,
          oceanMicros,
        })
      );
    }
  return slots;
}
export function validateSimulationGrounding(rawRequest, rawPassages) {
  const request = SimulationRequestV1Schema.parse(rawRequest);
  const passages = z.array(SimulationGroundingPassageV1Schema).max(16).parse(rawPassages);
  must(passages.reduce((total, row) => total + capabilityUtf8(row.text).length, 0) <= 32_000);
  const expected = new Map(request.grounding.sourceArtifacts.map((ref) => [ref.artifactId, ref])),
    used = new Set();
  assertUnique(
    passages.map((row) => canonicalJson([row.artifact.artifactId, row.entryKind, row.entryId]))
  );
  for (const row of passages) {
    must(
      expected.has(row.artifact.artifactId) &&
        equal(expected.get(row.artifact.artifactId), row.artifact)
    );
    used.add(row.artifact.artifactId);
  }
  must(
    used.size === expected.size &&
      (request.grounding.mode !== 'source_grounded' || passages.length > 0)
  );
  return passages;
}
function validateCandidate(candidate, request, operationId) {
  const plan = simulationPlan(request, { operationId });
  const ids = plan.map((slot) => slot.participantId);
  must(
    equal(
      candidate.participants.map((person) => person.participantId),
      ids
    )
  );
  must(
    equal(
      candidate.interviews.map((interview) => interview.participantId),
      ids
    )
  );
  const groups = new Map(request.stakeholders.map((group) => [group.stakeholderId, group]));
  for (let index = 0; index < plan.length; index++) {
    const slot = plan[index],
      person = candidate.participants[index],
      interview = candidate.interviews[index];
    must(
      equal(
        SimulationSlotV1Schema.parse(
          Object.fromEntries(Object.keys(slotShape).map((key) => [key, person[key]]))
        ),
        slot
      )
    );
    must(
      equal(
        interview.answers.map((answer) => answer.questionId),
        groups.get(slot.stakeholderId).questions.map((question) => question.questionId)
      )
    );
  }
  return plan;
}
function buildCorpus(candidate, request, operationId) {
  const groups = new Map(request.stakeholders.map((group) => [group.stakeholderId, group]));
  const documents = candidate.participants.map((person, index) => {
    const group = groups.get(person.stakeholderId),
      interview = candidate.interviews[index];
    const parts = [],
      turns = [];
    let position = 0;
    group.questions.forEach((question, questionIndex) => {
      const answer = interview.answers[questionIndex],
        key = canonicalHash({
          participantId: person.participantId,
          questionId: question.questionId,
        });
      for (const [prefix, utterance, role] of [
        ['Question: ', question.text, 'interviewer'],
        ['Answer: ', answer.text, person.participantId],
      ]) {
        parts.push(prefix, utterance, '\n');
        const start = position + capabilityUtf8(prefix).length,
          end = start + capabilityUtf8(utterance).length;
        turns.push({
          turnId: (role === 'interviewer' ? 'question-' : 'answer-') + key,
          participantId: role,
          questionId: question.questionId,
          start,
          end,
          offsetUnit: 'utf8_bytes',
        });
        position = end + 1;
      }
    });
    const body = parts.join('');
    return {
      documentId: boundUuid('transcript', operationId, person.participantId),
      title: 'Synthetic interview — ' + person.displayName,
      text: body,
      textSha256: sha256Hex(body),
      origin: 'synthetic_transcript',
      originArtifactRefs: [],
      participants: [
        {
          participantId: 'interviewer',
          displayName: 'Simulated interviewer',
          role: 'interviewer',
          stakeholderId: null,
        },
        {
          participantId: person.participantId,
          displayName: person.displayName,
          role: 'participant',
          stakeholderId: person.stakeholderId,
        },
      ],
      turns,
    };
  });
  return TranscriptCorpusV1Schema.parse({
    schemaVersion: 'axwise.transcript-corpus.v1',
    documents,
  });
}
export const SimulationCohortV1Schema = z
  .object({
    expectedParticipants: integer(1, 12),
    completedParticipants: integer(1, 12),
    expectedResponses: integer(1, 72),
    completedResponses: integer(1, 72),
    complete: z.literal(true),
  })
  .strict();
export const SimulationGroundingResultV1Schema = z
  .object({
    status: z.enum(['not_requested', 'applied']),
    selectedReferences: z.array(SimulationGroundingReferenceV1Schema).max(16),
  })
  .strict();
export const SimulationV1Schema = refineCapability(
  z
    .object({
      schemaVersion: z.literal('axwise.simulation.v1'),
      methodVersion: z.literal('axwise.simulate.bounded.v1'),
      origin: z.literal('synthetic'),
      operationId: Uuid,
      acceptedScope: Ref,
      request: SimulationRequestV1Schema,
      requestHash: Sha,
      sourceArtifacts: z.array(Ref).max(4),
      grounding: SimulationGroundingResultV1Schema,
      samplingReproducibility: z.literal('sampling_only'),
      participants: z.array(SimulationParticipantV1Schema).min(1).max(12),
      corpus: TranscriptCorpusV1Schema,
      cohort: SimulationCohortV1Schema,
      limitations: z.array(text(1, 500)).length(5),
    })
    .strict(),
  (value) => {
    must(
      value.acceptedScope.kind === 'scope' && value.requestHash === canonicalHash(value.request)
    );
    must(equal(value.sourceArtifacts, value.request.grounding.sourceArtifacts));
    must(equal(value.limitations, simulationLimitations(value.request.grounding.mode)));
    const refs = new Map(value.sourceArtifacts.map((ref) => [ref.artifactId, ref])),
      used = new Set();
    assertUnique(
      value.grounding.selectedReferences.map((row) =>
        canonicalJson([row.artifact.artifactId, row.entryKind, row.entryId])
      )
    );
    for (const row of value.grounding.selectedReferences) {
      must(
        refs.has(row.artifact.artifactId) && equal(refs.get(row.artifact.artifactId), row.artifact)
      );
      used.add(row.artifact.artifactId);
    }
    must(
      value.grounding.status ===
        (value.request.grounding.mode === 'source_grounded' ? 'applied' : 'not_requested') &&
        used.size === refs.size
    );
    must(value.corpus.documents.length === value.participants.length);
    const groups = new Map(value.request.stakeholders.map((group) => [group.stakeholderId, group]));
    const interviews = value.participants.map((person, index) => {
      const group = groups.get(person.stakeholderId),
        document = value.corpus.documents[index];
      must(group && document.turns.length === 2 * group.questions.length);
      return {
        participantId: person.participantId,
        answers: group.questions.map((question, questionIndex) => {
          const turn = document.turns[2 * questionIndex + 1];
          return {
            questionId: question.questionId,
            text: exactUtf8Span(document.text, turn.start, turn.end),
          };
        }),
      };
    });
    const candidate = SimulationCandidateV1Schema.parse({
      participants: value.participants,
      interviews,
    });
    validateCandidate(candidate, value.request, value.operationId);
    must(equal(value.corpus, buildCorpus(candidate, value.request, value.operationId)));
    const participantCount = value.request.stakeholders.reduce(
      (total, group) => total + group.participantCount,
      0
    );
    const responseCount = value.request.stakeholders.reduce(
      (total, group) => total + group.participantCount * group.questions.length,
      0
    );
    must(
      equal(value.cohort, {
        expectedParticipants: participantCount,
        completedParticipants: participantCount,
        expectedResponses: responseCount,
        completedResponses: responseCount,
        complete: true,
      })
    );
    must(
      value.participants.reduce(
        (total, person) =>
          total +
          capabilityUtf8(
            person.biography +
              person.communicationStyle +
              person.motivations.join('') +
              person.painPoints.join('')
          ).length,
        0
      ) <= 64_000
    );
  }
);
export function buildSimulation(
  rawCandidate,
  {
    request: rawRequest,
    operationId: rawOperationId,
    acceptedScope: rawScope,
    admittedGrounding = [],
  }
) {
  const request = SimulationRequestV1Schema.parse(rawRequest),
    operationId = Uuid.parse(rawOperationId),
    acceptedScope = Ref.parse(rawScope);
  const grounding = validateSimulationGrounding(request, admittedGrounding),
    candidate = SimulationCandidateV1Schema.parse(rawCandidate);
  validateCandidate(candidate, request, operationId);
  const count = candidate.participants.length,
    responses = candidate.interviews.reduce(
      (total, interview) => total + interview.answers.length,
      0
    );
  return SimulationV1Schema.parse({
    schemaVersion: 'axwise.simulation.v1',
    methodVersion: SIMULATION_METHOD,
    origin: 'synthetic',
    operationId,
    acceptedScope,
    request,
    requestHash: canonicalHash(request),
    sourceArtifacts: request.grounding.sourceArtifacts,
    grounding: {
      status: grounding.length ? 'applied' : 'not_requested',
      selectedReferences: grounding.map(({ text: _text, ...reference }) => reference),
    },
    samplingReproducibility: 'sampling_only',
    participants: candidate.participants,
    corpus: buildCorpus(candidate, request, operationId),
    cohort: {
      expectedParticipants: count,
      completedParticipants: count,
      expectedResponses: responses,
      completedResponses: responses,
      complete: true,
    },
    limitations: simulationLimitations(request.grounding.mode),
  });
}
export function validateSimulation(
  rawValue,
  { request: rawRequest, operationId, acceptedScope, admittedGrounding = [] }
) {
  const value = SimulationV1Schema.parse(rawValue),
    request = SimulationRequestV1Schema.parse(rawRequest);
  must(
    value.operationId === Uuid.parse(operationId) &&
      equal(value.request, request) &&
      equal(value.acceptedScope, Ref.parse(acceptedScope))
  );
  const selected = validateSimulationGrounding(request, admittedGrounding).map(
    ({ text: _text, ...reference }) => reference
  );
  must(equal(value.grounding.selectedReferences, selected));
  return value;
}
