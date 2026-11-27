BEGIN;

ALTER TABLE fixed_asset_depreciation_lines
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id UUID REFERENCES accounting_journal_entries(id);

COMMIT;
