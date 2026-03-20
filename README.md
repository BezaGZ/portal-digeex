# Portal de Gestion del Conocimiento — DIGEEX

Sistema de gestion del conocimiento para la Direccion General de
Educacion Extraescolar (DIGEEX), Ministerio de Educacion de Guatemala.

Desarrollado como Ejercicio Profesional Supervisado (EPS),
CUNORI — Universidad de San Carlos de Guatemala, 2026.

## Descripcion

Repositorio digital institucional que permite a DIGEEX almacenar,
organizar y difundir recursos educativos, investigaciones, estadisticas
y materiales de sus programas extraescolares.

## Stack

| Componente | Tecnologia |
|---|---|
| Backend | DSpace 9.2 (REST API) |
| Frontend | Angular 20 + PrimeNG 20 + Tailwind CSS 4 |
| Base de datos | PostgreSQL 16 |
| Busqueda | Apache Solr 9 |
| Testing | Vitest (TDD) |
| CI/CD | GitHub Actions |

## Estructura del repositorio
```
portal-digeex/
├── frontend/          Angular 20 (puerto 4200)
├── docker/            Configuracion Docker para DSpace
│   ├── local.cfg      Configuracion personalizada de DSpace
│   └── .env.example   Variables de entorno (plantilla)
├── scripts/           Scripts de setup y mantenimiento
└── .github/workflows/ Pipeline CI/CD
```

El backend DSpace no se incluye en este repositorio.
Se clona por separado desde el repositorio oficial:
https://github.com/DSpace/DSpace (branch dspace-9.2)

## Inicio rapido

### 1. Backend (DSpace)
```bash
# Clonar DSpace oficial (fuera de este repo o en carpeta ignorada)
git clone https://github.com/DSpace/DSpace.git backend
cd backend && git checkout dspace-9.2

# Levantar servicios
docker compose -p d9 up -d

# Crear estructura DIGEEX (incluye cuenta de administrador)
cd ..
cp docker/.env.example docker/.env   # Configurar credenciales
./scripts/setup-dspace.sh
```

### 2. Frontend (Angular)
```bash
cd frontend
npm install
ng serve
```

Acceder en http://localhost:4200

## Servicios

| Servicio | URL |
|---|---|
| Frontend Angular | http://localhost:4200 |
| DSpace REST API | http://localhost:8080/server/api |
| HAL Browser | http://localhost:8080/server/api/browser |
| Solr Admin | http://localhost:8983/solr |
| PostgreSQL | localhost:5432 |

## Ramas

| Rama | Proposito |
|---|---|
| main | Version estable (cierre de sprint) |
| dev | Desarrollo e integracion |

## Autor

Mynor Bezaleel Ramos Gonzalez
EPS — Ingenieria en Ciencias y Sistemas
CUNORI, Universidad de San Carlos de Guatemala