import { Router, Request, Response } from 'express';
import { queryAll, queryOne, runSql, execSql } from '../db/schema';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// Get all forwarders (carrier DB)
router.get('/', authenticate, (req: Request, res: Response) => {
  const forwarders = queryAll('SELECT * FROM forwarders ORDER BY name');
  res.json({ forwarders });
});

// Get one forwarder by ID
router.get('/:id', authenticate, (req: Request, res: Response) => {
  const f = queryOne('SELECT * FROM forwarders WHERE id = ?', [req.params.id]);
  if (!f) return res.status(404).json({ error: 'Forwarder not found' });
  res.json(f);
});

// Create a new forwarder
router.post('/', authenticate, requireAdmin, (req: Request, res: Response) => {
  const { name, contact, email, phone, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  try {
    const { lastId } = runSql(
      'INSERT INTO forwarders (name, contact, email, phone, notes) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), contact || null, email || null, phone || null, notes || null]
    );
    const created = queryOne('SELECT * FROM forwarders WHERE id = ?', [lastId]);
    return res.status(201).json(created);
  } catch (e: any) {
    return res.status(400).json({ error: e.message || 'Could not create forwarder' });
  }
});

// Update forwarder
router.put('/:id', authenticate, requireAdmin, (req: Request, res: Response) => {
  const existing = queryOne('SELECT * FROM forwarders WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Forwarder not found' });

  const { name, contact, email, phone, notes } = req.body;
  runSql(
    'UPDATE forwarders SET name = ?, contact = ?, email = ?, phone = ?, notes = ? WHERE id = ?',
    [name || existing.name, contact || existing.contact, email || existing.email, phone || existing.phone, notes || existing.notes, req.params.id]
  );
  const updated = queryOne('SELECT * FROM forwarders WHERE id = ?', [req.params.id]);
  res.json(updated);
});

// Delete forwarder
router.delete('/:id', authenticate, requireAdmin, (req: Request, res: Response) => {
  const existing = queryOne('SELECT * FROM forwarders WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Forwarder not found' });
  execSql('DELETE FROM forwarders WHERE id = ?', [req.params.id]);
  res.json({ message: 'Forwarder deleted' });
});

export default router;
