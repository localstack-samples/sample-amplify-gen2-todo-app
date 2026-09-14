import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { Schema } from '../resource';

// Inside LocalStack the Lambda runtime receives AWS_ENDPOINT_URL automatically,
// so a default SDK client talks to the local DynamoDB. On AWS it talks to AWS.
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type TodoItem = { content?: string; owner?: string; createdAt?: string };

export const handler: Schema['todoStats']['functionHandler'] = async (event, context) => {
  const tableName = process.env.TODO_TABLE_NAME;
  if (!tableName) throw new Error('TODO_TABLE_NAME is not set');

  // Amplify stores the owner as "<sub>::<username>" on every Todo.
  const identity = event.identity as { sub?: string; username?: string } | null | undefined;
  const owner =
    identity?.sub && identity?.username ? `${identity.sub}::${identity.username}` : undefined;

  const items: TodoItem[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey,
        ...(owner
          ? {
              FilterExpression: '#owner = :owner',
              ExpressionAttributeNames: { '#owner': 'owner' },
              ExpressionAttributeValues: { ':owner': owner },
            }
          : {}),
      }),
    );
    items.push(...((page.Items as TodoItem[]) ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  const contents = items.map((i) => i.content ?? '');
  const longest = contents.reduce<string | null>(
    (best, c) => (best === null || c.length > best.length ? c : best),
    null,
  );
  const latestCreatedAt = items
    .map((i) => i.createdAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1) ?? null;

  console.log(JSON.stringify({ msg: 'todo-stats computed', owner, total: items.length }));

  return {
    total: items.length,
    totalCharacters: contents.reduce((n, c) => n + c.length, 0),
    longest,
    latestCreatedAt,
    owner: owner ?? null,
    computedAt: new Date().toISOString(),
    functionName: context.functionName,
    endpoint: process.env.AWS_ENDPOINT_URL ?? null,
  };
};
