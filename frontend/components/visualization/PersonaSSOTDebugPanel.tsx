'use client';

import React from 'react';
import type { Persona, PersonaSSOT } from '@/types/api';
import { Badge } from '@/components/ui/badge';

type Props = {
  personas: Persona[];
  personasSSOT: PersonaSSOT[];
  validationSummary?: any;
  validationStatus?: string | null;
  confidenceComponents?: any;
  sourceInfo?: any;
};

export default function PersonaSSOTDebugPanel({
  personas,
  personasSSOT,
  validationSummary,
  validationStatus,
  confidenceComponents,
  sourceInfo
}: Props) {
  const renderEvidenceItem = (ev: any, idx: number) => {
    const item = typeof ev === 'string' ? { quote: ev } : (ev || {});
    const quote: string = typeof item.quote === 'string' ? item.quote : '';
    return (
      <div key={idx} className="text-xs text-muted-foreground">
        <div>
          <span className="font-medium">Quote:</span> "{quote}"{' '}
          {item?.speaker && (
            <span className="ml-2">(<span className="font-medium">Speaker:</span> {item.speaker})</span>
          )}
          {(item?.start_char != null || item?.end_char != null) && (
            <span className="ml-2">[
              <span className="font-medium">Offsets:</span> {item?.start_char ?? '—'}–{item?.end_char ?? '—'}
            ]</span>
          )}
        </div>
      </div>
    );
  };

  const renderAttributedField = (title: string, field: any) => {
    if (!field) return null;
    const rawValue = field?.value;
    const valueText = typeof rawValue === 'string'
      ? rawValue
      : Array.isArray(rawValue)
        ? rawValue.join(', ')
        : rawValue && typeof rawValue === 'object'
          ? JSON.stringify(rawValue)
          : '';
    const evidence = Array.isArray(field?.evidence) ? field.evidence : [];
    return (
      <div className="mb-3">
        <div className="font-medium">{title}</div>
        {valueText && <div className="text-sm break-words whitespace-pre-wrap">{valueText}</div>}
        {evidence.length > 0 && (
          <div className="mt-1 space-y-1">
            {evidence.map(renderEvidenceItem)}
          </div>
        )}
      </div>
    );
  };

  const renderSSOTPersona = (p: PersonaSSOT, idx: number) => (
    <div key={idx} className="border rounded p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">SSoT Persona</div>
          <div className="text-lg font-semibold">{p.name}</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {renderAttributedField('Demographics: Experience', p.demographics?.experience_level)}
        {renderAttributedField('Demographics: Industry', p.demographics?.industry)}
        {renderAttributedField('Demographics: Location', p.demographics?.location)}
        {renderAttributedField('Demographics: Context', p.demographics?.professional_context)}
        {renderAttributedField('Demographics: Roles', p.demographics?.roles)}
        {renderAttributedField('Demographics: Age', p.demographics?.age_range)}
      </div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {renderAttributedField('Goals & Motivations', p.goals_and_motivations)}
        {renderAttributedField('Challenges & Frustrations', p.challenges_and_frustrations)}
        {renderAttributedField('Key Quotes', p.key_quotes)}
      </div>
    </div>
  );

  const renderLegacyPersona = (p: Persona, idx: number) => (
    <div key={idx} className="border rounded p-3">
      <div className="text-sm text-muted-foreground">Legacy Persona</div>
      <div className="text-lg font-semibold">{p.name}</div>
      <div className="text-sm mt-1">{p.description}</div>
      {/* We intentionally avoid changing the legacy shape */}
    </div>
  );

  const renderSource = () => {
    if (!sourceInfo) return null;
    return (
      <div className="border rounded p-3">
        <div className="text-sm font-medium mb-2">Source</div>
        {Array.isArray(sourceInfo?.transcript) ? (
          <div className="text-xs text-muted-foreground">
            Transcript segments: {sourceInfo.transcript.length}
          </div>
        ) : sourceInfo?.original_text ? (
          <div className="text-xs text-muted-foreground line-clamp-3">
            Original text preview: {sourceInfo.original_text.slice(0, 240)}...
          </div>
        ) : sourceInfo?.dataId ? (
          <div className="text-xs text-muted-foreground">dataId: {String(sourceInfo.dataId)}</div>
        ) : (
          <div className="text-xs text-muted-foreground">No source attached.</div>
        )}
      </div>
    );
  };

  const renderValidation = () => (
    <div className="border rounded p-3">
      <div className="text-sm font-medium mb-2">Validation</div>
      <div className="flex items-center gap-2 mb-2">
        <div className="text-xs">Status:</div>
        <Badge variant={validationStatus === 'PASS' ? 'default' : validationStatus === 'SOFT_FAIL' ? 'secondary' : 'destructive'}>
          {validationStatus || '—'}
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground whitespace-pre-wrap">
        {validationSummary ? JSON.stringify(validationSummary, null, 2) : 'No summary'}
      </div>
      {confidenceComponents && (
        <div className="mt-2 text-xs text-muted-foreground">
          Confidence: {JSON.stringify(confidenceComponents)}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="text-sm font-medium">Legacy Personas</div>
          {personas?.length ? personas.map(renderLegacyPersona) : (
            <div className="text-xs text-muted-foreground">No legacy personas</div>
          )}
        </div>
        <div className="space-y-3">
          <div className="text-sm font-medium">SSoT Personas</div>
          {personasSSOT?.length ? personasSSOT.map(renderSSOTPersona) : (
            <div className="text-xs text-muted-foreground">No SSoT personas</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderSource()}
        {renderValidation()}
      </div>
    </div>
  );
}

