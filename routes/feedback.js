// routes/feedback.js — owns feedback submission from the public landing page.
// Does NOT own: contact page logic, support tickets, admin review UI.

const express = require('express');

module.exports = function({ pool }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const { name, email, category, message } = req.body || {};

    // Validation
    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return res.status(400).json({ error: 'Message is required and must be at least 10 characters.' });
    }

    const validCategories = ['Feedback', 'Suggestion', 'Bug Report'];
    if (!category || !validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category. Choose: Feedback, Suggestion, or Bug Report.' });
    }

    const trimmedMessage = message.trim().slice(0, 2000);
    const trimmedName = name ? name.trim().slice(0, 100) : null;
    const trimmedEmail = email ? email.trim().slice(0, 255) : null;

    try {
      await pool.query(
        `INSERT INTO feedback (name, email, category, message) VALUES ($1, $2, $3, $4)`,
        [trimmedName, trimmedEmail, category, trimmedMessage]
      );
      res.json({ success: true, message: 'Thanks for your feedback!' });
    } catch (err) {
      console.error('[feedback] DB insert error:', err.message);
      res.status(500).json({ error: 'Failed to save feedback. Please try again.' });
    }
  });

  return router;
};