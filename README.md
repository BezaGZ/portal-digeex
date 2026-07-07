# Portal de Gestión del Conocimiento — DIGEEX

Sistema de gestión del conocimiento para la Dirección General de
Educación Extraescolar (DIGEEX), Ministerio de Educación de Guatemala.

Desarrollado como Ejercicio Profesional Supervisado (EPS),
CUNORI — Universidad de San Carlos de Guatemala, 2026.

## Descripción

Repositorio digital institucional que permite a DIGEEX almacenar,
organizar y difundir recursos educativos, investigaciones, estadísticas
y materiales de sus programas extraescolares.

## Stack

| Componente    | Tecnología                                   |
| ------------- | -------------------------------------------- |
| Backend       | DSpace 9.2 (REST API, Java 17 en contenedor) |
| Frontend      | Angular 20 + PrimeNG 20 + Tailwind CSS 4     |
| Base de datos | PostgreSQL 16                                |
| Búsqueda      | Apache Solr 9                                |
| Testing       | Vitest (TDD)                                 |
| CI/CD         | GitHub Actions                               |

## Requisitos previos

- Docker y Docker Compose (el backend corre en contenedores).
- Node.js 20 o superior (el frontend corre en el host).
- Git.

Java y Maven no se instalan localmente: están dentro de los contenedores de DSpace.

## Estructura del repositorio

```
portal-digeex/
├── frontend/          Aplicación Angular 20 (puerto 4200)
├── deploy/            Configuración de despliegue (Docker, nginx, config de DSpace)
└── .github/workflows/ Pipeline CI/CD
```

El backend DSpace no se versiona en este repositorio: se usa la imagen oficial
(https://github.com/DSpace/DSpace, branch dspace-9.2). Para producción, todo el
stack se levanta con `deploy/` (ver `deploy/README.md`).

## Configuración

Frontend (`frontend/src/environments/`): `environment.ts` (desarrollo) y
`environment.prod.ts` (producción). Ajustes: `apiUrl` (URL del backend) y
`allowedEmailDomains` (dominios de correo permitidos).

Backend/despliegue: variables en `deploy/.env` (a partir de `deploy/.env.example`).

## Inicio rápido

### Backend + frontend (producción)

    docker compose -f deploy/docker-compose.yml up -d --build

Ver `deploy/README.md` para el detalle.

### Frontend (desarrollo local)

    cd frontend
    npm install
    npm start

Acceder en http://localhost:4200

La estructura del repositorio (comunidad raíz, subdirecciones y programas) se
inicializa desde el panel de administración (Repositorio → DIGEEX).

## Pruebas

Desde `frontend/`:

    npm test              # Suite completa (Vitest)
    npm run test:coverage # Con reporte de cobertura
    npm run lint          # ESLint
    npm run format        # Prettier

## Servicios

| Servicio         | URL                                      |
| ---------------- | ---------------------------------------- |
| Frontend Angular | http://localhost:4200                    |
| DSpace REST API  | http://localhost:8080/server/api         |
| HAL Browser      | http://localhost:8080/server/api/browser |
| Solr Admin       | http://localhost:8983/solr               |
| PostgreSQL       | localhost:5432                           |

## Ramas

| Rama | Propósito                          |
| ---- | ---------------------------------- |
| main | Versión estable (cierre de sprint) |
| dev  | Desarrollo e integración           |

## Autor

Mynor Bezaleel Ramos González
EPS — Ingeniería en Ciencias y Sistemas
CUNORI, Universidad de San Carlos de Guatemala
