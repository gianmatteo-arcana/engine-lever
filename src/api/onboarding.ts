/**
 * Onboarding API Routes
 * Stub implementation for testing compatibility
 */

import { Router } from 'express';

const router = Router();

// Stub implementation
router.post('/start', async (req, res) => {
  res.json({ message: 'Onboarding API stub - not implemented' });
});

export const onboardingRoutes = router;