import { runArchivalSweep } from '../../archival/sweep.js';

export async function handleArchivalSweep(admin, _pulse, { req } = {}) {
  const stats = await runArchivalSweep(admin, { req });
  return { status: 'done', stats };
}
