#!/bin/bash
# ---------------------------------------------------------------------------
# Entrypoint DIGEEX para el contenedor del backend DSpace.
#
# Corre, al arrancar y de forma idempotente, los pasos de bootstrap que antes
# hacia scripts/setup-dspace.sh a mano. Es la fuente DIGEEX: en deploy se monta
# como entrypoint del servicio dspace (ver docker/docker-compose.yml).
#
# Cubre migrate + entity-types + primer superadmin. La comunidad raiz NO se crea
# aqui: se inicializa desde la UI (pantalla /administrador/digeex, solo superadmin).
# ---------------------------------------------------------------------------

# 1. Esperar a que la base de datos este lista (mismo patron que el entrypoint stock).
while (!</dev/tcp/dspacedb/5432) > /dev/null 2>&1; do sleep 1; done

# 2. Migrar la base. Dispara los callbacks de Flyway que cargan los registries
#    de metadata, incluido digeex-types.xml (listado en dspace.cfg).
/dspace/bin/dspace database migrate

# 3. Registrar los entity-types DIGEEX (Documento / Galeria / Estadistica).
#    Idempotente: initialize-entities crea solo lo que falta.
/dspace/bin/dspace initialize-entities -f /dspace/config/entities/digeex-entity-types.xml

# 4. Crear el primer superadmin desde el .env (idempotente: si el correo ya existe
#    create-administrator lo sube a admin y reaplica la clave, no falla). Los cinco
#    flags son obligatorios; sin -c (idioma) el comando cae a modo interactivo y
#    cuelga el arranque esperando stdin.
/dspace/bin/dspace create-administrator \
  -e "${ADMIN_EMAIL}" -f "${ADMIN_FIRSTNAME}" -l "${ADMIN_LASTNAME}" \
  -c "${ADMIN_LANGUAGE}" -p "${ADMIN_PASSWORD}"

# 5. Arrancar el servidor DSpace.
exec java -jar /dspace/webapps/server-boot.jar --dspace.dir=/dspace
