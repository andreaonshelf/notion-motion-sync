-- Add schedule checkbox and other fields to sync_tasks table
ALTER TABLE sync_tasks 
ADD COLUMN IF NOT EXISTS schedule_checkbox BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS duration INTEGER,
ADD COLUMN IF NOT EXISTS due_date DATE,
ADD COLUMN IF NOT EXISTS status TEXT;

-- Create index for schedule checkbox
CREATE INDEX IF NOT EXISTS idx_schedule ON sync_tasks(schedule_checkbox);

-- Update the upsertSyncTask function will need to handle these new fields