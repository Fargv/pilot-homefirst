#!/usr/bin/env bash
# =============================================================================
# run_migration.sh
# Ejecuta los 3 scripts de migración en orden.
#
# USO:
#   bash run_migration.sh           → dry-run (solo muestra qué haría)
#   bash run_migration.sh --apply   → aplica los cambios en MongoDB
#
# REQUISITOS:
#   - Node.js >= 18
#   - Variable MONGODB_URI definida en backend/.env  (o ya exportada en shell)
#   - Ejecutar desde la raíz del repo:  bash backend/scripts/db-migration/run_migration.sh
# =============================================================================

set -euo pipefail

APPLY_FLAG="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$BACKEND_DIR/.env"

# ── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║          HomeFirst — DB Migration Runner                 ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ── Verificar que .env existe (los scripts Node lo cargan solos via dotenv) ───
if [ -f "$ENV_FILE" ]; then
  echo -e "${GREEN}✓  .env encontrado en $ENV_FILE${RESET}"
  echo -e "${CYAN}  (las variables las carga cada script Node internamente via dotenv)${RESET}"
else
  echo -e "${RED}✗  No se encontró $ENV_FILE — los scripts no podrán conectar a MongoDB${RESET}"
  exit 1
fi

# ── Modo ──────────────────────────────────────────────────────────────────────
if [ "$APPLY_FLAG" = "--apply" ]; then
  echo -e "${RED}${BOLD}⚠  MODO APPLY — Los cambios SE ESCRIBIRÁN en MongoDB${RESET}"
  echo ""
  read -r -p "¿Seguro que quieres aplicar? Escribe 'si' para confirmar: " CONFIRM
  if [ "$CONFIRM" != "si" ]; then
    echo "Cancelado."
    exit 0
  fi
  echo ""
else
  echo -e "${YELLOW}▸ MODO DRY-RUN — Solo se mostrará lo que haría cada script${RESET}"
  echo -e "${YELLOW}  Pasa --apply para ejecutar de verdad${RESET}"
fi

echo ""

# ── Función para ejecutar un script ──────────────────────────────────────────
run_script() {
  local num="$1"
  local file="$2"
  local desc="$3"

  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${CYAN}${BOLD}[$num/3] $desc${RESET}"
  echo -e "${CYAN}        $file${RESET}"
  echo ""

  if [ "$APPLY_FLAG" = "--apply" ]; then
    node --experimental-vm-modules "$SCRIPT_DIR/$file" --apply
  else
    node --experimental-vm-modules "$SCRIPT_DIR/$file"
  fi

  echo ""
  echo -e "${GREEN}✓  Script $num completado${RESET}"
  echo ""
}

# ── Ejecutar los 3 scripts ────────────────────────────────────────────────────
run_script "1" "01_fix_master_ingredients.js" \
  "Merge duplicados + canonicalNames + archivar Pilpil"

run_script "2" "02_enrich_catalog_steps.js" \
  "Enrichment steps: Pack Mediterráneo + Mexicano (18 dishes)"

run_script "3" "03_enrich_master_dishes.js" \
  "Enrichment recipes: 45 master dishes"

# ── Resumen ───────────────────────────────────────────────────────────────────
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
if [ "$APPLY_FLAG" = "--apply" ]; then
  echo -e "${BOLD}║  ${GREEN}✅ MIGRACIÓN COMPLETADA — Cambios aplicados en DB${RESET}${BOLD}      ║${RESET}"
else
  echo -e "${BOLD}║  ${YELLOW}DRY-RUN completado — ejecuta con --apply para aplicar${RESET}${BOLD} ║${RESET}"
fi
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"
echo ""
