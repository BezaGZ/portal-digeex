#!/usr/bin/env bash
# Importación de items PEAC vía Simple Archive Format (SAF)
# Usa dspace import CLI para archivos grandes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SAF_DIR="$SCRIPT_DIR/saf-peac"

if [ -f "$SCRIPT_DIR/../docker/.env" ]; then
  source "$SCRIPT_DIR/../docker/.env"
elif [ -f "$SCRIPT_DIR/.env" ]; then
  source "$SCRIPT_DIR/.env"
fi

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@digeex.gob.gt}"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Verificar que existe la estructura SAF
if [ ! -d "$SAF_DIR" ]; then
  log_error "No se encontró el directorio SAF: $SAF_DIR"
fi

ITEM_COUNT=$(find "$SAF_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
log_info "Preparando importación de $ITEM_COUNT items desde SAF"

# Obtener UUID de Collection PEAC
log_info "Obteniendo UUID de Collection PEAC..."

COLLECTIONS_RESPONSE=$(curl -s "http://localhost:8080/server/api/core/collections?size=100")

PEAC_UUID=$(echo "$COLLECTIONS_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for col in data.get('_embedded', {}).get('collections', []):
    if col.get('metadata', {}).get('dc.subject', [{}])[0].get('value') == 'PEAC':
        print(col['uuid']); break
")

if [ -z "$PEAC_UUID" ]; then
  log_error "No se encontró Collection PEAC. Ejecutar ./scripts/setup-dspace.sh primero."
fi

log_success "Collection PEAC UUID: $PEAC_UUID"

# Copiar SAF al contenedor
log_info "Copiando archivos al contenedor..."
docker cp "$SAF_DIR" dspace:/tmp/saf-peac

log_success "Archivos copiados"

# Importar vía CLI
log_info "Importando items..."
echo ""

docker exec dspace /dspace/bin/dspace import \
  --add \
  --eperson="$ADMIN_EMAIL" \
  --collection="$PEAC_UUID" \
  --source=/tmp/saf-peac \
  --mapfile=/tmp/peac-mapfile.txt

echo ""
log_success "Importación completada"

# Limpiar archivos temporales del contenedor
log_info "Limpiando archivos temporales..."
docker exec dspace rm -rf /tmp/saf-peac

log_success "Limpieza completada"

# Verificar items importados
log_info "Verificando items importados..."

ITEMS_RESPONSE=$(curl -s "http://localhost:8080/server/api/discover/search/objects?scope=$PEAC_UUID&size=20")

ITEMS_COUNT=$(echo "$ITEMS_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
objects = data.get('_embedded', {}).get('searchResult', {}).get('_embedded', {}).get('objects', [])
items = [obj for obj in objects if obj.get('_embedded', {}).get('indexableObject', {}).get('type') == 'item']
print(len(items))
")

echo ""
echo "==========================================="
echo " Importación PEAC completada"
echo "==========================================="
echo ""
echo "Collection PEAC: $PEAC_UUID"
echo "Items importados: $ITEMS_COUNT"
echo ""
echo "Verificar en: http://localhost:4200 → Click en 'PEAC'"
echo ""
