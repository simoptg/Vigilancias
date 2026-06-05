import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../api/utils/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;

  try {
    switch (method) {
      case 'GET':
        const { rows: teachers } = await sql`SELECT * FROM teachers ORDER BY name ASC`;
        const mappedTeachers = teachers.map(t => ({
          ...t,
          subjectGroup: t.subject_group,
          unavailabilities: typeof t.unavailabilities === 'string' ? JSON.parse(t.unavailabilities) : t.unavailabilities
        }));
        return res.status(200).json(mappedTeachers);

      case 'POST':
        const { id, name, subjectGroup, subject, role, email, phone, available, unavailabilities } = req.body;
        await sql`
          INSERT INTO teachers (id, name, subject_group, subject, role, email, phone, available, unavailabilities)
          VALUES (${id}, ${name}, ${subjectGroup}, ${subject}, ${role}, ${email}, ${phone}, ${available}, ${JSON.stringify(unavailabilities)})
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            subject_group = EXCLUDED.subject_group,
            subject = EXCLUDED.subject,
            role = EXCLUDED.role,
            email = EXCLUDED.email,
            phone = EXCLUDED.phone,
            available = EXCLUDED.available,
            unavailabilities = EXCLUDED.unavailabilities
        `;
        return res.status(201).json({ message: 'Teacher saved' });

      case 'DELETE':
        const { id: deleteId } = req.query;
        if (deleteId === 'all') {
          await sql`DELETE FROM teachers`;
        } else {
          await sql`DELETE FROM teachers WHERE id = ${deleteId as string}`;
        }
        return res.status(200).json({ message: 'Teacher(s) deleted' });

      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
