# Despliegue — Portal de Gestión del Conocimiento DIGEEX

Configuración de despliegue de producción del portal. Levanta el stack completo
con Docker Compose usando las imágenes oficiales de DSpace 9.2; no compila el
backend ni requiere clonar su código fuente.

## Qué levanta

| Servicio    | Imagen / origen                          | Rol |
|-------------|------------------------------------------|-----|
| frontend    | Build local (nginx + Angular compilado)  | Sirve el sitio y proxea `/server/` al backend. Único servicio con puertos al host (80/443). |
| dspace      | `dspace/dspace:9.2` + config del portal  | Backend DSpace (REST API). Sin puertos al host. |
| dspacedb    | `postgres:15`                            | Base de datos. Solo en la red interna. |
| dspacesolr  | `dspace/dspace-solr:9.2`                 | Motor de búsqueda. Solo en la red interna. |

El backend se arma a partir de la imagen oficial de DSpace con la configuración
del portal encima (`Dockerfile.dspace` + `dspace-config/`). No hay compilación
desde el código fuente.

## Requisitos

- Un servidor Linux con Docker y Docker Compose.
- Un dominio apuntando al servidor, con certificados Let's Encrypt en
  `/etc/letsencrypt` (el frontend los monta en solo lectura).
- El archivo `.env` configurado (ver Configuración).

## Configuración

Copie la plantilla y complete los valores:

    cp deploy/.env.example deploy/.env

Variables:

- `DSPACE_SERVER_URL`, `DSPACE_UI_URL` — URLs públicas del backend y del sitio.
- `DSPACE_NAME` — nombre del repositorio.
- `POSTGRES_PASSWORD` — clave de la base (la usan la base y el backend).
- `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_ADMIN` — correo saliente vía Resend (SMTP).
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FIRSTNAME`, `ADMIN_LASTNAME`,
  `ADMIN_LANGUAGE` — primer superadministrador; lo crea el arranque de forma
  idempotente.

El `.env` con valores reales no se versiona; solo se versiona `.env.example`.

## Despliegue

Desde la raíz del repositorio:

    docker compose -f deploy/docker-compose.yml up -d --build

El arranque es ordenado por healthchecks: la base espera a estar lista, el
backend espera a la base, y el frontend espera a que el backend responda. DSpace
tarda unos minutos en levantar la primera vez; hasta que su healthcheck pase, el
frontend no arranca.

Ver el estado:

    docker compose -f deploy/docker-compose.yml ps

## Primer arranque

Con el stack arriba y el superadministrador ya creado, inicialice la estructura
del repositorio desde el panel de administración (Repositorio → DIGEEX para crear
la comunidad raíz; luego las subdirecciones y programas). Si mantiene un script
de aprovisionamiento propio, ejecútelo autenticado como el usuario admin después
de que DSpace haya terminado de levantar.

## Operación

- Ver logs: `docker compose -f deploy/docker-compose.yml logs -f dspace`
- Reiniciar un servicio: `docker compose -f deploy/docker-compose.yml restart dspace`
- Actualizar tras cambios: `docker compose -f deploy/docker-compose.yml up -d --build`

Respaldos: los datos persistentes viven en tres volúmenes de Docker que deben
incluirse en la rutina de backup del servidor:

- `assetstore` — archivos subidos (documentos, imágenes, videos).
- `pgdata` — base de datos PostgreSQL.
- `solr_data` — índices de búsqueda y estadísticas.

## TLS y certificados

El frontend termina TLS con nginx usando los certificados de Let's Encrypt
montados desde `/etc/letsencrypt` del host (solo lectura). Renueve los
certificados en el host; nginx los toma en el próximo reinicio del contenedor.
