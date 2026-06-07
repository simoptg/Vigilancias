import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './utils/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    console.log('Starting migration...');

    // 1. Add missing columns to exams table if they don't exist
    await sql`ALTER TABLE exams ADD COLUMN IF NOT EXISTS duration INTEGER NOT NULL DEFAULT 120`;
    await sql`ALTER TABLE exams ADD COLUMN IF NOT EXISTS tolerance INTEGER NOT NULL DEFAULT 30`;
    await sql`ALTER TABLE exams ADD COLUMN IF NOT EXISTS rooms_needed INTEGER NOT NULL DEFAULT 1`;
    await sql`ALTER TABLE exams ADD COLUMN IF NOT EXISTS room_ids JSONB DEFAULT '[]'::jsonb`;

    // 2. Add priority to rooms if missing
    await sql`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0`;

    console.log('Migration completed successfully');
    return res.status(200).json({ message: 'Migration completed successfully' });
  } catch (error) {
    console.error('Migration failed:', error);
    return res.status(500).json({ error: 'Migration failed', details: error.message });
  }
}
