# ampx deploys with the `localstack` AWS profile (written by `make setup`), which carries
# the test credentials, so no static keys are exported here.
export AWS_DEFAULT_REGION = us-east-1
# CDK publishes assets with the bucket name in the hostname; LocalStack recognises
# those requests as S3 only on this hostname.
export AWS_ENDPOINT_URL_S3 = http://s3.localhost.localstack.cloud:4566
SHELL := /bin/bash

## Show this help
usage:
	@fgrep -h "##" $(MAKEFILE_LIST) | fgrep -v fgrep | sed -e 's/\\$$//' | sed -e 's/##//'

## Check if all required prerequisites are installed
check:
	@command -v docker > /dev/null 2>&1 || { echo "Docker is not installed. Please install Docker and try again."; exit 1; }
	@command -v node > /dev/null 2>&1 || { echo "Node.js is not installed. Please install Node.js 22.12 or later and try again."; exit 1; }
	@node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit((a>22||(a===22&&b>=12)||a===20&&b>=19)?0:1)' || { echo "Node.js 22.12 or later is required (found $$(node --version))."; exit 1; }
	@command -v lstk > /dev/null 2>&1 || { echo "lstk is not installed. Please install lstk (npm install -g @localstack/lstk) and try again."; exit 1; }
	@command -v cdk > /dev/null 2>&1 || { echo "The AWS CDK CLI is not installed. Please install it (npm install -g aws-cdk) and try again."; exit 1; }
	@echo "All required prerequisites are available."

## Install dependencies
install:
	@echo "Installing dependencies..."
	npm install
	@echo "Dependencies installed successfully."

## Start LocalStack, allowing the Vite dev server's origin for browser requests
start:
	@echo "Starting LocalStack..."
	@test -n "${LOCALSTACK_AUTH_TOKEN}" || (echo "LOCALSTACK_AUTH_TOKEN is not set. Find your token at https://app.localstack.cloud/workspace/auth-token"; exit 1)
	@LOCALSTACK_AUTH_TOKEN=$(LOCALSTACK_AUTH_TOKEN) LOCALSTACK_EXTRA_CORS_ALLOWED_ORIGINS=http://localhost:5173 lstk start --non-interactive
	@echo "LocalStack started successfully."

## Write the `localstack` AWS profile that ampx deploys with (one-time)
setup:
	@echo "Writing the localstack AWS profile..."
	@lstk setup aws --non-interactive
	@echo "Profile ready."

## Bootstrap the CDK toolkit stack that ampx expects (once per LocalStack start)
bootstrap:
	@echo "Bootstrapping CDK in LocalStack..."
	lstk cdk bootstrap aws://000000000000/$(AWS_DEFAULT_REGION)
	@echo "CDK bootstrapped successfully."

## Deploy the Amplify backend to LocalStack with a single sandbox run
deploy:
	@echo "Deploying the Amplify backend..."
	@$(MAKE) --no-print-directory bootstrap
	node scripts/reset-cdk-cache.mjs
	npx ampx sandbox --once --identifier local --profile localstack
	@echo "Backend deployed successfully."

## Run the Amplify sandbox in watch mode (redeploys on every change under amplify/)
sandbox:
	node scripts/reset-cdk-cache.mjs
	npx ampx sandbox --identifier local --profile localstack

## Run the frontend against LocalStack (http://localhost:5173)
run:
	npm run dev:localstack

## Run the end-to-end test against the deployed backend
test:
	@echo "Running tests..."
	node tests/e2e.mjs
	@echo "Tests completed successfully."

## Delete the sandbox stack from LocalStack
destroy:
	@echo "Deleting the sandbox stack..."
	npx ampx sandbox delete --identifier local --profile localstack --yes
	@echo "Sandbox deleted."

## Save the logs in a separate file
logs:
	@lstk logs > logs.txt

## Stop LocalStack
stop:
	@echo "Stopping LocalStack..."
	@lstk stop
	@echo "LocalStack stopped successfully."

.PHONY: usage check install start setup bootstrap deploy sandbox run test destroy logs stop
