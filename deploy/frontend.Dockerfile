# Compila el Angular y lo sirve con nginx. La imagen final es solo nginx + los
# estaticos; la etapa con Node se descarta.

# Build de produccion (apiUrl vacio, mismo origen).
FROM node:22-slim AS build
WORKDIR /app
# Manifiestos primero para cachear el npm ci si no cambian.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build -- --configuration production

# Servir los estaticos.
FROM nginx:1.27-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
# Angular 20 emite en dist/<proyecto>/browser.
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
