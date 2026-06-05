import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../api/utils/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;

  try {
    switch (method) {
      case 'GET':
        const { rows: exams } = await sql`SELECT * FROM exams ORDER BY date ASC, time ASC`;
        const mappedExams = exams.map(e => ({
          ...e,
          roomIds: typeof e.room_ids === 'string' ? JSON.parse(e.room_ids) : e.room_ids
        }));
        return res.status(200).json(mappedExams);

      case 'POST':
        const { id, name, subject, date, time, roomIds } = req.body;
        await sql`
          INSERT INTO exams (id, name, subject, date, time, room_ids)
          VALUES (${id}, ${name}, ${subject}, ${date}, ${time}, ${JSON.stringify(roomIds)})
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            subject = EXCLUDED.subject,
            date = EXCLUDED.date,
            time = EXCLUDED.time,
            room_ids = EXCLUDED.room_ids
        `;
        return res.status(201).json({ message: 'Exam saved' });

      case 'DELETE':
        const { id: deleteId } = req.query;
        await sql`DELETE FROM exams WHERE id = ${deleteId as string}`;
        return res.status(200).json({ message: 'Exam deleted' });

      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
