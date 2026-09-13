/**
 * Concilium criteria service: business logic for evaluation criteria.
 * Wraps conciliumCriteriaBackend with defaults and validation.
 */
import {
  loadCriteria,
  createCriterion,
  updateCriterionById,
  deleteCriterionById,
} from './conciliumCriteriaBackend';

export const DEFAULT_CRITERIA = [
  { name: 'Quality', weight: 0.3, rubric: 'Evaluate overall quality of the work product.' },
  { name: 'Completeness', weight: 0.25, rubric: 'Assess whether all requirements are addressed.' },
  { name: 'Accuracy', weight: 0.25, rubric: 'Check factual correctness and precision.' },
  {
    name: 'Actionability',
    weight: 0.2,
    rubric: 'Rate how actionable and practical the recommendations are.',
  },
];

export async function getAllCriteria(conciliumId) {
  return loadCriteria(conciliumId);
}

export async function addCriterion(conciliumId, criterionData) {
  const criterion = {
    conciliumId,
    name: criterionData.name || 'New Criterion',
    weight: criterionData.weight ?? 1.0,
    rubric: criterionData.rubric || '',
    examples: criterionData.examples || [],
    sortOrder: criterionData.sortOrder ?? 0,
  };
  return createCriterion(criterion);
}

export async function editCriterion(id, updates) {
  return updateCriterionById(id, updates);
}

export async function removeCriterion(id) {
  return deleteCriterionById(id);
}

export async function seedDefaultCriteria(conciliumId) {
  const results = [];
  for (let i = 0; i < DEFAULT_CRITERIA.length; i++) {
    const c = DEFAULT_CRITERIA[i];
    const created = await addCriterion(conciliumId, { ...c, sortOrder: i });
    results.push(created);
  }
  return results;
}
