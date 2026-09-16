import { describe, expect, it } from 'vitest';
import {
  captureProcessNextTrigger,
  createProcessNextTriggerCapture,
  withProcessNextTriggerCapture,
} from './process-next-trigger-capture.js';

describe('process-next trigger capture', () => {
  it('isolates concurrent execution captures', async () => {
    const first = createProcessNextTriggerCapture();
    const second = createProcessNextTriggerCapture();
    let releaseFirst;
    let releaseSecond;

    const firstRun = withProcessNextTriggerCapture(first, async () => {
      expect(captureProcessNextTrigger('first-child')).toBe(true);
      await new Promise((resolve) => {
        releaseFirst = resolve;
      });
      expect(captureProcessNextTrigger('first-grandchild')).toBe(true);
    });
    const secondRun = withProcessNextTriggerCapture(second, async () => {
      expect(captureProcessNextTrigger('second-child')).toBe(true);
      await new Promise((resolve) => {
        releaseSecond = resolve;
      });
      expect(captureProcessNextTrigger('second-grandchild')).toBe(true);
    });

    await Promise.resolve();
    releaseSecond();
    await secondRun;
    releaseFirst();
    await firstRun;

    expect([...first.jobIds]).toEqual(['first-child', 'first-grandchild']);
    expect([...second.jobIds]).toEqual(['second-child', 'second-grandchild']);
  });

  it('deactivates capture before late work from a settled execution runs', async () => {
    const capture = createProcessNextTriggerCapture();
    let lateCaptureResult = null;

    await withProcessNextTriggerCapture(capture, async () => {
      setTimeout(() => {
        lateCaptureResult = captureProcessNextTrigger('late-child');
      }, 0);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(capture.active).toBe(false);
    expect(lateCaptureResult).toBe(false);
    expect([...capture.jobIds]).toEqual([]);
  });
});
