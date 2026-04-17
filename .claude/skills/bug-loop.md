# Skill: bug-loop

## Cuándo se usa
Cualquier vez que se encuentre un bug, un test fallando, o un comportamiento inesperado en el código.
Este es el workflow CRÍTICO de iteración — seguirlo estrictamente evita rabbit holes.

## Workflow paso a paso

### Paso 1 — Reproduce el bug con un test que falle
- Antes de tocar nada, escribe un test que capture el bug exactamente.
- Si el bug ya tiene un test fallando, úsalo tal cual.
- **No avances sin un test rojo que reproduzca el problema.**

### Paso 2 — Identifica la causa raíz (NO el síntoma)
- Lee los logs completos del error, no solo la última línea.
- Traza el stack hasta el origen real del problema.
- Lee el código relevante: el módulo que falla, sus dependencias directas.
- Pregúntate: ¿por qué ocurre esto? ¿Qué asunción es incorrecta?
- **No arregles el síntoma. Arregla la causa.**

### Paso 3 — Propón un fix mínimo
- El fix debe ser lo más pequeño posible que corrija la causa raíz.
- Si el fix requiere cambiar más de 3 archivos, probablemente estás resolviendo el síntoma.
- Documenta en un comentario por qué el fix es correcto.

### Paso 4 — Aplica el fix

### Paso 5 — Corre el test → debe pasar verde
- Si sigue fallando, vuelve al Paso 2 con nueva información.

### Paso 6 — Corre TODA la suite de tests → ningún regression
```bash
npm test
```
- Si algún test regresiona, el fix rompió algo más. Investiga antes de continuar.

### Paso 7 — Si después de 3 intentos sigue fallando, CAMBIA DE APPROACH
- Descarta el approach actual completamente.
- Busca una solución alternativa desde cero.
- Documenta qué intentaste y por qué no funcionó.

### Paso 8 — Si después de 5 intentos no resuelves, PARA y documenta el bloqueo
Crea un comentario en el código o un issue con:
- Descripción exacta del bug
- Reproducción mínima
- Los 5 approaches intentados y por qué fallaron
- Hipótesis sobre dónde puede estar el problema real
- Escala al operador humano.
