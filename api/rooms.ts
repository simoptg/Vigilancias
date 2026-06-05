import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './utils/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;

  try {
    switch (method) {
      case 'GET':
        const { rows: rooms } = await sql`SELECT * FROM rooms ORDER BY name ASC`;
        return res.status(200).json(rooms);

      case 'POST':
        const { id, name, capacity, floor } = req.body;
        await sql`
          INSERT INTO rooms (id, name, capacity, floor)
          VALUES (${id}, ${name}, ${capacity}, ${floor})
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            capacity = EXCLUDED.capacity,
            floor = EXCLUDED.floor
        `;
        return res.status(201).json({ message: 'Room saved' });

      case 'DELETE':
        const { id: deleteId } = req.query;
        await sql`DELETE FROM rooms WHERE id = ${deleteId as string}`;
        return res.status(200).json({ message: 'Room deleted' });

      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
