-- 011: Add mensaje_base field to sexting_playlist phases (JSONB in-place migration)
-- Each phase object in sexting_playlists.phases gains a "mensaje_base" text field.
-- Existing rows get an empty string placeholder; real content is seeded via seed.js.

DO $$
DECLARE
  r             RECORD;
  phase         JSONB;
  new_phases    JSONB;
BEGIN
  FOR r IN SELECT id, phases FROM sexting_playlists LOOP
    new_phases := '[]'::jsonb;
    FOR phase IN SELECT jsonb_array_elements(r.phases) LOOP
      IF phase->>'mensaje_base' IS NULL THEN
        phase := phase || '{"mensaje_base": ""}'::jsonb;
      END IF;
      new_phases := new_phases || jsonb_build_array(phase);
    END LOOP;
    UPDATE sexting_playlists SET phases = new_phases WHERE id = r.id;
  END LOOP;
END $$;
