// ═══════════════════════════════════════════════════════════════
// ADD THIS BLOCK to your existing authRoutes.js file
// Place it alongside your other routes
// ═══════════════════════════════════════════════════════════════

// POST /api/v1/auth/add-role — add a secondary role to existing user
router.post('/add-role', async (req, res) => {
  const { user_id, secondary_role } = req.body;

  if (!user_id || !secondary_role) {
    return res.status(400).json({ error: 'user_id and secondary_role are required' });
  }

  if (!['farmer', 'trader'].includes(secondary_role)) {
    return res.status(400).json({ error: 'secondary_role must be farmer or trader' });
  }

  try {
    // Check user exists
    const check = await db.query(
      `SELECT id, role, secondary_role FROM users WHERE id = $1`, [user_id]
    );

    if (!check.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = check.rows[0];

    // Prevent adding same role as primary
    if (user.role === secondary_role) {
      return res.status(400).json({ error: `You are already a ${secondary_role}` });
    }

    // Prevent duplicate secondary role
    if (user.secondary_role === secondary_role) {
      return res.status(400).json({ error: `Already registered as ${secondary_role}` });
    }

    // Add the secondary role
    const result = await db.query(
      `UPDATE users 
       SET secondary_role = $1, role_switched_at = NOW()
       WHERE id = $2 
       RETURNING id, full_name, phone, role, secondary_role`,
      [secondary_role, user_id]
    );

    res.json({
      success: true,
      message: `You are now also registered as a ${secondary_role}`,
      user: result.rows[0]
    });

  } catch (err) {
    console.error('Add role error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/auth/roles/:userId — get all roles for a user
router.get('/roles/:userId', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, full_name, phone, role, secondary_role, role_switched_at 
       FROM users WHERE id = $1`,
      [req.params.userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});
