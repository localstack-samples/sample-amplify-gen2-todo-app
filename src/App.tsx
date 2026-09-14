import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { AuthUser } from 'aws-amplify/auth';
import type { Schema } from '../amplify/data/resource';
import outputs from '../amplify_outputs.json';
import { LOCALSTACK_ENDPOINT } from './amplify-config';

const client = generateClient<Schema>();

type Todo = Schema['Todo']['type'];
type TodoStats = Schema['TodoStats']['type'];

type Props = {
  signOut?: () => void;
  user?: AuthUser;
};

const graphqlHost = new URL(outputs.data.url).host;
const isLocal = Boolean(LOCALSTACK_ENDPOINT) || graphqlHost.includes('localstack');

function errorText(errors: { message: string }[] | undefined, fallback: string) {
  return errors?.map((e) => e.message).join('; ') || fallback;
}

export default function App({ signOut, user }: Props) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TodoStats | null>(null);
  const [statsBusy, setStatsBusy] = useState(false);

  const email = user?.signInDetails?.loginId ?? user?.username ?? '';

  const loadTodos = useCallback(async () => {
    const { data, errors } = await client.models.Todo.list();
    if (errors) {
      setError(errorText(errors, "Couldn't load todos."));
      return;
    }
    setTodos([...data].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
  }, []);

  const loadStats = useCallback(async () => {
    const { data, errors } = await client.queries.todoStats();
    setStatsBusy(false);
    if (errors || !data) {
      setError(errorText(errors, "Couldn't compute stats."));
      return;
    }
    setStats(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: list, errors: listErrors }, { data: computed, errors: statsErrors }] =
        await Promise.all([client.models.Todo.list(), client.queries.todoStats()]);
      if (cancelled) return;
      if (listErrors || statsErrors) {
        setError(errorText([...(listErrors ?? []), ...(statsErrors ?? [])], "Couldn't load your data."));
      }
      if (list) setTodos([...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
      if (computed) setStats(computed);
    })();
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
    await Promise.all([loadTodos(), loadStats()]);
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
    await Promise.all([loadTodos(), loadStats()]);
  }

  async function removeTodo(id: string) {
    setError(null);
    const { errors } = await client.models.Todo.delete({ id });
    if (errors) {
      setError(errorText(errors, "Couldn't delete the todo."));
      return;
    }
    await Promise.all([loadTodos(), loadStats()]);
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
          <span className="who" title={email}>
            {email}
          </span>
          <button type="button" className="ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="todos" aria-labelledby="todos-heading">
          <h2 id="todos-heading" className="visually-hidden">
            Your todos
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
              <dt>User pool</dt>
              <dd>{outputs.auth.user_pool_id}</dd>
              <dt>Region</dt>
              <dd>{outputs.auth.aws_region}</dd>
              <dt>Lambda</dt>
              <dd>{stats?.functionName ?? '…'}</dd>
              <dt>Endpoint the Lambda used (AWS_ENDPOINT_URL)</dt>
              <dd>{stats ? stats.endpoint ?? 'not set (AWS default)' : '…'}</dd>
            </dl>
          </section>

          <section className="card" aria-labelledby="stats-heading">
            <div className="card-head">
              <h2 id="stats-heading">Your stats</h2>
              <button
                type="button"
                className="ghost small"
                onClick={() => {
                  setStatsBusy(true);
                  void loadStats();
                }}
                disabled={statsBusy}
              >
                {statsBusy ? 'Computing…' : 'Recompute'}
              </button>
            </div>
            <p className="hint">Computed by the todo-stats Lambda, which scans your rows in the Todo table.</p>
            {stats ? (
              <dl className="stats">
                <dt>Todos</dt>
                <dd>{stats.total}</dd>
                <dt>Characters</dt>
                <dd>{stats.totalCharacters}</dd>
                <dt>Longest</dt>
                <dd className="wrap">{stats.longest ?? '—'}</dd>
                <dt>Latest</dt>
                <dd>{stats.latestCreatedAt ? new Date(stats.latestCreatedAt).toLocaleString() : '—'}</dd>
                <dt>Owner</dt>
                <dd className="wrap">{stats.owner ?? '—'}</dd>
                <dt>Computed</dt>
                <dd>{new Date(stats.computedAt).toLocaleTimeString()}</dd>
              </dl>
            ) : (
              <p className="hint">Waiting for the first response…</p>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}
