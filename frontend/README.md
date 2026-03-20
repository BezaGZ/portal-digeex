# Portal DIGEEX — Frontend

Frontend Angular 20 del Portal de Gestion del Conocimiento de la
Direccion General de Educacion Extraescolar (DIGEEX),
Ministerio de Educacion de Guatemala.

## Stack

- Angular 20
- PrimeNG 20 + Tailwind CSS 4
- Vitest (testing)
- DSpace 9.2 REST API (backend)

## Requisitos

- Node.js 22 LTS
- npm 10+
- DSpace 9.2 corriendo en localhost:8080 (ver docker/ en la raiz)

## Instalacion
```bash
npm install
```

## Desarrollo
```bash
ng serve
```

Acceder en http://localhost:4200.
Las peticiones a /server/ se redirigen a DSpace via proxy (proxy.conf.json).

## Scripts
```bash
npm run lint          # Analisis estatico con ESLint
npm run build         # Compilar para produccion
npm test              # Tests unitarios con Vitest
npm run test:coverage # Tests con reporte de cobertura
npm run lint:fix      # Corregir errores de lint automaticamente
npm run format        # Formatear codigo con Prettier
```

## Estructura
```
src/
├── app/
│   ├── core/           # Servicios, modelos, API
│   ├── features/       # Modulos por funcionalidad
│   ├── shared/         # Componentes reutilizables
│   └── layout/         # Header, sidebar, footer
├── environments/       # Configuracion por ambiente
└── assets/             # Recursos estaticos
```