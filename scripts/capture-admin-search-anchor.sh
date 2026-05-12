#!/usr/bin/env bash
#
# capture-admin-search-anchor.sh — Anclaje empirico Sprint 6 Ciclo 33
#
# Captura el shape del Discovery con configuration=administrativeView que el
# Ciclo 33 va a consumir para listar items activos + eliminados desde el
# panel de admin. Tres llamadas:
#   1. activos sin scope (superadmin global)
#   2. eliminados sin scope (superadmin global, f.withdrawn=true)
#   3. activos con scope a una sub-community (admin_subdireccion)
#
# Uso:
#   1. Loguearse con cuenta superadmin en el frontend (localhost:4200).
#   2. Copiar el JWT desde DevTools -> Application -> Cookies -> dsAuthInfo
#      (campo accessToken) y reemplazar abajo.
#   3. Opcional: setear SCOPE_UUID al uuid de una sub-community para probar
#      el scope per-rol; si queda en placeholder esa llamada se saltea.
#   4. bash scripts/capture-admin-search-anchor.sh

set -u

JWT="eyJhbGciOiJIUzI1NiJ9.eyJlaWQiOiI2NGM4YTg1Yi01NWQ4LTRlZjYtOTIxMy1kYjhlMjYxOWE5YzQiLCJzZyI6W10sImV4cCI6MTc3ODYwMDc5NiwiYXV0aGVudGljYXRpb25NZXRob2QiOiJwYXNzd29yZCJ9.ZtmBzvv2lWKMKM7CCOWFR25cezZholAZY_iOisiOvN0"
SCOPE_UUID="REPLACE_WITH_SUBCOMMUNITY_UUID"
BASE_URL="http://localhost:8080/server"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$PROJECT_ROOT/docs/07-sprints/sprint-06/anclajes"
mkdir -p "$DEST"

echo "Anclaje empirico contra $BASE_URL"
echo "Destino: $DEST"
echo ""

fetch() {
  local label="$1"
  local query="$2"
  local out="$DEST/admin-search-$label-response.json"
  local http
  http=$(curl -s -o "$out.raw" -w "%{http_code}" \
    -H "Authorization: Bearer $JWT" \
    "$BASE_URL/api/discover/search/objects?$query")

  if [ "$http" = "200" ]; then
    jq . < "$out.raw" > "$out"
    rm -f "$out.raw"
    echo "OK   $label  HTTP 200  $(wc -c < "$out") bytes"
  else
    mv "$out.raw" "$out"
    echo "FAIL $label  HTTP $http  body:"
    cat "$out"
    echo ""
  fi
}

# 1. Activos globales (sin scope, sin f.withdrawn). administrativeView no aplica
#    defaultFilterQuery sobre withdrawn asi que devuelve todos; sumamos
#    f.withdrawn=false,equals para que el response sea solo activos.
fetch "activos" "configuration=administrativeView&f.withdrawn=false,equals&size=10&embed=thumbnail"

# 2. Eliminados globales (withdrawn=true). Confirma que administrativeView
#    expone items con withdrawn=true cuando el caller es superadmin.
fetch "eliminados" "configuration=administrativeView&f.withdrawn=true,equals&size=10&embed=thumbnail"

# 3. Activos scoped a una sub-community. Confirma que scope filtra a items
#    dentro del subarbol indicado. Si SCOPE_UUID quedo en placeholder, se salta.
if [ "$SCOPE_UUID" != "REPLACE_WITH_SUBCOMMUNITY_UUID" ]; then
  fetch "activos-scoped" "configuration=administrativeView&scope=$SCOPE_UUID&f.withdrawn=false,equals&size=5&embed=thumbnail"
else
  echo "SKIP activos-scoped  (SCOPE_UUID no configurado)"
fi

echo ""
echo "=== Archivos generados ==="
ls -la "$DEST/" | grep "admin-search-"
