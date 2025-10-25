-- Migration: Add deduplication constraints and JSONB inputs normalization
-- Date: 2024-01-01
-- Description: Enforce uniqueness (alert_id, ts) and normalize inputs to JSONB array

-- 1. Add unique constraint for deduplication on alerts_emitted
ALTER TABLE public.alerts_emitted
  ADD CONSTRAINT IF NOT EXISTS alerts_emitted_alert_id_ts_key
  UNIQUE (alert_id, ts);

-- 2. Add updated_at column if it doesn't exist
ALTER TABLE public.alerts_emitted
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 3. Set default updated_at for existing records
UPDATE public.alerts_emitted 
SET updated_at = created_at 
WHERE updated_at IS NULL;

-- 4. Normalize alert_rules.inputs to JSONB array
-- Convert existing string inputs to JSONB array format
ALTER TABLE public.alert_rules
  ALTER COLUMN inputs TYPE JSONB USING
    CASE
      WHEN jsonb_typeof(inputs::jsonb) IS NOT NULL THEN inputs::jsonb
      WHEN inputs ~ '^\s*\[.*\]\s*$' THEN inputs::jsonb  -- Already array format
      WHEN inputs ~ '^\s*\{.*\}\s*$' THEN 
        -- Convert object-like string to array (naive rescue)
        to_jsonb(regexp_split_to_array(regexp_replace(inputs,'[{} ]','','g'),','))
      ELSE to_jsonb(ARRAY[inputs])  -- Convert single string to array
    END;

-- 5. Set default empty array for inputs
ALTER TABLE public.alert_rules
  ALTER COLUMN inputs SET DEFAULT '[]'::jsonb;

-- 6. Ensure inputs is NOT NULL
ALTER TABLE public.alert_rules
  ALTER COLUMN inputs SET NOT NULL;

-- 7. Add index for better performance on dedup constraint
CREATE INDEX IF NOT EXISTS idx_alerts_emitted_alert_id_ts 
ON public.alerts_emitted(alert_id, ts);

-- 8. Add index for inputs queries
CREATE INDEX IF NOT EXISTS idx_alert_rules_inputs 
ON public.alert_rules USING GIN (inputs);
