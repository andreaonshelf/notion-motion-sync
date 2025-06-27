#!/bin/bash
cd /Users/andreavillani/notion-motion-sync
git add -A
git commit -F commit-recovery.txt
git push
rm commit-recovery.txt deploy-recovery.sh