#!/usr/bin/env bash
#
# Déploie le simulateur FreelanceDream sur un VPS Debian/Ubuntu :
# Node, clone/pull du repo, service systemd, exposition via Nginx.
#
# Deux modes, à lancer SUR le VPS (en root ou via sudo) :
#
# 1. Domaine dédié (crée un site Nginx complet + certificat Let's Encrypt) :
#    curl -fsSL https://raw.githubusercontent.com/Duddde/FreelanceDream/main/scripts/deploy-vps.sh | sudo bash -s -- simulateur.mondomaine.fr
#
# 2. Préfixe de chemin sur un domaine DÉJÀ servi par Nginx
#    (l'app existante reste à la racine, le simulateur vit sous le préfixe) :
#    curl -fsSL https://raw.githubusercontent.com/Duddde/FreelanceDream/main/scripts/deploy-vps.sh | sudo bash -s -- srv725641.hstgr.cloud /simulateur
#
# Relançable sans risque : chaque étape est idempotente, une nouvelle
# exécution met simplement l'app à jour et recharge les services.
set -euo pipefail

DOMAINE="${1:-}"
PREFIXE="${2:-}"
if [ -z "$DOMAINE" ]; then
  echo "Usage : deploy-vps.sh mondomaine.fr [/prefixe]" >&2
  exit 1
fi
if [ -n "$PREFIXE" ] && [ "${PREFIXE#/}" = "$PREFIXE" ]; then
  echo "Le préfixe doit commencer par / (ex. /simulateur)" >&2
  exit 1
fi
PREFIXE="${PREFIXE%/}" # tolère "/simulateur/" en entrée

if [ "$(id -u)" -ne 0 ]; then
  echo "Ce script doit être lancé en root (ou via sudo)." >&2
  exit 1
fi

APP="freelancedream"
DIR="/opt/${APP}"
REPO="https://github.com/Duddde/FreelanceDream.git"
PORT="${PORT:-3000}"
EMAIL="${EMAIL:-admin@${DOMAINE}}"

if [ -n "$PREFIXE" ]; then
  echo "── FreelanceDream → http(s)://${DOMAINE}${PREFIXE}/ (port interne ${PORT})"
else
  echo "── FreelanceDream → https://${DOMAINE} (port interne ${PORT})"
fi

# 1. Dépendances système ────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git nginx >/dev/null

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

sleep 1
if ! curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/"; then
  echo "⚠ L'app ne répond pas sur le port ${PORT} — il est peut-être déjà occupé" >&2
  echo "  par une autre application. Relance avec un autre port interne :" >&2
  echo "      curl -fsSL ... | sudo PORT=3001 bash -s -- ${DOMAINE} ${PREFIXE}" >&2
  journalctl -u "$APP" --no-pager -n 5 >&2 || true
  exit 1
fi

# 4. Nginx ──────────────────────────────────────────────────────────────
if [ -n "$PREFIXE" ]; then
  # ── Mode préfixe : on greffe un location dans le site existant ───────
  echo "── Ajout du préfixe ${PREFIXE}/ au site Nginx existant de ${DOMAINE}"
  mkdir -p /etc/nginx/snippets
  SNIPPET="/etc/nginx/snippets/${APP}.conf"
  cat > "$SNIPPET" <<SNIP
# Simulateur FreelanceDream sous ${PREFIXE}/ (géré par deploy-vps.sh)
location = ${PREFIXE} { return 301 ${PREFIXE}/; }
location ${PREFIXE}/ {
    # Le / final de proxy_pass retire le préfixe avant de transmettre.
    proxy_pass http://127.0.0.1:${PORT}/;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
}
SNIP

  # Trouve le fichier qui déclare le bloc server visé, via la config
  # effective (nginx -T voit tous les fichiers, où qu'ils soient).
  # Priorité : server_name explicite du domaine, sinon bloc default_server,
  # sinon catch-all server_name _.
  DUMP="$(nginx -T 2>/dev/null)"
  conf_pour() {
    printf '%s\n' "$DUMP" | awk -v pat="$1" '
      /^# configuration file/ { f = $4; sub(/:$/, "", f) }
      $0 !~ /^[[:space:]]*#/ && $0 ~ pat { print f; exit }'
  }
  DOMAINE_RE="${DOMAINE//./\\.}"
  # UNIQUE=1 : insérer une seule fois (un bloc peut avoir deux lignes
  # listen default_server, ipv4 + ipv6) ; sinon insérer après chaque
  # occurrence (blocs HTTP et HTTPS distincts du même fichier).
  UNIQUE=0
  ANCRE="server_name[^;]*${DOMAINE_RE}"
  CONF="$(conf_pour "$ANCRE")"
  if [ -z "$CONF" ]; then
    ANCRE="server_name[[:space:]][[:space:]]*_[[:space:]]*;"
    CONF="$(conf_pour "$ANCRE")"
  fi
  if [ -z "$CONF" ]; then
    ANCRE="listen[^;]*default_server"
    UNIQUE=1
    CONF="$(conf_pour "$ANCRE")"
  fi
  if [ -z "$CONF" ] || [ ! -f "$CONF" ]; then
    echo "⚠ Impossible de localiser le bloc server existant pour ${DOMAINE}." >&2
    echo "  Blocs présents dans la config Nginx :" >&2
    printf '%s\n' "$DUMP" | grep -nE "^# configuration file|^[[:space:]]*server_name" >&2 || true
    echo "  Ajoute manuellement cette ligne dans le bloc server concerné :" >&2
    echo "      include ${SNIPPET};" >&2
    exit 1
  fi

  if grep -q "snippets/${APP}.conf" "$CONF"; then
    echo "── Include déjà présent dans ${CONF}"
  else
    cp "$CONF" "${CONF}.avant-${APP}"
    if [ "$UNIQUE" -eq 1 ]; then
      sed -i "0,/${ANCRE}/{/${ANCRE}/a\\    include ${SNIPPET};
}" "$CONF"
    else
      sed -i "/${ANCRE}/a\\    include ${SNIPPET};" "$CONF"
    fi
    echo "── Include inséré dans ${CONF} (sauvegarde : ${CONF}.avant-${APP})"
  fi

  if nginx -t; then
    systemctl reload nginx
  else
    echo "⚠ nginx -t a échoué, restauration de la conf d'origine." >&2
    [ -f "${CONF}.avant-${APP}" ] && cp "${CONF}.avant-${APP}" "$CONF"
    nginx -t && systemctl reload nginx
    exit 1
  fi

  echo "── Déploiement terminé : http(s)://${DOMAINE}${PREFIXE}/"
else
  # ── Mode domaine dédié : site complet + certificat ───────────────────
  echo "── Configuration Nginx pour ${DOMAINE}"
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
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

  echo "── Certificat TLS (Let's Encrypt)"
  if certbot --nginx -d "$DOMAINE" --non-interactive --agree-tos -m "$EMAIL" --redirect; then
    echo "── OK : https://${DOMAINE}"
  else
    echo "⚠ certbot a échoué (DNS pas encore propagé ?). L'app reste accessible en HTTP :"
    echo "  http://${DOMAINE}"
    echo "  Relance plus tard : certbot --nginx -d ${DOMAINE} --redirect"
  fi
  echo "── Déploiement terminé."
fi

systemctl --no-pager --lines=0 status "$APP" || true
