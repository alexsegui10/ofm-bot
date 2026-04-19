-- Paso 8.6 — FIX D9: persistir si Alba ya enseñó el catálogo a un cliente.
--
-- Antes (FIX C / BUG C) usábamos `assistantHasShownCatalog(history)` que
-- escaneaba los últimos 6 mensajes del assistant buscando markers
-- ("esto es lo que tengo", "tengo de ", "cuántas quieres?"). Esa ventana
-- es demasiado corta: en D9 (cliente compara precios con otras modelos)
-- el catálogo se mostró en el turno 1, pero al llegar el turno 3 ya había
-- caído fuera del lookback y Alba volvió a recitar la lista entera —
-- sumando un fallo "D - Repitió información" en el evaluador.
--
-- La fix correcta es persistir el estado en la fila del cliente:
-- una vez visto, ya está visto. La única forma de re-mostrarlo es que el
-- cliente lo pida explícitamente (clientExplicitlyAsksCatalog).
--
-- No reseteamos el flag por inactividad — si vuelve después de 7 días el
-- catálogo se vuelve a forzar via shouldAppendCatalog (lastInteraction)
-- y al re-emitirlo se queda en TRUE igual.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS has_seen_catalog BOOLEAN NOT NULL DEFAULT FALSE;
