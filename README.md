# Amplify Gen 2 on LocalStack: a Todo app

A small, complete [AWS Amplify Gen 2](https://docs.amplify.aws/) application that deploys to
[LocalStack](https://localstack.cloud) instead of AWS. The backend is the stock `create-amplify`
template: email-based Cognito auth and a `Todo` model that guests can create, read, update and
delete. The frontend is a React + Vite app that lists, adds, edits and deletes todos, and shows
which endpoints it is talking to.

Everything the app uses runs inside one LocalStack container: Cognito (user pool and identity
pool), AppSync (GraphQL API and resolvers), DynamoDB (the Todo table), plus CloudFormation, S3,
SSM, IAM and Lambda underneath, which is what `ampx` uses to deploy.

The **same code** runs against AWS: deploy an AWS sandbox with `npx ampx sandbox` and start Vite
without the LocalStack mode.

![The app with a few todos and the "Where this runs" panel pointing at LocalStack](docs/screenshots/app.png)

A step-by-step record of building and running it, with real command output, is in
[docs/blog-steps.md](docs/blog-steps.md).

## Prerequisites

| Tool | Version used here | Notes |
| --- | --- | --- |
| Node.js | 22.23 | Vite 8 needs Node 20.19+ or 22.12+ |
| [lstk](https://docs.localstack.cloud/aws/developer-tools/running-localstack/lstk/) | 1.0.1 | `npm i -g @localstack/lstk` or `brew install localstack/tap/lstk` |
| Docker | 26 | LocalStack runs in a container |
| AWS CDK CLI | 2.x | `npm i -g aws-cdk`; `lstk cdk` wraps it |
| LocalStack for AWS auth token | | Cognito and AppSync need a licensed LocalStack. `lstk` prompts for login on first start. |

## Run it

```bash
npm install

# 1. Start LocalStack, allowing the Vite dev server's origin for browser requests.
npm run localstack:start   # LOCALSTACK_EXTRA_CORS_ALLOWED_ORIGINS=http://localhost:5173 lstk start

# 2. One-time: write the `localstack` AWS profile that ampx deploys with.
lstk setup aws

# 3. Once per container: bootstrap the CDK toolkit stack that ampx expects.
npm run localstack:bootstrap

# 4. Deploy the Amplify backend (auth + data). About a minute. Writes amplify_outputs.json.
npm run localstack:deploy

# 5. Run the frontend against LocalStack.
npm run dev:localstack
```

Open <http://localhost:5173> and add a few todos. The right-hand panel shows the AppSync host,
the identity pool, and the guest identity Cognito issued to your browser session.

### The dev loop

`npm run localstack:sandbox` runs `ampx sandbox` in watch mode: edit anything under `amplify/`
and it redeploys the change. Keep `npm run dev:localstack` running in a second terminal for the
frontend.

### Look around

```bash
npm run localstack:status                      # every resource ampx created
lstk aws dynamodb list-tables
lstk aws dynamodb scan --table-name <Todo-...>  # your todos
lstk aws appsync list-graphql-apis
lstk aws cognito-identity list-identity-pools --max-results 10
npm run localstack:logs                        # follow requests as you click around
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
[`src/amplify-config.ts`](src/amplify-config.ts) adds `userPoolEndpoint` and
`identityPoolEndpoint` when `VITE_LOCALSTACK_ENDPOINT` is set. `npm run dev:localstack` runs
Vite in the `localstack` mode, which loads [`.env.localstack`](.env.localstack); plain
`npm run dev` leaves the endpoints alone and the app talks to AWS.

The deploy side uses the `localstack` AWS profile that `lstk setup aws` writes. CDK's asset
publisher addresses S3 with the bucket name in the hostname, which LocalStack only recognises
on `s3.localhost.localstack.cloud`, so the deploy scripts set
`AWS_ENDPOINT_URL_S3=http://s3.localhost.localstack.cloud:4566` for `ampx`.

## Project layout

```
amplify/
  backend.ts               defineBackend({ auth, data })
  auth/resource.ts         email sign-in (stock)
  data/resource.ts         Todo model with allow.guest(), identityPool default auth mode (stock)
src/
  main.tsx                 renders the app
  App.tsx                  todos with inline edit, "where this runs" panel
  amplify-config.ts        Amplify.configure + the LocalStack endpoint toggle
.env.localstack            VITE_LOCALSTACK_ENDPOINT for `vite --mode localstack`
```

## Scripts

| Script | What it runs |
| --- | --- |
| `localstack:start` | `LOCALSTACK_EXTRA_CORS_ALLOWED_ORIGINS=http://localhost:5173 lstk start --non-interactive` |
| `localstack:bootstrap` | `lstk cdk bootstrap aws://000000000000/us-east-1` |
| `localstack:deploy` | `AWS_ENDPOINT_URL_S3=... ampx sandbox --once --identifier local --profile localstack` (after dropping the CDK hotswap cache) |
| `localstack:sandbox` | `AWS_ENDPOINT_URL_S3=... ampx sandbox --identifier local --profile localstack` (watch mode) |
| `localstack:destroy` | `AWS_ENDPOINT_URL_S3=... ampx sandbox delete --identifier local --profile localstack --yes` |
| `localstack:status` / `localstack:logs` / `localstack:stop` | `lstk status` / `lstk logs --follow` / `lstk stop` |
| `dev:localstack` | `vite --mode localstack` |
| `dev`, `build`, `lint`, `preview` | the usual Vite scripts |

## License

Apache-2.0. See [LICENSE](LICENSE).
