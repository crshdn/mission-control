#!/bin/bash

echo "🔍 Verifying MC Dashboard Phase 2 Features"
echo "========================================="
echo

BASE_URL="http://localhost:4000"

echo "✅ Testing QC Metrics endpoint..."
curl -s "${BASE_URL}/api/qc/metrics" | jq '.' > /dev/null && echo "   QC Metrics: WORKING" || echo "   QC Metrics: FAILED"

echo "✅ Testing QC Decisions endpoint..."
curl -s "${BASE_URL}/api/qc/decisions" | jq '.' > /dev/null && echo "   QC Decisions: WORKING" || echo "   QC Decisions: FAILED"

echo "✅ Testing QC Patterns endpoint..."
curl -s "${BASE_URL}/api/qc/patterns" | jq '.' > /dev/null && echo "   QC Patterns: WORKING" || echo "   QC Patterns: FAILED"

echo "✅ Testing API Usage Summary endpoint..."
curl -s "${BASE_URL}/api/usage/summary" | jq '.' > /dev/null && echo "   Usage Summary: WORKING" || echo "   Usage Summary: FAILED"

echo "✅ Testing API Usage Alerts endpoint..."
curl -s "${BASE_URL}/api/usage/alerts" | jq '.' > /dev/null && echo "   Usage Alerts: WORKING" || echo "   Usage Alerts: FAILED"

echo "✅ Testing Bug Reports endpoint..."
curl -s "${BASE_URL}/api/bugs" | jq '.' > /dev/null && echo "   Bug Reports: WORKING" || echo "   Bug Reports: FAILED"

echo "✅ Testing Docs Library endpoint..."
curl -s "${BASE_URL}/api/docs/library" | jq '.' > /dev/null && echo "   Docs Library: WORKING" || echo "   Docs Library: FAILED"

echo
echo "🌐 Dashboard should be available at: ${BASE_URL}"
echo "   Navigate to any workspace to see the new Phase 2 tabs:"
echo "   - QC Process"
echo "   - API Monitor"  
echo "   - Bug Reports"
echo "   - Docs Library"
echo
echo "✅ Phase 2 verification complete!"