import { useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { Button } from '../common/Button';
import { Field } from '../common/Field';
import { Modal } from '../common/Modal';
import { Select } from '../common/Select';
import { Alert } from './Alert';

export function FormDialog({ spec, close, mutate }) {
  const [values, setValues] = useState(spec.values || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = (key, value) => setValues(v => ({ ...v, [key]: value }));

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await mutate(spec.route, spec.transform ? spec.transform(values) : values);
      spec.onSuccess?.(result);
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const fields = typeof spec.fields === 'function' ? spec.fields(values) : spec.fields;

  return (
    <Modal
      title={spec.title}
      description={spec.description}
      onClose={close}
      busy={busy}
      wide={spec.wide}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <Alert>{error}</Alert>
          <div className="form-grid">
            {fields.map(
              ({
                name,
                label,
                type = 'text',
                choices,
                optional,
                full,
                min,
                max,
                placeholder,
              }) => {
                const value = values[name] ?? '';
                const props = {
                  value,
                  required: !optional,
                  onChange: e => update(name, e.target.value),
                  placeholder,
                };
                return (
                  <Field key={name} label={label} full={full || type === 'textarea' || type === 'checkbox'}>
                    {choices ? (
                      <Select {...props} options={choices} blank="Select…" />
                    ) : type === 'textarea' ? (
                      <textarea {...props} rows={3} />
                    ) : type === 'checkbox' ? (
                      <input
                        className="check"
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={e => update(name, e.target.checked)}
                      />
                    ) : (
                      <input
                        {...props}
                        type={type === 'money' ? 'number' : type}
                        min={min ?? (type === 'money' ? 0 : undefined)}
                        max={max}
                        step={type === 'money' ? '0.01' : type === 'number' ? '1' : undefined}
                      />
                    )}
                  </Field>
                );
              }
            )}
          </div>
        </div>
        <div className="modal-footer">
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={spec.danger ? 'danger' : 'primary'}
            icon={busy ? LoaderCircle : Check}
            disabled={busy}
          >
            {busy ? 'Saving…' : spec.submit || 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
