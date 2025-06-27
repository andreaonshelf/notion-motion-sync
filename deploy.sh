#!/bin/bash
cd /Users/andreavillani/notion-motion-sync
git add -A
git commit -F commit-final.txt
git push
rm commit-final.txt deploy.sh