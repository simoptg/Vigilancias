import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './utils/db.js';

function normalizeTeacherId(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return null;
  return normalized;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;

  try {
    switch (method) {
      case 'GET':
        const { rows: allocations } = await sql`SELECT * FROM allocations`;
        if (!allocations || !Array.isArray(allocations)) {
          return res.status(200).json([]);
        }
        const mappedAllocations = allocations.map(a => ({
          id: a.id,
          examId: a.exam_id ?? a.examId,
          roomId: a.room_id ?? a.roomId,
          invigilator1Id: normalizeTeacherId(a.invigilator1_id ?? a.invigilator1Id),
          invigilator2Id: normalizeTeacherId(a.invigilator2_id ?? a.invigilator2Id),
          substituteId: normalizeTeacherId(a.substitute_id ?? a.substituteId)
        }));
        return res.status(200).json(mappedAllocations);

      case 'POST':
        const { id, examId, roomId, invigilator1Id, invigilator2Id, substituteId } = req.body;
        const normalizedInvigilator1Id = normalizeTeacherId(invigilator1Id);
        const normalizedInvigilator2Id = normalizeTeacherId(invigilator2Id);
        const normalizedSubstituteId = normalizeTeacherId(substituteId);
        
        if (id) {
          await sql`
            INSERT INTO allocations (id, exam_id, room_id, invigilator1_id, invigilator2_id, substitute_id)
            VALUES (${id}, ${examId}, ${roomId}, ${normalizedInvigilator1Id}, ${normalizedInvigilator2Id}, ${normalizedSubstituteId})
            ON CONFLICT (id) DO UPDATE SET
              exam_id = EXCLUDED.exam_id,
              room_id = EXCLUDED.room_id,
              invigilator1_id = EXCLUDED.invigilator1_id,
              invigilator2_id = EXCLUDED.invigilator2_id,
              substitute_id = EXCLUDED.substitute_id
          `;
        } else {
          await sql`
            INSERT INTO allocations (exam_id, room_id, invigilator1_id, invigilator2_id, substitute_id)
            VALUES (${examId}, ${roomId}, ${normalizedInvigilator1Id}, ${normalizedInvigilator2Id}, ${normalizedSubstituteId})
          `;
        }
        return res.status(201).json({ message: 'Allocation saved' });

      case 'DELETE':
        const { examId: deleteExamId, all, date } = req.query;
        if (all === 'true') {
          await sql`DELETE FROM allocations`;
        } else if (deleteExamId) {
          await sql`DELETE FROM allocations WHERE exam_id = ${deleteExamId as string}`;
        } else if (date) {
          await sql`
            DELETE FROM allocations 
            WHERE exam_id IN (
              SELECT id FROM exams WHERE date = ${date as string}
            )
          `;
        }
        return res.status(200).json({ message: 'Allocations deleted' });

      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
