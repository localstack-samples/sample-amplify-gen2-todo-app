import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

/**
 * The stock `create-amplify` schema: one Todo model that any unauthenticated
 * (guest) visitor can create, read, update and delete. Guests get temporary AWS
 * credentials from the Cognito identity pool and sign their AppSync requests
 * with them, which is what the `identityPool` authorization mode means.
 */
const schema = a.schema({
  Todo: a
    .model({
      content: a.string(),
    })
    .authorization((allow) => [allow.guest()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'identityPool',
  },
});
