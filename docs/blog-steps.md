# Walkthrough: building and running this app on LocalStack

Every command below was run on 2026-09-14 against `localstack/localstack-pro:dev`
(`2026.9.0.dev263`) with lstk 1.0.1, Node 22.23, `@aws-amplify/backend` 1.25.0,
`@aws-amplify/backend-cli` 1.10.0 (`ampx`) and `aws-amplify` 6.20.0. Outputs are trimmed to the
interesting lines.

## 1. Scaffold the app

```bash
npm create vite@latest amplify-gen2-localstack-todo -- --template react-ts
cd amplify-gen2-localstack-todo
npm create amplify@latest -- --yes
```

`create-amplify` adds the backend definition and its dev dependencies:

```
Installing devDependencies:
 - @aws-amplify/backend
 - @aws-amplify/backend-cli
 - aws-cdk-lib@2.268.0
 - constructs@^10.0.0
 - typescript@^5.0.0
 - tsx
 - esbuild
Installing dependencies:
 - aws-amplify
✔ Template files created
Successfully created a new project!
```

The generated backend is the whole backend of this sample. `amplify/auth/resource.ts`:

```ts
export const auth = defineAuth({
  loginWith: { email: true },
});
```

`amplify/data/resource.ts` (comments removed):

```ts
const schema = a.schema({
  Todo: a
    .model({ content: a.string() })
    .authorization((allow) => [allow.guest()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'identityPool' },
});
```

`allow.guest()` with `identityPool` means: a visitor gets temporary AWS credentials from the
Cognito identity pool without signing in, and the Amplify client signs every GraphQL request with
them (SigV4). AppSync checks the signature and the unauthenticated role's permissions.

Two edits to Vite's `tsconfig.app.json` complete the setup: `"strict": true` (Amplify's schema
types depend on strict mode) and `"resolveJsonModule": true` (to import `amplify_outputs.json`).

## 2. Start LocalStack

The browser calls Cognito and AppSync on LocalStack directly from the Vite dev server's origin,
so that origin has to be on LocalStack's CORS allow-list. `lstk` forwards `LOCALSTACK_`-prefixed
variables to the container:

```
$ LOCALSTACK_EXTRA_CORS_ALLOWED_ORIGINS=http://localhost:5173 LOCALSTACK_LAMBDA_IGNORE_ARCHITECTURE=1 lstk start
Starting LocalStack...
✔︎ LocalStack is running (containerId: 1fe91bfb2e36)
• Endpoint: localhost.localstack.cloud:4566
```

Without the CORS variable, the browser's preflight to Cognito fails with
"No 'Access-Control-Allow-Origin' header" and the page shows a network error. Amplify pins its
`CDKBucketDeployment` helper Lambda to `arm64`; `LAMBDA_IGNORE_ARCHITECTURE=1` lets LocalStack run
it natively on x86_64 hosts, where it would otherwise fail with `Runtime.InvalidEntrypoint` and the
data stack would time out.

## 3. Write the AWS profile

```
$ lstk setup aws
✔︎ Created LocalStack profile in ~/.aws
```

This writes a `localstack` profile to `~/.aws/config` and test credentials to `~/.aws/credentials`:

```ini
[profile localstack]
region       = us-east-1
output       = json
endpoint_url = http://localhost.localstack.cloud:4566
```

CDK publishes assets to S3 with the bucket name in the hostname (`<bucket>.<endpoint>`). On the
plain endpoint LocalStack cannot tell those requests are S3, so the deploy fails while publishing
assets. Point S3 at `s3.localhost.localstack.cloud` with the service-specific endpoint variable in
the terminal that runs `ampx` (the npm scripts set it for you):

```
$ export AWS_ENDPOINT_URL_S3=http://s3.localhost.localstack.cloud:4566
$ aws --profile localstack sts get-caller-identity --query Account --output text
000000000000
```

The same override can be written into a `[services]` section of the profile instead.

## 4. Bootstrap CDK

```
$ npm run localstack:bootstrap    # lstk cdk bootstrap aws://000000000000/us-east-1
 ⏳  Bootstrapping environment aws://000000000000/us-east-1...
CDKToolkit: creating CloudFormation changeset...
 ✅  Environment aws://000000000000/us-east-1 bootstrapped.
```

About 7 seconds. `ampx` looks for the `/cdk-bootstrap/hnb659fds/version` SSM parameter before it
deploys.

## 5. Deploy the backend

```
$ npm run localstack:deploy       # ampx sandbox --once --identifier local --profile localstack
  Amplify Sandbox
  Identifier:   local
  Stack:        amplify-amplifygen2localstacktodo-local-sandbox-26c8b1a1be
  Region:       us-east-1
✔ Backend synthesized in 1.71 seconds
✔ Type checks completed in 4.84 seconds
✔ Built and published assets
amplify-…-local-sandbox-26c8b1a1be | CREATE_IN_PROGRESS | AWS::CloudFormation::Stack | amplify-…-local-sandbox-26c8b1a1be
amplify-…-local-sandbox-26c8b1a1be | CREATE_COMPLETE    | AWS::CloudFormation::Stack | auth.NestedStack/auth.NestedStackResource
amplify-…-local-sandbox-26c8b1a1be | CREATE_COMPLETE    | AWS::CloudFormation::Stack | data.NestedStack/data.NestedStackResource
amplify-…-local-sandbox-26c8b1a1be | CREATE_COMPLETE    | AWS::CloudFormation::Stack | amplify-…-local-sandbox-26c8b1a1be
✔ Deployment completed in 60.508 seconds
AppSync API endpoint = http://localhost.localstack.cloud:4566/graphql/b15163c7ff004dc08e02b347e7
File written: amplify_outputs.json
```

The script first runs `scripts/reset-cdk-cache.mjs`, which drops the CDK toolkit's hotswap
cache under `.amplify/`. Every `lstk start` begins from a clean slate, so a cache left over from
a previous container would describe a stack that no longer exists; without it, ampx simply does a
full deploy.

`amplify_outputs.json` comes out with `data.url` already on LocalStack:

```json
{
  "auth": {
    "user_pool_id": "us-east-1_0501966cc8c142f8bf0ce92005bcd847",
    "user_pool_client_id": "ldaqaxdz5m9ttgiaf5lj34ehds",
    "identity_pool_id": "us-east-1:67b5433b",
    "unauthenticated_identities_enabled": true,
    "aws_region": "us-east-1"
  },
  "data": {
    "url": "http://localhost.localstack.cloud:4566/graphql/b15163c7ff004dc08e02b347e7",
    "aws_region": "us-east-1",
    "default_authorization_type": "AWS_IAM",
    "authorization_types": ["AMAZON_COGNITO_USER_POOLS"]
  },
  "version": "1.5"
}
```

### What got created

```
$ lstk aws cloudformation list-stacks --query 'StackSummaries[].StackName' --output text
CDKToolkit
amplify-amplifygen2localstacktodo-local-sandbox-26c8b1a1be        (root)
amplify-amplifygen2localstacktodo-local-s-auth179371D7-…          (auth: user pool, client, identity pool, roles)
amplify-amplifygen2localstacktodo-local-s-data7552DF31-…          (data: AppSync API, resolvers)
amplify-amplifygen2localstack-amplifyDataAmplifyTableM-…          (Amplify's table manager)
amplify-amplifygen2localstack-amplifyDataTodoNestedSta-…          (the Todo table)

$ lstk aws dynamodb list-tables --output text
TABLENAMES  Todo-b15163c7ff004dc08e02b347e7-NONE

$ lstk aws appsync list-graphql-apis --query 'graphqlApis[].[apiId,name,authenticationType]' --output text
b15163c7ff004dc08e02b347e7  amplifyData  AWS_IAM

$ lstk aws cognito-identity list-identity-pools --max-results 10 --query 'IdentityPools[].[IdentityPoolId,IdentityPoolName]' --output text
us-east-1:67b5433b  amplifyAuthIdentityPool…
```

`lstk status` lists everything at once: the CloudFormation stacks, the DynamoDB table, the IAM
roles (Amplify's authenticated and unauthenticated roles plus the CDK bootstrap roles), the
Lambda functions Amplify uses as CloudFormation custom-resource providers, the S3 buckets, the
SSM parameters and a Step Functions state machine that waits for table creation.

## 6. Run the frontend

```
$ npm run dev:localstack          # vite --mode localstack
  VITE v8.3.0   localstack   ready in 84 ms
  ➜  Local:   http://localhost:5173/
```

The `localstack` mode loads `.env.localstack`, which sets
`VITE_LOCALSTACK_ENDPOINT=http://localhost.localstack.cloud:4566`. `src/amplify-config.ts`
adds `userPoolEndpoint` and `identityPoolEndpoint` to the parsed outputs before calling
`Amplify.configure`. Nothing else in the frontend knows about LocalStack; `client.models.Todo`
is the standard generated data client.

On load, the browser makes exactly these calls, all to LocalStack:

```
POST http://localhost.localstack.cloud:4566/           cognito-identity GetId
POST http://localhost.localstack.cloud:4566/           cognito-identity GetCredentialsForIdentity
POST http://localhost.localstack.cloud:4566/graphql/b15163c7…   listTodos (SigV4-signed)
```

The **Where this runs** panel shows the AppSync host, the authorization mode, the identity pool
id and the guest identity Cognito just issued (for example `us-east-1:2e4471db`).

## 7. Use the app

Add, edit and delete todos. Each action is one GraphQL mutation (`createTodo`, `updateTodo`,
`deleteTodo`) followed by `listTodos`; all of them return 200 from LocalStack's AppSync and land
in the DynamoDB table:

```
$ lstk aws dynamodb scan --table-name Todo-b15163c7ff004dc08e02b347e7-NONE \
    --query 'Items[].content.S' --output text
Check the Todo table with lstk aws dynamodb scan   Deploy it to LocalStack with npm run localstack:deploy
```

`npm run localstack:logs` (`lstk logs --follow`) shows the requests as you click:

```
localstack.request.aws  : AWS cognito-identity.GetId => 200
localstack.request.aws  : AWS cognito-identity.GetCredentialsForIdentity => 200
localstack.request.http : POST /graphql/b15163c7ff004dc08e02b347e7 => 200
```

### The same flow from a script

The Amplify JS client's guest flow is reproducible with any AWS SDK: get an identity from the
pool, fetch its credentials, sign GraphQL requests with SigV4. A 10-assertion Python check
(create, get, list, update, update persisted, filter match, filter exclude, update of a missing
id fails, delete, get after delete is null) passed against this deployment:

```
  data.url       = http://localhost.localstack.cloud:4566/graphql/b15163c7ff004dc08e02b347e7
  identity pool  = us-east-1:67b5433b
  guest identity = us-east-1:c066b70a
  PASS  1. createTodo returns id+content
  …
  PASS  10. get after delete returns null

RESULT: 10 passed, 0 failed
```

## 8. The dev loop: `ampx sandbox` in watch mode

```
$ npm run localstack:sandbox      # ampx sandbox --identifier local --profile localstack
✔ Deployment completed in 0.142 seconds
[Sandbox] Watching for file changes...
```

Starting it against an already-deployed backend is a no-op. Edit anything under `amplify/` and
save; ampx synthesizes, type-checks and deploys the difference. With the frontend running in a
second terminal, the regenerated `amplify_outputs.json` is picked up by Vite automatically.

## 9. Tear down

```
$ npm run localstack:destroy      # ampx sandbox delete --identifier local --profile localstack --yes
$ npm run localstack:stop         # lstk stop
```

LocalStack state is not persisted by default, so `lstk stop` also clears the deployment.
`npm run localstack:bootstrap` is needed again after every fresh start.
