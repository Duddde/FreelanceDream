#!/usr/bin/env bash
#
# Déploie le simulateur FreelanceDream sur un VPS Debian/Ubuntu :
# Node, clone/pull du repo, service systemd, Nginx en reverse proxy,
# certificat TLS Let's Encrypt.
#
# Usage (à lancer SUR le VPS, en root ou via sudo) :
#   curl -fsSL https://raw.githubusercontent.com/Duddde/FreelanceDream/main/scripts/deploy-vps.sh | bash -s -- votredomaine.fr
#
# Relançable sans risque : chaque étape est idempotente, une nouvelle
# exécution met simplement l'app à jour et recharge les services.
set -euo pipefail

DOMAINE="${1:-}"
if [ -z "$DOMAINE" ]; then
  echo "Usage : deploy-vps.sh votredomaine.fr" >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Ce script doit être lancé en root (ou via sudo)." >&2
  exit 1
fi

APP="freelancedream"
DIR="/opt/${APP}"
REPO="https://github.com/Duddde/FreelanceDream.git"
PORT="${PORT:-3000}"
EMAIL="${EMAIL:-admin@${DOMAINE}}"

echo "── FreelanceDream → https://${DOMAINE} (port interne ${PORT})"

# 1. Dépendances système ────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git nginx certbot python3-certbot-nginx >/dev/null

if ! command -v node >/dev/null 2>&1 || [ "$(node -e 'console.log(process.versions.node.split(".")[0])')" -lt 18 ]; then
  echo "── Installation de Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

# 2. Code : clone initial ou mise à jour ────────────────────────────────
if [ -d "${DIR}/.git" ]; then
  echo "── Mise à jour du code"
  git -C "$DIR" fetch origin main
  git -C "$DIR" reset --hard origin/main
else
  echo "── Clone du repo"
  git clone --branch main "$REPO" "$DIR"
fi

# 3. Service systemd ────────────────────────────────────────────────────
echo "── Service systemd ${APP}"
cat > "/etc/systemd/system/${APP}.service" <<UNIT
[Unit]
Description=Simulateur FreelanceDream
After=network.target

[Service]
Type=simple
WorkingDirectory=${DIR}
Environment=PORT=${PORT}
ExecStart=$(command -v node) ${DIR}/server.js
Restart=always
RestartSec=3
User=www-data
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now "$APP" >/dev/null 2>&1
systemctl restart "$APP"

# 4. Nginx en reverse proxy ─────────────────────────────────────────────
echo "── Configuration Nginx pour ${DOMAINE}"
cat > "/etc/nginx/sites-available/${APP}" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAINE};

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
ln -sf "/etc/nginx/sites-available/${APP}" "/etc/nginx/sites-enabled/${APP}"
nginx -t
systemctl reload nginx

# 5. TLS Let's Encrypt ──────────────────────────────────────────────────
echo "── Certificat TLS (Let's Encrypt)"
if certbot --nginx -d "$DOMAINE" --non-interactive --agree-tos -m "$EMAIL" --redirect; then
  echo "── OK : https://${DOMAINE}"
else
  echo "⚠ certbot a échoué (DNS pas encore propagé ?). L'app reste accessible en HTTP :"
  echo "  http://${DOMAINE}"
  echo "  Relance plus tard : certbot --nginx -d ${DOMAINE} --redirect"
fi

systemctl --no-pager --lines=0 status "$APP" || true
echo "── Déploiement terminé."
