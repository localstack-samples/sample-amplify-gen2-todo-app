// End-to-end check of the deployed backend, the way the frontend uses it: obtain guest
// credentials from the Cognito identity pool, then run the Todo CRUD operations through
// AppSync with the Amplify data client. Run with `make test` after `make deploy`.
import { readFileSync } from 'node:fs';
import { Amplify } from 'aws-amplify';
import { parseAmplifyConfig } from 'aws-amplify/utils';
import { fetchAuthSession } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT ?? 'http://localhost.localstack.cloud:4566';
const outputs = JSON.parse(readFileSync(new URL('../amplify_outputs.json', import.meta.url), 'utf8'));

// Same override as src/amplify-config.ts: the outputs file cannot carry Cognito endpoints.
const config = parseAmplifyConfig(outputs);
Object.assign(config.Auth.Cognito, {
  userPoolEndpoint: LOCALSTACK_ENDPOINT,
  identityPoolEndpoint: LOCALSTACK_ENDPOINT,
});
Amplify.configure(config);

const client = generateClient();
let failed = 0;

function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failed += 1;
}

function firstError(result) {
  return result.errors?.map((e) => e.message).join('; ') ?? '';
}

const session = await fetchAuthSession();
console.log(`  data.url        = ${outputs.data.url}`);
console.log(`  identity pool   = ${outputs.auth.identity_pool_id}`);
console.log(`  guest identity  = ${session.identityId}`);
check('guest credentials issued', Boolean(session.identityId && session.credentials?.accessKeyId));

const tag = Math.random().toString(16).slice(2, 10);
const content1 = `todo-${tag}-v1`;
const content2 = `todo-${tag}-v2`;

const created = await client.models.Todo.create({ content: content1 });
check('createTodo returns id and content', created.data?.id && created.data.content === content1, firstError(created));
const id = created.data?.id;

if (id) {
  const got = await client.models.Todo.get({ id });
  check('getTodo reads the item back', got.data?.content === content1, firstError(got));

  const listed = await client.models.Todo.list();
  check('listTodos contains the item', listed.data?.some((t) => t.id === id), firstError(listed));

  const updated = await client.models.Todo.update({ id, content: content2 });
  check('updateTodo returns the new content', updated.data?.content === content2, firstError(updated));

  const filtered = await client.models.Todo.list({ filter: { content: { eq: content2 } } });
  check(
    'listTodos filter matches the new content',
    filtered.data?.some((t) => t.id === id) && filtered.data.every((t) => t.content === content2),
    firstError(filtered),
  );

  const missing = await client.models.Todo.update({ id: `missing-${tag}`, content: 'x' });
  check('updateTodo on a missing id fails', Boolean(missing.errors?.length) || missing.data === null, firstError(missing));

  const deleted = await client.models.Todo.delete({ id });
  check('deleteTodo returns the id', deleted.data?.id === id, firstError(deleted));

  const gone = await client.models.Todo.get({ id });
  check('getTodo after delete returns null', gone.data === null, firstError(gone));
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
