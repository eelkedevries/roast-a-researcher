#!/usr/bin/env bash
# One-shot helper: sets this repository's GitHub Actions deploy secrets (the
# SiteGround connection used by deploy-site.yml) via the GitHub CLI.
#
# GitHub Actions secrets are write-only, so they cannot be copied from the
# eelkedevries.com repository automatically — this script asks for the same
# values once and sets them all. Run it locally, from this repository's clone,
# on the machine that holds the deploy key:
#
#   bash scripts/setup-deploy-secrets.sh            # current repository
#   bash scripts/setup-deploy-secrets.sh owner/name # or an explicit repository
#
# Requires the GitHub CLI (https://cli.github.com), logged in via `gh auth login`.
set -euo pipefail

command -v gh >/dev/null 2>&1 \
  || { echo "The GitHub CLI (gh) is required: https://cli.github.com" >&2; exit 1; }
gh auth status >/dev/null 2>&1 \
  || { echo "Not logged in to GitHub: run 'gh auth login' first." >&2; exit 1; }

repo_flag=()
if [[ -n "${1:-}" ]]; then
  repo_flag=(-R "$1")
fi

echo "Values must match the eelkedevries.com repository's deploy secrets."
read -r -p "SSH host (REMOTE_HOST): " host
read -r -p "SSH user (REMOTE_USER): " user
read -r -p "SSH port (REMOTE_PORT) [22]: " port
port="${port:-22}"
read -r -p "Absolute document root of eelkedevries.com (REMOTE_PATH_PRODUCTION): " docroot
default_key="$HOME/.ssh/id_ed25519"
read -r -p "Deploy key file (private half) [$default_key]: " key
key="${key:-$default_key}"
[[ -f "$key" ]] || { echo "Key file not found: $key" >&2; exit 1; }
read -r -s -p "Key passphrase (leave empty if none): " pass
echo

gh secret set REMOTE_HOST "${repo_flag[@]}" --body "$host"
gh secret set REMOTE_USER "${repo_flag[@]}" --body "$user"
gh secret set REMOTE_PORT "${repo_flag[@]}" --body "$port"
gh secret set REMOTE_PATH_PRODUCTION "${repo_flag[@]}" --body "$docroot"
gh secret set SSH_PRIVATE_KEY "${repo_flag[@]}" < "$key"
if [[ -n "$pass" ]]; then
  gh secret set SSH_KEY_PASSPHRASE "${repo_flag[@]}" --body "$pass"
fi

# Pin the host key now if the host is reachable; otherwise the workflow's own
# run-time ssh-keyscan covers it.
if known=$(ssh-keyscan -T 15 -p "$port" "$host" 2>/dev/null) && [[ -n "$known" ]]; then
  gh secret set SSH_KNOWN_HOSTS "${repo_flag[@]}" --body "$known"
  echo "SSH_KNOWN_HOSTS pinned from a live ssh-keyscan."
else
  echo "ssh-keyscan returned nothing; skipping SSH_KNOWN_HOSTS (the workflow scans at run time)."
fi

echo "Done: deploy secrets set. Trigger 'Deploy Site' from the Actions tab (or push to main) to publish."
