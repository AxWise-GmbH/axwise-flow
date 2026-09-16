/**
 * BudgetTab — agent spend + per-phase cost breakdown for the Report tab.
 * Uses stacked cards on mobile and tables on larger screens to avoid overflow.
 */
import { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  Paper,
  Table,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
  TableContainer,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FormDialog from '../Common/FormDialog';
import ReportMetricCell from './ReportMetricCell';
import { getMetricInfo } from '../../utils/reportMetricMeta';
import { formatTokenSpend, formatTokensOrZero } from '../../utils/formatTokens';

import AppIcon from '../icons/AppIcon';

const tableScrollSx = {
  overflowX: 'auto',
  maxWidth: '100%',
  minWidth: 0,
  WebkitOverflowScrolling: 'touch',
};

function wrapTextSx(extra = {}) {
  return {
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    whiteSpace: 'normal',
    ...extra,
  };
}

function AgentMobileCard({ agent, onSelect }) {
  const theme = useTheme();
  return (
    <Paper
      variant="outlined"
      onClick={() => onSelect(agent)}
      sx={{
        p: 1.25,
        mb: 1,
        borderRadius: 2,
        cursor: 'pointer',
        minWidth: 0,
        maxWidth: '100%',
        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mb: 0.75, minWidth: 0 }}>
        <AppIcon
          name="SmartToyOutlined"
          fallback={SmartToyOutlinedIcon}
          sx={{ fontSize: 14, color: 'info.main', mt: 0.15, flexShrink: 0 }}
        />
        <Typography
          variant="caption"
          sx={{
            flex: 1,
            minWidth: 0,
            fontWeight: 700,
            fontSize: '0.72rem',
            color: 'info.main',
            ...wrapTextSx(),
          }}
        >
          {agent.name}
        </Typography>
        {agent.failed > 0 ? (
          <Chip
            label={`${agent.failed} failed`}
            size="small"
            color="error"
            variant="outlined"
            sx={{ height: 18, fontSize: '0.55rem', flexShrink: 0 }}
          />
        ) : (
          <Chip
            label="OK"
            size="small"
            color="success"
            variant="outlined"
            sx={{ height: 18, fontSize: '0.55rem', flexShrink: 0 }}
          />
        )}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.75 }}>
        <Box>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              fontSize: '0.55rem',
              color: 'text.disabled',
              textTransform: 'uppercase',
            }}
          >
            Tasks
          </Typography>
          <Chip
            label={`${agent.completed}/${agent.tasks}`}
            size="small"
            variant="outlined"
            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, mt: 0.25 }}
          />
        </Box>
        <Box sx={{ gridColumn: 'span 2' }}>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              fontSize: '0.55rem',
              color: 'text.disabled',
              textTransform: 'uppercase',
            }}
          >
            Spend / Tokens
          </Typography>
          <Box sx={{ mt: 0.35 }}>
            <ReportMetricCell
              costUsd={agent.spent}
              tokens={agent.tokens}
              costInfo={getMetricInfo(agent.metricMeta?.costReason)}
              tokenInfo={getMetricInfo(agent.metricMeta?.tokenReason)}
              align="left"
              compact
            />
          </Box>
        </Box>
        <Box>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              fontSize: '0.55rem',
              color: 'text.disabled',
              textTransform: 'uppercase',
            }}
          >
            Quality
          </Typography>
          {agent.avgQuality != null ? (
            <Chip
              label={`${agent.avgQuality}/100`}
              size="small"
              color={
                agent.avgQuality >= 70 ? 'success' : agent.avgQuality >= 40 ? 'warning' : 'error'
              }
              variant="outlined"
              sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, mt: 0.25 }}
            />
          ) : (
            <Typography
              variant="caption"
              sx={{ color: 'text.disabled', display: 'block', mt: 0.35 }}
            >
              —
            </Typography>
          )}
        </Box>
      </Box>
    </Paper>
  );
}

function PhaseMobileCard({ phase }) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.25, mb: 1, borderRadius: 2, minWidth: 0, maxWidth: '100%' }}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, fontSize: '0.72rem', display: 'block', mb: 0.75, ...wrapTextSx() }}
      >
        {phase.phaseName}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.75 }}>
        <Box sx={{ gridColumn: 'span 1' }}>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              fontSize: '0.55rem',
              color: 'text.disabled',
              textTransform: 'uppercase',
            }}
          >
            Cost / Tokens
          </Typography>
          <Box sx={{ mt: 0.35 }}>
            <ReportMetricCell
              costUsd={phase.cost}
              tokens={phase.tokens}
              costInfo={getMetricInfo(phase.metricMeta?.costReason)}
              tokenInfo={getMetricInfo(phase.metricMeta?.tokenReason)}
              align="left"
              compact
            />
          </Box>
        </Box>
        <Box>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              fontSize: '0.55rem',
              color: 'text.disabled',
              textTransform: 'uppercase',
            }}
          >
            Quality
          </Typography>
          {phase.qualityScore != null ? (
            <Chip
              label={`${phase.qualityScore}/100`}
              size="small"
              color={
                phase.qualityScore >= 70
                  ? 'success'
                  : phase.qualityScore >= 40
                    ? 'warning'
                    : 'error'
              }
              variant="outlined"
              sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, mt: 0.25 }}
            />
          ) : (
            <Typography
              variant="caption"
              sx={{ color: 'text.disabled', display: 'block', mt: 0.35 }}
            >
              —
            </Typography>
          )}
        </Box>
        <Box>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              fontSize: '0.55rem',
              color: 'text.disabled',
              textTransform: 'uppercase',
            }}
          >
            Status
          </Typography>
          <Chip
            label={phase.status || 'pending'}
            size="small"
            color={
              phase.status === 'completed'
                ? 'success'
                : phase.status === 'executing'
                  ? 'info'
                  : 'default'
            }
            variant="outlined"
            sx={{ height: 18, fontSize: '0.55rem', textTransform: 'capitalize', mt: 0.25 }}
          />
        </Box>
      </Box>
    </Paper>
  );
}

export default function BudgetTab({ goal }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [agentPopup, setAgentPopup] = useState(null);
  const agents = goal?.agentBudget || [];
  const hasLlmColumn = true;
  const totalSpent = agents.reduce((s, a) => s + a.spent, 0);
  const totalAgentTokens = agents.reduce((s, a) => s + Number(a.tokens || 0), 0);
  const totalAgentTokenCost = agents.reduce((s, a) => s + Number(a.tokenCostUsd || 0), 0);
  const totalTasks = agents.reduce((s, a) => s + a.tasks, 0);
  const totalCompleted = agents.reduce((s, a) => s + a.completed, 0);
  const totalFailed = agents.reduce((s, a) => s + a.failed, 0);
  const budget = Number(goal?.budget_usd || 0);
  const remaining = Math.max(0, budget - Number(goal?.spent_usd || 0));

  const tableSx = {
    tableLayout: 'fixed',
    width: '100%',
    '& td, & th': {
      fontSize: '0.72rem',
      py: 0.75,
      borderColor: alpha(theme.palette.divider, 0.1),
      verticalAlign: 'top',
    },
  };

  return (
    <Box sx={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(5, 1fr)' },
          gap: 1,
          mb: 2,
        }}
      >
        {[
          { label: 'Total Budget', value: `$${budget.toFixed(2)}`, color: 'primary.main' },
          {
            label: 'Spent',
            value: `$${Number(goal?.spent_usd || 0).toFixed(4)}`,
            color: 'warning.main',
          },
          { label: 'Remaining', value: `$${remaining.toFixed(2)}`, color: 'success.main' },
          { label: 'Tasks', value: `${totalCompleted}/${totalTasks}`, color: 'info.main' },
          {
            label: 'Tokens',
            value: `${formatTokensOrZero(goal.tokenSummary?.totalTokens)} tokens`,
            color: 'secondary.main',
          },
        ].map((card) => (
          <Box
            key={card.label}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              textAlign: 'center',
              minWidth: 0,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.58rem',
                color: 'text.disabled',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {card.label}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '0.78rem', sm: '0.85rem' },
                color: card.color,
                wordBreak: 'break-word',
              }}
            >
              {card.value}
            </Typography>
          </Box>
        ))}
      </Box>
      {agents.length === 0 ? (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
          No agent activity yet
        </Typography>
      ) : isMobile ? (
        <Box>
          {agents.map((agent) => (
            <AgentMobileCard key={agent.name} agent={agent} onSelect={setAgentPopup} />
          ))}
          <Paper
            variant="outlined"
            sx={{ p: 1.25, borderRadius: 2, borderTop: '2px solid', borderColor: 'divider' }}
          >
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, fontSize: '0.72rem', display: 'block', mb: 0.75 }}
            >
              Total
            </Typography>
            <Box
              sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.75 }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {totalCompleted}/{totalTasks} tasks
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                ${totalSpent.toFixed(4)}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {totalFailed > 0 ? `${totalFailed} failed` : 'All OK'}
              </Typography>
            </Box>
          </Paper>
        </Box>
      ) : (
        <TableContainer sx={tableScrollSx}>
          <Table size="small" sx={tableSx}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: hasLlmColumn ? '28%' : '34%' }}>
                  Agent
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, width: '12%' }}>
                  Tasks
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, width: '14%' }}>
                  Spend
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, width: '16%' }}>
                  Tokens
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ fontWeight: 700, width: hasLlmColumn ? '14%' : '17%' }}
                >
                  Quality
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ fontWeight: 700, width: hasLlmColumn ? '16%' : '17%' }}
                >
                  Status
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {agents.map((agent) => (
                <TableRow
                  key={agent.name}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => setAgentPopup(agent)}
                >
                  <TableCell sx={{ maxWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, minWidth: 0 }}>
                      <AppIcon
                        name="SmartToyOutlined"
                        fallback={SmartToyOutlinedIcon}
                        sx={{ fontSize: 14, color: 'info.main', flexShrink: 0, mt: 0.15 }}
                      />
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.72rem',
                          color: 'info.main',
                          ...wrapTextSx(),
                        }}
                      >
                        {agent.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={`${agent.completed}/${agent.tasks}`}
                      size="small"
                      color={
                        agent.completed === agent.tasks && agent.tasks > 0 ? 'success' : 'default'
                      }
                      variant="outlined"
                      sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <ReportMetricCell
                      costUsd={agent.spent}
                      costInfo={getMetricInfo(agent.metricMeta?.costReason)}
                      showTokens={false}
                      align="center"
                      compact
                    />
                  </TableCell>
                  <TableCell align="center">
                    <ReportMetricCell
                      costUsd={0}
                      tokens={agent.tokens}
                      tokenInfo={getMetricInfo(agent.metricMeta?.tokenReason)}
                      showCost={false}
                      align="center"
                      compact
                    />
                  </TableCell>
                  <TableCell align="center">
                    {agent.avgQuality != null ? (
                      <Chip
                        label={`${agent.avgQuality}/100`}
                        size="small"
                        color={
                          agent.avgQuality >= 70
                            ? 'success'
                            : agent.avgQuality >= 40
                              ? 'warning'
                              : 'error'
                        }
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }}
                      />
                    ) : (
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        —
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {agent.failed > 0 ? (
                      <Chip
                        label={`${agent.failed} failed`}
                        size="small"
                        color="error"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.55rem' }}
                      />
                    ) : (
                      <Chip
                        label="OK"
                        size="small"
                        color="success"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.55rem' }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow
                sx={{ '& td': { fontWeight: 700, borderTop: '2px solid', borderColor: 'divider' } }}
              >
                <TableCell>
                  <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.72rem' }}>
                    Total
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={`${totalCompleted}/${totalTasks}`}
                    size="small"
                    color="info"
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }}
                  />
                </TableCell>
                <TableCell align="center">
                  <ReportMetricCell
                    costUsd={totalSpent}
                    showTokens={false}
                    align="center"
                    compact
                  />
                </TableCell>
                <TableCell align="center">
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {formatTokensOrZero(totalAgentTokens)} tokens
                  </Typography>
                </TableCell>
                <TableCell align="center">—</TableCell>
                <TableCell align="center">
                  {totalFailed > 0 ? (
                    <Chip
                      label={`${totalFailed} failed`}
                      size="small"
                      color="error"
                      variant="outlined"
                      sx={{ height: 18, fontSize: '0.55rem' }}
                    />
                  ) : (
                    <Chip
                      label="All OK"
                      size="small"
                      color="success"
                      variant="outlined"
                      sx={{ height: 18, fontSize: '0.55rem' }}
                    />
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {goal?.phaseBudget?.length > 0 && (
        <Box sx={{ mt: 2.5, minWidth: 0, maxWidth: '100%' }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, fontSize: '0.75rem', mb: 1, display: 'block' }}
          >
            {hasLlmColumn ? 'Cost & Tokens by Phase' : 'Cost by Phase'}
          </Typography>
          {isMobile ? (
            <Box>
              {goal.phaseBudget.map((phase) => (
                <PhaseMobileCard key={phase.phaseIndex} phase={phase} />
              ))}
              <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, fontSize: '0.72rem', display: 'block', mb: 0.5 }}
                >
                  Total
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  $
                  {(
                    goal.financialSummary?.totalSpent ||
                    goal.phaseBudget.reduce((s, p) => s + p.cost, 0)
                  ).toFixed(4)}
                </Typography>
              </Paper>
            </Box>
          ) : (
            <TableContainer sx={tableScrollSx}>
              <Table size="small" sx={tableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, width: hasLlmColumn ? '34%' : '42%' }}>
                      Phase
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{ fontWeight: 700, width: hasLlmColumn ? '14%' : '18%' }}
                    >
                      Cost
                    </TableCell>
                    {hasLlmColumn && (
                      <TableCell align="center" sx={{ fontWeight: 700, width: '18%' }}>
                        Tokens
                      </TableCell>
                    )}
                    <TableCell
                      align="center"
                      sx={{ fontWeight: 700, width: hasLlmColumn ? '16%' : '20%' }}
                    >
                      Quality
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{ fontWeight: 700, width: hasLlmColumn ? '18%' : '20%' }}
                    >
                      Status
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {goal.phaseBudget.map((phase) => (
                    <TableRow key={phase.phaseIndex} hover>
                      <TableCell sx={{ maxWidth: 0 }}>
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 600, fontSize: '0.72rem', ...wrapTextSx() }}
                        >
                          {phase.phaseName}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <ReportMetricCell
                          costUsd={phase.cost}
                          costInfo={getMetricInfo(phase.metricMeta?.costReason)}
                          showTokens={false}
                          align="center"
                          compact
                        />
                      </TableCell>
                      <TableCell align="center">
                        <ReportMetricCell
                          costUsd={0}
                          tokens={phase.tokens}
                          tokenInfo={getMetricInfo(phase.metricMeta?.tokenReason)}
                          showCost={false}
                          align="center"
                          compact
                        />
                      </TableCell>
                      <TableCell align="center">
                        {phase.qualityScore != null ? (
                          <Chip
                            label={`${phase.qualityScore}/100`}
                            size="small"
                            color={
                              phase.qualityScore >= 70
                                ? 'success'
                                : phase.qualityScore >= 40
                                  ? 'warning'
                                  : 'error'
                            }
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }}
                          />
                        ) : (
                          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                            —
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={phase.status || 'pending'}
                          size="small"
                          color={
                            phase.status === 'completed'
                              ? 'success'
                              : phase.status === 'executing'
                                ? 'info'
                                : 'default'
                          }
                          variant="outlined"
                          sx={{ height: 18, fontSize: '0.55rem', textTransform: 'capitalize' }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow
                    sx={{
                      '& td': { fontWeight: 700, borderTop: '2px solid', borderColor: 'divider' },
                    }}
                  >
                    <TableCell>
                      <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.72rem' }}>
                        Total
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <ReportMetricCell
                        costUsd={
                          goal.financialSummary?.totalSpent ||
                          goal.phaseBudget.reduce((s, p) => s + p.cost, 0)
                        }
                        showTokens={false}
                        align="center"
                        compact
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {formatTokensOrZero(goal.tokenSummary?.totalTokens)} tokens
                      </Typography>
                    </TableCell>
                    <TableCell align="center">—</TableCell>
                    <TableCell align="center">—</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}
      {agentPopup && (
        <FormDialog
          open
          onClose={() => setAgentPopup(null)}
          title={agentPopup.name}
          icon={SmartToyOutlinedIcon}
          maxWidth="xs"
          contentDividers={false}
          primaryLabel="Close"
          onPrimary={() => setAgentPopup(null)}
          hideCancel
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
            {[
              { label: 'Tasks Completed', value: `${agentPopup.completed}/${agentPopup.tasks}` },
              { label: 'Tasks Failed', value: agentPopup.failed || 0 },
              { label: 'Total Spent', value: `$${agentPopup.spent.toFixed(4)}` },
              { label: 'Tokens', value: `${formatTokensOrZero(agentPopup.tokens)} tokens` },
              {
                label: 'Avg Quality',
                value: agentPopup.avgQuality != null ? `${agentPopup.avgQuality}/100` : 'N/A',
              },
            ].map((item) => (
              <Box
                key={item.label}
                sx={{ p: 1, borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.58rem', color: 'text.disabled', textTransform: 'uppercase' }}
                >
                  {item.label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
                  {item.value}
                </Typography>
              </Box>
            ))}
          </Box>
          {agentPopup.agentId && (
            <Button
              size="small"
              variant="outlined"
              startIcon={
                <AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 14 }} />
              }
              onClick={() => {
                window.location.href = '/my-agents';
              }}
              sx={{ textTransform: 'none', fontSize: '0.72rem', borderRadius: 2 }}
            >
              View in My Agents
            </Button>
          )}
        </FormDialog>
      )}
    </Box>
  );
}
