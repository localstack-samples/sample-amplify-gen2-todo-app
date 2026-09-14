import { Amplify } from 'aws-amplify';
import { parseAmplifyConfig } from 'aws-amplify/utils';
import outputs from '../amplify_outputs.json';

/**
 * Configure the Amplify client library from `amplify_outputs.json`.
 *
 * The outputs file already carries the AppSync URL, so the data layer talks
 * to wherever the backend was deployed. Cognito endpoints, however, are
 * derived from the region inside the Amplify library and cannot be expressed
 * in the outputs file. When `VITE_LOCALSTACK_ENDPOINT` is set we point them at
 * LocalStack too, so the same code runs against LocalStack or against AWS.
 */
export const LOCALSTACK_ENDPOINT: string | undefined = import.meta.env.VITE_LOCALSTACK_ENDPOINT;

function configureAmplify(): void {
  const config = parseAmplifyConfig(outputs);

  if (LOCALSTACK_ENDPOINT && config.Auth) {
    Object.assign(config.Auth.Cognito, {
      userPoolEndpoint: LOCALSTACK_ENDPOINT,
      identityPoolEndpoint: LOCALSTACK_ENDPOINT,
    });
  }

  Amplify.configure(config);
}

// Runs on import, so importing this module first in main.tsx guarantees Amplify is
// configured before any component module creates a data client.
configureAmplify();
