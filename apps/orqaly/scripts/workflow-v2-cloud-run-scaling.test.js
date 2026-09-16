import { describe, expect, it } from 'vitest';
import { assertExactCloudRunScaling } from './workflow-v2-cloud-run-scaling.mjs';

function service({ service = {}, revision = {} } = {}) {
  return {
    metadata: { annotations: service },
    spec: { template: { metadata: { annotations: revision } } },
  };
}

describe('Cloud Run scaling release contract', () => {
  it('accepts the service-level representation emitted by --min/--max', () => {
    expect(() =>
      assertExactCloudRunScaling(
        service({
          service: {
            'run.googleapis.com/minScale': '1',
            'run.googleapis.com/maxScale': '1',
          },
        }),
        { min: '1', max: '1' }
      )
    ).not.toThrow();
  });

  it('accepts a looser materialized revision max under the exact service cap', () => {
    expect(() =>
      assertExactCloudRunScaling(
        service({
          service: {
            'run.googleapis.com/minScale': '1',
            'run.googleapis.com/maxScale': '1',
          },
          revision: {
            'autoscaling.knative.dev/maxScale': '10',
          },
        }),
        { min: '1', max: '1' }
      )
    ).not.toThrow();
  });

  it('accepts the equivalent v1 revision annotation representation', () => {
    expect(() =>
      assertExactCloudRunScaling(
        service({
          revision: {
            'autoscaling.knative.dev/minScale': '1',
            'autoscaling.knative.dev/maxScale': '4',
          },
        }),
        { min: '1', max: '4' }
      )
    ).not.toThrow();
  });

  it('accepts an unset minimum only when the required value is zero', () => {
    expect(() =>
      assertExactCloudRunScaling(
        service({ service: { 'run.googleapis.com/maxScale': '4' } }),
        { min: '0', max: '4' }
      )
    ).not.toThrow();
  });

  it('rejects conflicting or duplicated service and revision settings', () => {
    expect(() =>
      assertExactCloudRunScaling(
        service({
          service: {
            'run.googleapis.com/minScale': '1',
            'run.googleapis.com/maxScale': '1',
          },
          revision: {
            'autoscaling.knative.dev/minScale': '1',
          },
        }),
        { min: '1', max: '1' }
      )
    ).toThrow(/service=1, revision=1/);
  });

  it('rejects wrong or missing nonzero scaling limits', () => {
    expect(() =>
      assertExactCloudRunScaling(service(), { min: '1', max: '1' })
    ).toThrow();
    expect(() =>
      assertExactCloudRunScaling(
        service({ service: { 'run.googleapis.com/maxScale': '5' } }),
        { min: '0', max: '4' }
      )
    ).toThrow();
    expect(() =>
      assertExactCloudRunScaling(
        service({
          service: { 'run.googleapis.com/maxScale': '4' },
          revision: { 'autoscaling.knative.dev/maxScale': '3' },
        }),
        { min: '0', max: '4' }
      )
    ).toThrow();
  });
});
