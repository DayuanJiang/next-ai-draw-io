#!/bin/bash
set -e

BRANCH_NAME="$1"

cd /tmp/next-ai-draw-io

# Configure git
git config user.name "DayuanJiang"
git config user.email "jdy.toh@gmail.com"

echo "=== Current git status ==="
git status

echo "=== Checking out branch: ${BRANCH_NAME} ==="
git checkout ${BRANCH_NAME} || git checkout -b ${BRANCH_NAME}

echo "=== Setting remote URL to use SSH ==="
git remote set-url origin git@github.com:DayuanJiang/next-ai-draw-io.git

echo "=== Remote URL configured ==="
git remote -v

# Commit any local changes if needed
git add -A || true
git diff --cached --quiet || git commit -m "Auto-commit before push" || true

echo "=== Adding GitHub to known hosts ==="
ssh-keyscan -H github.com >> ~/.ssh/known_hosts 2>/dev/null || true

echo "=== Testing SSH connection to GitHub ==="
ssh -T git@github.com 2>&1 || true

echo "=== Pushing branch ${BRANCH_NAME} to GitHub ==="
git push -u origin ${BRANCH_NAME}

echo "=== Push successful! ==="

# Clean up
echo "=== Cleaning up ==="
cd /tmp
rm -rf next-ai-draw-io

echo "Done!"
