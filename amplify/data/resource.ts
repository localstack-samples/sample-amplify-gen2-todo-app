import { type ClientSchema, a, defineData, defineFunction } from '@aws-amplify/backend';

/**
 * A Lambda that computes per-user statistics by reading the Todo table
 * directly with the AWS SDK. It is grouped into the `data` stack because it
 * is both a handler for a custom query *and* a consumer of the data tables
 * (this avoids a circular dependency between stacks).
 */
export const todoStats = defineFunction({
  name: 'todo-stats',
  entry: './todo-stats/handler.ts',
  resourceGroupName: 'data',
  runtime: 22,
  timeoutSeconds: 30,
});

const schema = a.schema({
  /**
   * The stock `create-amplify` Todo model, switched from guest access to
   * owner-based access: every signed-in user only sees their own todos.
   */
  Todo: a
    .model({
      content: a.string(),
    })
    .authorization((allow) => [allow.owner()]),

  /** Shape returned by the `todoStats` custom query. */
  TodoStats: a.customType({
    total: a.integer().required(),
    totalCharacters: a.integer().required(),
    longest: a.string(),
    latestCreatedAt: a.datetime(),
    owner: a.string(),
    computedAt: a.datetime().required(),
    functionName: a.string(),
    endpoint: a.string(),
  }),

  /** Custom query resolved by the `todo-stats` Lambda. */
  todoStats: a
    .query()
    .returns(a.ref('TodoStats'))
    .handler(a.handler.function(todoStats))
    .authorization((allow) => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
