#!/usr/bin/env bash
set -euo pipefail

# Prepara uma VPS Ubuntu/Debian para o OEE (Docker Compose).
# Uso: sudo bash infra/scripts/vps-bootstrap.sh

if [[ $EUID -ne 0 ]]; then
  echo "Execute como root (sudo)."
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg git

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

systemctl enable --now docker
echo "Docker pronto. Copie .env.example para .env, defina GEMINI_API_KEY e JWT_SECRET, depois:"
echo "  docker compose up -d --build"
echo "  docker compose exec api python -m oee.seed --demo-dias 7"
echo "Login: gestao / gestao  ou  operador / operador"
