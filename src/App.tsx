import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import outputs from '../amplify_outputs.json';
import { LOCALSTACK_ENDPOINT } from './amplify-config';

// The default authorization mode comes from amplify_outputs.json: identityPool,
// i.e. guest credentials from Cognito, SigV4-signed requests to AppSync.
const client = generateClient<Schema>();

type Todo = Schema['Todo']['type'];

const graphqlHost = new URL(outputs.data.url).host;
const isLocal = Boolean(LOCALSTACK_ENDPOINT) || graphqlHost.includes('localstack');

function errorText(errors: { message: string }[] | undefined, fallback: string) {
  return errors?.map((e) => e.message).join('; ') || fallback;
}

function sortNewestFirst(todos: Todo[]) {
  return [...todos].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identityId, setIdentityId] = useState<string | null>(null);

  const loadTodos = useCallback(async () => {
    const { data, errors } = await client.models.Todo.list();
    if (errors) {
      setError(errorText(errors, "Couldn't load todos."));
      return;
    }
    setTodos(sortNewestFirst(data));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Guest credentials: Cognito hands out an identity id and temporary keys.
      const session = await fetchAuthSession();
      const { data, errors } = await client.models.Todo.list();
      if (cancelled) return;
      setIdentityId(session.identityId ?? null);
      if (errors) setError(errorText(errors, "Couldn't load todos."));
      if (data) setTodos(sortNewestFirst(data));
    })().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function addTodo(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    const { errors } = await client.models.Todo.create({ content });
    setBusy(false);
    if (errors) {
      setError(errorText(errors, "Couldn't save the todo."));
      return;
    }
    setDraft('');
    await loadTodos();
  }

  function startEdit(todo: Todo) {
    setEditingId(todo.id);
    setEditDraft(todo.content ?? '');
  }

  async function saveEdit(id: string) {
    const content = editDraft.trim();
    if (!content) return;
    setError(null);
    const { errors } = await client.models.Todo.update({ id, content });
    if (errors) {
      setError(errorText(errors, "Couldn't update the todo."));
      return;
    }
    setEditingId(null);
    await loadTodos();
  }

  async function removeTodo(id: string) {
    setError(null);
    const { errors } = await client.models.Todo.delete({ id });
    if (errors) {
      setError(errorText(errors, "Couldn't delete the todo."));
      return;
    }
    await loadTodos();
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className={`dot ${isLocal ? 'dot-local' : 'dot-aws'}`} aria-hidden="true" />
          <h1>Todos</h1>
          <span className="eyebrow">Amplify Gen 2 · {isLocal ? 'LocalStack' : 'AWS'}</span>
        </div>
        <div className="session">
          <span className="who">guest session</span>
        </div>
      </header>

      <main className="layout">
        <section className="todos" aria-labelledby="todos-heading">
          <h2 id="todos-heading" className="visually-hidden">
            Todos
          </h2>
          <form className="composer" onSubmit={addTodo}>
            <input
              aria-label="New todo"
              placeholder="What needs doing?"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <button type="submit" className="primary" disabled={busy || !draft.trim()}>
              {busy ? 'Adding…' : 'Add'}
            </button>
          </form>

          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}

          {todos.length === 0 ? (
            <p className="empty">
              No todos yet. Add one above. It is written to a DynamoDB table through AppSync,
              both running {isLocal ? 'inside LocalStack on this machine' : 'on AWS'}.
            </p>
          ) : (
            <ul className="list">
              {todos.map((todo) => (
                <li key={todo.id} className="item">
                  {editingId === todo.id ? (
                    <form
                      className="edit"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveEdit(todo.id);
                      }}
                    >
                      <input
                        aria-label="Edit todo"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        autoFocus
                      />
                      <button type="submit" className="primary small">
                        Save
                      </button>
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="content">{todo.content}</span>
                      <span className="actions">
                        <button type="button" className="ghost small" onClick={() => startEdit(todo)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ghost small danger"
                          onClick={() => void removeTodo(todo.id)}
                        >
                          Delete
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="panel">
          <section className="card receipt" aria-labelledby="backend-heading">
            <div className="card-head">
              <h2 id="backend-heading">Where this runs</h2>
              <span className={`pill ${isLocal ? 'pill-local' : 'pill-aws'}`}>
                {isLocal ? 'Local' : 'AWS'}
              </span>
            </div>
            <dl>
              <dt>AppSync API</dt>
              <dd>{graphqlHost}</dd>
              <dt>Authorization</dt>
              <dd>{outputs.data.default_authorization_type} (guest via identity pool)</dd>
              <dt>Identity pool</dt>
              <dd>{outputs.auth.identity_pool_id}</dd>
              <dt>Your guest identity</dt>
              <dd>{identityId ?? '…'}</dd>
              <dt>Region</dt>
              <dd>{outputs.auth.aws_region}</dd>
            </dl>
            <p className="hint">
              Every request is signed with temporary credentials that Cognito issued to this browser
              session.
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}
