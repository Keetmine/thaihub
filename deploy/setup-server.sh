#!/bin/bash
# Первичная настройка чистого Ubuntu-сервера под MyBLHub.
# Запуск (на сервере, под root): bash setup-server.sh
set -e

echo "== Docker =="
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "== Swap 2G (next build прожорлив, спасает от OOM на маленьких VPS) =="
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== Firewall: только SSH и HTTP/HTTPS =="
if command -v ufw >/dev/null; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

echo "== Готово. Дальше: git clone проекта, .env, docker compose up =="
