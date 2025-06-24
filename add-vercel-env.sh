#!/bin/bash

# Add environment variables to Vercel
echo "Adding environment variables to Vercel..."

vercel env add MOTION_API_KEY production < <(echo "PKgLtKL86SZ9RRt3IfcjL0n9/FOsg/oaEZ+r3Npz1Nw=")
vercel env add NOTION_API_KEY production < <(echo "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")
vercel env add NOTION_DATABASE_ID production < <(echo "21a6c10e5e2280cfacc3e6a4efb90505")
vercel env add WEBHOOK_SECRET production < <(echo "2ff12b8d57197635bcf636a60f674753f4f7b98e9762d6b226b4ce71b7d4648f")
vercel env add MOTION_API_URL production < <(echo "https://api.usemotion.com/v1/")

echo "Environment variables added!"