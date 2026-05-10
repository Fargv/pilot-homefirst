#!/usr/bin/env bash
# admin-subscription.sh
# Gestiona suscripciones de households desde git bash.
#
# Uso básico (interactivo):
#   bash scripts/admin-subscription.sh
#
# Uso directo (sin prompts):
#   bash scripts/admin-subscription.sh --household <id> --plan <free|basic|pro|premium|off>
#
# Variables de entorno opcionales:
#   API_URL      URL base del backend
#   ADMIN_EMAIL  Email del admin (por defecto: admin@admin.com)
#   ADMIN_PASS   Contraseña del admin (evita el prompt si se define)

set -euo pipefail

API_URL="${API_URL:-https://pilot-homefirst-backend-dev.onrender.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@admin.com}"
ADMIN_PASS="${ADMIN_PASS:-}"
ARG_HOUSEHOLD_ID=""
ARG_PLAN=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

while [[ $# -gt 0 ]]; do
  case "$1" in
    --household|-h) ARG_HOUSEHOLD_ID="$2"; shift 2 ;;
    --plan|-p)      ARG_PLAN="$2"; shift 2 ;;
    --api)          API_URL="$2"; shift 2 ;;
    --email)        ADMIN_EMAIL="$2"; shift 2 ;;
    --pass)         ADMIN_PASS="$2"; shift 2 ;;
    *) echo "Opción desconocida: $1"; exit 1 ;;
  esac
done

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║  Lunchfy Admin — Suscripciones       ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════╝${NC}"
echo -e "  API: ${CYAN}${API_URL}${NC}"
echo ""

if [ -z "$ADMIN_PASS" ]; then
  read -rsp "Contraseña de ${ADMIN_EMAIL}: " ADMIN_PASS
  echo ""
fi

# ── Login ───────────────────────────────────────────────────────────────────
echo -e "${YELLOW}› Iniciando sesión...${NC}"
LOGIN_RESPONSE=$(curl -sf \
  -X POST "${API_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASS}\"}" 2>&1) || {
  echo -e "${RED}✗ No se pudo conectar con ${API_URL}${NC}"
  echo "  Comprueba que el backend esté arriba y que API_URL sea correcto."
  exit 1
}

if echo "$LOGIN_RESPONSE" | grep -q '"ok":false'; then
  ERR=$(echo "$LOGIN_RESPONSE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
  echo -e "${RED}✗ Login fallido: ${ERR}${NC}"
  exit 1
fi

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  echo -e "${RED}✗ No se recibió token${NC}"
  exit 1
fi

GLOBAL_ROLE=$(echo "$LOGIN_RESPONSE" | grep -o '"globalRole":"[^"]*"' | cut -d'"' -f4)
if [ "$GLOBAL_ROLE" != "diod" ]; then
  echo -e "${RED}✗ Este usuario no tiene permisos de admin (globalRole debe ser 'diod')${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Sesión iniciada${NC}"
echo ""

# ── Load households ─────────────────────────────────────────────────────────
echo -e "${YELLOW}› Cargando households...${NC}"
HH_RESPONSE=$(curl -sf \
  -X GET "${API_URL}/api/admin/households" \
  -H "Authorization: Bearer ${TOKEN}" 2>&1) || {
  echo -e "${RED}✗ Error al cargar households${NC}"
  exit 1
}

if echo "$HH_RESPONSE" | grep -q '"ok":false'; then
  ERR=$(echo "$HH_RESPONSE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
  echo -e "${RED}✗ ${ERR}${NC}"
  exit 1
}

# Parse: try python3, then python, then raw grep fallback
parse_households() {
  local json="$1"
  local PYCODE='
import json, sys
data = json.load(sys.stdin)
for i, h in enumerate(data.get("households", []), 1):
    plan = h.get("subscriptionPlan", "basic")
    status = h.get("subscriptionStatus", "inactive")
    members = h.get("memberCount", 0)
    print(f"{i}|{h[\"id\"]}|{h[\"name\"]}|{plan}|{status}|{members}")
'
  if command -v python3 &>/dev/null; then
    echo "$json" | python3 -c "$PYCODE" 2>/dev/null && return
  fi
  if command -v python &>/dev/null; then
    echo "$json" | python -c "$PYCODE" 2>/dev/null && return
  fi
  # Fallback: minimal grep parse (no memberCount/status)
  echo "$json" | grep -o '"id":"[^"]*","name":"[^"]*"' | awk -F'"' 'BEGIN{i=1}{print i"|"$4"|"$8"|?|?|?"; i++}'
}

PARSED=$(parse_households "$HH_RESPONSE")

if [ -z "$PARSED" ]; then
  echo -e "${RED}✗ No se encontraron households o no se pudo parsear la respuesta${NC}"
  exit 1
fi

echo ""
echo -e "${BOLD}Households disponibles:${NC}"
printf "  %-4s %-12s %-12s %6s  %s\n" "#" "Plan" "Estado" "Users" "Nombre"
echo "  ─────────────────────────────────────────────────────────────"

while IFS='|' read -r idx hid hname hplan hstatus hmembers; do
  printf "  [%-2s] %-12s %-12s %6s  %s\n" "$idx" "$hplan" "$hstatus" "$hmembers" "$hname"
done <<< "$PARSED"

echo ""

# ── Select household ─────────────────────────────────────────────────────────
HOUSEHOLD_ID="$ARG_HOUSEHOLD_ID"
HOUSEHOLD_NAME=""

if [ -z "$HOUSEHOLD_ID" ]; then
  read -rp "Número de household (o pega el ID directamente): " HH_CHOICE

  # Try numeric index first
  MATCHED=$(echo "$PARSED" | awk -F'|' -v choice="$HH_CHOICE" '$1 == choice {print $2 "|" $3}')
  if [ -n "$MATCHED" ]; then
    HOUSEHOLD_ID=$(echo "$MATCHED" | cut -d'|' -f1)
    HOUSEHOLD_NAME=$(echo "$MATCHED" | cut -d'|' -f2)
  else
    HOUSEHOLD_ID="$HH_CHOICE"
    HOUSEHOLD_NAME="(ID manual)"
  fi
fi

echo -e "  → Household: ${CYAN}${HOUSEHOLD_NAME:-$HOUSEHOLD_ID}${NC}"
echo ""

# ── Select plan ──────────────────────────────────────────────────────────────
PLAN="$ARG_PLAN"
if [ -z "$PLAN" ]; then
  echo -e "${BOLD}Planes disponibles:${NC}"
  echo "  [1] free     — Sin funciones premium"
  echo "  [2] basic    — Randomización por día"
  echo "  [3] pro      — Presupuesto + randomización completa  ★"
  echo "  [4] premium  — Igual que pro"
  echo "  [5] off      — Desactivar (resetea a basic/inactive)"
  echo ""
  read -rp "Selecciona plan [1-5] o nombre: " PLAN_CHOICE
  case "$PLAN_CHOICE" in
    1|free)    PLAN="free" ;;
    2|basic)   PLAN="basic" ;;
    3|pro)     PLAN="pro" ;;
    4|premium) PLAN="premium" ;;
    5|off)     PLAN="off" ;;
    *) echo -e "${RED}✗ Opción inválida${NC}"; exit 1 ;;
  esac
fi

echo ""

# ── Apply ────────────────────────────────────────────────────────────────────
if [ "$PLAN" = "off" ]; then
  echo -e "${YELLOW}› Desactivando suscripción...${NC}"
  RESULT=$(curl -sf \
    -X POST "${API_URL}/api/admin/subscription/deactivate" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"householdId\":\"${HOUSEHOLD_ID}\"}" 2>&1) || { echo -e "${RED}✗ Error de red${NC}"; exit 1; }
else
  echo -e "${YELLOW}› Activando plan ${BOLD}${PLAN}${NC}${YELLOW}...${NC}"
  RESULT=$(curl -sf \
    -X POST "${API_URL}/api/admin/subscription/activate" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"householdId\":\"${HOUSEHOLD_ID}\",\"plan\":\"${PLAN}\"}" 2>&1) || { echo -e "${RED}✗ Error de red${NC}"; exit 1; }
fi

if echo "$RESULT" | grep -q '"ok":true'; then
  FINAL_PLAN=$(echo "$RESULT" | grep -o '"subscriptionPlan":"[^"]*"' | head -1 | cut -d'"' -f4)
  FINAL_STATUS=$(echo "$RESULT" | grep -o '"subscriptionStatus":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo -e "${GREEN}✓ Suscripción actualizada${NC}"
  echo -e "  Plan:   ${BOLD}${FINAL_PLAN:-?}${NC}"
  echo -e "  Status: ${BOLD}${FINAL_STATUS:-?}${NC}"
else
  ERR=$(echo "$RESULT" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
  echo -e "${RED}✗ Error: ${ERR:-respuesta inesperada}${NC}"
  echo "$RESULT"
  exit 1
fi

echo ""
echo -e "${CYAN}Cambio aplicado. La app lo refleja en el próximo refresco.${NC}"
echo ""
