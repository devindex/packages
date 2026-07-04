#!/usr/bin/env bash

set -e

# Ensure there are no uncommitted changes (optional but recommended)
if [[ -n $(git status --porcelain) ]]; then
  echo "Error: Working directory is not clean. Please commit or stash your changes first."
  exit 1
fi

# Run tests before releasing
echo "Running tests..."
npm run test

echo "Enter release version (e.g., 1.0.1, patch, minor, major): "
read VERSION

read -p "Releasing version $VERSION - are you sure? (y/n) " -n 1 -r
echo    # move to a new line
if [[ $REPLY =~ ^[Yy]$ ]]
then
  echo "Releasing version $VERSION ..."

  # npm version updates package.json, creates commit and git tag automatically
  # The --allow-same-version flag prevents errors if the version is already at the requested version
  npm version $VERSION --allow-same-version -m "chore: release %s"

  # push commits and created tags
  git push --follow-tags

  # publish package to npm
  npm publish --access public
  
  echo "Version $VERSION successfully released and published!"
fi
