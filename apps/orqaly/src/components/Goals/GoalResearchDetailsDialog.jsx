import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Link,
  Paper,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import ManageSearchOutlinedIcon from '@mui/icons-material/ManageSearchOutlined';
import FormDialog from '../Common/FormDialog';
import {
  getGoalResearchBundle,
  hasTranscriptSpan,
  isExternallyVerifiedResearchSource,
  researchConfidencePercent,
} from './researchBundle';
import {
  cleanGeneratedDocumentText,
  cleanGeneratedPresentationText,
} from '../../utils/generatedPresentationText.js';

const TABS = [
  ['overview', 'Overview'],
  ['evidence', 'Evidence'],
  ['customer-personas', 'Customer personas'],
  ['interviews', 'Participants & interviews'],
  ['sources', 'Market sources'],
  ['executor-personas', 'Executor personas'],
  ['prd', 'Research PRD'],
  ['method', 'Method & confidence'],
];

function valueText(value, fallback = 'Not provided') {
  if (typeof value === 'string' && value.trim()) return cleanGeneratedPresentationText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value))
    return value
      .map((item) => valueText(item, ''))
      .filter(Boolean)
      .join(', ');
  if (value && typeof value === 'object') {
    const subject = valueText(value.subject, '');
    const predicate = valueText(value.predicate, '').replaceAll('_', ' ');
    const objectValue = valueText(value.object, '');
    if (subject && predicate && objectValue) return `${subject} — ${predicate}: ${objectValue}`;
    return valueText(
      value.claim ||
        value.finding ||
        value.insight ||
        value.summary ||
        value.description ||
        value.value ||
        value.name,
      fallback
    );
  }
  return fallback;
}

function detailText(value, fallback = '') {
  if (typeof value === 'string') return cleanGeneratedPresentationText(value) || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => detailText(item, ''))
      .filter(Boolean)
      .join('; ');
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([key, item]) => !key.startsWith('_') && item != null && item !== '')
      .map(([key, item]) => {
        const rendered = detailText(item, '');
        return rendered ? `${key.replaceAll('_', ' ')}: ${rendered}` : '';
      })
      .filter(Boolean);
    return entries.join(' · ') || fallback;
  }
  return fallback;
}

function evidenceIdentifiers(...values) {
  return [
    ...new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : value == null ? [] : [value]))
        .map((item) =>
          typeof item === 'object'
            ? valueText(
                item.source_id ||
                  item.provider_source_id ||
                  item.evidence_id ||
                  item.claim_id ||
                  item.document_id ||
                  item.interview_id ||
                  item.participant_id ||
                  item.artifact_id,
                ''
              )
            : valueText(item, '')
        )
        .filter(Boolean)
    ),
  ];
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function authorityStatusColor(value) {
  const status = String(value || '')
    .trim()
    .toLowerCase();
  if (/(?:failed|rejected|conflict|invalid|blocked)/.test(status)) {
    return 'error';
  }
  if (/(?:pending|unverified|redirect|unknown|stale|partial)/.test(status)) return 'warning';
  if (
    /(?:verified|validated|confirmed|authoritative|official|publisher_domain|direct_domain|recognized_public_root|independently_attested|registry|passed|complete)/.test(
      status
    )
  ) {
    return 'success';
  }
  return 'default';
}

function criticalClaimCountLabel(value) {
  const verified = value?.verified_count ?? value?.validated_count;
  const total = value?.total_count ?? value?.total;
  if (
    verified == null ||
    total == null ||
    !Number.isFinite(Number(verified)) ||
    !Number.isFinite(Number(total))
  ) {
    return 'Verified: not reported';
  }
  return `Verified: ${Number(verified)}/${Number(total)}`;
}

function Empty({ children }) {
  return (
    <Typography color="text.secondary" variant="body2" sx={{ py: 2 }}>
      {children}
    </Typography>
  );
}

function Metric({ label, value }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25, minWidth: 108 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
        {value}
      </Typography>
    </Paper>
  );
}

function ListCard({ item, children }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>
        {item.name}
      </Typography>
      {item.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
          {item.description}
        </Typography>
      )}
      {children}
    </Paper>
  );
}

function PersonaDetail({ label, value }) {
  const rendered = detailText(value);
  if (!rendered) return null;
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
        {rendered}
      </Typography>
    </Box>
  );
}

function TabPanel({ active, tabId, children }) {
  return (
    <Box
      role="tabpanel"
      hidden={!active}
      id={`research-tabpanel-${tabId}`}
      aria-labelledby={`research-tab-${tabId}`}
      tabIndex={active ? 0 : -1}
      sx={{ pt: 2, outline: 'none' }}
    >
      {active ? children : null}
    </Box>
  );
}

function Overview({ research }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {research.contextGate.status === 'blocked' && (
        <Alert severity="error">
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            Gate 1 is blocked by the research quality contract
          </Typography>
          {(research.contextGate.issues || []).map((issue) => (
            <Typography key={issue.code || issue.message} variant="body2" sx={{ mt: 0.5 }}>
              • {valueText(issue.message, 'Research quality requirement was not satisfied.')}
            </Typography>
          ))}
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Metric
          label={research.stageLabel}
          value={`${research.completedStages ?? '—'}/${research.stages.length || '—'}`}
        />
        <Metric label="Sources" value={research.counts.sources ?? '—'} />
        <Metric label="Participants" value={research.counts.participants ?? '—'} />
        <Metric label="Interviews" value={research.counts.interviews ?? '—'} />
        <Metric label="Customer personas" value={research.counts.customerPersonas ?? '—'} />
        <Metric label="Executor personas" value={research.counts.executorPersonas ?? '—'} />
        <Metric
          label="Confidence"
          value={research.confidence == null ? 'Not reported' : `${research.confidence}%`}
        />
      </Box>

      {Object.keys(research.criticalClaims).length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>
            Critical-claim validation
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
            <Chip
              size="small"
              color={research.criticalClaims.status === 'passed' ? 'success' : 'error'}
              label={`Status: ${valueText(research.criticalClaims.status, 'missing')}`}
            />
            <Chip
              size="small"
              variant="outlined"
              label={criticalClaimCountLabel(research.criticalClaims)}
            />
            {Number(research.criticalClaims.conflict_count || 0) > 0 && (
              <Chip
                size="small"
                color="error"
                label={`${research.criticalClaims.conflict_count} conflicts`}
              />
            )}
            {Number(research.criticalClaims.stale_count || 0) > 0 && (
              <Chip
                size="small"
                color="warning"
                label={`${research.criticalClaims.stale_count} stale`}
              />
            )}
          </Box>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1 }}>
          AxWise research run
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          <Chip size="small" label={`Status: ${research.status}`} />
          {research.mode && (
            <Chip size="small" variant="outlined" label={`Mode: ${research.mode}`} />
          )}
          {research.performanceProfile && (
            <Chip
              size="small"
              variant="outlined"
              label={`Profile: ${research.performanceProfile}`}
            />
          )}
          {Number(research.performance?.elapsed_ms) > 0 && (
            <Chip
              size="small"
              variant="outlined"
              label={`Elapsed: ${Math.max(1, Math.round(Number(research.performance.elapsed_ms) / 60000))}m`}
            />
          )}
          {research.runId && (
            <Chip size="small" variant="outlined" label={`Run: ${research.runId}`} />
          )}
          {research.bundleId && (
            <Chip size="small" variant="outlined" label={`Bundle: ${research.bundleId}`} />
          )}
          {research.schemaVersion && (
            <Chip size="small" variant="outlined" label={`Contract: ${research.schemaVersion}`} />
          )}
        </Box>
      </Paper>

      {research.marketScope?.resolved_scope?.countries?.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>
            Resolved market scope
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Versioned country snapshot used by AxWise; comparison evidence cannot replace a missing
            country cell.
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
            {research.marketScope.resolved_scope.countries.map((market) => {
              const coverage = research.cellCoverage.find((cell) =>
                (cell.country_codes || []).includes(market.country_code)
              );
              return (
                <Chip
                  key={market.country_code}
                  size="small"
                  color={
                    ['complete', 'completed'].includes(coverage?.status) ? 'success' : 'warning'
                  }
                  variant="outlined"
                  label={`${market.country_name}${market.priority === 'primary' ? ' · priority' : ''} · ${coverage?.source_count ?? '—'} sources${coverage?.authoritative_source_count != null ? ` · ${coverage.authoritative_source_count} authoritative` : ''}`}
                />
              );
            })}
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
            <Chip
              size="small"
              variant="outlined"
              label={`Coverage: ${research.marketScope.resolved_scope.coverage_mode || 'weighted'}`}
            />
            {research.marketScope.resolution_hash && (
              <Chip
                size="small"
                variant="outlined"
                label={`Scope: ${research.marketScope.resolution_hash.slice(0, 10)}…`}
              />
            )}
          </Box>
        </Paper>
      )}

      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1 }}>
          {research.stageLabel}
        </Typography>
        {research.stages.length ? (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
              gap: 1,
            }}
          >
            {research.stages.map((stage) => (
              <Paper key={stage.id} variant="outlined" sx={{ p: 1.25 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {stage.name}
                  </Typography>
                  <Chip size="small" label={stage.status} />
                </Box>
                {stage.count != null && (
                  <Typography variant="caption" color="text.secondary">
                    {stage.count} item{stage.count === 1 ? '' : 's'}
                  </Typography>
                )}
              </Paper>
            ))}
          </Box>
        ) : (
          <Empty>No stage telemetry is available for this research run.</Empty>
        )}
      </Box>

      {(research.selectedPersonaIds.length > 0 ||
        Object.keys(research.personaSelection).length > 0) && (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>
            Persona selection
          </Typography>
          {research.selectedPersonaIds.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
              {research.selectedPersonaIds.map((personaId) => {
                const persona = [...research.customerPersonas, ...research.executorPersonas].find(
                  (item) => String(item.id) === String(personaId)
                );
                return (
                  <Chip
                    key={personaId}
                    size="small"
                    color="success"
                    label={persona?.name || personaId}
                  />
                );
              })}
            </Box>
          )}
          {valueText(
            research.personaSelection.rationale ||
              research.personaSelection.reason ||
              research.personaSelection.method,
            ''
          ) && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {valueText(
                research.personaSelection.rationale ||
                  research.personaSelection.reason ||
                  research.personaSelection.method
              )}
            </Typography>
          )}
        </Paper>
      )}

      {(research.marketClaims.length > 0 || research.patterns.length > 0) && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>
              Market claims
            </Typography>
            {research.marketClaims.length ? (
              research.marketClaims.map((item, index) => {
                const criticalRows = Array.isArray(research.criticalClaims.claims)
                  ? research.criticalClaims.claims
                  : Array.isArray(research.criticalClaims.items)
                    ? research.criticalClaims.items
                    : [];
                const critical = criticalRows.find(
                  (row) => String(row?.claim_id || row?.id) === String(item?.claim_id || item?.id)
                );
                const sourceIds = evidenceIdentifiers(
                  critical?.source_ids,
                  critical?.evidence_refs,
                  item?.source_ids,
                  item?.evidence_refs,
                  item?.evidence,
                  item?.citation_metadata?.source_ids
                );
                const spanStart = item?.citation_metadata?.segment_start;
                const spanEnd = item?.citation_metadata?.segment_end;
                const hasExactSpan = Number.isInteger(spanStart) && Number.isInteger(spanEnd);
                const spanUnit =
                  item?.citation_metadata?.offset_unit === 'utf8_bytes'
                    ? 'UTF-8 bytes'
                    : 'characters';
                const partIndex = item?.citation_metadata?.part_index;
                const provenanceArtifact =
                  item?.provenance_artifact && typeof item.provenance_artifact === 'object'
                    ? item.provenance_artifact
                    : {};
                const claimBinding =
                  provenanceArtifact.claim_binding &&
                  typeof provenanceArtifact.claim_binding === 'object'
                    ? provenanceArtifact.claim_binding
                    : {};
                const evidenceHash = String(
                  provenanceArtifact.sha256 || item?.provider_response_hash || ''
                );
                const claimProofSignature = String(claimBinding.claim_proof_signature || '');
                const directAuthorityBound =
                  item?.citation_metadata?.span_target === 'direct_authority_document' &&
                  provenanceArtifact.artifact_type === 'direct_authority_document' &&
                  /^[a-f0-9]{64}$/i.test(claimProofSignature);
                return (
                  <Box key={item?.claim_id || index} sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      • {valueText(item, 'Claim details unavailable')}
                    </Typography>
                    {(sourceIds.length > 0 || item?.verification_status || item?.status) && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
                        {sourceIds.length > 0
                          ? `Evidence: ${sourceIds.join(', ')}`
                          : 'Evidence IDs not reported'}
                        {item.verification_status || item.status
                          ? ` · ${valueText(item.verification_status || item.status)}`
                          : ''}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', ml: 1.5, mt: 0.5 }}>
                      {critical?.status && (
                        <Chip
                          size="small"
                          color={authorityStatusColor(critical.status)}
                          variant="outlined"
                          label={`Critical check: ${valueText(critical.status).replaceAll('_', ' ')}`}
                        />
                      )}
                      {critical?.evidence_class && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Class: ${valueText(critical.evidence_class).replaceAll('_', ' ')}`}
                        />
                      )}
                      {hasExactSpan && (
                        <Chip
                          size="small"
                          color="success"
                          variant="outlined"
                          label={`Exact span: ${spanStart}–${spanEnd} ${spanUnit}${Number.isInteger(partIndex) ? ` · part ${partIndex + 1}` : ''}`}
                        />
                      )}
                      {directAuthorityBound && (
                        <Chip
                          size="small"
                          color="success"
                          variant="outlined"
                          label={`Direct authority proof: ${claimProofSignature.slice(0, 12)}…`}
                        />
                      )}
                      {evidenceHash.match(/^[a-f0-9]{64}$/i) && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Evidence hash: ${evidenceHash.slice(0, 12)}…`}
                        />
                      )}
                    </Box>
                  </Box>
                );
              })
            ) : (
              <Empty>None reported.</Empty>
            )}
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>
              Observed patterns
            </Typography>
            {research.patterns.length ? (
              research.patterns.map((item, index) => (
                <Typography key={index} variant="body2" sx={{ mt: 0.75 }}>
                  • {valueText(item)}
                </Typography>
              ))
            ) : (
              <Empty>None reported.</Empty>
            )}
          </Paper>
        </Box>
      )}

      {(research.contradictions.length > 0 || research.limitations.length > 0) && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>
              Contradictions
            </Typography>
            {research.contradictions.length ? (
              research.contradictions.map((item, index) => (
                <Typography key={index} variant="body2" sx={{ mt: 0.75 }}>
                  • {valueText(item)}
                </Typography>
              ))
            ) : (
              <Empty>None reported.</Empty>
            )}
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>
              Limitations
            </Typography>
            {research.limitations.length ? (
              research.limitations.map((item, index) => (
                <Typography key={index} variant="body2" sx={{ mt: 0.75 }}>
                  • {valueText(item)}
                </Typography>
              ))
            ) : (
              <Empty>None reported.</Empty>
            )}
          </Paper>
        </Box>
      )}
    </Box>
  );
}

const UNSUPPORTED_EVIDENCE_LABELS = Object.freeze({
  subscription_plan: 'Subscription plan',
  usage_tariff: 'Usage tariff',
  project_service_quote: 'Project service quote',
  subscription_rate_difference: 'Subscription rate difference',
  usage_tariff_rate_difference: 'Usage tariff rate difference',
  project_quote_rate_difference: 'Project quote rate difference',
});

function typedStatusLabel(value, fallback = 'Not reported') {
  return typeof value === 'string' && value ? value.replaceAll('_', ' ') : fallback;
}

function moneyLabel(value) {
  if (!value?.amount || !value?.currency) return 'Not reported';
  return `${value.amount} ${value.currency}${value.taxBasis ? ` · tax ${value.taxBasis}` : ''}`;
}

function basisLabel(value) {
  if (!value?.quantity || !value?.unit) return 'Not reported';
  return `${value.quantity} ${value.unit}`;
}

function EvidenceField({ label, children }) {
  return (
    <Box>
      <Typography
        component="dt"
        variant="caption"
        color="text.secondary"
        sx={{ textTransform: 'uppercase' }}
      >
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
        {children || 'Not reported'}
      </Typography>
    </Box>
  );
}

function evidenceSourceForId(research, sourceId) {
  return research.marketSources.find(
    (source) =>
      String(source.id || '') === sourceId ||
      String(source.external_source_id || '') === sourceId ||
      String(source.source_id || '') === sourceId
  );
}

function EvidenceSources({ fact, research }) {
  if (!fact.sourceIds.length) {
    return <Empty>No source IDs were supplied for this typed fact.</Empty>;
  }
  return (
    <Box sx={{ mt: 1.25 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
        Sources
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
        {fact.sourceIds.map((sourceId) => {
          const source = evidenceSourceForId(research, sourceId);
          const url = safeUrl(source?.url || source?.source_url);
          return (
            <Box key={sourceId} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <Chip size="small" variant="outlined" label={`Source ID: ${sourceId}`} />
              {url && (
                <Link
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open source ${sourceId}`}
                >
                  Open source
                </Link>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function PhysicalOfferFact({ fact, research }) {
  const payload = fact.payload || {};
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            {payload.productName || 'Physical product offer'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Verified typed offer; values are shown exactly as imported.
          </Typography>
        </Box>
        <Chip
          size="small"
          color={
            fact.verificationStatus === 'verified_current_authoritative' ? 'success' : 'warning'
          }
          label={typedStatusLabel(fact.verificationStatus)}
        />
      </Box>
      <Box
        component="dl"
        sx={{
          m: 0,
          mt: 1.25,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          gap: 1.25,
        }}
      >
        <EvidenceField label="Merchant / provider">
          {payload.merchant || payload.merchantDomain}
        </EvidenceField>
        <EvidenceField label="Product">{payload.productName}</EvidenceField>
        <EvidenceField label="Pack">{basisLabel(payload.pack)}</EvidenceField>
        <EvidenceField label="Exact price">{moneyLabel(payload.price)}</EvidenceField>
        {payload.brand && <EvidenceField label="Brand">{payload.brand}</EvidenceField>}
        {payload.sku && <EvidenceField label="SKU">{payload.sku}</EvidenceField>}
        <EvidenceField label="Offer basis">{basisLabel(payload.basis)}</EvidenceField>
        <EvidenceField label="Countries">
          {fact.countryCodes.length ? fact.countryCodes.join(', ') : null}
        </EvidenceField>
        <EvidenceField label="Observed date">{fact.observedAt}</EvidenceField>
      </Box>
      <EvidenceSources fact={fact} research={research} />
    </Paper>
  );
}

function UnsupportedTypedEvidence({ kind, recordType }) {
  return (
    <Alert severity="info">
      <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>
        {UNSUPPORTED_EVIDENCE_LABELS[kind] || 'Unsupported typed evidence'}
      </Typography>
      <Typography variant="body2">
        A typed {recordType} is stored, but its model-specific human-review view is not enabled in
        this rollout. The raw provider payload is intentionally hidden.
      </Typography>
    </Alert>
  );
}

function PhysicalCalculationInput({ label, fact }) {
  if (!fact?.reviewSupported || !fact.payload) {
    return (
      <Paper variant="outlined" sx={{ p: 1.25 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>
          {label} input
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          The referenced persisted physical-offer fact is unavailable. No value was inferred.
        </Typography>
      </Paper>
    );
  }
  return (
    <Paper variant="outlined" sx={{ p: 1.25 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1 }}>
        {label} input
      </Typography>
      <Box
        component="dl"
        sx={{
          m: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
          gap: 1,
        }}
      >
        <EvidenceField label="Product">{fact.payload.productName}</EvidenceField>
        <EvidenceField label="Pack">{basisLabel(fact.payload.pack)}</EvidenceField>
        <EvidenceField label="Exact price">{moneyLabel(fact.payload.price)}</EvidenceField>
      </Box>
    </Paper>
  );
}

function PhysicalPriceDifference({ calculation, factsById }) {
  const higher = factsById.get(calculation.inputFactIds.higher);
  const lower = factsById.get(calculation.inputFactIds.lower);
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            Observed pack-total price difference
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Imported validated result; Orqaly does not recompute or infer this value.
          </Typography>
        </Box>
        <Chip
          size="small"
          color={
            calculation.verificationStatus === 'verified_traceable_calculation'
              ? 'success'
              : 'warning'
          }
          label={typedStatusLabel(calculation.verificationStatus)}
        />
      </Box>
      <Box sx={{ display: 'grid', gap: 1, mt: 1.25 }}>
        <PhysicalCalculationInput label="Higher" fact={higher} />
        <PhysicalCalculationInput label="Lower" fact={lower} />
      </Box>
      <Box
        component="dl"
        sx={{
          m: 0,
          mt: 1.25,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
          gap: 1,
        }}
      >
        <EvidenceField label="Exact result">{moneyLabel(calculation.result)}</EvidenceField>
        <EvidenceField label="Target basis">{basisLabel(calculation.targetBasis)}</EvidenceField>
        <EvidenceField label="Countries">
          {calculation.countryCodes.length ? calculation.countryCodes.join(', ') : null}
        </EvidenceField>
      </Box>
    </Paper>
  );
}

function Evidence({ research }) {
  if (!research.typedEvidence) {
    return (
      <Alert severity="info">
        This run does not use the typed AxWise v2 evidence contract. No approval evidence is
        inferred from its raw research bundle.
      </Alert>
    );
  }

  const factsById = new Map(research.facts.map((fact) => [fact.id, fact]));
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Metric label="Facts" value={research.counts.facts} />
        <Metric label="Calculations" value={research.counts.calculations} />
      </Box>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>
          Evidence profile
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
          <Chip size="small" label={`Research status: ${research.status}`} />
          <Chip
            size="small"
            color={research.evidenceContract.status === 'passed' ? 'success' : 'warning'}
            label={`Evidence status: ${typedStatusLabel(research.evidenceContract.status)}`}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`Profile: ${research.evidenceProfile.version || 'Not reported'}`}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`Economic model: ${typedStatusLabel(research.evidenceProfile.economicModel)}`}
          />
          {research.evidenceProfile.intent && (
            <Chip
              size="small"
              variant="outlined"
              label={`Intent: ${typedStatusLabel(research.evidenceProfile.intent)}`}
            />
          )}
        </Box>
      </Paper>

      {!research.typedEvidenceDetailsLoaded ? (
        <Alert severity="warning">
          Persisted typed facts and calculations have not been loaded. Raw bundle fallback is
          disabled, so these records cannot be reviewed or approved from this screen yet.
        </Alert>
      ) : (
        <>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1 }}>
              Verified facts ({research.facts.length})
            </Typography>
            {research.facts.length ? (
              <Box sx={{ display: 'grid', gap: 1.25 }}>
                {research.facts.map((fact) =>
                  fact.reviewSupported ? (
                    <PhysicalOfferFact key={fact.id} fact={fact} research={research} />
                  ) : (
                    <UnsupportedTypedEvidence key={fact.id} kind={fact.kind} recordType="fact" />
                  )
                )}
              </Box>
            ) : (
              <Empty>No persisted typed facts are attached to this current run.</Empty>
            )}
          </Box>
          <Divider />
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1 }}>
              Verified calculations ({research.calculations.length})
            </Typography>
            {research.calculations.length ? (
              <Box sx={{ display: 'grid', gap: 1.25 }}>
                {research.calculations.map((calculation) =>
                  calculation.reviewSupported ? (
                    <PhysicalPriceDifference
                      key={calculation.id}
                      calculation={calculation}
                      factsById={factsById}
                    />
                  ) : (
                    <UnsupportedTypedEvidence
                      key={calculation.id}
                      kind={calculation.kind}
                      recordType="calculation"
                    />
                  )
                )}
              </Box>
            ) : (
              <Empty>No persisted typed calculations are attached to this current run.</Empty>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}

function Personas({ items, selectedIds, emptyLabel, executor = false, assignments = [] }) {
  if (!items.length) return <Empty>{emptyLabel}</Empty>;
  return (
    <Box sx={{ display: 'grid', gap: 1.25 }}>
      {items.map((item) => {
        const selected = selectedIds.includes(String(item.id)) || item.selected === true;
        const profile = item.profile || item.persona || {};
        const confidence = researchConfidencePercent(item.confidence ?? profile.confidence);
        const evidenceRefs = evidenceIdentifiers(
          item.evidence_refs,
          item.source_ids,
          item.evidence,
          profile.evidence_refs,
          profile.source_ids,
          profile.evidence,
          profile.research_context?.source_ids,
          profile.research_context?.claim_refs
        );
        const evidenceItems = [
          ...(Array.isArray(item.evidence) ? item.evidence : []),
          ...(Array.isArray(profile.evidence) ? profile.evidence : []),
        ].slice(0, 5);
        const personaAssignments = assignments.filter(
          (assignment) =>
            String(
              assignment.persona_id ||
                assignment.external_persona_id ||
                assignment.research_persona_id ||
                ''
            ) === String(item.id)
        );
        return (
          <ListCard key={item.id} item={item}>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
              {selected && <Chip size="small" color="success" label="Selected for this goal" />}
              {confidence != null && (
                <Chip size="small" variant="outlined" label={`Confidence ${confidence}%`} />
              )}
              {!executor && (item.decision_role || profile.decision_role) && (
                <Chip
                  size="small"
                  color={
                    item.buyer_role === true || profile.buyer_role === true ? 'success' : 'warning'
                  }
                  variant="outlined"
                  label={`Customer role: ${valueText(
                    item.decision_role || profile.decision_role
                  ).replaceAll('_', ' ')}`}
                />
              )}
              {!executor && (item.selection_eligibility || profile.selection_eligibility) && (
                <Chip
                  size="small"
                  color={
                    (item.selection_eligibility || profile.selection_eligibility) ===
                    'eligible_primary'
                      ? 'success'
                      : 'warning'
                  }
                  variant="outlined"
                  label={`Eligibility: ${valueText(
                    item.selection_eligibility || profile.selection_eligibility
                  ).replaceAll('_', ' ')}`}
                />
              )}
              {evidenceRefs.map((identifier) => (
                <Chip
                  key={`persona-evidence-${identifier}`}
                  size="small"
                  variant="outlined"
                  label={`Evidence: ${identifier}`}
                />
              ))}
              {executor && item.role && item.role !== item.name && (
                <Chip size="small" variant="outlined" label={item.role} />
              )}
              {personaAssignments.map((assignment) => (
                <Chip
                  key={assignment.id || assignment.agent_id}
                  size="small"
                  color="primary"
                  variant="outlined"
                  label={`Agent: ${assignment.agent_name || assignment.agent_id || 'assigned'}`}
                />
              ))}
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                gap: 1.25,
                mt: 1.25,
              }}
            >
              {executor ? (
                <>
                  <PersonaDetail label="Mission" value={profile.mission || item.mission} />
                  <PersonaDetail
                    label="Relevant experience"
                    value={profile.relevant_experience || item.relevant_experience}
                  />
                  <PersonaDetail
                    label="Domain knowledge"
                    value={profile.domain_knowledge || item.domain_knowledge}
                  />
                  <PersonaDetail
                    label="Capabilities"
                    value={
                      profile.capabilities ||
                      item.capabilities ||
                      profile.required_capabilities ||
                      item.required_capabilities
                    }
                  />
                  <PersonaDetail label="Methods" value={profile.methods || item.methods} />
                  <PersonaDetail
                    label="Expected outputs"
                    value={
                      profile.output_contract?.expected_outputs ||
                      item.output_contract?.expected_outputs ||
                      profile.scope?.success_criteria ||
                      item.scope?.success_criteria
                    }
                  />
                  <PersonaDetail
                    label="Communication style"
                    value={profile.communication_style || item.communication_style}
                  />
                  <PersonaDetail
                    label="Boundaries & limitations"
                    value={
                      profile.boundaries ||
                      item.boundaries ||
                      profile.limitations ||
                      item.limitations
                    }
                  />
                </>
              ) : (
                <>
                  <PersonaDetail label="Background" value={profile.background || item.background} />
                  <PersonaDetail
                    label="Demographics"
                    value={
                      profile.demographic_details ||
                      item.demographic_details ||
                      profile.demographics ||
                      item.demographics
                    }
                  />
                  <PersonaDetail
                    label="Pain points"
                    value={profile.pain_points || item.pain_points || profile.pains || item.pains}
                  />
                  <PersonaDetail
                    label="Goals & motivations"
                    value={
                      profile.goals_and_motivations ||
                      item.goals_and_motivations ||
                      profile.goals ||
                      item.goals ||
                      profile.motivations ||
                      item.motivations
                    }
                  />
                  <PersonaDetail
                    label="Triggers"
                    value={
                      profile.triggers ||
                      item.triggers ||
                      profile.buying_triggers ||
                      item.buying_triggers
                    }
                  />
                  <PersonaDetail
                    label="Communication style"
                    value={profile.communication_style || item.communication_style}
                  />
                  <PersonaDetail
                    label="Limitations"
                    value={profile.limitations || item.limitations}
                  />
                  <PersonaDetail label="Evidence excerpts" value={evidenceItems} />
                </>
              )}
            </Box>
          </ListCard>
        );
      })}
    </Box>
  );
}

function Interviews({ research }) {
  if (!research.participants.length && !research.interviews.length) {
    return <Empty>No participant or interview records were imported for this run.</Empty>;
  }
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1 }}>
          Participants ({research.counts.participants})
        </Typography>
        {research.participants.length ? (
          <Box sx={{ display: 'grid', gap: 1 }}>
            {research.participants.map((item) => (
              <ListCard key={item.id} item={item} />
            ))}
          </Box>
        ) : (
          <Empty>
            Only the participant count was supplied; participant details are unavailable.
          </Empty>
        )}
      </Box>
      <Divider />
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1 }}>
          Interviews ({research.counts.interviews})
        </Typography>
        {research.interviews.length ? (
          <Box sx={{ display: 'grid', gap: 1 }}>
            {research.interviews.map((item) => (
              <ListCard key={item.id} item={item} />
            ))}
          </Box>
        ) : (
          <Empty>Only the interview count was supplied; interview details are unavailable.</Empty>
        )}
      </Box>
    </Box>
  );
}

function Sources({ research }) {
  if (!research.marketSources.length) {
    return <Empty>No market-source details were imported for this run.</Empty>;
  }
  return (
    <Box sx={{ display: 'grid', gap: 1.25 }}>
      <Alert severity="info">
        “Transcript span checked” confirms quote-to-transcript integrity only. It does not mean an
        external source independently verified the claim.
      </Alert>
      {research.marketSources.map((item) => {
        const url = safeUrl(item.url || item.source_url);
        const externallyVerified = isExternallyVerifiedResearchSource(item);
        const sourceType = valueText(item.source_type, '');
        const sourceAuthority = valueText(item.source_authority, '');
        const authorityCheck = valueText(item.authority_verification_status, '');
        const jurisdiction = detailText(item.jurisdiction || item.country_codes);
        const publishedAt = valueText(item.published_at, '');
        const authorityProof = item.authority_proof || {};
        const authorityProofSignature = valueText(
          authorityProof.proof_signature || item.authority_proof_signature,
          ''
        );
        return (
          <ListCard key={item.id} item={item}>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
              {externallyVerified && (
                <Chip size="small" color="success" label="Externally verified" />
              )}
              {hasTranscriptSpan(item) && (
                <Chip size="small" variant="outlined" label="Transcript span checked" />
              )}
              {sourceType && <Chip size="small" variant="outlined" label={sourceType} />}
              {(item.provider || item.source_provider) && (
                <Chip
                  size="small"
                  color="primary"
                  variant="outlined"
                  label={`Provider: ${valueText(item.provider || item.source_provider)}`}
                />
              )}
              {evidenceIdentifiers(item.provider_source_id, item.source_id).map((identifier) => (
                <Chip
                  key={`source-${identifier}`}
                  size="small"
                  variant="outlined"
                  label={`Source ID: ${identifier}`}
                />
              ))}
              {evidenceIdentifiers(
                item.provider_query_ids,
                item.provider_query_id,
                item.query_ids,
                item.query_id,
                item.citation_metadata?.query_ids,
                item.citation_metadata?.query_id
              ).map((identifier) => (
                <Chip
                  key={`query-${identifier}`}
                  size="small"
                  variant="outlined"
                  label={`Query ID: ${identifier}`}
                />
              ))}
              {sourceAuthority && (
                <Chip
                  size="small"
                  color={authorityStatusColor(sourceAuthority)}
                  variant="outlined"
                  label={`Authority: ${sourceAuthority}`}
                />
              )}
              {authorityCheck && (
                <Chip
                  size="small"
                  color={authorityStatusColor(authorityCheck)}
                  variant="outlined"
                  label={`Authority check: ${authorityCheck}`}
                />
              )}
              {authorityProof.proof_type && (
                <Chip
                  size="small"
                  color="success"
                  variant="outlined"
                  label={`Authority proof: ${valueText(authorityProof.proof_type).replaceAll('_', ' ')}`}
                />
              )}
              {authorityProofSignature.match(/^[a-f0-9]{64}$/i) && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Authority signature: ${authorityProofSignature.slice(0, 12)}…`}
                />
              )}
              {jurisdiction && (
                <Chip size="small" variant="outlined" label={`Jurisdiction: ${jurisdiction}`} />
              )}
              {publishedAt && (
                <Chip size="small" variant="outlined" label={`Published ${publishedAt}`} />
              )}
              {(item.effective_date || item.retrieved_at) && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${item.effective_date ? `Effective ${valueText(item.effective_date)}` : ''}${item.effective_date && item.retrieved_at ? ' · ' : ''}${item.retrieved_at ? `Retrieved ${valueText(item.retrieved_at)}` : ''}`}
                />
              )}
            </Box>
            {detailText(item.citation_metadata) && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Citation: {detailText(item.citation_metadata)}
              </Typography>
            )}
            {url && (
              <Link
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ display: 'inline-block', mt: 1 }}
              >
                Open source
              </Link>
            )}
          </ListCard>
        );
      })}
    </Box>
  );
}

function prdLabel(value) {
  return cleanGeneratedPresentationText(String(value || '').replaceAll('_', ' '));
}

function hasPrdValue(value) {
  if (value == null) return false;
  if (typeof value === 'string') return Boolean(cleanGeneratedDocumentText(value));
  if (Array.isArray(value)) return value.some(hasPrdValue);
  if (typeof value === 'object') {
    return Object.entries(value).some(([key, item]) => !key.startsWith('_') && hasPrdValue(item));
  }
  return true;
}

function PrdText({ value }) {
  const document = cleanGeneratedDocumentText(String(value ?? ''));
  if (!document) return null;
  return document
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph, index) => (
      <Typography
        key={`${paragraph.slice(0, 40)}-${index}`}
        variant="body2"
        sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}
      >
        {paragraph}
      </Typography>
    ));
}

function StructuredPrdValue({ value, depth = 0 }) {
  if (!hasPrdValue(value)) return null;
  if (typeof value !== 'object') return <PrdText value={value} />;

  if (Array.isArray(value)) {
    const items = value.filter(hasPrdValue);
    return (
      <Box component="ul" sx={{ my: 0.5, pl: 2.5, display: 'grid', gap: 0.5 }}>
        {items.map((item, index) => (
          <Box component="li" key={index} sx={{ pl: 0.25 }}>
            <StructuredPrdValue value={item} depth={Math.min(depth + 1, 4)} />
          </Box>
        ))}
      </Box>
    );
  }

  if (depth >= 4) return <PrdText value={detailText(value)} />;
  return (
    <Box sx={{ display: 'grid', gap: depth > 1 ? 0.75 : 1, mt: 0.5 }}>
      {Object.entries(value)
        .filter(([key, item]) => !key.startsWith('_') && hasPrdValue(item))
        .map(([key, item]) => (
          <Box key={key}>
            <Typography
              component={depth <= 1 ? 'h4' : 'h5'}
              variant={depth <= 1 ? 'subtitle2' : 'body2'}
              sx={{ fontWeight: 750, color: depth <= 1 ? 'text.primary' : 'text.secondary' }}
            >
              {prdLabel(key)}
            </Typography>
            <StructuredPrdValue value={item} depth={depth + 1} />
          </Box>
        ))}
    </Box>
  );
}

function ResearchPrd({ research }) {
  const prd = research.researchPrd;
  if (!prd) return <Empty>No Research PRD artifact was imported for this run.</Empty>;
  if (typeof prd === 'string') {
    const document = cleanGeneratedDocumentText(prd);
    return (
      <Box sx={{ display: 'grid', gap: 1 }}>
        {document
          .split(/\n{2,}/)
          .filter(Boolean)
          .map((paragraph, index) => (
            <Typography
              key={index}
              variant="body2"
              sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}
            >
              {paragraph}
            </Typography>
          ))}
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'grid', gap: 1.25 }}>
      {Object.entries(prd)
        .filter(([key, value]) => !key.startsWith('_') && hasPrdValue(value))
        .map(([key, value]) => (
          <Paper key={key} variant="outlined" sx={{ p: 1.5 }}>
            <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 800 }}>
              {prdLabel(key)}
            </Typography>
            <StructuredPrdValue value={value} depth={1} />
          </Paper>
        ))}
    </Box>
  );
}

function Method({ research }) {
  const entries = Object.entries({
    ...research.configuration,
    ...research.method,
    ...research.quality,
  }).filter(
    ([key, value]) =>
      ![
        'confidence',
        'confidence_score',
        'coverage',
        'research_coverage',
        'context_gate',
        'critical_claims',
        'critical_claim_validation',
        'evidence_contract',
      ].includes(key) &&
      value != null &&
      value !== ''
  );
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Metric
          label="Confidence"
          value={research.confidence == null ? 'Not reported' : `${research.confidence}%`}
        />
        <Metric
          label="Coverage"
          value={
            research.coverage.percent == null ? 'Not reported' : `${research.coverage.percent}%`
          }
        />
      </Box>
      {research.coverage.dimensions.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1 }}>
            Coverage
          </Typography>
          {research.coverage.dimensions.map((item) => (
            <Box
              key={item.id}
              sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.75 }}
            >
              <Typography variant="body2">{item.label}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {item.value == null ? 'Not reported' : `${item.value}%`}
              </Typography>
            </Box>
          ))}
        </Paper>
      )}
      {entries.length ? (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 750, mb: 1 }}>
            Method
          </Typography>
          {entries.map(([key, value]) => (
            <Box key={key} sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {key.replaceAll('_', ' ')}
              </Typography>
              <Typography variant="body2">{valueText(value)}</Typography>
            </Box>
          ))}
        </Paper>
      ) : (
        <Empty>No method notes were supplied in the research bundle.</Empty>
      )}
      {research.limitations.length > 0 && (
        <Alert severity="warning">
          <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>
            Known limitations
          </Typography>
          {research.limitations.map((item, index) => (
            <Typography key={index} variant="body2">
              • {valueText(item)}
            </Typography>
          ))}
        </Alert>
      )}
    </Box>
  );
}

export default function GoalResearchDetailsDialog({
  open,
  onClose,
  goal,
  initialTab = 'overview',
  loadBundle,
}) {
  const [tab, setTab] = useState(initialTab);
  const [loadState, setLoadState] = useState({ goalId: null, bundle: null, error: '' });

  useEffect(() => {
    if (!open || !goal?.id || typeof loadBundle !== 'function') return undefined;
    let current = true;
    Promise.resolve(loadBundle(goal.id))
      .then((result) => current && setLoadState({ goalId: goal.id, bundle: result, error: '' }))
      .catch(
        (reason) =>
          current &&
          setLoadState({
            goalId: goal.id,
            bundle: null,
            error: reason?.message || 'Research details could not be loaded.',
          })
      );
    return () => {
      current = false;
    };
  }, [goal?.id, loadBundle, open]);

  const currentLoad = loadState.goalId === goal?.id ? loadState : null;
  const loadedBundle = currentLoad?.bundle || null;
  const error = currentLoad?.error || '';
  const loading = Boolean(open && goal?.id && typeof loadBundle === 'function' && !currentLoad);
  const research = useMemo(() => getGoalResearchBundle(goal, loadedBundle), [goal, loadedBundle]);
  const activeIndex = Math.max(
    0,
    TABS.findIndex(([id]) => id === tab)
  );
  const close = () => {
    setTab(initialTab);
    onClose?.();
  };

  return (
    <FormDialog
      open={open}
      onClose={close}
      title="Customer intelligence research"
      subtitle={goal?.title}
      icon={ManageSearchOutlinedIcon}
      maxWidth="lg"
      primaryLabel="Close"
      onPrimary={close}
      hideCancel
      paperSx={{ height: { xs: '94vh', md: '88vh' } }}
      contentSx={{
        p: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <Tabs
        value={activeIndex}
        onChange={(_, index) => setTab(TABS[index][0])}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Research detail sections"
        sx={{ px: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
      >
        {TABS.map(([id, label]) => (
          <Tab
            key={id}
            id={`research-tab-${id}`}
            aria-controls={`research-tabpanel-${id}`}
            label={label}
            sx={{ textTransform: 'none' }}
          />
        ))}
      </Tabs>
      <Box
        role="region"
        aria-label="Research details content"
        sx={{
          px: { xs: 2, md: 3 },
          pb: 3,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        {loading && (
          <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2">Loading the full AxWise research bundle…</Typography>
          </Box>
        )}
        {error && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {error} Showing the compact goal summary.
          </Alert>
        )}
        {!research.available && !loading && (
          <Alert severity="info" sx={{ mt: 2 }}>
            No AxWise research bundle is attached to this goal yet. Legacy customer-persona context
            remains available in Gate 1.
          </Alert>
        )}
        <TabPanel active={tab === 'overview'} tabId="overview">
          <Overview research={research} />
        </TabPanel>
        <TabPanel active={tab === 'evidence'} tabId="evidence">
          <Evidence research={research} />
        </TabPanel>
        <TabPanel active={tab === 'customer-personas'} tabId="customer-personas">
          <Personas
            items={research.customerPersonas}
            selectedIds={research.selectedPersonaIds}
            emptyLabel="No customer-persona details were imported for this run."
          />
        </TabPanel>
        <TabPanel active={tab === 'interviews'} tabId="interviews">
          <Interviews research={research} />
        </TabPanel>
        <TabPanel active={tab === 'sources'} tabId="sources">
          <Sources research={research} />
        </TabPanel>
        <TabPanel active={tab === 'executor-personas'} tabId="executor-personas">
          <Personas
            executor
            items={research.executorPersonas}
            selectedIds={research.selectedPersonaIds}
            assignments={research.assignments}
            emptyLabel="No executor-persona details were imported for this run."
          />
        </TabPanel>
        <TabPanel active={tab === 'prd'} tabId="prd">
          <ResearchPrd research={research} />
        </TabPanel>
        <TabPanel active={tab === 'method'} tabId="method">
          <Method research={research} />
        </TabPanel>
      </Box>
    </FormDialog>
  );
}
