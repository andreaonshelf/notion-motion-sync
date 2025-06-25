#!/bin/bash

# Script to fix phantom Motion IDs in the Notion-Motion sync system

echo "🔍 Checking for phantom Motion IDs..."
echo ""

# First, verify which IDs are phantom
echo "Verifying phantom IDs..."
curl -s https://notion-motion-sync-production.up.railway.app/diagnostic/verify-phantom-ids | jq '.'

echo ""
echo "📋 If phantom IDs were found, press Enter to fix them (or Ctrl+C to cancel)..."
read

# Fix the phantom IDs
echo "🔧 Fixing phantom Motion IDs..."
curl -X POST -s https://notion-motion-sync-production.up.railway.app/diagnostic/fix-broken-motion-ids | jq '.'

echo ""
echo "✅ Done! The next sync cycle will create proper Motion tasks for these items."