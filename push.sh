#!/bin/bash
# Push CropsIntelV2 to GitHub
cd "$(dirname "$0")"
git init
git branch -m main
git add -A
git commit -m "Initial commit — CropsIntelV2 autonomous platform"
git remote add origin https://github.com/muzammil691/CropsIntelV2.git
git push -u origin main
echo ""
echo "Done! Code pushed to https://github.com/muzammil691/CropsIntelV2"
