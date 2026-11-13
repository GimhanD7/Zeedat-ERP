import { useState } from 'react';
import { Check, ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import { Button } from '../common/Button';
import { Field } from '../common/Field';
import { Modal } from '../common/Modal';
import { Select } from '../common/Select';
import { compressProductImage, useProductImagesEnabled } from '../../utils';
import { Alert } from './Alert';

function ImageUploadField({ value, existingUrl, removed, onSelectDataUrl, onRemove }) {
  const imagesEnabled = useProductImagesEnabled();
  const [compressing, setCompressing] = useState(false);
  const [byteInfo, setByteInfo] = useState(null);
  const [localError, setLocalError] = useState('');

  const previewSrc = value || (!removed && existingUrl ? existingUrl : '');

  if (!imagesEnabled) {
    return (
      <div className="zk-img-offline-note">
        Offline mode active — stock images are uploaded &amp; displayed in the online version only so offline mode runs fast and smoothly.
      </div>
    );
  }

  const handleFile = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLocalError('');
    setCompressing(true);
    try {
      const res = await compressProductImage(file);
      setByteInfo(res.bytes);
      onSelectDataUrl(res.dataUrl);
    } catch (err) {
      setLocalError(err?.message || 'Failed to compress image under 10 KB.');
    } finally {
      setCompressing(false);
    }
  };

  return (
    <div className="zk-img-picker">
      <div className="zk-img-preview-box">
        {previewSrc ? (
          <img src={previewSrc} alt="Product thumbnail" className="zk-img-preview" />
        ) : (
          <span className="zk-img-placeholder">
            <ImagePlus size={20} />
          </span>
        )}
      </div>

      <div className="zk-img-picker-meta">
        <div className="zk-img-picker-actions">
          <label className="zk-img-upload-btn">
            <ImagePlus size={14} />
            <span>{compressing ? 'Compressing…' : previewSrc ? 'Change Image' : 'Upload Image'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={compressing}
              onChange={handleFile}
              hidden
            />
          </label>
          {previewSrc && (
            <button
              type="button"
              className="zk-img-remove-btn"
              onClick={() => {
                setByteInfo(null);
                setLocalError('');
                onRemove();
              }}
            >
              <Trash2 size={13} />
              <span>Remove</span>
            </button>
          )}
        </div>

        <small className="zk-img-hint">
          {byteInfo !== null
            ? `Compressed to ${(byteInfo / 1024).toFixed(1)} KB (max 10 KB) · Shown in online version only`
            : 'Auto-compressed to ≤ 10 KB when saved to server (hidden in offline mode)'}
        </small>
        {localError && <small className="text-red">{localError}</small>}
      </div>
    </div>
  );
}

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
                readOnly,
              }) => {
                const value = values[name] ?? '';
                const props = {
                  value,
                  required: !optional && !readOnly,
                  readOnly: Boolean(readOnly),
                  disabled: Boolean(readOnly),
                  onChange: e => {
                    if (!readOnly) update(name, e.target.value);
                  },
                  placeholder,
                };
                return (
                  <Field key={name} label={label} full={full || type === 'textarea' || type === 'checkbox' || type === 'image'}>
                    {type === 'image' ? (
                      <ImageUploadField
                        value={value}
                        existingUrl={values.image_url}
                        removed={Boolean(values.remove_image)}
                        onSelectDataUrl={dataUrl => {
                          setValues(v => ({ ...v, [name]: dataUrl, remove_image: false }));
                        }}
                        onRemove={() => {
                          setValues(v => ({ ...v, [name]: '', remove_image: true }));
                        }}
                      />
                    ) : choices ? (
                      <Select
                        {...props}
                        options={choices}
                        blank="Select…"
                        searchable={/product|item|device|unit|part|supplier|customer/i.test(`${name} ${label}`) || choices.length > 12}
                      />
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
          {spec.actions?.(values, update)}
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
