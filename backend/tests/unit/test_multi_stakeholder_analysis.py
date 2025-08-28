#!/usr/bin/env python3
"""
Test script to upload multi-stakeholder file and trigger analysis
"""

import requests
import time
import json

# Configuration
API_BASE_URL = "http://localhost:8000"
AUTH_TOKEN = "testuser123"
TEST_FILE_PATH = "test_multi_stakeholder_interview.txt"


def upload_file_and_analyze():
    """Upload the test file and trigger analysis"""

    headers = {"Authorization": f"Bearer {AUTH_TOKEN}"}

    print("=" * 60)
    print("MULTI-STAKEHOLDER ANALYSIS TEST")
    print("=" * 60)

    # Step 1: Upload the file
    print(f"1. Uploading file: {TEST_FILE_PATH}")

    try:
        with open(TEST_FILE_PATH, "rb") as f:
            files = {"file": (TEST_FILE_PATH, f, "text/plain")}
            response = requests.post(
                f"{API_BASE_URL}/api/data", headers=headers, files=files
            )

        if response.status_code != 200:
            print(f"❌ Upload failed: {response.status_code} - {response.text}")
            return

        upload_result = response.json()
        data_id = upload_result.get("data_id")
        print(f"✅ File uploaded successfully. Data ID: {data_id}")

    except Exception as e:
        print(f"❌ Upload error: {str(e)}")
        return

    # Step 2: Trigger analysis
    print(f"\n2. Triggering analysis for data_id: {data_id}")

    try:
        analysis_payload = {
            "data_id": data_id,
            "llm_provider": "gemini",
            "llm_model": "models/gemini-2.5-flash",
        }

        response = requests.post(
            f"{API_BASE_URL}/api/analyze",
            headers={**headers, "Content-Type": "application/json"},
            json=analysis_payload,
        )

        if response.status_code != 200:
            print(f"❌ Analysis failed: {response.status_code} - {response.text}")
            return

        analysis_result = response.json()
        result_id = analysis_result.get("result_id")
        print(f"✅ Analysis started successfully. Result ID: {result_id}")

    except Exception as e:
        print(f"❌ Analysis error: {str(e)}")
        return

    # Step 3: Poll for results
    print(f"\n3. Polling for analysis results...")

    max_attempts = 30  # 5 minutes max
    attempt = 0

    while attempt < max_attempts:
        try:
            response = requests.get(
                f"{API_BASE_URL}/api/results/{result_id}", headers=headers
            )

            if response.status_code != 200:
                print(f"❌ Results fetch failed: {response.status_code}")
                break

            result = response.json()
            status = result.get("status", "unknown")

            print(f"   Attempt {attempt + 1}: Status = {status}")

            if status == "completed":
                print(f"✅ Analysis completed!")

                # Check for stakeholder intelligence
                stakeholder_intelligence = result.get("results", {}).get(
                    "stakeholder_intelligence"
                )

                if stakeholder_intelligence:
                    detected_stakeholders = stakeholder_intelligence.get(
                        "detected_stakeholders", []
                    )
                    print(f"✅ Stakeholder intelligence found!")
                    print(f"   - Detected stakeholders: {len(detected_stakeholders)}")

                    for i, stakeholder in enumerate(detected_stakeholders):
                        print(
                            f"   - Stakeholder {i+1}: {stakeholder.get('stakeholder_id', 'Unknown')}"
                        )

                    # Print the frontend URL
                    print(f"\n🌐 Frontend URL:")
                    print(
                        f"   http://localhost:3000/unified-dashboard?analysisId={result_id}&visualizationTab=themes"
                    )

                else:
                    print(f"❌ No stakeholder intelligence found in results")
                    print(
                        f"   Available keys: {list(result.get('results', {}).keys())}"
                    )

                break

            elif status == "failed":
                print(f"❌ Analysis failed")
                error = result.get("results", {}).get("error", "Unknown error")
                print(f"   Error: {error}")
                break

            else:
                # Still processing, wait and try again
                time.sleep(10)
                attempt += 1

        except Exception as e:
            print(f"❌ Polling error: {str(e)}")
            break

    if attempt >= max_attempts:
        print(f"⏰ Timeout waiting for analysis to complete")


if __name__ == "__main__":
    upload_file_and_analyze()
