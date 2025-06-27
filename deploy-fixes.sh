#!/bin/bash
cd /Users/andreavillani/notion-motion-sync
git add -A
git commit -F commit-fixes.txt
git push
rm commit-fixes.txt deploy-fixes.sh