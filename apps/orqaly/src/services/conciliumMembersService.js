/**
 * Concilium members service: business logic for member management.
 * Wraps conciliumMembersBackend with ID generation and validation.
 */
import {
  loadMembers,
  createMember,
  updateMemberById,
  deleteMemberById,
  quarantineMember,
  unquarantineMember,
} from './conciliumMembersBackend';
import { resolveLlmPair } from '../utils/llmPair';

export const MEMBER_ROLES = [
  { value: 'chairman', label: 'Chairman' },
  { value: 'evaluator', label: 'Evaluator' },
  { value: 'auditor', label: 'Auditor' },
  { value: 'specialist', label: 'Specialist' },
  { value: 'observer', label: 'Observer' },
];

export const MEMBER_PROVIDERS = [
  { value: 'groq', label: 'Groq' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'glm', label: 'GLM' },
  { value: 'gemini', label: 'Google Gemini' },
];

export const PROVIDER_MODELS = {
  groq: [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
    { value: 'gemma2-9b-it', label: 'Gemma 2 9B' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
  anthropic: [
    { value: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat' },
    { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  ],
  glm: [
    { value: 'glm-5.1', label: 'GLM-5.1' },
    { value: 'glm-4', label: 'GLM-4' },
    { value: 'glm-4-flash', label: 'GLM-4 Flash' },
  ],
  gemini: [
    { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { value: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
    { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
    { value: 'gemini-flash-latest', label: 'Gemini Flash (latest alias)' },
    { value: 'gemini-pro-latest', label: 'Gemini Pro (latest alias)' },
    { value: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite (latest alias)' },
    { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)' },
    { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite (preview)' },
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (preview)' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
  ],
};

const MEMBER_PROVIDER_IDS = MEMBER_PROVIDERS.map((provider) => provider.value);

export function resolveMemberLlmPair(input = {}) {
  return resolveLlmPair(input, { allowedProviders: MEMBER_PROVIDER_IDS });
}

export async function getAllMembers(conciliumId) {
  return loadMembers(conciliumId);
}

export async function addMember(conciliumId, memberData) {
  const llm = resolveMemberLlmPair(memberData);
  const member = {
    conciliumId,
    name: memberData.name || 'New Member',
    role: memberData.role || 'evaluator',
    provider: llm.provider,
    model: llm.model,
    resume: memberData.resume || '',
    skills: memberData.skills || [],
    comments: memberData.comments || [],
    temperature: memberData.temperature ?? 0.7,
    maxTokens: memberData.maxTokens ?? 4096,
    active: memberData.active !== false,
  };
  return createMember(member);
}

export async function editMember(id, updates) {
  return updateMemberById(id, updates);
}

export async function removeMember(id) {
  return deleteMemberById(id);
}

export { quarantineMember, unquarantineMember };
