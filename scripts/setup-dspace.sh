#!/bin/bash
# ============================================================================
# Estructura DIGEEX en DSpace 9.2
# Crea la jerarquia de Communities y Collections via REST API
#
# Estructura:
#   DIGEEX (Top Community)
#     +-- Subdireccion de Educacion Basica
#     |     PEAC, PRONEA, Modalidades Flexibles, EVA
#     +-- Subdireccion de Educacion para el Trabajo y la Cultura
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
      "dc.description": [{"value": "Programas de educación básica extraescolar dirigidos a jóvenes y adultos que no tuvieron acceso a la educación formal. Incluye PEAC, PRONEA, Modalidades Flexibles y EVA."}]
    }
  }' \
  "$BASE_URL/api/core/communities?parent=$DIGEEX_UUID")

ED_BASICA_UUID=$(echo "$ED_BASICA_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
log_success "Educacion Basica creada (UUID: $ED_BASICA_UUID)"

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
      "dc.title": [{"value": "Subdirección de Educación para el Trabajo y la Cultura"}],
      "dc.description": [{"value": "Programas de formación técnica, capacitación laboral y promoción cultural. Incluye CEMUCAF, PROBEFI, ETCAE y SCSS, orientados al desarrollo de competencias para el trabajo y el fortalecimiento cultural."}]
    }
  }' \
  "$BASE_URL/api/core/communities?parent=$DIGEEX_UUID")

ED_TRABAJO_UUID=$(echo "$ED_TRABAJO_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
log_success "Educacion para el Trabajo y la Cultura creada (UUID: $ED_TRABAJO_UUID)"

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
      "dc.description": [{"value": "Área de investigación educativa, generación de conocimiento, innovación pedagógica y gestión documental institucional. Incluye investigaciones, experiencias significativas, datos estadísticos, galería institucional, informes de gestión, y normativa vigente."}]
    }
  }' \
  "$BASE_URL/api/core/communities?parent=$DIGEEX_UUID")

ED_INVESTIGACION_UUID=$(echo "$ED_INVESTIGACION_RESPONSE" | grep -o '"uuid" : "[^"]*"' | head -1 | sed 's/"uuid" : "//; s/"$//')
log_success "Formacion, Investigacion y Proyectos creada (UUID: $ED_INVESTIGACION_UUID)"

# ----------------------------------------------------------------------------
# Collections — Educacion Basica
# ----------------------------------------------------------------------------
log_info "Creando colecciones de Educacion Basica..."

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"PEAC","metadata":{"dc.title":[{"value":"Programa de Educación de Adultos por Correspondencia"}],"dc.description":[{"value":"Modalidad de educación a distancia dirigida a jóvenes y adultos que desean completar la educación primaria mediante materiales autoinstructivos. Incluye guías de estudio, evaluaciones y recursos pedagógicos del programa PEAC."}],"dc.subject":[{"value":"PEAC"}],"dc.type":[{"value":"menu-principal"}],"dc.identifier.other":[{"value":"1"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_BASICA_UUID" > /dev/null
log_success "  PEAC"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Modalidades Flexibles","metadata":{"dc.title":[{"value":"Modalidades Flexibles de Educación Básica"}],"dc.description":[{"value":"Programas de educación con metodologías adaptadas a las necesidades de tiempo, edad y contexto de los estudiantes. Incluye recursos educativos, lineamientos metodológicos y materiales de apoyo para modalidades semipresenciales y a distancia."}],"dc.subject":[{"value":"Modalidades Flexibles"}],"dc.type":[{"value":"menu-principal"}],"dc.identifier.other":[{"value":"2"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_BASICA_UUID" > /dev/null
log_success "  Modalidades Flexibles"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"PRONEA","metadata":{"dc.title":[{"value":"Programa Nacional de Educación Alternativa"}],"dc.description":[{"value":"Programa de alfabetización y educación básica para población adulta mediante metodologías flexibles y contextualizadas. Contiene materiales didácticos, manuales para facilitadores y documentación del programa PRONEA."}],"dc.subject":[{"value":"PRONEA"}],"dc.type":[{"value":"menu-principal"}],"dc.identifier.other":[{"value":"3"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_BASICA_UUID" > /dev/null
log_success "  PRONEA"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"EVA","metadata":{"dc.title":[{"value":"Educación Virtual para Adultos"}],"dc.description":[{"value":"Programa de educación básica en línea para jóvenes y adultos mediante plataformas digitales. Contiene recursos multimedia, cursos en línea, evaluaciones virtuales y materiales de apoyo tecnológico del programa EVA."}],"dc.subject":[{"value":"EVA"}],"dc.type":[{"value":"menu-principal"}],"dc.identifier.other":[{"value":"7"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_BASICA_UUID" > /dev/null
log_success "  EVA"

# ----------------------------------------------------------------------------
# Collections — Educacion para el Trabajo y la Cultura
# ----------------------------------------------------------------------------
log_info "Creando colecciones de Educacion para el Trabajo y la Cultura..."

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"CEMUCAF","metadata":{"dc.title":[{"value":"Centros Municipales de Capacitación y Formación Humana"}],"dc.description":[{"value":"Red de centros de formación técnica y capacitación laboral en comunidades. Contiene materiales de capacitación, manuales técnicos, currículos y recursos pedagógicos del programa CEMUCAF."}],"dc.subject":[{"value":"CEMUCAF"}],"dc.type":[{"value":"menu-principal"}],"dc.identifier.other":[{"value":"4"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_TRABAJO_UUID" > /dev/null
log_success "  CEMUCAF"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"SCC","metadata":{"dc.title":[{"value":"Sistema de Certificación de Competencias"}],"dc.description":[{"value":"Sistema de reconocimiento y certificación de competencias laborales adquiridas por experiencia. Incluye procedimientos de certificación, estándares de competencia, evaluaciones y normativas del SCC."}],"dc.subject":[{"value":"SCC"}],"dc.type":[{"value":"menu-principal"}],"dc.identifier.other":[{"value":"5"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_TRABAJO_UUID" > /dev/null
log_success "  SCC"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"ETCAE","metadata":{"dc.title":[{"value":"Escuelas Técnicas de Capacitación Artesanal y Empresarial"}],"dc.description":[{"value":"Formación en oficios artesanales, emprendimiento y microempresas. Contiene manuales técnicos, planes de estudio, guías de emprendimiento y materiales del programa ETCAE."}],"dc.subject":[{"value":"ETCAE"}],"dc.type":[{"value":"menu-principal"}],"dc.identifier.other":[{"value":"6"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_TRABAJO_UUID" > /dev/null
log_success "  ETCAE"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"PROBEFI","metadata":{"dc.title":[{"value":"Programa de Becas de Formación e Inserción Laboral"}],"dc.description":[{"value":"Programa de becas para formación técnica y empleabilidad de jóvenes. Incluye lineamientos, convocatorias, materiales de capacitación y documentación del programa PROBEFI."}],"dc.subject":[{"value":"PROBEFI"}],"dc.type":[{"value":"menu-principal"}],"dc.identifier.other":[{"value":"8"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_TRABAJO_UUID" > /dev/null
log_success "  PROBEFI"

# ----------------------------------------------------------------------------
# Collections — Formacion, Investigacion y Proyectos
# ----------------------------------------------------------------------------
log_info "Creando colecciones de Formacion, Investigacion y Proyectos..."

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Investigaciones","metadata":{"dc.title":[{"value":"Investigaciones Educativas"}],"dc.description":[{"value":"Estudios, investigaciones y análisis sobre educación extraescolar en Guatemala. Incluye investigaciones propias, tesis, estudios de caso, diagnósticos y documentos de investigación educativa."}],"dc.type":[{"value":"menu-secundario"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_INVESTIGACION_UUID" > /dev/null
log_success "  Investigaciones"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Experiencias Significativas","metadata":{"dc.title":[{"value":"Experiencias Significativas y Buenas Prácticas"}],"dc.description":[{"value":"Sistematización de experiencias exitosas, innovaciones pedagógicas y buenas prácticas en educación extraescolar. Contiene relatos de experiencias, estudios de caso y documentación de prácticas destacadas."}],"dc.type":[{"value":"menu-secundario"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_INVESTIGACION_UUID" > /dev/null
log_success "  Experiencias Significativas"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Datos Estadísticos","metadata":{"dc.title":[{"value":"Datos Estadísticos Institucionales"}],"dc.description":[{"value":"Bases de datos, anuarios estadísticos, indicadores educativos y cifras oficiales de DIGEEX. Incluye datos de cobertura, matrícula, graduaciones y otros indicadores del sistema extraescolar."}],"dc.type":[{"value":"menu-secundario"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_INVESTIGACION_UUID" > /dev/null
log_success "  Datos Estadisticos"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Galería Institucional","metadata":{"dc.title":[{"value":"Galería Institucional"}],"dc.description":[{"value":"Registro fotográfico y audiovisual de eventos, actividades, ceremonias y acciones institucionales de DIGEEX. Memoria histórica visual de la dirección y sus programas."}],"dc.type":[{"value":"menu-secundario"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_INVESTIGACION_UUID" > /dev/null
log_success "  Galeria Institucional"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Informes de Gestión","metadata":{"dc.title":[{"value":"Informes de Gestión y Memorias Institucionales"}],"dc.description":[{"value":"Informes anuales, memorias de labores, planes operativos anuales (POA), rendición de cuentas y documentación de gestión administrativa de DIGEEX."}],"dc.type":[{"value":"menu-secundario"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_INVESTIGACION_UUID" > /dev/null
log_success "  Informes de Gestion"

curl -s -X POST -b "$COOKIES_FILE" \
  -H "Authorization: Bearer $JWT" -H "X-XSRF-TOKEN: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Normativa y Acuerdos","metadata":{"dc.title":[{"value":"Normativa y Acuerdos Institucionales"}],"dc.description":[{"value":"Marco legal, acuerdos ministeriales, resoluciones, lineamientos técnicos, reglamentos y normativa vigente que rige la educación extraescolar en Guatemala."}],"dc.type":[{"value":"menu-secundario"}]}}' \
  "$BASE_URL/api/core/collections?parent=$ED_INVESTIGACION_UUID" > /dev/null
log_success "  Normativa y Acuerdos"

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
echo "  Educacion Basica             (4 colecciones)"
echo "  Educacion para el Trabajo    (4 colecciones)"
echo "  Formacion e Investigacion    (6 colecciones)"
echo ""
echo "Total: 1 comunidad + 3 subcomunidades + 14 colecciones"
echo ""
echo "Backend: $BASE_URL"
echo "Usuario: $ADMIN_EMAIL"
