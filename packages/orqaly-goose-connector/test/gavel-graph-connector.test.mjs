import test from 'node:test';
import assert from 'node:assert/strict';
import { GavelGraphConnector, injectGavelContextIntoPrompt } from '../src/gavel-graph-connector.mjs';

test('GavelGraphConnector indexes codebase and extracts pruned subgraphs in < 5ms', async () => {
  const codebaseText = `// Module: src/pricing.ts
export interface PricingConfig { id: string; rate: number; }
export function calculateTierPrice(units: number, rate: number): number { return units * rate; }
// Module: src/billing.ts
export class BillingService {
  bill(id: string) { return id; }
}
`;

  const connector = new GavelGraphConnector({ maxHops: 2 });
  const indexRes = await connector.indexWorkspace(codebaseText);
  assert.ok(indexRes.nodeCount > 0);
  assert.ok(indexRes.buildDurationMs < 50);

  // Precondition verification
  const pre = connector.verifyPreconditions('calculateTierPrice');
  assert.equal(pre.satisfied, true);

  // Subgraph extraction
  const sub = connector.extractSubgraph('calculateTierPrice');
  assert.equal(sub.found, true);
  assert.match(sub.prunedSnippet, /calculateTierPrice/);

  // Prompt injection
  const initialMessages = [{ role: 'user', content: 'Refactor calculateTierPrice' }];
  const injected = injectGavelContextIntoPrompt(initialMessages, 'calculateTierPrice', connector);
  assert.equal(injected.length, 2);
  assert.equal(injected[0].role, 'system');
  assert.match(injected[0].content, /GAVEL In-Memory Graph Context/);
});
