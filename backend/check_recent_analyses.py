#!/usr/bin/env python3
"""
Check recent analysis results to find the correct ID for keyword analysis.
"""

import sys
import os
import json
from datetime import datetime

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "."))

from database import SessionLocal
from models import AnalysisResult


def main():
    """Check recent analysis results."""

    print("🔍 Checking Recent Analysis Results")
    print("=" * 60)

    db = SessionLocal()
    try:
        # Get recent analysis results
        from sqlalchemy import desc

        recent_analyses = (
            db.query(AnalysisResult)
            .order_by(desc(AnalysisResult.analysis_date))
            .limit(10)
            .all()
        )

        if not recent_analyses:
            print("❌ No analysis results found")
            return

        print(f"📊 Found {len(recent_analyses)} recent analyses:")
        print()

        for analysis in recent_analyses:
            # Parse results to check for personas
            try:
                results_data = (
                    json.loads(analysis.results)
                    if isinstance(analysis.results, str)
                    else analysis.results
                )

                personas_count = (
                    len(results_data.get("personas", [])) if results_data else 0
                )
                status = analysis.status or "unknown"

                print(f"🔸 Result ID: {analysis.result_id}")
                print(f"   Created: {analysis.created_at}")
                print(f"   Status: {status}")
                print(f"   Personas: {personas_count}")

                # Show persona names if available
                if personas_count > 0:
                    personas = results_data.get("personas", [])
                    persona_names = [p.get("name", "Unnamed") for p in personas[:3]]
                    print(f"   Names: {', '.join(persona_names)}")
                    if personas_count > 3:
                        print(f"          ... and {personas_count - 3} more")

                print()

            except Exception as e:
                print(f"   ❌ Error parsing results: {str(e)}")
                print()

        # Find the most recent completed analysis with personas
        for analysis in recent_analyses:
            if analysis.status == "completed":
                try:
                    results_data = (
                        json.loads(analysis.results)
                        if isinstance(analysis.results, str)
                        else analysis.results
                    )

                    if results_data and results_data.get("personas"):
                        print(
                            f"🎯 Most recent completed analysis with personas: {analysis.result_id}"
                        )
                        print(f"   Use this ID for keyword highlighting analysis")
                        break
                except:
                    continue

    except Exception as e:
        print(f"❌ Error checking analyses: {str(e)}")
        import traceback

        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    main()
