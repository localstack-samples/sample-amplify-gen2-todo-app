# Walkthrough: building and running this app on LocalStack

Every command below was run on 2026-09-14 against `localstack/localstack-pro:dev`
(`2026.9.0.dev263`) with lstk 1.0.1, Node 22.23, `@aws-amplify/backend` 1.25.0,
`@aws-amplify/backend-cli` 1.10.0 (`ampx`), `aws-amplify` 6.20.0 and `@aws-amplify/ui-react` 6.15.6.
Outputs are trimmed to the interesting lines.

## 1. Scaffold the app

```bash
npm create vite@latest amplify-gen2-localstack-todo -- --template react-ts
cd amplify-gen2-localstack-todo
npm create amplify@latest -- --yes
npm i @aws-amplify/ui-react
npm i -D @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @types/aws-lambda
```

`create-amplify` adds `amplify/backend.ts`, `amplify/auth/resource.ts` (email sign-in) and
`amplify/data/resource.ts` (a `Todo { content }` model with guest access), plus the
`@aws-amplify/backend*`, `aws-cdk-lib`, `tsx` and `esbuild` dev dependencies.

Two adjustments to the Vite template were needed:

- `tsconfig.app.json`: add `"strict": true`. Vite 8's `react-ts` template no longer sets it, and
  without strict mode Amplify's schema types collapse (`content` is inferred as `string[]`).
- `tsconfig.app.json`: add `"resolveJsonModule": true` so `amplify_outputs.json` can be imported.

## 2. Define the backend

`amplify/data/resource.ts` switches the Todo model to owner-based access, sets the default auth
mode to the user pool, and adds a Lambda-backed custom query:

```ts
export const todoStats = defineFunction({
  name: 'todo-stats',
  entry: './todo-stats/handler.ts',
  resourceGroupName: 'data',   // handler for a query that also reads the data tables
});

const schema = a.schema({
  Todo: a.model({ content: a.string() }).authorization((allow) => [allow.owner()]),
  TodoStats: a.customType({ total: a.integer().required(), /* … */ }),
  todoStats: a.query().returns(a.ref('TodoStats'))
    .handler(a.handler.function(todoStats))
    .authorization((allow) => [allow.authenticated()]),
});

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
```

`amplify/backend.ts` gives the function the table name and read access:

```ts
const backend = defineBackend({ auth, data, todoStats });
const todoTable = backend.data.resources.tables['Todo'];
backend.todoStats.addEnvironment('TODO_TABLE_NAME', todoTable.tableName);
todoTable.grantReadData(backend.todoStats.resources.lambda);
```

The handler (`amplify/data/todo-stats/handler.ts`) scans the table for rows whose `owner` matches
the caller (`<sub>::<username>`, the format Amplify writes) and returns counts plus
`context.functionName` and `process.env.AWS_ENDPOINT_URL`, so the UI can show where it ran.

## 3. Start LocalStack

`lstk.toml` in the repo selects the `dev` image and opens CORS for the Vite dev server:

```toml
[[containers]]
type = "aws"
tag  = "dev"
port = "4566"
env  = ["amplify"]

[env.amplify]
EXTRA_CORS_ALLOWED_ORIGINS = "http://localhost:5173"
```

```
$ npm run localstack:start        # lstk --config lstk.toml start --type aws --non-interactive
✔︎ Using local image localstack/localstack-pro:dev
Starting LocalStack...
✔︎ LocalStack is running (containerId: a9f96970b923)
• Endpoint: localhost.localstack.cloud:4566
```

Without the CORS setting, the browser's preflight to Cognito fails with
"No 'Access-Control-Allow-Origin' header" and Amplify UI shows "A network error has occurred".
LocalStack's default allow-list covers `localhost:4566` but not `localhost:5173`.

## 4. Write the AWS profile

```
$ lstk setup aws
```

This writes a `localstack` profile to `~/.aws/config` and `~/.aws/credentials`:

```ini
[profile localstack]
region = us-east-1
endpoint_url = https://localhost.localstack.cloud:4566
services = localstack-services

[services localstack-services]
s3 =
  endpoint_url = http://s3.localhost.localstack.cloud:4566
```

`ampx` deploys with `--profile localstack`. A profile (rather than `AWS_ENDPOINT_URL` variables)
is what makes CDK's asset publishing hit S3 on the virtual-host-capable endpoint.

## 5. Bootstrap CDK

```
$ npm run localstack:bootstrap    # lstk cdk bootstrap aws://000000000000/us-east-1
 ⏳  Bootstrapping environment aws://000000000000/us-east-1...
CDKToolkit: creating CloudFormation changeset...
 ✅  Environment aws://000000000000/us-east-1 bootstrapped.
```

Took about 7 seconds. `ampx` checks for the `/cdk-bootstrap/hnb659fds/version` SSM parameter and
refuses to deploy without it.

## 6. Deploy the backend

```
$ npm run localstack:deploy       # ampx sandbox --once --identifier local --profile localstack
✔ Backend synthesized in 2.17 seconds
✔ Type checks completed in 5.16 seconds
✔ Built and published assets
amplify-amplifygen2localstacktodo-local-sandbox-26c8b1a1be | CREATE_IN_PROGRESS | AWS::CloudFormation::Stack
… | CREATE_COMPLETE | auth.NestedStack/auth.NestedStackResource
… | CREATE_COMPLETE | data.NestedStack/data.NestedStackResource
… | CREATE_COMPLETE | amplify-amplifygen2localstacktodo-local-sandbox-26c8b1a1be
✔ Deployment completed in 75.4 seconds
AppSync API endpoint = http://localhost.localstack.cloud:4566/graphql/3c47fd53e7704670bb98c62e55
File written: amplify_outputs.json
```

A second run (fresh container) completed in 60 seconds. `amplify_outputs.json` comes out with
`data.url` already pointing at LocalStack:

```json
{
  "auth": {
    "user_pool_id": "us-east-1_9f0cfc1c9a7245e2a01e37e0155ba522",
    "user_pool_client_id": "jdz6j4m60tl3pd7mbtw4yloggl",
    "identity_pool_id": "us-east-1:40cae1c6",
    "aws_region": "us-east-1",
    "username_attributes": ["email"]
  },
  "data": {
    "url": "http://localhost.localstack.cloud:4566/graphql/3c47fd53e7704670bb98c62e55",
    "default_authorization_type": "AMAZON_COGNITO_USER_POOLS",
    "authorization_types": ["AWS_IAM"]
  },
  "version": "1.5"
}
```

### What got created

```
$ lstk aws cloudformation list-stacks --query 'StackSummaries[].StackName' --output text
CDKToolkit
amplify-amplifygen2localstacktodo-local-sandbox-26c8b1a1be          (root)
amplify-amplifygen2localstacktodo-local-s-auth179371D7-52f424bf     (auth)
amplify-amplifygen2localstacktodo-local-s-data7552DF31-83c01b74     (data)
amplify-amplifygen2localstack-amplifyDataAmplifyTableM-cc76b4e6     (table manager)
amplify-amplifygen2localstack-amplifyDataTodoNestedSta-9e1393dd     (Todo model)
amplify-amplifygen2localstack-amplifyDataFunctionDirec-d9cf5c3d     (todo-stats function)

$ lstk aws lambda list-functions --query 'Functions[].[FunctionName,Runtime]' --output text
amplify-amplifygen2localstackt-todostatslambdaCC7D66CB-1ae091da  nodejs22.x
amplify-amplifygen2localstack-TableManagerCustomProvid-…         nodejs24.x   (Amplify's table manager)
amplify-amplifygen2localstack-CustomCDKBucketDeploymen-…         python3.13  (CDK asset helper)

$ lstk aws dynamodb list-tables --output text
TABLENAMES  Todo-3c47fd53e7704670bb98c62e55-NONE

$ lstk aws cognito-idp list-user-pools --max-results 10 --query 'UserPools[].[Id,Name]' --output text
us-east-1_9f0cfc1c9a7245e2a01e37e0155ba522  amplifyAuthUserPool4BA7F805-5ed947c5

$ lstk aws appsync list-graphql-apis --query 'graphqlApis[].[apiId,name,authenticationType]' --output text
3c47fd53e7704670bb98c62e55  amplifyData  AMAZON_COGNITO_USER_POOLS
```

`lstk status` lists all 47 resources at once: 7 CloudFormation stacks, the DynamoDB table, 15 IAM
roles (Amplify's plus the CDK bootstrap roles), 8 KMS keys, 5 Lambda functions, 4 S3 buckets, 5 SSM
parameters and the Step Functions state machine Amplify uses to wait for table creation.

## 7. Run the frontend

```
$ npm run dev:localstack          # vite --mode localstack
  VITE v8.3.0   localstack   ready in 84 ms
  ➜  Local:   http://localhost:5173/
```

The `localstack` mode loads `.env.localstack`, which sets
`VITE_LOCALSTACK_ENDPOINT=http://localhost.localstack.cloud:4566`. `src/amplify-config.ts`
uses it to add `userPoolEndpoint` and `identityPoolEndpoint` to the parsed outputs before calling
`Amplify.configure`. Nothing else in the frontend knows about LocalStack.

## 8. Sign up, confirm, sign in

1. Open <http://localhost:5173>, choose **Create Account**, enter `alice@example.com` and a
   password, submit. Amplify UI moves to the confirmation-code screen.
2. LocalStack prints the code instead of emailing it. `lstk logs` hides it by default (the default
   view shows only request lines), so use `-v`:

   ```
   $ lstk logs -v | grep "Confirmation code"
   INFO --- [et.reactor-3] l.p.c.s.c.provider : Confirmation code for Cognito user alice@example.com: 586971
   ```

3. Enter the code. The Authenticator confirms the account and signs in automatically.

The browser made these Cognito calls, all against LocalStack:

```
cognito-idp.SignUp
cognito-idp.ConfirmSignUp
cognito-idp.InitiateAuth            (SRP)
cognito-idp.RespondToAuthChallenge
cognito-idp.GetUser
cognito-identity.GetId
cognito-identity.GetCredentialsForIdentity
```

Two cosmetic differences from AWS were visible in the Authenticator: the confirmation screen is
titled "We Texted You" (LocalStack's `SignUp` response has no `CodeDeliveryDetails`, so the UI
cannot tell it was an email), and after confirmation a "verify contact" step appears with a
**Skip** button (LocalStack does not set `email_verified` on `ConfirmSignUp`).

## 9. Use the app

- Add "Write the Amplify Gen 2 blog post" and "Deploy it to LocalStack with ampx sandbox".
- Edit the first one, delete the second. Each mutation goes through `createTodo` /
  `updateTodo` / `deleteTodo` and the list reloads with `listTodos`.
- The **Your stats** card is the `todoStats` query: the Lambda scanned the table and returned
  `total`, `totalCharacters`, `longest`, `latestCreatedAt`, the caller's `owner` key,
  its own function name and the endpoint it used.

The **Where this runs** card shows, live from `amplify_outputs.json` and the Lambda's response:

```
AppSync API   localhost.localstack.cloud:4566
User pool     us-east-1_0501966cc8c142f8bf0ce92005bcd847
Region        us-east-1
Lambda        amplify-amplifygen2localstackt-todostatslambdaCC7D66CB-347d1471
Endpoint the Lambda used (AWS_ENDPOINT_URL)   http://192.168.215.3:4566
```

The endpoint is the LocalStack container's address on the Docker network, injected by LocalStack
into every Lambda's environment. The SDK client in the handler has no configuration at all.

### Owner isolation

Sign out, create `bob@example.com` the same way. Bob's list is empty and his stats read 0, while
the table holds both users' rows:

```
$ lstk aws dynamodb scan --table-name Todo-2c8b0eb55b3a4bfeae77c5dc9e-NONE
owner=4fc3eea4…  content='Review the pull request for the sample repo'
owner=3977b3db…  content='Write the Amplify Gen 2 on LocalStack blog post'
```

### Watching requests

`npm run localstack:logs` (`lstk logs --follow`) shows every call as you click. GraphQL requests
appear as plain HTTP lines, and the `dynamodb.Scan` calls are the Lambda talking to the local
table (the resolver invokes the function internally, so there is no `lambda.Invoke` line):

```
localstack.request.http : POST /graphql/2c8b0eb55b3a4bfeae77c5dc9e => 200
localstack.request.aws  : AWS dynamodb.Scan => 200
localstack.request.aws  : AWS cognito-idp.GetUser => 200
```

The Lambda's own `console.log` output goes to CloudWatch Logs, like on AWS:

```
$ lstk aws logs filter-log-events \
    --log-group-name /aws/lambda/amplify-amplifygen2localstackt-todostatslambdaCC7D66CB-347d1471 \
    --query 'events[].message' --output text
2026-09-14T08:43:19.956Z  dd785eab-…  INFO  {"msg":"todo-stats computed","owner":"4fc3eea4-…::4fc3eea4-…","total":1}
```

## 10. The dev loop: `ampx sandbox` in watch mode

```
$ npm run localstack:sandbox      # ampx sandbox --identifier local --profile localstack
```

Leave it running. Edit `amplify/data/todo-stats/handler.ts` and save; ampx detects the change,
rebuilds the function with esbuild and hotswaps the Lambda code without a CloudFormation update.
See the section at the end of this file for the measured timings.

## 11. Tear down

```
$ npm run localstack:destroy      # ampx sandbox delete --identifier local --profile localstack --yes
$ npm run localstack:stop         # lstk stop
```

LocalStack state is not persisted by default, so `lstk stop` also clears the deployment.
`npm run localstack:bootstrap` is needed again after every fresh start.

## Hotswap timings

Measured with `npm run localstack:sandbox` running. Starting it against an already-deployed
backend is a no-op:

```
✔ Backend synthesized in 2.19 seconds
✔ Type checks completed in 5.2 seconds
✔ Built and published assets
✔ Deployment completed in 0.142 seconds
[Sandbox] Watching for file changes...
```

Then a one-line change to `amplify/data/todo-stats/handler.ts` (adding a `console.log`) was saved
at 14:12:57:

```
2:12:57 PM [Sandbox] Triggered due to a file update event: amplify/data/todo-stats/handler.ts
2:12:57 PM ✔ Backend synthesized in 0.61 seconds
2:13:03 PM ✔ Type checks completed in 5.28 seconds
2:13:03 PM ✔ Built and published assets
2:13:05 PM ✔ Updated AWS::Lambda::Function data/todo-stats-lambda
2:13:05 PM ✔ Deployment completed in 1.277 seconds
2:13:05 PM [Sandbox] Watching for file changes...
```

Eight seconds from save to live, of which the LocalStack part (the hotswapped
`UpdateFunctionCode`, visible in `lstk logs` as `AWS lambda.UpdateFunctionCode => 200`) is
1.3 seconds; the rest is ampx's own synth and type check. Clicking **Recompute** in the UI
afterwards ran the new code; its log line shows up in the function's CloudWatch log group:

```
$ lstk aws logs filter-log-events --log-group-name /aws/lambda/<todo-stats function> \
    --filter-pattern '"todo-stats computed"' --query 'events[].message' --output text
2026-09-14T08:43:19.956Z  dd785eab-…  INFO  {"msg":"todo-stats computed","owner":"4fc3eea4-…::4fc3eea4-…","total":1}
```
