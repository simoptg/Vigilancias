import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './utils/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 1. Drop existing tables if needed (to ensure clean slate for structural changes)
    // Comentado para segurança, mas útil se houver conflitos de schema
    // await sql`DROP TABLE IF EXISTS allocations, exams, rooms, teachers, teacher_roles, AuthorizedUsers CASCADE`;

    // 2. Create teacher_roles FIRST (no dependencies)
    await sql`
      CREATE TABLE IF NOT EXISTS teacher_roles (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL
      );
    `;

    // 3. Inserir roles iniciais
    const initialRoles = [
      'Coordenador', 'Juri de PAP', 'Classificadores Básico', 'Classificadores Secundário', 
      'Direção', 'Inventário Mediateca', 'Matriculas', 'Bibliotecária', 
      'Rececão de Portáteis', 'AP', 'Manuais', 'Turmas', 'Atestado Médico', 
      'Coordenadora de curso', 'Avaliação Interna', 'Técnica esp.', 'P.I.R', 
      'Enes', 'TE', 'Secretariado', 'Out', 'Horários', 'EE', 'Agrupamento'
    ];

    for (const roleName of initialRoles) {
      const roleId = roleName.toLowerCase().replace(/\s+/g, '_');
      await sql`
        INSERT INTO teacher_roles (id, name)
        VALUES (${roleId}, ${roleName})
        ON CONFLICT (id) DO NOTHING
      `;
    }

    // 4. Create AuthorizedUsers (no dependencies)
    await sql`
      CREATE TABLE IF NOT EXISTS AuthorizedUsers ( 
        id SERIAL PRIMARY KEY, 
        email TEXT UNIQUE NOT NULL, 
        name TEXT, 
        role TEXT DEFAULT 'admin', 
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() 
      );
    `;

    // 5. Create teachers (depends on teacher_roles)
    await sql`
      CREATE TABLE IF NOT EXISTS teachers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          subject_group TEXT NOT NULL,
          subject TEXT NOT NULL,
          role TEXT REFERENCES teacher_roles(id),
          email TEXT UNIQUE,
          phone TEXT,
          available BOOLEAN DEFAULT TRUE,
          unavailabilities JSONB DEFAULT '[]'::jsonb
      );
    `;

    // 6. FORCE ALTER TABLE to allow NULL emails (in case table already existed)
    try {
      await sql`ALTER TABLE teachers ALTER COLUMN email DROP NOT NULL`;
      console.log("Forced NULL constraint drop on teachers.email");
    } catch (e) {
      console.log("Alter table email might have failed or already applied", e);
    }

    await sql`
      CREATE TABLE IF NOT EXISTS rooms (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          capacity INTEGER NOT NULL,
          floor TEXT
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS exams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          subject TEXT NOT NULL,
          date TEXT NOT NULL,
          time TEXT NOT NULL,
          room_ids JSONB DEFAULT '[]'::jsonb
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS allocations (
          id TEXT PRIMARY KEY,
          exam_id TEXT REFERENCES exams(id) ON DELETE CASCADE,
          room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
          invigilator1_id TEXT,
          invigilator2_id TEXT,
          substitute_id TEXT
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          recipient_email TEXT NOT NULL,
          recipient_name TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          sent_via TEXT NOT NULL,
          read BOOLEAN DEFAULT FALSE
      );
    `;

    return res.status(200).json({ message: 'Database initialized successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to initialize database' });
  }
}
