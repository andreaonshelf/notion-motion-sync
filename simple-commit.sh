#!/bin/bash
cd /Users/andreavillani/notion-motion-sync
git add -A
git commit -m "Fix sync issues: polling intervals and phantom Motion ID cleanup

- Fix polling interval: was running fast sync every 3 seconds instead of 60
- Add phantom Motion ID cleanup to handle IDs pointing to non-existent Motion tasks
- Handle case when Motion API returns 0 tasks but database has Motion IDs
- Ensure Motion IDs are cleared when Motion is empty

This fixes orphaned Motion IDs and restores proper sync intervals.

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
git push
rm commit-message4.txt
rm simple-commit.sh