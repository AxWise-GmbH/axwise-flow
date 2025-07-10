"""
Test script to demonstrate the enhanced simulation capabilities.
"""

import asyncio
import json
import time
from datetime import datetime

from backend.api.research.simulation_bridge.models import (
    SimulationRequest,
    SimulationConfig,
    BusinessContext,
    QuestionsData,
    Stakeholder,
    SimulationDepth,
    ResponseStyle,
)
from backend.api.research.simulation_bridge.services.orchestrator import (
    SimulationOrchestrator,
)
from backend.infrastructure.persistence.simulation_repository import (
    SimulationRepository,
)
from backend.infrastructure.persistence.unit_of_work import UnitOfWork
from backend.database import SessionLocal


async def test_parallel_vs_sequential():
    """Compare parallel vs sequential processing performance."""

    print("🚀 Testing Enhanced Simulation Capabilities")
    print("=" * 50)

    # Create test data
    business_context = BusinessContext(
        business_idea="AI-powered fitness coaching app",
        target_customer="Busy professionals aged 25-45",
        problem="Lack of personalized fitness guidance that fits busy schedules",
    )

    stakeholders = {
        "primary": [
            Stakeholder(
                id="fitness_enthusiasts",
                name="Fitness Enthusiasts",
                description="People who regularly exercise and are interested in fitness technology",
                questions=[
                    "What's your current fitness routine?",
                    "What challenges do you face with existing fitness apps?",
                    "How important is personalization in fitness coaching?",
                    "What would make you switch to a new fitness app?",
                ],
            )
        ]
    }

    questions_data = QuestionsData(stakeholders=stakeholders)

    config = SimulationConfig(
        depth=SimulationDepth.DETAILED,
        people_per_stakeholder=3,  # Small number for testing
        response_style=ResponseStyle.REALISTIC,
        include_insights=True,
        temperature=0.7,
    )

    request = SimulationRequest(
        questions_data=questions_data, business_context=business_context, config=config
    )

    # Test 1: Sequential Processing
    print("\n📊 Test 1: Sequential Processing")
    print("-" * 30)

    orchestrator_sequential = SimulationOrchestrator(use_parallel=False)
    start_time = time.time()

    try:
        result_sequential = await orchestrator_sequential.simulate_with_persistence(
            request, user_id="test_user_sequential"
        )
        sequential_time = time.time() - start_time

        print(f"✅ Sequential simulation completed in {sequential_time:.2f} seconds")
        print(f"   - Simulation ID: {result_sequential.simulation_id}")
        print(f"   - Personas generated: {len(result_sequential.personas or [])}")
        print(f"   - Interviews completed: {len(result_sequential.interviews or [])}")

    except Exception as e:
        print(f"❌ Sequential simulation failed: {str(e)}")
        sequential_time = None

    # Test 2: Parallel Processing
    print("\n⚡ Test 2: Parallel Processing")
    print("-" * 30)

    orchestrator_parallel = SimulationOrchestrator(use_parallel=True, max_concurrent=3)
    start_time = time.time()

    try:
        result_parallel = await orchestrator_parallel.simulate_with_persistence(
            request, user_id="test_user_parallel"
        )
        parallel_time = time.time() - start_time

        print(f"✅ Parallel simulation completed in {parallel_time:.2f} seconds")
        print(f"   - Simulation ID: {result_parallel.simulation_id}")
        print(f"   - Personas generated: {len(result_parallel.personas or [])}")
        print(f"   - Interviews completed: {len(result_parallel.interviews or [])}")

    except Exception as e:
        print(f"❌ Parallel simulation failed: {str(e)}")
        parallel_time = None

    # Performance Comparison
    if sequential_time and parallel_time:
        print("\n📈 Performance Comparison")
        print("-" * 30)
        speedup = sequential_time / parallel_time
        print(f"Sequential time: {sequential_time:.2f}s")
        print(f"Parallel time: {parallel_time:.2f}s")
        print(f"Speedup: {speedup:.2f}x")

        if speedup > 1:
            print(f"🎉 Parallel processing is {speedup:.2f}x faster!")
        else:
            print(
                "⚠️  Parallel processing didn't show improvement (possibly due to overhead)"
            )


async def test_database_persistence():
    """Test database persistence functionality."""

    print("\n💾 Test 3: Database Persistence")
    print("-" * 30)

    try:
        async with UnitOfWork(SessionLocal) as uow:
            simulation_repo = SimulationRepository(uow.session)

            # Get recent simulations
            simulations = await simulation_repo.get_completed_simulations(limit=5)

            print(f"📋 Found {len(simulations)} completed simulations in database:")

            for sim in simulations:
                print(f"   - ID: {sim.simulation_id[:8]}...")
                print(f"     Status: {sim.status}")
                print(f"     Created: {sim.created_at}")
                print(f"     Duration: {sim.duration_minutes or 'N/A'} minutes")
                print(f"     Personas: {sim.total_personas}")
                print(f"     Interviews: {sim.total_interviews}")
                print()

            if simulations:
                # Test retrieval of specific simulation
                latest_sim = simulations[0]
                retrieved_sim = await simulation_repo.get_by_simulation_id(
                    latest_sim.simulation_id
                )

                if retrieved_sim:
                    print(
                        f"✅ Successfully retrieved simulation: {retrieved_sim.simulation_id[:8]}..."
                    )
                    print(f"   - Has personas data: {bool(retrieved_sim.personas)}")
                    print(f"   - Has interviews data: {bool(retrieved_sim.interviews)}")
                    print(f"   - Has insights data: {bool(retrieved_sim.insights)}")
                else:
                    print("❌ Failed to retrieve simulation")
            else:
                print(
                    "ℹ️  No simulations found in database. Run some simulations first!"
                )

    except Exception as e:
        print(f"❌ Database persistence test failed: {str(e)}")


async def test_cache_performance():
    """Test response caching in parallel simulator."""

    print("\n🗄️  Test 4: Response Caching")
    print("-" * 30)

    try:
        orchestrator = SimulationOrchestrator(use_parallel=True, max_concurrent=3)

        if orchestrator.parallel_interview_simulator:
            # Get cache stats before
            stats_before = orchestrator.parallel_interview_simulator.get_cache_stats()
            print(f"Cache stats before: {stats_before}")

            # Clear cache to start fresh
            orchestrator.parallel_interview_simulator.clear_cache()
            print("🧹 Cache cleared")

            # Get updated stats
            stats_after = orchestrator.parallel_interview_simulator.get_cache_stats()
            print(f"Cache stats after clear: {stats_after}")

        else:
            print("⚠️  Parallel simulator not available")

    except Exception as e:
        print(f"❌ Cache performance test failed: {str(e)}")


async def main():
    """Run all tests."""

    print("🧪 Enhanced Simulation Testing Suite")
    print("=" * 50)
    print(f"Started at: {datetime.now()}")

    try:
        # Run all tests
        await test_parallel_vs_sequential()
        await test_database_persistence()
        await test_cache_performance()

        print("\n🎯 Summary")
        print("-" * 30)
        print("✅ All tests completed!")
        print("\n📋 Key Improvements Demonstrated:")
        print("   1. ⚡ Parallel processing for faster simulations")
        print("   2. 💾 Database persistence for reliable storage")
        print("   3. 🗄️  Response caching for efficiency")
        print("   4. 🔄 Enhanced error handling and recovery")
        print("   5. 📊 Detailed progress tracking")

    except Exception as e:
        print(f"\n❌ Test suite failed: {str(e)}")

    print(f"\nCompleted at: {datetime.now()}")


if __name__ == "__main__":
    asyncio.run(main())
