#!/bin/bash
cd /Users/andreavillani/notion-motion-sync
git add -A
git commit -F commit-scheduling.txt
git push
rm commit-scheduling.txt deploy-scheduling.sh