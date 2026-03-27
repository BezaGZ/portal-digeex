#!/usr/bin/env bash
# Importación de Videos y Álbumes vía Simple Archive Format (SAF)
#
# Videos  → Collection "Modalidades Flexibles"
# Álbumes → Collection "Galería Institucional"
#
# Uso:
#   chmod +x scripts/import-media-saf.sh
#   ./scripts/import-media-saf.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SAF_VIDEOS="$SCRIPT_DIR/saf-videos"
SAF_ALBUMS="$SCRIPT_DIR/saf-albums"

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

# ─── Función para obtener UUID de una Collection por dc.title ────────────────
get_collection_uuid() {
  local TITLE="$1"
  local RESPONSE=$(curl -s "http://localhost:8080/server/api/core/collections?size=100")

  local UUID=$(echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
name = '$TITLE'
for col in data.get('_embedded', {}).get('collections', []):
    title = col.get('metadata', {}).get('dc.title', [{}])[0].get('value', '')
    if name.lower() in title.lower():
        print(col['uuid']); break
")

  echo "$UUID"
}

# ─── Función para limpiar archivos temporales de importación ─────────────────
clean_temp_files() {
  local SAF_NAME="$1"
  log_info "Limpiando archivos temporales de $SAF_NAME..."
  docker exec dspace rm -rf "/tmp/$SAF_NAME" 2>/dev/null || true
  docker exec dspace rm -f "/tmp/${SAF_NAME}-mapfile.txt" 2>/dev/null || true
}

# ─── Función para importar un directorio SAF a una Collection ────────────────
import_saf() {
  local SAF_DIR="$1"
  local COLLECTION_UUID="$2"
  local COLLECTION_NAME="$3"
  local SAF_NAME=$(basename "$SAF_DIR")

  if [ ! -d "$SAF_DIR" ]; then
    log_error "No se encontró el directorio SAF: $SAF_DIR"
  fi

  local ITEM_COUNT=$(find "$SAF_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')

  if [ "$ITEM_COUNT" -eq 0 ]; then
    log_warning "No hay items en $SAF_DIR — saltando"
    return
  fi

  log_info "Importando $ITEM_COUNT items a $COLLECTION_NAME..."

  # Limpiar restos temporales de importaciones anteriores
  clean_temp_files "$SAF_NAME"

  # Copiar SAF al contenedor
  docker cp "$SAF_DIR" "dspace:/tmp/$SAF_NAME"

  # Importar vía CLI
  docker exec dspace /dspace/bin/dspace import \
    --add \
    --eperson="$ADMIN_EMAIL" \
    --collection="$COLLECTION_UUID" \
    --source="/tmp/$SAF_NAME" \
    --mapfile="/tmp/${SAF_NAME}-mapfile.txt"

  # Limpiar temporales
  docker exec dspace rm -rf "/tmp/$SAF_NAME"

  # Verificar
  local ITEMS_RESPONSE=$(curl -s "http://localhost:8080/server/api/discover/search/objects?scope=$COLLECTION_UUID&size=50")
  local ITEMS_COUNT=$(echo "$ITEMS_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
objects = data.get('_embedded', {}).get('searchResult', {}).get('_embedded', {}).get('objects', [])
items = [obj for obj in objects if obj.get('_embedded', {}).get('indexableObject', {}).get('type') == 'item']
print(len(items))
")

  log_success "$COLLECTION_NAME: $ITEMS_COUNT items totales en la colección"
}

# ═══════════════════════════════════════════════════════════════════════════════
# INICIO DE IMPORTACIÓN
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "==========================================="
echo " Importación de Videos y Álbumes — SAF"
echo "==========================================="
echo ""

# ─── 1. Obtener UUIDs de Collections ─────────────────────────────────────────
log_info "Buscando colecciones en DSpace..."

MODALIDADES_UUID=$(get_collection_uuid "Modalidades Flexibles")
if [ -z "$MODALIDADES_UUID" ]; then
  log_error "No se encontró Collection 'Modalidades Flexibles'. Ejecutar ./scripts/setup-dspace.sh primero."
fi
log_success "Modalidades Flexibles UUID: $MODALIDADES_UUID"

GALERIA_UUID=$(get_collection_uuid "Galería Institucional")
if [ -z "$GALERIA_UUID" ]; then
  log_error "No se encontró Collection 'Galería Institucional'. Ejecutar ./scripts/setup-dspace.sh primero."
fi
log_success "Galería Institucional UUID: $GALERIA_UUID"

echo ""

# ─── 2. Importar Videos → Modalidades Flexibles ─────────────────────────────
import_saf "$SAF_VIDEOS" "$MODALIDADES_UUID" "Modalidades Flexibles (Videos)"

echo ""

# ─── 3. Importar Álbumes → Galería Institucional ────────────────────────────
import_saf "$SAF_ALBUMS" "$GALERIA_UUID" "Galería Institucional (Álbumes)"

echo ""
echo "==========================================="
echo " Importación completada"
echo "==========================================="
echo ""
echo "Videos:  2 items → Modalidades Flexibles ($MODALIDADES_UUID)"
echo "Álbumes: 2 items → Galería Institucional ($GALERIA_UUID)"
echo ""
