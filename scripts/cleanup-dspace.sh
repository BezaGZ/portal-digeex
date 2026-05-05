#!/bin/bash
# ============================================================================
# Limpieza de Communities en DSpace 9.2
# Elimina TODAS las comunidades top-level (y sus subcomunidades/colecciones)
#
# Uso:
#   1. Configurar credenciales en .env
#   2. Ejecutar: ./cleanup-dspace.sh
# ============================================================================

set -e

# Cargar variables desde .env si existe
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/../docker/.env" ]; then
  source "$SCRIPT_DIR/../docker/.env"
elif [ -f "$SCRIPT_DIR/.env" ]; then
  source "$SCRIPT_DIR/.env"
fi

BASE_URL="${DSPACE_REST_URL:-http://localhost:8080/server}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@digeex.gob.gt}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-bezaleelj1}"

COOKIES_FILE=$(mktemp)
trap "rm -f $COOKIES_FILE" EXIT

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Autenticacion
curl -s -c "$COOKIES_FILE" "$BASE_URL/api/authn/status" > /dev/null
CSRF_TOKEN=$(grep DSPACE-XSRF-COOKIE "$COOKIES_FILE" | awk '{print $NF}')

LOGIN_RESPONSE=$(curl -s -i -X POST \
  -b "$COOKIES_FILE" -c "$COOKIES_FILE" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "user=$ADMIN_EMAIL&password=$ADMIN_PASSWORD" \
  "$BASE_URL/api/authn/login")

JWT=$(echo "$LOGIN_RESPONSE" | tr -d '\r' | grep -i "^Authorization:" | sed 's/^Authorization: Bearer //')
CSRF_TOKEN=$(grep DSPACE-XSRF-COOKIE "$COOKIES_FILE" | awk '{print $NF}')

if [ -z "$JWT" ]; then
  echo "Error: autenticacion fallo. Verificar credenciales."
  exit 1
fi

# Obtener comunidades existentes
echo "Obteniendo comunidades..."
COMMUNITIES=$(curl -s -X GET \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/core/communities")

UUIDS=$(echo "$COMMUNITIES" | python3 -c "
import sys, json
data = json.load(sys.stdin)
communities = data.get('_embedded', {}).get('communities', [])
for c in communities:
    print(c['uuid'])
")

if [ -z "$UUIDS" ]; then
  echo "No hay comunidades para eliminar."
  exit 0
fi

COUNT=$(echo "$UUIDS" | wc -l | tr -d ' ')
echo "Encontradas $COUNT comunidades."

for UUID in $UUIDS; do
  NAME=$(curl -s -X GET \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    "$BASE_URL/api/core/communities/$UUID" | \
    python3 -c "import sys, json; print(json.load(sys.stdin).get('name', 'Sin nombre'))" 2>/dev/null || echo "Sin nombre")

  echo -n "  Eliminando: $NAME ($UUID)... "

  STATUS=$(curl -s -w "%{http_code}" -o /dev/null -X DELETE \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    "$BASE_URL/api/core/communities/$UUID")

  if [ "$STATUS" = "204" ]; then
    echo -e "${GREEN}OK${NC}"
  else
    echo "Error (HTTP $STATUS)"
  fi
done

echo ""
echo "Eliminando grupos del rol del portal (ADMIN_*, SUBMITTERS_*) y técnicos huérfanos (COMMUNITY_*_ADMIN, COLLECTION_*_SUBMIT)..."
# Los técnicos auto-nombrados deberían cascadear con la community/collection,
# pero si quedaron huérfanos de runs anteriores, este barrido los limpia.
ROLE_GROUPS=$(curl -s -X GET \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/eperson/groups?size=200" | \
  jq -r '._embedded.groups[] | select(.permanent == false and (.name | test("^(ADMIN_|SUBMITTERS_|COMMUNITY_|COLLECTION_)"))) | "\(.uuid)|\(.name)"')

if [ -n "$ROLE_GROUPS" ]; then
  echo "$ROLE_GROUPS" | while IFS='|' read -r G_UUID G_NAME; do
    echo -n "  Eliminando grupo: $G_NAME ($G_UUID)... "
    G_STATUS=$(curl -s -w "%{http_code}" -o /dev/null -X DELETE \
      -b "$COOKIES_FILE" \
      -H "Authorization: Bearer $JWT" \
      -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
      "$BASE_URL/api/eperson/groups/$G_UUID")
    if [ "$G_STATUS" = "204" ]; then
      echo -e "${GREEN}OK${NC}"
    else
      echo "Error (HTTP $G_STATUS)"
    fi
  done
else
  echo "  No hay grupos del portal para eliminar."
fi

echo ""
echo "Limpieza completada."

REMAINING=$(curl -s -X GET \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/core/communities" | grep -o '"totalElements" : [0-9]*' | grep -o '[0-9]*')
echo "Comunidades restantes: $REMAINING"
