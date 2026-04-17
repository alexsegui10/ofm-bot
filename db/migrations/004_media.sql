CREATE TABLE IF NOT EXISTS media (
  id                    SERIAL PRIMARY KEY,
  file_id               TEXT UNIQUE NOT NULL,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('photo', 'video', 'audio')),
  tags                  TEXT[] DEFAULT '{}',
  intensidad            INTEGER DEFAULT 1 CHECK (intensidad BETWEEN 1 AND 5),
  precio_individual_eur DECIMAL(10,2),
  veces_vendido         INTEGER DEFAULT 0,
  descripcion           TEXT,
  activo                BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_tipo       ON media(tipo);
CREATE INDEX IF NOT EXISTS idx_media_tags       ON media USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_media_intensidad ON media(intensidad);
