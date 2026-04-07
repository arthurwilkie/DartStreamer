#!/usr/bin/env bash
# DartStreamer TLS certificate setup via Let's Encrypt
set -euo pipefail

DOMAIN="${DOMAIN:?DOMAIN env var required}"
EMAIL="${EMAIL:?EMAIL env var required}"
WEBROOT="${WEBROOT:-/var/www/certbot}"

echo "==> Installing certbot..."
apt-get update -qq
apt-get install -y -qq certbot

echo "==> Requesting certificate for ${DOMAIN}..."
mkdir -p "${WEBROOT}"

certbot certonly \
  --webroot \
  --webroot-path="${WEBROOT}" \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}" \
  --domain "${DOMAIN}"

echo "==> Certificate issued to /etc/letsencrypt/live/${DOMAIN}/"

echo "==> Setting up cron for auto-renewal..."
CRON_JOB="0 3 * * * certbot renew --quiet --webroot --webroot-path=${WEBROOT} && systemctl reload nginx 2>/dev/null || true"
(crontab -l 2>/dev/null | grep -v "certbot renew"; echo "${CRON_JOB}") | crontab -

echo "==> Done. Renewal cron installed."
