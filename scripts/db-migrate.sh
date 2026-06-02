#!/usr/bin/env bash
#
# Aplica todas las migraciones pendientes en supabase/migrations/ en orden.
#
# Mantiene una tabla `_nanny_migrations` con los archivos ya aplicados.
# Las migraciones son idempotentes (usan IF NOT EXISTS, etc.) pero igual
# se chequea para no recorrer todo el set en cada run.
#
# Uso:
#   ./scripts/db-migrate.sh           → aplica las pendientes
#   ./scripts/db-migrate.sh --dry     → solo lista las pendientes sin aplicar
#   ./scripts/db-migrate.sh --status  → muestra estado actual

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
ENV_FILE="$REPO_ROOT/app/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: no se encontró $ENV_FILE" >&2
  exit 1
fi

SUPABASE_DB_URL="$(grep -E '^SUPABASE_DB_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERROR: SUPABASE_DB_URL no está definida en $ENV_FILE" >&2
  exit 1
fi

# Asegurar la tabla de tracking
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -c "
CREATE TABLE IF NOT EXISTS _nanny_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
" > /dev/null

# Lista archivos en orden
ALL_MIGRATIONS=()
while IFS= read -r line; do
  ALL_MIGRATIONS+=("$line")
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' -type f -printf '%f\n' | sort)

# Lista las ya aplicadas
APPLIED="$(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -tA -c "SELECT filename FROM _nanny_migrations ORDER BY filename;")"

PENDING=()
for f in "${ALL_MIGRATIONS[@]}"; do
  if ! grep -qx "$f" <<< "$APPLIED"; then
    PENDING+=("$f")
  fi
done

if [[ "${1:-}" == "--status" ]]; then
  echo "Total: ${#ALL_MIGRATIONS[@]} | Aplicadas: $(echo "$APPLIED" | grep -c '^' || true) | Pendientes: ${#PENDING[@]}"
  for f in "${PENDING[@]}"; do echo "  pending: $f"; done
  exit 0
fi

if [[ ${#PENDING[@]} -eq 0 ]]; then
  echo "Sin migraciones pendientes."
  exit 0
fi

echo "Pendientes (${#PENDING[@]}):"
for f in "${PENDING[@]}"; do echo "  $f"; done

if [[ "${1:-}" == "--dry" ]]; then
  echo "(dry run, no se aplicó nada)"
  exit 0
fi

echo ""
for f in "${PENDING[@]}"; do
  echo "→ aplicando $f"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$MIGRATIONS_DIR/$f"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -c "INSERT INTO _nanny_migrations(filename) VALUES('$f') ON CONFLICT DO NOTHING;" > /dev/null
  echo "  ✓ ok"
done

echo ""
echo "Listo. ${#PENDING[@]} migración(es) aplicadas."
