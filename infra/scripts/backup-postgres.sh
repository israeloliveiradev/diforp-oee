#!/bin/sh
# Copia o Postgres do compose diforp-oee. Não restaura sozinho.
# Uso, na pasta do projeto na VPS: ./infra/scripts/backup-postgres.sh /var/backups/diforp-oee
set -eu
DEST="${1:-./backups}"
mkdir -p "$DEST"
ARQ="$DEST/oee-$(date +%F-%H%M).sql.gz"
docker compose -p diforp-oee exec -T postgres pg_dump -U "${POSTGRES_USER:-oee}" "${POSTGRES_DB:-oee}" | gzip > "$ARQ"
echo "cópia em $ARQ"
echo "para restaurar em um banco vazio: gunzip -c $ARQ | docker compose -p diforp-oee exec -T postgres psql -U ${POSTGRES_USER:-oee} -d ${POSTGRES_DB:-oee}"
