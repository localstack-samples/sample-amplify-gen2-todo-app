// ampx (via the CDK toolkit) caches the last deployed templates under .amplify/ so that
// follow-up sandbox deploys can hotswap. LocalStack starts from a clean slate on every
// `lstk start`, so a cache left over from a previous container would describe a stack
// that no longer exists. Drop it before deploying; ampx then does a normal full deploy.
import { rmSync } from 'node:fs';

rmSync('.amplify/artifacts/cdk.out/.hotswap-cache', { recursive: true, force: true });
