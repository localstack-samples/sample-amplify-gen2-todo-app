import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data, todoStats } from './data/resource';

const backend = defineBackend({
  auth,
  data,
  todoStats,
});

// Let the todo-stats Lambda read the Todo table directly.
const todoTable = backend.data.resources.tables['Todo'];
backend.todoStats.addEnvironment('TODO_TABLE_NAME', todoTable.tableName);
todoTable.grantReadData(backend.todoStats.resources.lambda);
