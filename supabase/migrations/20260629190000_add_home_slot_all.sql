DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'home_slot' AND e.enumlabel = 'all'
  ) THEN
    ALTER TYPE public.home_slot ADD VALUE 'all';
  END IF;
END $$;
