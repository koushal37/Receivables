import { useRef, useState } from 'react';
import Icon from '../../components/ui/Icon';
import { ACCEPT, MAX_FILE_BYTES, MAX_FILES } from './fileTypes';

export default function Dropzone({ onFiles, compact = false, disabled = false }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const take = (list) => {
    const files = [...(list || [])];
    if (files.length) onFiles(files);
  };

  return (
    <div
      className={`dropzone ${compact ? 'dropzone-compact' : ''}`}
      data-dragging={dragging}
      onDragEnter={(e) => { e.preventDefault(); depth.current += 1; setDragging(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => { depth.current -= 1; if (depth.current <= 0) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); depth.current = 0; setDragging(false); if (!disabled) take(e.dataTransfer.files); }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        id="import-files"
        tabIndex={-1}
        onChange={(e) => { take(e.target.files); e.target.value = ''; }}
      />
      <div className="dropzone-icon"><Icon name="upload" size={compact ? 18 : 24} /></div>
      <div className="dropzone-text">
        <p className="dropzone-title">
          {dragging ? 'Drop to add files' : compact ? 'Add more files' : 'Drag and drop invoices here'}
        </p>
        {!compact && (
          <p className="hint">PDF (including scans), JPG, PNG, WEBP, HEIC, XLSX, XLS, CSV, DOCX, JSON and XML e-invoices (UBL, Factur-X). Up to {MAX_FILES} files, {MAX_FILE_BYTES / 1024 / 1024} MB each.</p>
        )}
      </div>
      <button type="button" className={`btn ${compact ? 'btn-secondary btn-sm' : 'btn-primary'}`} onClick={() => inputRef.current?.click()} disabled={disabled}>
        Choose files
      </button>
    </div>
  );
}
