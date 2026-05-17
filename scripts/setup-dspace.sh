#!/bin/bash
# ============================================================================
# Estructura DIGEEX en DSpace 9.2
# Crea la jerarquia de Communities y Collections via REST API
#
# Estructura:
#   DIGEEX (Top Community)
#     +-- Subdireccion de Educacion Basica
#     |     PEAC, PRONEA, Modalidades Flexibles, EVA
#     +-- Subdireccion para el Trabajo y la Cultura
#     |     CEMUCAF, PROBEFI, ETCAE, SCC
#     +-- Subdireccion de Formacion, Investigacion y Proyectos Educativos
#           Investigaciones, Experiencias Significativas, Datos Estadisticos,
#           Galeria Institucional, Informes de Gestion, Normativa y Acuerdos
#
# Uso:
#   1. Copiar .env.example a .env y configurar credenciales
#   2. Levantar DSpace: docker compose up -d
#   3. Esperar ~2 min a que DSpace inicialice
#   4. Ejecutar: ./setup-dspace.sh
# ============================================================================

set -e

# Cargar variables desde .env si existe
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/../docker/.env" ]; then
  source "$SCRIPT_DIR/../docker/.env"
elif [ -f "$SCRIPT_DIR/.env" ]; then
  source "$SCRIPT_DIR/.env"
fi

# Configuracion (usa .env si existe, si no usa defaults de desarrollo)
BASE_URL="${DSPACE_REST_URL:-http://localhost:8080/server}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@mineduc.gob.gt}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin}"

# Password compartido por los 6 seed users de subdirecciones (admin_subdireccion
# y personal_delegado de las 3 subs). En produccion se sobreescribe via .env y
# cada usuario lo cambia al primer login. En dev queda en digeex123 para pruebas.
SEED_PASSWORD="${SEED_PASSWORD:-digeex123}"

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
# Cuenta semilla (RN-01) — solo se crea si no existe
# ----------------------------------------------------------------------------
log_info "Verificando cuenta de administrador..."

# Intentar autenticar primero
TEST_AUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -c "$COOKIES_FILE" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "user=$ADMIN_EMAIL&password=$ADMIN_PASSWORD" \
  "$BASE_URL/api/authn/login")

if [ "$TEST_AUTH" != "200" ]; then
  log_info "Cuenta no existe, creando administrador (RN-01)..."
  docker exec dspace /dspace/bin/dspace create-administrator \
    -e "$ADMIN_EMAIL" \
    -f "Administrador" \
    -l "DIGEEX" \
    -p "$ADMIN_PASSWORD" \
    -c es
  log_success "Cuenta semilla creada: $ADMIN_EMAIL"
else
  log_success "Cuenta de administrador ya existe"
fi

# ----------------------------------------------------------------------------
# Autenticacion
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

JWT_LENGTH=${#JWT}
if [ "$JWT_LENGTH" -lt 100 ]; then
  log_error "JWT invalido ($JWT_LENGTH chars)"
fi

log_success "Autenticacion correcta"
CSRF_TOKEN=$(grep DSPACE-XSRF-COOKIE "$COOKIES_FILE" | awk '{print $NF}')

# ----------------------------------------------------------------------------
# Registro de dc.audience en metadata registry
# DSpace no lo trae por defecto (solo los 15 elementos DC core).
# Se usa para nivel educativo: Alfabetización, Primaria adultos, Básico, etc.
# ----------------------------------------------------------------------------
log_info "Verificando campo dc.audience en metadata registry..."

EXISTING_FIELDS=$(curl -s -X GET \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/core/metadatafields/search/byFieldName?schema=dc&element=audience")

HAS_AUDIENCE=$(echo "$EXISTING_FIELDS" | grep -c '"element" : "audience"' || true)

if [ "$HAS_AUDIENCE" -gt 0 ]; then
  log_success "dc.audience ya existe en metadata registry"
else
  log_info "Registrando dc.audience..."

  DC_SCHEMA_ID=$(curl -s -X GET \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    "$BASE_URL/api/core/metadataschemas" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for s in data.get('_embedded',{}).get('metadataschemas',[]):
    if s['prefix'] == 'dc':
        print(s['id']); break
")

  curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"element":"audience","qualifier":null,"scopeNote":"Nivel educativo del recurso: Alfabetización, Primaria adultos, Básico, Medio, Formación laboral, Todos"}' \
    "$BASE_URL/api/core/metadatafields?schemaId=$DC_SCHEMA_ID" > /dev/null

  log_success "dc.audience registrado"
fi

# ----------------------------------------------------------------------------
# Registro de schema custom: digeex
# Campos propios del portal que no encajan en Dublin Core estándar.
# Ver docs/07-sprints/sprint-05/01-refactor-metadata.md
# ----------------------------------------------------------------------------
log_info "Verificando schema digeex en metadata registry..."

EXISTING_SCHEMAS=$(curl -s -X GET \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/core/metadataschemas")

DIGEEX_SCHEMA_ID=$(echo "$EXISTING_SCHEMAS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for s in data.get('_embedded',{}).get('metadataschemas',[]):
    if s['prefix'] == 'digeex':
        print(s['id']); break
" 2>/dev/null)

if [ -n "$DIGEEX_SCHEMA_ID" ]; then
  log_success "Schema digeex ya existe (ID: $DIGEEX_SCHEMA_ID)"
else
  log_info "Registrando schema digeex..."

  DIGEEX_SCHEMA_RESPONSE=$(curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"prefix":"digeex","namespace":"https://portal.digeex.gob.gt/ns/"}' \
    "$BASE_URL/api/core/metadataschemas")

  DIGEEX_SCHEMA_ID=$(echo "$DIGEEX_SCHEMA_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('id',''))
" 2>/dev/null)

  if [ -z "$DIGEEX_SCHEMA_ID" ]; then
    log_error "No se pudo registrar schema digeex"
  fi

  log_success "Schema digeex registrado (ID: $DIGEEX_SCHEMA_ID)"
fi

# Registrar los 5 campos digeex si no existen
DIGEEX_FIELDS=(
  'navLocation|Ubicacion en navegacion del frontend: menu-principal o menu-secundario'
  'populationType|Tipo de poblacion predominante en fotografia institucional'
  'imageFocus|Contexto visual de la imagen: Infraestructura, Tecnologia, Agricultura'
  'sufijo|Sufijo identificador de la subdireccion (ej: ED_BASICA) usado para nombrar los grupos ADMIN_<sufijo> y SUBMITTERS_<sufijo>'
)

for field_entry in "${DIGEEX_FIELDS[@]}"; do
  FIELD_ELEMENT="${field_entry%%|*}"
  FIELD_SCOPE="${field_entry#*|}"

  EXISTING_FIELD=$(curl -s -X GET \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    "$BASE_URL/api/core/metadatafields/search/byFieldName?schema=digeex&element=$FIELD_ELEMENT")

  HAS_FIELD=$(echo "$EXISTING_FIELD" | grep -c "\"element\" : \"$FIELD_ELEMENT\"" || true)

  if [ "$HAS_FIELD" -gt 0 ]; then
    log_success "  digeex.$FIELD_ELEMENT ya existe"
  else
    curl -s -X POST \
      -b "$COOKIES_FILE" \
      -H "Authorization: Bearer $JWT" \
      -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"element\":\"$FIELD_ELEMENT\",\"qualifier\":null,\"scopeNote\":\"$FIELD_SCOPE\"}" \
      "$BASE_URL/api/core/metadatafields?schemaId=$DIGEEX_SCHEMA_ID" > /dev/null

    log_success "  digeex.$FIELD_ELEMENT registrado"
  fi
done

# ----------------------------------------------------------------------------
# Registro de entity-types DIGEEX (Documento, Galeria, Estadistica) via CLI.
# Las colecciones de abajo se marcan con dspace.entity.type apuntando a estos
# tipos. Los items heredan el tipo de su coleccion padre automaticamente.
# Idempotente: si los tres ya estan registrados, el bloque salta el CLI.
# ----------------------------------------------------------------------------
log_info "Registrando entity-types DIGEEX..."

EXISTING_TYPES_COUNT=$(curl -s -X GET \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/core/entitytypes?size=20" | grep -c '"label" : "Documento"' || true)

if [ "$EXISTING_TYPES_COUNT" = "0" ]; then
  docker exec dspace /dspace/bin/dspace initialize-entities \
    -f /dspace/config/entities/digeex-entity-types.xml > /dev/null
  log_success "Entity-types registrados: Documento, Galeria, Estadistica"
else
  log_success "Entity-types DIGEEX ya existen"
fi

# ----------------------------------------------------------------------------
# Verificacion de dc.title.alternative (sigla de programa / nombre corto de
# subdireccion). Es un qualifier nativo del schema dc en DSpace 9.x, asi que
# normalmente ya esta registrado; el check es defensivo para que un schema
# truncado no falle silenciosamente al crear comunidades y colecciones.
# ----------------------------------------------------------------------------
log_info "Verificando dc.title.alternative en el schema dc..."

EXISTING_DC_ALT=$(curl -s -X GET \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/core/metadatafields/search/byFieldName?schema=dc&element=title&qualifier=alternative")

HAS_DC_ALT=$(echo "$EXISTING_DC_ALT" | grep -c '"qualifier" : "alternative"' || true)

if [ "$HAS_DC_ALT" -gt 0 ]; then
  log_success "  dc.title.alternative ya existe"
else
  log_info "  dc.title.alternative no estaba registrado, registrandolo..."

  DC_SCHEMA_ID=$(curl -s -X GET \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    "$BASE_URL/api/core/metadataschemas/search/byPrefix?prefix=dc" | grep -o '"id" : [0-9]*' | head -1 | sed 's/"id" : //')

  if [ -z "$DC_SCHEMA_ID" ]; then
    log_error "No se pudo encontrar el schema dc"
  fi

  curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"element":"title","qualifier":"alternative","scopeNote":"Titulo alternativo. En DIGEEX se usa como sigla de programa (PEAC, PRONEA) y nombre corto de subdireccion (Educacion Basica)."}' \
    "$BASE_URL/api/core/metadatafields?schemaId=$DC_SCHEMA_ID" > /dev/null

  log_success "  dc.title.alternative registrado"
fi

# ----------------------------------------------------------------------------
# Top-Level Community: DIGEEX
# ----------------------------------------------------------------------------
log_info "Verificando si DIGEEX ya existe..."

EXISTING_COMMUNITIES=$(curl -s -X GET \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/core/communities")

DIGEEX_UUID=$(echo "$EXISTING_COMMUNITIES" | grep -B 5 '"value" : "Dirección General de Educación Extraescolar"' | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')

if [ -n "$DIGEEX_UUID" ]; then
  log_success "DIGEEX ya existe (UUID: $DIGEEX_UUID)"
else
  log_info "Creando comunidad principal: DIGEEX"

  DIGEEX_RESPONSE=$(curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "DIGEEX",
      "metadata": {
        "dc.title": [{"value": "Dirección General de Educación Extraescolar"}],
        "dc.description": [{"value": "Portal de Gestión del Conocimiento de la Dirección General de Educación Extraescolar, Ministerio de Educación de Guatemala. Repositorio institucional de documentos, recursos educativos, investigaciones, estadísticas y materiales de los programas extraescolares."}],
        "dc.identifier.uri": [{"value": "https://portal.digeex.gob.gt"}]
      }
    }' \
    "$BASE_URL/api/core/communities")

  DIGEEX_UUID=$(echo "$DIGEEX_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')

  if [ -z "$DIGEEX_UUID" ]; then
    log_error "No se pudo crear DIGEEX"
  fi

  log_success "DIGEEX creada (UUID: $DIGEEX_UUID)"
fi

# ----------------------------------------------------------------------------
# Subcomunidades (3 Subdirecciones)
# ----------------------------------------------------------------------------

# Educacion Basica
log_info "Creando subcomunidad: Educacion Basica"

ED_BASICA_RESPONSE=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Educación Básica",
    "metadata": {
      "dc.title": [{"value": "Subdirección de Educación Básica"}],
      "dc.title.alternative": [{"value": "Educación Básica"}],
      "dc.description": [{"value": "Programas de educación básica extraescolar dirigidos a jóvenes y adultos que no tuvieron acceso a la educación formal. Incluye PEAC, PRONEA, Modalidades Flexibles y EVA."}],
      "digeex.sufijo": [{"value": "ED_BASICA"}]
    }
  }' \
  "$BASE_URL/api/core/communities?parent=$DIGEEX_UUID")

ED_BASICA_UUID=$(echo "$ED_BASICA_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
log_success "Educacion Basica creada (UUID: $ED_BASICA_UUID)"

# Patrón subgroup contract-compliant: POST sobre el subrecurso crea el adminGroup
# técnico (DSpace lo nombra COMMUNITY_<uuid>_ADMIN) y lo asocia a la community.
# Luego POST sobre /eperson/groups crea ADMIN_ED_BASICA standalone con nombre
# custom (que el role-resolver del Sprint 5 busca por prefijo). Finalmente POST
# .../subgroups con text/uri-list enlaza ADMIN_ED_BASICA como subgrupo del técnico,
# para que DSpace reconozca a sus miembros como admins de la community por
# herencia transitiva.
log_info "Creando adminGroup técnico para Educacion Basica"
TECH_ADMIN_BASICA_RESPONSE=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"metadata":{"dc.description":[{"value":"adminGroup técnico de Subdirección de Educación Básica (auto-nombrado por DSpace)"}]}}' \
  "$BASE_URL/api/core/communities/$ED_BASICA_UUID/adminGroup")

TECH_ADMIN_BASICA_UUID=$(echo "$TECH_ADMIN_BASICA_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')

log_info "Creando ADMIN_ED_BASICA standalone (nombre custom para role-resolver)"
ADMIN_GROUP_BASICA_RESPONSE=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ADMIN_ED_BASICA",
    "metadata": {
      "dc.description": [{"value": "Administradores de Subdirección de Educación Básica"}]
    }
  }' \
  "$BASE_URL/api/eperson/groups")

ADMIN_GROUP_BASICA_UUID=$(echo "$ADMIN_GROUP_BASICA_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')

curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: text/uri-list" \
  -d "$BASE_URL/api/eperson/groups/$ADMIN_GROUP_BASICA_UUID" \
  "$BASE_URL/api/eperson/groups/$TECH_ADMIN_BASICA_UUID/subgroups" > /dev/null

log_success "ADMIN_ED_BASICA wireado vía subgroup (UUID: $ADMIN_GROUP_BASICA_UUID; técnico parent: $TECH_ADMIN_BASICA_UUID)"

# Crear grupo de personal delegado (submittersGroup compartido) para Educacion Basica
log_info "Creando submittersGroup para Educacion Basica"
SUBMITTERS_GROUP_BASICA_RESPONSE=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SUBMITTERS_ED_BASICA",
    "metadata": {
      "dc.description": [{"value": "Personal delegado de Educación Básica (acceso a todas sus colecciones)"}]
    }
  }' \
  "$BASE_URL/api/eperson/groups")

SUBMITTERS_GROUP_BASICA_UUID=$(echo "$SUBMITTERS_GROUP_BASICA_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
log_success "submittersGroup creado (UUID: $SUBMITTERS_GROUP_BASICA_UUID)"

# Educacion para el Trabajo y la Cultura
log_info "Creando subcomunidad: Educacion para el Trabajo y la Cultura"

ED_TRABAJO_RESPONSE=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Educación para el Trabajo y la Cultura",
    "metadata": {
      "dc.title": [{"value": "Subdirección para el Trabajo y la Cultura"}],
      "dc.title.alternative": [{"value": "Educación para el Trabajo y la Cultura"}],
      "dc.description": [{"value": "Programas de formación técnica, capacitación laboral y promoción cultural. Incluye CEMUCAF, PROBEFI, ETCAE y SCC, orientados al desarrollo de competencias para el trabajo y el fortalecimiento cultural."}],
      "digeex.sufijo": [{"value": "ED_TRABAJO"}]
    }
  }' \
  "$BASE_URL/api/core/communities?parent=$DIGEEX_UUID")

ED_TRABAJO_UUID=$(echo "$ED_TRABAJO_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
log_success "Educacion para el Trabajo y la Cultura creada (UUID: $ED_TRABAJO_UUID)"

# Patrón subgroup contract-compliant (ver Educación Básica para detalle).
log_info "Creando adminGroup técnico para Educacion para el Trabajo"
TECH_ADMIN_TRABAJO_RESPONSE=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"metadata":{"dc.description":[{"value":"adminGroup técnico de Subdirección para el Trabajo y la Cultura (auto-nombrado por DSpace)"}]}}' \
  "$BASE_URL/api/core/communities/$ED_TRABAJO_UUID/adminGroup")

TECH_ADMIN_TRABAJO_UUID=$(echo "$TECH_ADMIN_TRABAJO_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')

log_info "Creando ADMIN_ED_TRABAJO standalone (nombre custom para role-resolver)"
ADMIN_GROUP_TRABAJO_RESPONSE=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ADMIN_ED_TRABAJO",
    "metadata": {
      "dc.description": [{"value": "Administradores de Subdirección para el Trabajo y la Cultura"}]
    }
  }' \
  "$BASE_URL/api/eperson/groups")

ADMIN_GROUP_TRABAJO_UUID=$(echo "$ADMIN_GROUP_TRABAJO_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')

curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: text/uri-list" \
  -d "$BASE_URL/api/eperson/groups/$ADMIN_GROUP_TRABAJO_UUID" \
  "$BASE_URL/api/eperson/groups/$TECH_ADMIN_TRABAJO_UUID/subgroups" > /dev/null

log_success "ADMIN_ED_TRABAJO wireado vía subgroup (UUID: $ADMIN_GROUP_TRABAJO_UUID; técnico parent: $TECH_ADMIN_TRABAJO_UUID)"

# Crear grupo de personal delegado (submittersGroup compartido) para Educacion para el Trabajo
log_info "Creando submittersGroup para Educacion para el Trabajo"
SUBMITTERS_GROUP_TRABAJO_RESPONSE=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SUBMITTERS_ED_TRABAJO",
    "metadata": {
      "dc.description": [{"value": "Personal delegado de Educación para el Trabajo (acceso a todas sus colecciones)"}]
    }
  }' \
  "$BASE_URL/api/eperson/groups")

SUBMITTERS_GROUP_TRABAJO_UUID=$(echo "$SUBMITTERS_GROUP_TRABAJO_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
log_success "submittersGroup creado (UUID: $SUBMITTERS_GROUP_TRABAJO_UUID)"

# Formacion, Investigacion y Proyectos Educativos
log_info "Creando subcomunidad: Formacion, Investigacion y Proyectos Educativos"

ED_INVESTIGACION_RESPONSE=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Formación, Investigación y Proyectos Educativos",
    "metadata": {
      "dc.title": [{"value": "Subdirección de Formación, Investigación y Proyectos Educativos"}],
      "dc.title.alternative": [{"value": "Formación, Investigación y Proyectos Educativos"}],
      "dc.description": [{"value": "Área de investigación educativa, generación de conocimiento, innovación pedagógica y gestión documental institucional. Incluye investigaciones, experiencias significativas, datos estadísticos, galería institucional, informes de gestión, y normativa vigente."}],
      "digeex.sufijo": [{"value": "ED_INVESTIGACION"}]
    }
  }' \
  "$BASE_URL/api/core/communities?parent=$DIGEEX_UUID")

ED_INVESTIGACION_UUID=$(echo "$ED_INVESTIGACION_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
log_success "Formacion, Investigacion y Proyectos creada (UUID: $ED_INVESTIGACION_UUID)"

# Patrón subgroup contract-compliant (ver Educación Básica para detalle).
log_info "Creando adminGroup técnico para Formacion, Investigacion y Proyectos"
TECH_ADMIN_INVESTIGACION_RESPONSE=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"metadata":{"dc.description":[{"value":"adminGroup técnico de Subdirección de Formación, Investigación y Proyectos (auto-nombrado por DSpace)"}]}}' \
  "$BASE_URL/api/core/communities/$ED_INVESTIGACION_UUID/adminGroup")

TECH_ADMIN_INVESTIGACION_UUID=$(echo "$TECH_ADMIN_INVESTIGACION_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')

log_info "Creando ADMIN_ED_INVESTIGACION standalone (nombre custom para role-resolver)"
ADMIN_GROUP_INVESTIGACION_RESPONSE=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ADMIN_ED_INVESTIGACION",
    "metadata": {
      "dc.description": [{"value": "Administradores de Subdirección de Formación, Investigación y Proyectos"}]
    }
  }' \
  "$BASE_URL/api/eperson/groups")

ADMIN_GROUP_INVESTIGACION_UUID=$(echo "$ADMIN_GROUP_INVESTIGACION_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')

curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: text/uri-list" \
  -d "$BASE_URL/api/eperson/groups/$ADMIN_GROUP_INVESTIGACION_UUID" \
  "$BASE_URL/api/eperson/groups/$TECH_ADMIN_INVESTIGACION_UUID/subgroups" > /dev/null

log_success "ADMIN_ED_INVESTIGACION wireado vía subgroup (UUID: $ADMIN_GROUP_INVESTIGACION_UUID; técnico parent: $TECH_ADMIN_INVESTIGACION_UUID)"

# Crear grupo de personal delegado (submittersGroup compartido) para Formacion e Investigacion
log_info "Creando submittersGroup para Formacion, Investigacion y Proyectos"
SUBMITTERS_GROUP_INVESTIGACION_RESPONSE=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SUBMITTERS_ED_INVESTIGACION",
    "metadata": {
      "dc.description": [{"value": "Personal delegado de Formación e Investigación (acceso a todas sus colecciones)"}]
    }
  }' \
  "$BASE_URL/api/eperson/groups")

SUBMITTERS_GROUP_INVESTIGACION_UUID=$(echo "$SUBMITTERS_GROUP_INVESTIGACION_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
log_success "submittersGroup creado (UUID: $SUBMITTERS_GROUP_INVESTIGACION_UUID)"

# ----------------------------------------------------------------------------
# Seed users — un admin_subdireccion y un personal_delegado por subdireccion.
# Idempotente: si el email ya existe en DSpace se skipea el create y solo se
# verifica que este enrollado al grupo. La creacion del eperson va via CLI
# (`dspace user --add`) porque es la forma soportada por DSpace 9.x para fijar
# password en el alta. El enroll al grupo va via REST con text/uri-list, igual
# que en el alta normal de personal delegado del Sprint 5.
# ----------------------------------------------------------------------------
log_info "Creando seed users de subdirecciones..."

SEED_USERS=(
  "adminsub_basica@mineduc.gob.gt|Admin|Educación Básica|$ADMIN_GROUP_BASICA_UUID"
  "adminsub_trabajo@mineduc.gob.gt|Admin|Trabajo y Cultura|$ADMIN_GROUP_TRABAJO_UUID"
  "adminsub_investigacion@mineduc.gob.gt|Admin|Investigación|$ADMIN_GROUP_INVESTIGACION_UUID"
  "submitters_basica@mineduc.gob.gt|Personal|Educación Básica|$SUBMITTERS_GROUP_BASICA_UUID"
  "submitters_trabajo@mineduc.gob.gt|Personal|Trabajo y Cultura|$SUBMITTERS_GROUP_TRABAJO_UUID"
  "submitters_investigacion@mineduc.gob.gt|Personal|Investigación|$SUBMITTERS_GROUP_INVESTIGACION_UUID"
)

for entry in "${SEED_USERS[@]}"; do
  IFS='|' read -r SEED_EMAIL SEED_FIRST SEED_LAST SEED_GROUP_UUID <<< "$entry"

  # Buscar si el eperson ya existe.
  EXISTING_EPERSON=$(curl -s -X GET \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    "$BASE_URL/api/eperson/epersons/search/byEmail?email=$SEED_EMAIL")

  EPERSON_UUID=$(echo "$EXISTING_EPERSON" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')

  if [ -z "$EPERSON_UUID" ]; then
    log_info "  Creando $SEED_EMAIL..."
    # Las flags del subcomando `user --add` divergen de las de
    # `create-administrator` (que usa --first/--last/-c): aqui son
    # --givenname/--surname y no acepta --language ni --silent. Documentado
    # en wiki.lyrasis.org/display/DSDOC7x/Managing+User+Accounts.
    CREATE_OUTPUT=$(docker exec dspace /dspace/bin/dspace user --add \
      --email "$SEED_EMAIL" \
      --givenname "$SEED_FIRST" \
      --surname "$SEED_LAST" \
      --password "$SEED_PASSWORD" 2>&1)
    CREATE_EXIT=$?

    if [ $CREATE_EXIT -ne 0 ]; then
      echo "Salida del CLI:"
      echo "$CREATE_OUTPUT"
      log_error "dspace user --add fallo (exit $CREATE_EXIT) para $SEED_EMAIL"
    fi

    # Parsear el UUID directamente del output del CLI ("Created EPerson <uuid>").
    # NO usar /api/eperson/epersons/search/byEmail post-create: la REST API
    # tiene cache stale del eperson recien creado via CLI y devuelve 204.
    # El CLI escribe directo a DB sin invalidar el cache REST hasta que pase
    # un tiempo o se reinicie el contenedor.
    EPERSON_UUID=$(echo "$CREATE_OUTPUT" | grep -oE 'EPerson [a-f0-9-]+' | head -1 | sed 's/EPerson //')

    if [ -z "$EPERSON_UUID" ]; then
      echo "Salida del CLI:"
      echo "$CREATE_OUTPUT"
      log_error "No se pudo parsear UUID del output del CLI para $SEED_EMAIL"
    fi
  else
    log_success "  $SEED_EMAIL ya existe (UUID: $EPERSON_UUID)"
  fi

  # Enrollar al grupo. POST con text/uri-list es idempotente en DSpace 9.x:
  # si el eperson ya es miembro del grupo, devuelve 4xx silencioso pero no
  # lanza error visible al script. La verificacion previa de membership
  # involucra un GET extra por usuario y no aporta valor.
  curl -s -o /dev/null -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: text/uri-list" \
    -d "$BASE_URL/api/eperson/epersons/$EPERSON_UUID" \
    "$BASE_URL/api/eperson/groups/$SEED_GROUP_UUID/epersons"

  log_success "  $SEED_EMAIL enrollado en grupo $SEED_GROUP_UUID"
done

log_success "Seed users de subdirecciones creados"

# ----------------------------------------------------------------------------
# Collections — Educacion Basica
# ----------------------------------------------------------------------------
log_info "Creando colecciones de Educacion Basica..."

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"PEAC","metadata":{"dc.title":[{"value":"Programa de Educación de Adultos por Correspondencia"}],"dc.description":[{"value":"Modalidad de educación a distancia dirigida a jóvenes y adultos que desean completar la educación primaria mediante materiales autoinstructivos. Incluye guías de estudio, evaluaciones y recursos pedagógicos del programa PEAC."}],"dc.title.alternative":[{"value":"PEAC"}],"digeex.navLocation":[{"value":"menu-principal"}],"dspace.entity.type":[{"value":"Documento"}],"dc.identifier.other":[{"value":"1"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_BASICA_UUID" > /dev/null
log_success "  PEAC"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Modalidades Flexibles","metadata":{"dc.title":[{"value":"Programa Modalidades Flexibles para la Educación Media"}],"dc.description":[{"value":"Programa de educación media con metodologías flexibles dirigido a jóvenes y adultos de 15 años en adelante. Atiende ciclo básico y diversificado mediante modalidades semipresenciales y a distancia. Incluye recursos educativos, lineamientos metodológicos y materiales de apoyo adaptados a las necesidades de los estudiantes."}],"dc.title.alternative":[{"value":"Modalidades Flexibles"}],"digeex.navLocation":[{"value":"menu-principal"}],"dspace.entity.type":[{"value":"Documento"}],"dc.identifier.other":[{"value":"2"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_BASICA_UUID" > /dev/null
log_success "  Modalidades Flexibles"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"PRONEA","metadata":{"dc.title":[{"value":"Programa Nacional de Educación Alternativa"}],"dc.description":[{"value":"Programa de alfabetización y educación básica para población adulta mediante metodologías flexibles y contextualizadas. Contiene materiales didácticos, manuales para facilitadores y documentación del programa PRONEA."}],"dc.title.alternative":[{"value":"PRONEA"}],"digeex.navLocation":[{"value":"menu-principal"}],"dspace.entity.type":[{"value":"Documento"}],"dc.identifier.other":[{"value":"3"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_BASICA_UUID" > /dev/null
log_success "  PRONEA"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"EVA","metadata":{"dc.title":[{"value":"Entornos Virtuales de Aprendizaje"}],"dc.description":[{"value":"Plataforma de entornos virtuales que ofrece recursos educativos digitales, cursos en línea y herramientas tecnológicas para el subsistema de educación extraescolar. Contiene recursos multimedia, evaluaciones virtuales y materiales de apoyo para la formación a distancia del programa EVA."}],"dc.title.alternative":[{"value":"EVA"}],"digeex.navLocation":[{"value":"menu-principal"}],"dspace.entity.type":[{"value":"Documento"}],"dc.identifier.other":[{"value":"7"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_BASICA_UUID" > /dev/null
log_success "  EVA"

# ----------------------------------------------------------------------------
# Collections — Educacion para el Trabajo y la Cultura
# ----------------------------------------------------------------------------
log_info "Creando colecciones de Educacion para el Trabajo y la Cultura..."

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"CEMUCAF","metadata":{"dc.title":[{"value":"Centros Municipales de Capacitación y Formación Humana"}],"dc.description":[{"value":"Red de centros de formación técnica y capacitación laboral en comunidades. Contiene materiales de capacitación, manuales técnicos, currículos y recursos pedagógicos del programa CEMUCAF."}],"dc.title.alternative":[{"value":"CEMUCAF"}],"digeex.navLocation":[{"value":"menu-principal"}],"dspace.entity.type":[{"value":"Documento"}],"dc.identifier.other":[{"value":"4"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_TRABAJO_UUID" > /dev/null
log_success "  CEMUCAF"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"SCC","metadata":{"dc.title":[{"value":"Sistema de Certificación de Competencias"}],"dc.description":[{"value":"Sistema de reconocimiento y certificación de competencias laborales adquiridas por experiencia. Incluye procedimientos de certificación, estándares de competencia, evaluaciones y normativas del SCC."}],"dc.title.alternative":[{"value":"SCC"}],"digeex.navLocation":[{"value":"menu-principal"}],"dspace.entity.type":[{"value":"Documento"}],"dc.identifier.other":[{"value":"5"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_TRABAJO_UUID" > /dev/null
log_success "  SCC"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"ETCAE","metadata":{"dc.title":[{"value":"Escuelas Técnicas de Campo para la Alimentación Escolar"}],"dc.description":[{"value":"Centros de formación y capacitación del Subsistema de Educación Extraescolar, asociadas al área agropecuaria. Contiene manuales técnicos, planes de estudio y materiales del programa ETCAE."}],"dc.title.alternative":[{"value":"ETCAE"}],"digeex.navLocation":[{"value":"menu-principal"}],"dspace.entity.type":[{"value":"Documento"}],"dc.identifier.other":[{"value":"6"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_TRABAJO_UUID" > /dev/null
log_success "  ETCAE"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"PROBEFI","metadata":{"dc.title":[{"value":"Programa de Becas para Formación Técnica Laboral en Inglés"}],"dc.description":[{"value":"Programa de becas para fortalecer las competencias laborales de jóvenes y adultos mediante el aprendizaje técnico del idioma inglés. Incluye lineamientos, convocatorias, materiales de capacitación y documentación del programa PROBEFI."}],"dc.title.alternative":[{"value":"PROBEFI"}],"digeex.navLocation":[{"value":"menu-principal"}],"dspace.entity.type":[{"value":"Documento"}],"dc.identifier.other":[{"value":"8"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_TRABAJO_UUID" > /dev/null
log_success "  PROBEFI"

# ----------------------------------------------------------------------------
# Collections — Formacion, Investigacion y Proyectos
# ----------------------------------------------------------------------------
log_info "Creando colecciones de Formacion, Investigacion y Proyectos..."

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"INVEST","metadata":{"dc.title":[{"value":"Investigaciones Educativas"}],"dc.description":[{"value":"Estudios, investigaciones y análisis sobre educación extraescolar en Guatemala. Incluye investigaciones propias, tesis, estudios de caso, diagnósticos y documentos de investigación educativa."}],"dc.title.alternative":[{"value":"INVEST"}],"digeex.navLocation":[{"value":"menu-secundario"}],"dspace.entity.type":[{"value":"Documento"}],"dc.identifier.other":[{"value":"1"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_INVESTIGACION_UUID" > /dev/null
log_success "  Investigaciones"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"EXPER","metadata":{"dc.title":[{"value":"Experiencias Significativas y Buenas Prácticas"}],"dc.description":[{"value":"Sistematización de experiencias exitosas, innovaciones pedagógicas y buenas prácticas en educación extraescolar. Contiene relatos de experiencias, estudios de caso y documentación de prácticas destacadas."}],"dc.title.alternative":[{"value":"EXPER"}],"digeex.navLocation":[{"value":"menu-secundario"}],"dspace.entity.type":[{"value":"Documento"}],"dc.identifier.other":[{"value":"2"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_INVESTIGACION_UUID" > /dev/null
log_success "  Experiencias Significativas"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"DATOS","metadata":{"dc.title":[{"value":"Datos Estadísticos Institucionales"}],"dc.description":[{"value":"Bases de datos, anuarios estadísticos, indicadores educativos y cifras oficiales de DIGEEX. Incluye datos de cobertura, matrícula, graduaciones y otros indicadores del sistema extraescolar."}],"dc.title.alternative":[{"value":"DATOS"}],"digeex.navLocation":[{"value":"menu-secundario"}],"dspace.entity.type":[{"value":"Estadistica"}],"dc.identifier.other":[{"value":"3"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_INVESTIGACION_UUID" > /dev/null
log_success "  Datos Estadisticos"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"GALERIA","metadata":{"dc.title":[{"value":"Galería Institucional"}],"dc.description":[{"value":"Registro fotográfico y audiovisual de eventos, actividades, ceremonias y acciones institucionales de DIGEEX. Memoria histórica visual de la dirección y sus programas."}],"dc.title.alternative":[{"value":"GALERIA"}],"digeex.navLocation":[{"value":"menu-secundario"}],"dspace.entity.type":[{"value":"Galeria"}],"dc.identifier.other":[{"value":"4"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_INVESTIGACION_UUID" > /dev/null
log_success "  Galeria Institucional"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"INFORMES","metadata":{"dc.title":[{"value":"Informes de Gestión y Memorias Institucionales"}],"dc.description":[{"value":"Informes anuales, memorias de labores, planes operativos anuales (POA), rendición de cuentas y documentación de gestión administrativa de DIGEEX."}],"dc.title.alternative":[{"value":"INFORMES"}],"digeex.navLocation":[{"value":"menu-secundario"}],"dspace.entity.type":[{"value":"Documento"}],"dc.identifier.other":[{"value":"5"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_INVESTIGACION_UUID" > /dev/null
log_success "  Informes de Gestion"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"NORMATIVA","metadata":{"dc.title":[{"value":"Normativa y Acuerdos Institucionales"}],"dc.description":[{"value":"Marco legal, acuerdos ministeriales, resoluciones, lineamientos técnicos, reglamentos y normativa vigente que rige la educación extraescolar en Guatemala."}],"dc.title.alternative":[{"value":"NORMATIVA"}],"digeex.navLocation":[{"value":"menu-secundario"}],"dspace.entity.type":[{"value":"Documento"}],"dc.identifier.other":[{"value":"6"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_INVESTIGACION_UUID" > /dev/null
log_success "  Normativa y Acuerdos"

# ----------------------------------------------------------------------------
# Vincular submittersGroups a las colecciones
# ----------------------------------------------------------------------------
log_info "Vinculando submittersGroups a las colecciones..."

# Obtener todas las colecciones de Educacion Basica y vincular el submittersGroup
COLLECTIONS_BASICA=$(curl -s -X GET \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/core/communities/$ED_BASICA_UUID/collections")

echo "$COLLECTIONS_BASICA" | jq -r '._embedded.collections[] | "\(.uuid)|\(.name)"' | while IFS='|' read -r COLL_UUID COLL_NAME; do
  TECH_SUBM_RESP=$(curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"metadata":{"dc.description":[{"value":"submittersGroup técnico de la collection"}]}}' \
    "$BASE_URL/api/core/collections/$COLL_UUID/submittersGroup")
  TECH_SUBM_UUID=$(echo "$TECH_SUBM_RESP" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
  if [ -z "$TECH_SUBM_UUID" ]; then
    echo "  ✗ $COLL_NAME (POST submittersGroup no devolvió uuid)"
    continue
  fi
  curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: text/uri-list" \
    -d "$BASE_URL/api/eperson/groups/$SUBMITTERS_GROUP_BASICA_UUID" \
    "$BASE_URL/api/eperson/groups/$TECH_SUBM_UUID/subgroups" > /dev/null

  # adminGroup técnico de la colección. SUBMITTERS_<sufijo> entra como subgroup
  # para que el delegado herede ADMIN sobre la colección y la propagación nativa
  # de DSpace lo extienda a items, bundles y bitstreams. Esto desbloquea
  # POST /items/{uuid}/bundles (cover en THUMBNAIL) y los PATCH post-archive sin
  # crear policies custom.
  TECH_ADMIN_RESP=$(curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"metadata":{"dc.description":[{"value":"adminGroup técnico de la collection"}]}}' \
    "$BASE_URL/api/core/collections/$COLL_UUID/adminGroup")
  TECH_ADMIN_UUID=$(echo "$TECH_ADMIN_RESP" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
  if [ -z "$TECH_ADMIN_UUID" ]; then
    echo "  ✗ $COLL_NAME (POST adminGroup no devolvió uuid)"
    continue
  fi
  curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: text/uri-list" \
    -d "$BASE_URL/api/eperson/groups/$SUBMITTERS_GROUP_BASICA_UUID" \
    "$BASE_URL/api/eperson/groups/$TECH_ADMIN_UUID/subgroups" > /dev/null

  echo "  ✓ $COLL_NAME (submit + admin)"
done

# Obtener todas las colecciones de Educacion para el Trabajo y vincular el submittersGroup
COLLECTIONS_TRABAJO=$(curl -s -X GET \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/core/communities/$ED_TRABAJO_UUID/collections")

echo "$COLLECTIONS_TRABAJO" | jq -r '._embedded.collections[] | "\(.uuid)|\(.name)"' | while IFS='|' read -r COLL_UUID COLL_NAME; do
  TECH_SUBM_RESP=$(curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"metadata":{"dc.description":[{"value":"submittersGroup técnico de la collection"}]}}' \
    "$BASE_URL/api/core/collections/$COLL_UUID/submittersGroup")
  TECH_SUBM_UUID=$(echo "$TECH_SUBM_RESP" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
  if [ -z "$TECH_SUBM_UUID" ]; then
    echo "  ✗ $COLL_NAME (POST submittersGroup no devolvió uuid)"
    continue
  fi
  curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: text/uri-list" \
    -d "$BASE_URL/api/eperson/groups/$SUBMITTERS_GROUP_TRABAJO_UUID" \
    "$BASE_URL/api/eperson/groups/$TECH_SUBM_UUID/subgroups" > /dev/null

  TECH_ADMIN_RESP=$(curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"metadata":{"dc.description":[{"value":"adminGroup técnico de la collection"}]}}' \
    "$BASE_URL/api/core/collections/$COLL_UUID/adminGroup")
  TECH_ADMIN_UUID=$(echo "$TECH_ADMIN_RESP" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
  if [ -z "$TECH_ADMIN_UUID" ]; then
    echo "  ✗ $COLL_NAME (POST adminGroup no devolvió uuid)"
    continue
  fi
  curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: text/uri-list" \
    -d "$BASE_URL/api/eperson/groups/$SUBMITTERS_GROUP_TRABAJO_UUID" \
    "$BASE_URL/api/eperson/groups/$TECH_ADMIN_UUID/subgroups" > /dev/null

  echo "  ✓ $COLL_NAME (submit + admin)"
done

# Obtener todas las colecciones de Formacion e Investigacion y vincular el submittersGroup
COLLECTIONS_INVESTIGACION=$(curl -s -X GET \
  -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/core/communities/$ED_INVESTIGACION_UUID/collections")

echo "$COLLECTIONS_INVESTIGACION" | jq -r '._embedded.collections[] | "\(.uuid)|\(.name)"' | while IFS='|' read -r COLL_UUID COLL_NAME; do
  TECH_SUBM_RESP=$(curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"metadata":{"dc.description":[{"value":"submittersGroup técnico de la collection"}]}}' \
    "$BASE_URL/api/core/collections/$COLL_UUID/submittersGroup")
  TECH_SUBM_UUID=$(echo "$TECH_SUBM_RESP" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
  if [ -z "$TECH_SUBM_UUID" ]; then
    echo "  ✗ $COLL_NAME (POST submittersGroup no devolvió uuid)"
    continue
  fi
  curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: text/uri-list" \
    -d "$BASE_URL/api/eperson/groups/$SUBMITTERS_GROUP_INVESTIGACION_UUID" \
    "$BASE_URL/api/eperson/groups/$TECH_SUBM_UUID/subgroups" > /dev/null

  TECH_ADMIN_RESP=$(curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"metadata":{"dc.description":[{"value":"adminGroup técnico de la collection"}]}}' \
    "$BASE_URL/api/core/collections/$COLL_UUID/adminGroup")
  TECH_ADMIN_UUID=$(echo "$TECH_ADMIN_RESP" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
  if [ -z "$TECH_ADMIN_UUID" ]; then
    echo "  ✗ $COLL_NAME (POST adminGroup no devolvió uuid)"
    continue
  fi
  curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Authorization: Bearer $JWT" \
    -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
    -H "Content-Type: text/uri-list" \
    -d "$BASE_URL/api/eperson/groups/$SUBMITTERS_GROUP_INVESTIGACION_UUID" \
    "$BASE_URL/api/eperson/groups/$TECH_ADMIN_UUID/subgroups" > /dev/null

  echo "  ✓ $COLL_NAME (submit + admin)"
done

log_success "SUBMITTERS vinculados como subgroup de submit + admin en todas las colecciones"

# ----------------------------------------------------------------------------
# Resumen
# ----------------------------------------------------------------------------
echo ""
echo "==========================================="
echo " Estructura DIGEEX creada en DSpace"
echo "==========================================="
echo ""
echo "Comunidad principal:"
echo "  DIGEEX (UUID: $DIGEEX_UUID)"
echo ""
echo "Subcomunidades:"
echo "  Educacion Basica             (4 colecciones + adminGroup + submittersGroup)"
echo "  Educacion para el Trabajo    (4 colecciones + adminGroup + submittersGroup)"
echo "  Formacion e Investigacion    (6 colecciones + adminGroup + submittersGroup)"
echo ""
echo "Total: 1 comunidad + 3 subcomunidades + 14 colecciones + 6 grupos de rol"
echo ""
echo "Grupos creados:"
echo "  3 adminGroups (Subadministradores)"
echo "  3 submittersGroups (Personal delegado, compartido por subdirección)"
echo ""
echo "Backend: $BASE_URL"
echo ""
echo "Usuarios seed (password de los 6 de subdireccion: $SEED_PASSWORD):"
echo "  $ADMIN_EMAIL                                  superadmin"
echo "  adminsub_basica@mineduc.gob.gt                admin_subdireccion ED_BASICA"
echo "  adminsub_trabajo@mineduc.gob.gt               admin_subdireccion ED_TRABAJO"
echo "  adminsub_investigacion@mineduc.gob.gt         admin_subdireccion ED_INVESTIGACION"
echo "  submitters_basica@mineduc.gob.gt              personal_delegado ED_BASICA"
echo "  submitters_trabajo@mineduc.gob.gt             personal_delegado ED_TRABAJO"
echo "  submitters_investigacion@mineduc.gob.gt       personal_delegado ED_INVESTIGACION"
