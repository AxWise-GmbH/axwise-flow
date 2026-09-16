import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const SERVICE_KEYS = {
  min: 'run.googleapis.com/minScale',
  max: 'run.googleapis.com/maxScale',
};
const REVISION_KEYS = {
  min: 'autoscaling.knative.dev/minScale',
  max: 'autoscaling.knative.dev/maxScale',
};

function annotationValue(annotations, key) {
  const value = annotations?.[key];
  return typeof value === 'string' ? value : null;
}

function assertDimension(document, dimension, expected) {
  const service = annotationValue(document?.metadata?.annotations, SERVICE_KEYS[dimension]);
  const revision = annotationValue(
    document?.spec?.template?.metadata?.annotations,
    REVISION_KEYS[dimension]
  );
  const configured = [service, revision].filter((value) => value !== null);
  let valid;
  if (dimension === 'max' && service !== null) {
    // Cloud Run may materialize its revision default (currently 10) when a
    // Direct VPC setting is updated. The service-level maximum is the fleet
    // cap, so an equal or looser revision cap cannot raise the effective max.
    valid = service === expected
      && (revision === null || (/^[1-9][0-9]*$/.test(revision)
        && Number(revision) >= Number(expected)));
  } else {
    valid = expected === '0'
      ? configured.length === 0 || (configured.length === 1 && configured[0] === expected)
      : configured.length === 1 && configured[0] === expected;
  }

  if (!valid) {
    throw new Error(
      `Cloud Run ${dimension} scaling expected exactly ${expected}; ` +
        `service=${service ?? 'unset'}, revision=${revision ?? 'unset'}`
    );
  }
}

export function assertExactCloudRunScaling(document, { min, max }) {
  if (!/^(0|[1-9][0-9]*)$/.test(min) || !/^[1-9][0-9]*$/.test(max)) {
    throw new Error('Expected scaling values must be canonical nonnegative integers');
  }
  assertDimension(document, 'min', min);
  assertDimension(document, 'max', max);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`${name} is required`);
  }
  return process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const document = JSON.parse(fs.readFileSync(0, 'utf8'));
    assertExactCloudRunScaling(document, {
      min: argument('--min'),
      max: argument('--max'),
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 77;
  }
}
