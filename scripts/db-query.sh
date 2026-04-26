#!/usr/bin/env bash
#
# Ejecuta un query SQL contra la BD de Supabase usando psql + SUPABASE_DB_URL.
#
# Uso:
#   ./scripts/db-query.sh "SELECT * FROM tasks LIMIT 5;"
#   ./scripts/db-query.sh -f path/to/file.sql
#   echo "SELECT 1;" | ./scripts/db-query.sh
#
# Requisitos:
#   - psql instalado (apt: postgresql-client)
#   - app/.env.local con SUPABASE_DB_URL (formato postgresql://...)
#     Sacar de Supabase Dashboard → Project Settings → Database → Connection string

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../app/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: no se encontró $ENV_FILE" >&2
  echo "Creá el archivo con SUPABASE_DB_URL=postgresql://..." >&2
  exit 1
fi

# Carga la variable sin contaminar el environment con todo .env.local
SUPABASE_DB_URL="$(grep -E '^SUPABASE_DB_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERROR: SUPABASE_DB_URL no está definida en $ENV_FILE" >&2
  exit 1
fi

if [[ "${1:-}" == "-f" ]]; then
  shift
  exec psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$1"
elif [[ -n "${1:-}" ]]; then
  exec psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "$1"
else
  # stdin
  exec psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1
fi
