import { Box, Stack, Typography } from '@mui/material';
import { TaskDisclosure } from '../WorkflowV2/TaskDisclosure.jsx';
import { workflowRequirementText, workflowSchemaFields } from './solution-presentation.js';

function SchemaSummary({ title, schema }) {
  const fields = workflowSchemaFields(schema);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="h3" variant="subtitle1">
        {title}
      </Typography>
      {fields.length ? (
        <Stack component="ul" gap={1} sx={{ pl: 2.5, mt: 1, mb: 0 }} aria-label={title}>
          {fields.map((field) => (
            <Typography
              component="li"
              key={field.path}
              variant="body2"
              sx={{ overflowWrap: 'anywhere' }}
            >
              <Box component="code">{field.path}</Box> · {field.type}
              {field.required ? ' · required' : ''}
              {field.description ? ` — ${field.description}` : ''}
            </Typography>
          ))}
        </Stack>
      ) : (
        <Typography color="text.secondary">No contract has been saved yet.</Typography>
      )}
    </Box>
  );
}

export default function WorkflowContractSummary({ spec }) {
  if (!spec) return null;
  return (
    <Stack gap={2} sx={{ minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary">
        These are the saved requirements and expected data shapes, not an execution result. The
        native graph above shows the actual workflow.
      </Typography>
      {spec.requirements?.length ? (
        <Stack component="ul" gap={1} sx={{ pl: 2.5, m: 0 }} aria-label="Workflow requirements">
          {spec.requirements.map((item, index) => (
            <Typography
              component="li"
              key={item.id || index}
              variant="body2"
              sx={{ overflowWrap: 'anywhere' }}
            >
              {workflowRequirementText(item)}
            </Typography>
          ))}
        </Stack>
      ) : null}
      {spec.connections?.length ? (
        <Stack gap={1} aria-label="Required service actions">
          <Typography component="h3" variant="subtitle1">
            Required service actions
          </Typography>
          {spec.connections.map((item) => (
            <Typography key={item.id} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              {item.provider} · {item.operation} — {item.purpose}
            </Typography>
          ))}
          <Typography variant="caption" color="text.secondary">
            A requested connection is not permission to use an account. Setup, verification and
            effect approval remain separate.
          </Typography>
        </Stack>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(2,minmax(0,1fr))' },
          gap: 2,
        }}
      >
        <SchemaSummary title="Expected input" schema={spec.inputSchema} />
        <SchemaSummary title="Expected output" schema={spec.outputSchema} />
      </Box>
      {spec.acceptanceCases?.length ? (
        <TaskDisclosure title="Agreed acceptance cases">
          <Typography variant="body2" color="text.secondary">
            Proposed or agreed checks are not passed tests. Only execution evidence can establish a
            result.
          </Typography>
          {spec.acceptanceCases.map((item, index) => (
            <Box key={item.id || index} sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2">
                {item.name || item.description || `Case ${index + 1}`}
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  mt: 1,
                  p: 1.5,
                  bgcolor: 'action.hover',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  fontSize: 12,
                }}
              >
                {JSON.stringify(item, null, 2)}
              </Box>
            </Box>
          ))}
        </TaskDisclosure>
      ) : null}
    </Stack>
  );
}
