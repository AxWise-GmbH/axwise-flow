"""No-network acceptance coverage for the public-wrapper fixture pipeline."""
import asyncio
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

_spec = importlib.util.spec_from_file_location('axwise_fixture_benchmark', Path(__file__).with_name('benchmark-axwise-e2e.py'))
benchmark = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(benchmark)


class FixtureBenchmarkTests(unittest.TestCase):
    def test_real_wrapper_pipeline_retains_lineage_and_honest_measurements(self):
        with tempfile.TemporaryDirectory() as temporary:
            result = asyncio.run(benchmark.benchmark_fixture_pipeline(Path(temporary).resolve()))
        self.assertEqual(result['kind'], 'offline-fixture-fastmcp-pipeline')
        self.assertEqual(result['providerCalls'], 6)
        self.assertIsNone(result['baseline'])
        stages = result['stages']
        self.assertEqual(len({stage['operationId'] for stage in stages}), 6)
        self.assertEqual([stage['tool'] for stage in stages], [
            'prepare_discovery', 'generate_personas', 'simulate_interviews',
            'analyze_interviews', 'research_market', 'create_prd'])
        for stage in stages:
            self.assertEqual(stage['model'], 'deterministic-fixture')
            self.assertIsNot(stage['qualityReview'].get('passed'), True)
        prd_parents = {reference['operationId'] for reference in stages[-1]['references']}
        self.assertEqual(prd_parents, {stages[3]['operationId'], stages[4]['operationId']})

    def test_failed_provider_cannot_complete_pipeline(self):
        async def failed(*_args):
            raise RuntimeError('fake provider unavailable')
        with tempfile.TemporaryDirectory() as temporary, patch.object(benchmark.FixtureProvider, 'complete', failed):
            with self.assertRaises(Exception):
                asyncio.run(benchmark.benchmark_fixture_pipeline(Path(temporary).resolve()))


if __name__ == '__main__':
    unittest.main()
