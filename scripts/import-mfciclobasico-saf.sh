#!/bin/bash
# ============================================================================
# Importación SAF: Modalidades Flexibles - Ciclo Básico
# Importa 4 módulos (Etapa I y II) a la colección Modalidades Flexibles
# ============================================================================

set -e

# Cargar variables desde .env si existe
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/../docker/.env" ]; then
  source "$SCRIPT_DIR/../docker/.env"
elif [ -f "$SCRIPT_DIR/.env" ]; then
  source "$SCRIPT_DIR/.env"
fi

# Configuración
BASE_URL="${DSPACE_REST_URL:-http://localhost:8080/server}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@digeex.gob.gt}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin}"

COOKIES_FILE=$(mktemp)
trap "rm -f $COOKIES_FILE" EXIT

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ----------------------------------------------------------------------------
# Autenticación
# ----------------------------------------------------------------------------
log_info "Conectando a DSpace en $BASE_URL"

curl -s -c "$COOKIES_FILE" "$BASE_URL/api/authn/status" > /dev/null
CSRF_TOKEN=$(grep DSPACE-XSRF-COOKIE "$COOKIES_FILE" | awk '{print $NF}' || echo "")

if [ -z "$CSRF_TOKEN" ]; then
  log_error "No se obtuvo CSRF token. Verificar que DSpace este corriendo en $BASE_URL"
fi

log_info "Autenticando como $ADMIN_EMAIL"

LOGIN_RESPONSE=$(curl -s -i -X POST \
  -b "$COOKIES_FILE" -c "$COOKIES_FILE" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "user=$ADMIN_EMAIL&password=$ADMIN_PASSWORD" \
  "$BASE_URL/api/authn/login")

JWT=$(echo "$LOGIN_RESPONSE" | tr -d '\r' | grep -i "^Authorization:" | sed 's/^Authorization: Bearer //')

if [ -z "$JWT" ]; then
  log_error "Autenticacion fallo. Verificar credenciales en .env"
fi

log_success "Autenticacion correcta"
CSRF_TOKEN=$(grep DSPACE-XSRF-COOKIE "$COOKIES_FILE" | awk '{print $NF}')

# ----------------------------------------------------------------------------
# Obtener UUID de la colección Modalidades Flexibles
# ----------------------------------------------------------------------------
log_info "Buscando colección 'Modalidades Flexibles'..."

COLLECTIONS=$(curl -s -X GET \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/core/collections?size=100")

MF_UUID=$(echo "$COLLECTIONS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
collections = data.get('_embedded', {}).get('collections', [])
for c in collections:
    title = c.get('metadata', {}).get('dc.title', [{}])[0].get('value', '')
    if 'Modalidades Flexibles'.lower() in title.lower():
        print(c['uuid'])
        break
" 2>/dev/null)

if [ -z "$MF_UUID" ]; then
  log_error "No se encontró la colección 'Modalidades Flexibles'. Ejecutar setup-dspace.sh primero."
fi

log_success "Colección encontrada (UUID: $MF_UUID)"

# ----------------------------------------------------------------------------
# Importar SAF
# ----------------------------------------------------------------------------
SAF_DIR="$SCRIPT_DIR/saf-mf-ciclobasico"
SAF_NAME="saf-mf-ciclobasico"

if [ ! -d "$SAF_DIR" ]; then
  log_error "Directorio SAF no encontrado: $SAF_DIR"
fi

log_info "Importando items desde $SAF_DIR"
log_info "Destino: Modalidades Flexibles ($MF_UUID)"

# Contar items
ITEM_COUNT=$(find "$SAF_DIR" -mindepth 1 -maxdepth 1 -type d -name "item_*" | wc -l | tr -d ' ')
log_info "Items a importar: $ITEM_COUNT"

# Limpiar restos temporales de importaciones anteriores
log_info "Limpiando archivos temporales previos..."
docker exec dspace rm -rf "/tmp/$SAF_NAME" 2>/dev/null || true
docker exec dspace rm -f "/tmp/${SAF_NAME}-mapfile.txt" 2>/dev/null || true

# Copiar SAF al contenedor
log_info "Copiando SAF al contenedor Docker..."
docker cp "$SAF_DIR" "dspace:/tmp/$SAF_NAME"

# Ejecutar importación dentro del contenedor
log_info "Ejecutando importación..."
docker exec dspace /dspace/bin/dspace import \
  --add \
  --eperson="$ADMIN_EMAIL" \
  --collection="$MF_UUID" \
  --source="/tmp/$SAF_NAME" \
  --mapfile="/tmp/${SAF_NAME}-mapfile.txt"

# Verificar resultado
if [ $? -eq 0 ]; then
  log_success "Importación completada"

  # Limpiar temporales del contenedor
  log_info "Limpiando archivos temporales..."
  docker exec dspace rm -rf "/tmp/$SAF_NAME"

  # Verificar items en la colección
  log_info "Verificando items importados..."
  VERIFY_RESPONSE=$(curl -s "$BASE_URL/api/discover/search/objects?scope=$MF_UUID&size=50")
  ITEMS_IN_COLLECTION=$(echo "$VERIFY_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
objects = data.get('_embedded', {}).get('searchResult', {}).get('_embedded', {}).get('objects', [])
items = [obj for obj in objects if obj.get('_embedded', {}).get('indexableObject', {}).get('type') == 'item']
print(len(items))
" 2>/dev/null || echo "0")

  log_success "Items totales en Modalidades Flexibles: $ITEMS_IN_COLLECTION"
else
  log_error "Error durante la importación"
fi

# ----------------------------------------------------------------------------
# Resumen
# ----------------------------------------------------------------------------
echo ""
echo "==========================================="
echo " Importación SAF completada"
echo "==========================================="
echo ""
echo "Colección: Modalidades Flexibles"
echo "UUID: $MF_UUID"
echo "Items importados: $ITEM_COUNT"
echo ""
echo "Contenido:"
echo "  - Etapa I Módulo 1 (Ciclo Básico)"
echo "  - Etapa I Módulo 2 (Ciclo Básico)"
echo "  - Etapa II Módulo 1 (Ciclo Básico)"
echo "  - Etapa II Módulo 2 (Ciclo Básico)"
echo ""
echo "Verificar en: $BASE_URL/api/core/collections/$MF_UUID/items"
echo ""