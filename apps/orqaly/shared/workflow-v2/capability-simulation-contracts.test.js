// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalHash, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import {
  SimulationRequestV1Schema,
  SimulationV1Schema,
  buildSimulation,
  simulationPlan,
  validateSimulation,
  validateSimulationGrounding,
} from './capability-simulation-contracts.js';
import { extractSourceQuote } from './capability-source-contracts.js';

const vectors = JSON.parse(
  readFileSync(new URL('./fixtures/capability-simulation-vectors.json', import.meta.url), 'utf8')
);
const fresh = (name) =>
  structuredClone(vectors.cases.find((row) => row.name === (name ?? 'unicode_cohort')));
const bindings = (row) => ({
  request: row.request,
  operationId: row.operationId,
  acceptedScope: row.acceptedScope,
  admittedGrounding: row.grounding,
});

describe('Python-generated Simulation vectors', () => {
  for (const row of vectors.cases)
    it(row.name, () => {
      expect(SimulationRequestV1Schema.parse(row.request)).toEqual(row.request);
      expect(simulationPlan(row.request, { operationId: row.operationId })).toEqual(row.plan);
      expect(buildSimulation(row.candidate, bindings(row))).toEqual(row.artifact);
      expect(SimulationV1Schema.parse(row.artifact)).toEqual(row.artifact);
      expect(canonicalHash(row.artifact)).toBe(row.artifactCanonicalHash);
      expect(validateSimulation(row.artifact, bindings(row))).toEqual(row.artifact);
    });
  it('keeps exact generated UTF8 answer bytes, question IDs and synthetic speaker origin', () => {
    const row = fresh(),
      doc = row.artifact.corpus.documents[0],
      answer = doc.turns[1];
    const quote = extractSourceQuote(row.artifact.corpus, {
      documentId: doc.documentId,
      turnId: answer.turnId,
      participantId: answer.participantId,
      start: answer.start,
      end: answer.end,
    });
    expect(quote.text).toBe(row.candidate.interviews[0].answers[0].text);
    expect(quote.origin).toBe('synthetic_transcript');
    expect(quote.speakerRole).toBe('participant');
    expect(quote.text).toContain('\r\n');
    expect(quote.text).toContain('cafe\u0301');
  });
  it('binds participant IDs to operation while keeping illustrative sampling stable', () => {
    const row = fresh(),
      other = 'a3fc0fbe-c59b-41bc-b095-9a38df7b9c20';
    const changed = simulationPlan(row.request, { operationId: other });
    expect(changed.map((slot) => slot.oceanMicros)).toEqual(
      row.plan.map((slot) => slot.oceanMicros)
    );
    expect(changed.map((slot) => slot.participantId)).not.toEqual(
      row.plan.map((slot) => slot.participantId)
    );
    const changedSeed = structuredClone(row.request);
    changedSeed.sampling.seed++;
    expect(
      simulationPlan(changedSeed, { operationId: row.operationId }).map((slot) => slot.oceanMicros)
    ).not.toEqual(row.plan.map((slot) => slot.oceanMicros));
  });
});

describe('explicit bounded Simulation request', () => {
  it.each([
    [
      'implicit request',
      (value) => {
        value.requested = false;
      },
    ],
    [
      'numeric request',
      (value) => {
        value.requested = 1;
      },
    ],
    [
      'string request',
      (value) => {
        value.requested = 'true';
      },
    ],
    [
      'unknown field',
      (value) => {
        value.privateInstructions = 'not admitted';
      },
    ],
    [
      'extra group',
      (value) => {
        value.stakeholders = Array.from({ length: 5 }, (_, index) => ({
          ...value.stakeholders[0],
          stakeholderId: `group-${index}`,
        }));
      },
    ],
    [
      'duplicate group',
      (value) => {
        value.stakeholders[1].stakeholderId = value.stakeholders[0].stakeholderId;
      },
    ],
    [
      'four participants',
      (value) => {
        value.stakeholders[0].participantCount = 4;
      },
    ],
    [
      'coerced count',
      (value) => {
        value.stakeholders[0].participantCount = '2';
      },
    ],
    [
      'no questions',
      (value) => {
        value.stakeholders[0].questions = [];
      },
    ],
    [
      'duplicate question',
      (value) => {
        value.stakeholders[0].questions[1].questionId =
          value.stakeholders[0].questions[0].questionId;
      },
    ],
    [
      'locality without country',
      (value) => {
        value.stakeholders[0].countryCode = null;
      },
    ],
    [
      'noncanonical country',
      (value) => {
        value.stakeholders[0].countryCode = 'lv';
      },
    ],
    [
      'unsafe seed',
      (value) => {
        value.sampling.seed = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'fractional seed',
      (value) => {
        value.sampling.seed = 1.25;
      },
    ],
    [
      'unknown sampler',
      (value) => {
        value.sampling.profileVersion = 'demographic_population';
      },
    ],
    [
      'unbacked grounding',
      (value) => {
        value.grounding.mode = 'source_grounded';
      },
    ],
    [
      'blank Unicode label',
      (value) => {
        value.stakeholders[0].label = '\u0085';
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const row = fresh();
    mutate(row.request);
    expect(SimulationRequestV1Schema.safeParse(row.request).success).toBe(false);
  });
  it('accepts Unicode by codepoint and rejects aggregate semantic byte overflow', () => {
    const row = fresh();
    row.request.scenario.description = '🙂'.repeat(4000);
    expect(SimulationRequestV1Schema.safeParse(row.request).success).toBe(true);
    row.request.scenario.targetAudience = '🙂'.repeat(4000);
    row.request.scenario.problem = '🙂'.repeat(4000);
    row.request.stakeholders.forEach((group) => {
      group.description = '🙂'.repeat(4000);
    });
    expect(SimulationRequestV1Schema.safeParse(row.request).success).toBe(false);
  });
});

describe('complete cohort and authoritative request identity', () => {
  it.each([
    [
      'missing participant',
      (candidate) => {
        candidate.participants.pop();
      },
    ],
    [
      'duplicate participant',
      (candidate) => {
        candidate.participants[1] = structuredClone(candidate.participants[0]);
      },
    ],
    [
      'reordered participants',
      (candidate) => {
        candidate.participants.reverse();
      },
    ],
    [
      'missing interview',
      (candidate) => {
        candidate.interviews.pop();
      },
    ],
    [
      'missing answer',
      (candidate) => {
        candidate.interviews[0].answers.pop();
      },
    ],
    [
      'duplicate question answer',
      (candidate) => {
        candidate.interviews[0].answers[1].questionId =
          candidate.interviews[0].answers[0].questionId;
      },
    ],
    [
      'wrong participant market',
      (candidate) => {
        candidate.participants[0].countryCode = 'EE';
      },
    ],
    [
      'changed sampled profile',
      (candidate) => {
        candidate.participants[0].oceanMicros.openness++;
      },
    ],
    [
      'human origin label',
      (candidate) => {
        candidate.participants[0].origin = 'human';
      },
    ],
    [
      'empty assumptions',
      (candidate) => {
        candidate.participants[0].motivations = ['\u0085', 'Other fictional motivation'];
      },
    ],
    [
      'too short biography',
      (candidate) => {
        candidate.participants[0].biography = 'Short';
      },
    ],
    [
      'unbounded answer',
      (candidate) => {
        candidate.interviews[0].answers[0].text = 'a'.repeat(4001);
      },
    ],
  ])('rejects %s rather than publishing a repaired subset', (_name, mutate) => {
    const row = fresh();
    mutate(row.candidate);
    expect(() => buildSimulation(row.candidate, bindings(row))).toThrow();
  });
  it.each([
    [
      'wrong operation',
      (value) => {
        value.operationId = 'a3fc0fbe-c59b-41bc-b095-9a38df7b9c20';
      },
    ],
    [
      'upgraded corpus origin',
      (value) => {
        value.corpus.documents[0].origin = 'supplied_transcript';
      },
    ],
    [
      'wrong source speaker',
      (value) => {
        value.corpus.documents[0].participants[1].role = 'interviewer';
      },
    ],
    [
      'changed source question',
      (value) => {
        value.corpus.documents[0].turns[1].questionId = 'unrequested';
      },
    ],
    [
      'changed source turn',
      (value) => {
        value.corpus.documents[0].turns[1].turnId = 'unbound-turn';
      },
    ],
    [
      'extra corpus text',
      (value) => {
        const doc = value.corpus.documents[0];
        doc.text += 'unused text';
        doc.textSha256 = sha256Hex(doc.text);
      },
    ],
    [
      'wrong cohort coverage',
      (value) => {
        value.cohort.completedResponses--;
      },
    ],
    [
      'rewritten limitation',
      (value) => {
        value.limitations[0] = 'A real representative survey.';
      },
    ],
    [
      'reproducibility overclaim',
      (value) => {
        value.samplingReproducibility = 'all_text';
      },
    ],
    [
      'new source lineage',
      (value) => {
        value.sourceArtifacts = [
          {
            artifactId: value.acceptedScope.artifactId,
            artifactHash: 'c'.repeat(64),
            kind: 'research',
          },
        ];
      },
    ],
  ])('rejects %s in an otherwise typed artifact', (_name, mutate) => {
    const row = fresh();
    mutate(row.artifact);
    expect(SimulationV1Schema.safeParse(row.artifact).success).toBe(false);
  });
  it('rejects a valid artifact bound to a different caller scope or request', () => {
    const row = fresh();
    expect(() =>
      validateSimulation(row.artifact, {
        ...bindings(row),
        acceptedScope: { ...row.acceptedScope, artifactHash: 'c'.repeat(64) },
      })
    ).toThrow();
    const request = structuredClone(row.request);
    request.responseStyle = 'critical';
    expect(() => validateSimulation(row.artifact, { ...bindings(row), request })).toThrow();
  });
});

describe('selected source passage grounding', () => {
  it('retains exact selected text hashes but not source text in artifact metadata', () => {
    const row = fresh('selected_research_passage');
    const artifact = buildSimulation(row.candidate, bindings(row));
    expect(artifact.grounding.selectedReferences[0].textSha256).toBe(row.grounding[0].textSha256);
    expect(artifact.grounding.selectedReferences[0]).not.toHaveProperty('text');
  });
  it.each([
    [
      'missing passage',
      (passages) => {
        passages.pop();
      },
    ],
    [
      'duplicate passage',
      (passages) => {
        passages.push(structuredClone(passages[0]));
      },
    ],
    [
      'different selected artifact',
      (passages) => {
        passages[0].artifact.artifactHash = 'c'.repeat(64);
      },
    ],
    [
      'different text bytes',
      (passages) => {
        passages[0].text += ' changed';
      },
    ],
    [
      'coerced entry ID',
      (passages) => {
        passages[0].entryId = 1;
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const row = fresh('selected_research_passage');
    mutate(row.grounding);
    expect(() => validateSimulationGrounding(row.request, row.grounding)).toThrow();
  });
  it('rejects changed caller passage even if it is rehashed consistently', () => {
    const row = fresh('selected_research_passage');
    row.grounding[0].text += ' Changed fictional observation.';
    row.grounding[0].textSha256 = sha256Hex(row.grounding[0].text);
    expect(() => validateSimulation(row.artifact, bindings(row))).toThrow();
  });
  it('enforces total passage bytes and every selected source', () => {
    const row = fresh('selected_research_passage');
    const text = '🙂'.repeat(8000);
    const passages = [0, 1].map((index) => ({
      ...structuredClone(row.grounding[0]),
      entryId: String(index + 1).repeat(64),
      text,
      textSha256: sha256Hex(text),
    }));
    expect(() => validateSimulationGrounding(row.request, passages)).toThrow();
    const missing = {
      artifactId: 'b1000000-0000-4000-8000-000000000001',
      artifactHash: 'b'.repeat(64),
      kind: 'research',
    };
    row.request.grounding.sourceArtifacts.push(missing);
    expect(() => validateSimulationGrounding(row.request, row.grounding)).toThrow();
  });
});
