# OFM Bot

Bot de Telegram con Business Connection para gestión de fans de modelos OnlyFans/Fansly.
Mantiene conversaciones de roleplaying con IA, vende contenido digital, y escala a operador humano vía WhatsApp.

## Setup rápido

```bash
# 1. Copia las variables de entorno
cp .env.example .env
# Edita .env con tus credenciales reales

# 2. Levanta Postgres
docker compose up -d postgres

# 3. Instala dependencias (Prompt 2+)
npm install

# 4. Corre migraciones (Prompt 2+)
npm run db:migrate

# 5. Inicia el bot
npm run dev
```

## Requisitos

- Node.js 20+
- Docker + Docker Compose
- Cuenta de Telegram Business con Business Connection activa
- Claves de Anthropic y OpenRouter

## Comandos

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor en modo desarrollo con hot-reload |
| `npm test` | Suite de tests unitarios |
| `npm run test:integration` | Tests de integración (requiere Postgres) |
| `npm run test:e2e` | Tests E2E con Playwright |
| `npm run lint` | Lint del código |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `npm run db:seed` | Seed de datos de prueba |

## Arquitectura

Ver `CLAUDE.md` para descripción completa de agentes y convenciones.

## Variables de entorno

Ver `.env.example` para la lista completa de variables necesarias.
