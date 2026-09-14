# Amplify Gen 2 on LocalStack: a Todo app

A small, complete [AWS Amplify Gen 2](https://docs.amplify.aws/) application that deploys to
[LocalStack](https://localstack.cloud) instead of AWS. It is the stock `create-amplify` Todo app
with three additions that make it feel like a real product:

- **Sign-up and sign-in** with Amazon Cognito, through the Amplify UI `<Authenticator>`.
- **Per-user data**: the `Todo` model uses `allow.owner()`, so every user sees only their own todos.
- **A Lambda-backed custom query**, `todoStats`, that reads the Todo table with the AWS SDK and
  returns statistics for the signed-in user. The result panel also shows which endpoint the
  Lambda saw, which is how the app proves it is running locally.

Everything the app talks to runs inside one LocalStack container: Cognito (user pool and
identity pool), AppSync (GraphQL API and resolvers), DynamoDB (the Todo table), Lambda (the stats
function), plus CloudFormation, S3, SSM and IAM underneath, which is what `ampx` uses to deploy.

The frontend is React + Vite. The **same code** runs against AWS: point `amplify_outputs.json` at
an AWS sandbox and start Vite without the LocalStack mode.

![The app signed in, with the "Where this runs" panel showing LocalStack endpoints](docs/screenshots/app.png)

A step-by-step record of building and running it, with real command output, is in
[docs/blog-steps.md](docs/blog-steps.md).

## Prerequisites

| Tool | Version used here | Notes |
| --- | --- | --- |
| Node.js | 22.23 | Vite 8 needs Node 20.19+ or 22.12+ |
| [lstk](https://docs.localstack.cloud/aws/developer-tools/running-localstack/lstk/) | 1.0.1 | `npm i -g @localstack/lstk` or `brew install localstack/tap/lstk` |
| Docker | 26 | Lambda functions run in containers next to LocalStack |
| AWS CDK CLI | 2.x | `npm i -g aws-cdk`; `lstk cdk` wraps it |
| LocalStack Pro auth token | | Cognito, AppSync and Amplify are Pro services. `lstk` prompts for login on first start. |

Amplify Gen 2 support currently ships in the `dev` (nightly) image of LocalStack for AWS, which
is what [`lstk.toml`](lstk.toml) selects.

## Run it

```bash
npm install

# 1. Start LocalStack (dev image, CORS opened for the Vite dev server).
npm run localstack:start

# 2. One-time: write the `localstack` AWS profile that ampx will deploy with.
lstk setup aws

# 3. One-time per container: bootstrap the CDK toolkit stack that ampx expects.
npm run localstack:bootstrap

# 4. Deploy the Amplify backend (auth + data + function). ~75 s. Writes amplify_outputs.json.
npm run localstack:deploy

# 5. Run the frontend against LocalStack.
npm run dev:localstack
```

Open <http://localhost:5173>, create an account with any email address, then fetch the
confirmation code from the LocalStack logs:

```bash
lstk logs -v | grep "Confirmation code"
# ... Confirmation code for Cognito user alice@example.com: 123456
```

Enter the code, sign in, and add a few todos. The right-hand panel shows the AppSync host, the
user pool id, the name of the Lambda that computed your stats, and the endpoint it used.

### The dev loop

`npm run localstack:sandbox` runs `ampx sandbox` in watch mode: edit anything under `amplify/`
and it redeploys, using hotswap for Lambda code changes. Keep `npm run dev:localstack` running in
a second terminal for the frontend.

### Look around

```bash
npm run localstack:status                           # every resource ampx created
lstk aws cognito-idp list-users --user-pool-id <id> # your users
lstk aws dynamodb scan --table-name <Todo-...>      # your todos, owner column included
lstk aws lambda list-functions                      # the todo-stats function (and Amplify's helpers)
lstk aws appsync list-graphql-apis
npm run localstack:logs                             # follow requests as you click around
```

### Tear down

```bash
npm run localstack:destroy   # ampx sandbox delete
npm run localstack:stop      # stop the container
```

## How the app points at LocalStack

`ampx` writes `amplify_outputs.json` with the AppSync URL already on LocalStack, so the data
layer needs nothing extra. Cognito endpoints are derived from the region inside the Amplify
library and cannot be expressed in that file, so
[`src/amplify-config.ts`](src/amplify-config.ts) injects `userPoolEndpoint` and
`identityPoolEndpoint` when `VITE_LOCALSTACK_ENDPOINT` is set. `npm run dev:localstack` runs
Vite in the `localstack` mode, which loads [`.env.localstack`](.env.localstack); plain
`npm run dev` leaves the endpoints alone and the app talks to AWS.

The deploy side uses an AWS profile rather than environment variables because CDK's asset
publisher resolves S3 through the profile, and S3 must be addressed at
`s3.localhost.localstack.cloud`. `lstk setup aws` writes exactly that profile.

The Lambda needs no configuration at all: LocalStack injects `AWS_ENDPOINT_URL` into every
function's environment, so a default `DynamoDBClient` talks to the local table.

## Project layout

```
amplify/
  backend.ts               defineBackend + table grant for the stats function
  auth/resource.ts         email sign-in
  data/resource.ts         Todo model (owner auth), TodoStats type, todoStats query, defineFunction
  data/todo-stats/handler.ts
src/
  main.tsx                 Amplify.configure + <Authenticator>
  App.tsx                  todos, inline edit, stats and "where this runs" panel
  amplify-config.ts        the LocalStack endpoint toggle
lstk.toml                  LocalStack container config used by npm run localstack:start
.env.localstack            VITE_LOCALSTACK_ENDPOINT for `vite --mode localstack`
```

## Scripts

| Script | What it runs |
| --- | --- |
| `localstack:start` | `lstk --config lstk.toml start --type aws --non-interactive` |
| `localstack:bootstrap` | `lstk cdk bootstrap aws://000000000000/us-east-1` |
| `localstack:deploy` | `ampx sandbox --once --identifier local --profile localstack` |
| `localstack:sandbox` | `ampx sandbox --identifier local --profile localstack` (watch mode) |
| `localstack:destroy` | `ampx sandbox delete --identifier local --profile localstack --yes` |
| `localstack:status` / `localstack:logs` / `localstack:stop` | `lstk status` / `lstk logs --follow` / `lstk stop` |
| `dev:localstack` | `vite --mode localstack` |
| `dev`, `build`, `lint`, `preview` | the usual Vite scripts |

## License

Apache-2.0. See [LICENSE](LICENSE).
