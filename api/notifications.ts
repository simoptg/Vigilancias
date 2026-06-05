import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../api/utils/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;

  try {
    switch (method) {
      case 'GET':
        const { rows: notifications } = await sql`SELECT * FROM notifications ORDER BY timestamp DESC`;
        const mappedNotifications = notifications.map(n => ({
          ...n,
          recipientEmail: n.recipient_email,
          recipientName: n.recipient_name,
          sentVia: n.sent_via
        }));
        return res.status(200).json(mappedNotifications);

      case 'POST':
        const { id, timestamp, recipientEmail, recipientName, title, message, sentVia, read } = req.body;
        await sql`
          INSERT INTO notifications (id, timestamp, recipient_email, recipient_name, title, message, sent_via, read)
          VALUES (${id}, ${timestamp}, ${recipientEmail}, ${recipientName}, ${title}, ${message}, ${sentVia}, ${read})
          ON CONFLICT (id) DO UPDATE SET
            read = EXCLUDED.read
        `;
        return res.status(201).json({ message: 'Notification saved' });

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
