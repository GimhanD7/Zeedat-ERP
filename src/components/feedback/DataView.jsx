import { Alert } from './Alert';
import { Spinner } from './Spinner';

export function DataView({ state, children }) {
  if (!state || !state.data) {
    return state?.error ? <Alert>{state.error}</Alert> : <Spinner />;
  }

  return (
    <>
      <Alert>{state.error}</Alert>
      {typeof children === 'function' ? children(state.data) : children}
    </>
  );
}
