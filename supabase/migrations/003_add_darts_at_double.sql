-- Add darts_at_double and darts_for_checkout columns to turns
-- darts_at_double: how many darts were thrown at a double (for checkout % tracking)
-- darts_for_checkout: how many total darts were used in a checkout turn (for accurate dart count)
ALTER TABLE turns ADD COLUMN IF NOT EXISTS darts_at_double int;
ALTER TABLE turns ADD COLUMN IF NOT EXISTS darts_for_checkout int;
