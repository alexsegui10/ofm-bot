# Skill: ship-check

## Cuándo se usa
Antes de marcar cualquier fase o tarea como COMPLETA. Es el checklist de calidad
que garantiza que lo que se entrega es estable y no deja deuda técnica sin documentar.

## Checklist — TODOS los puntos deben ser ✓

### Tests
- [ ] Tests unitarios pasan: `npm test`
- [ ] Tests de integración pasan: `npm run test:integration`
- [ ] Tests E2E pasan (si aplican a esta fase): `npm run test:e2e`
- [ ] **Tests verdes 3 veces seguidas** — corre la suite 3 veces para descartar flakiness

### Calidad de código
- [ ] Lint limpio: `npm run lint` — cero errores, cero warnings nuevos
- [ ] No hay `console.log` de debug en el código
- [ ] No hay `TODO` sin un issue asociado documentado
- [ ] No hay claves o valores sensibles hardcodeados

### Configuración y documentación
- [ ] `.env.example` actualizado con todas las variables nuevas introducidas en esta fase
- [ ] `README.md` sección "Comandos" actualizada si se añadieron nuevos scripts npm
- [ ] Si se añadieron nuevas migraciones: `db/migrations/` numerado correctamente con `down`

### Integración
- [ ] El código corre igual en local y en VPS (solo difiere en `.env`)
- [ ] No hay imports de módulos que no están en `package.json`
- [ ] No hay rutas absolutas hardcodeadas al sistema de archivos

## Cómo ejecutar la verificación final

```bash
# 3 pasadas consecutivas de la suite completa
npm test && npm test && npm test
npm run lint
```

Si algún punto falla, la fase NO está completa. Corrígelo antes de marcar como done.
