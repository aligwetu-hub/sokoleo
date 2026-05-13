const express = require('express');
const router  = express.Router();
const { query } = require('../db/pool');

// POST /api/messages/conversation  — find or create conversation between farmer + trader
router.post('/conversation', async (req, res) => {
  const { farmer_id, trader_id, listing_id } = req.body;
  if (!farmer_id || !trader_id)
    return res.status(400).json({ error: 'farmer_id and trader_id are required' });

  try {
    // Try to find existing
    let r = await query(
      `SELECT * FROM conversations WHERE farmer_id=$1 AND trader_id=$2`,
      [farmer_id, trader_id]
    );

    if (r.rows.length) return res.json({ conversation: r.rows[0] });

    // Create new
    r = await query(
      `INSERT INTO conversations (farmer_id, trader_id, listing_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [farmer_id, trader_id, listing_id || null]
    );
    res.status(201).json({ conversation: r.rows[0] });
  } catch (err) {
    console.error('Open conversation error:', err.message);
    res.status(500).json({ error: 'Failed to open conversation' });
  }
});

// GET /api/messages/inbox/:userId  — all conversations for a user, newest first
router.get('/inbox/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const r = await query(`
      SELECT
        c.id,
        c.farmer_id,
        c.trader_id,
        c.listing_id,
        c.last_message_at,
        f.name  AS farmer_name,
        t.name  AS trader_name,
        (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1)  AS last_message,
        (SELECT COUNT(*)::int FROM messages
         WHERE conversation_id = c.id AND is_read = FALSE AND sender_id != $1) AS unread_count
      FROM conversations c
      JOIN users f ON c.farmer_id = f.id
      JOIN users t ON c.trader_id = t.id
      WHERE c.farmer_id = $1 OR c.trader_id = $1
      ORDER BY c.last_message_at DESC`,
      [userId]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Inbox error:', err.message);
    res.status(500).json({ error: 'Failed to load inbox' });
  }
});

// GET /api/messages/thread/:convId  — all messages in a conversation
router.get('/thread/:convId', async (req, res) => {
  try {
    const r = await query(`
      SELECT m.id, m.sender_id, m.body, m.is_read, m.created_at,
             u.name AS sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at ASC`,
      [req.params.convId]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Thread error:', err.message);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// POST /api/messages/send  — send a message
router.post('/send', async (req, res) => {
  const { conversation_id, sender_id, body } = req.body;
  if (!conversation_id || !sender_id || !body || !body.trim())
    return res.status(400).json({ error: 'conversation_id, sender_id and body are required' });

  try {
    const msg = await query(`
      INSERT INTO messages (conversation_id, sender_id, body)
      VALUES ($1, $2, $3) RETURNING *`,
      [conversation_id, sender_id, body.trim()]
    );

    await query(
      `UPDATE conversations SET last_message_at=NOW() WHERE id=$1`,
      [conversation_id]
    );

    res.status(201).json({ success: true, message: msg.rows[0] });
  } catch (err) {
    console.error('Send message error:', err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// PATCH /api/messages/read/:convId/:userId  — mark messages as read for this user
router.patch('/read/:convId/:userId', async (req, res) => {
  try {
    await query(
      `UPDATE messages SET is_read=TRUE
       WHERE conversation_id=$1 AND sender_id != $2 AND is_read=FALSE`,
      [req.params.convId, req.params.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err.message);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

module.exports = router;
