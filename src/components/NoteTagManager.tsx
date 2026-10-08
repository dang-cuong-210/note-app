import { useId, useMemo, useState, type FormEvent } from 'react';
import { Hash, Plus, X } from 'lucide-react';
import { normalizeTagName } from '@/lib/tagUtils.js';

interface NoteTagManagerProps {
  tags: string[];
  existingTags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onOpenTag: (tag: string) => void;
  mobile?: boolean;
  className?: string;
}

export function NoteTagManager({ tags, existingTags, onAddTag, onRemoveTag, onOpenTag, mobile = false, className = '' }: NoteTagManagerProps) {
  const [value, setValue] = useState('');
  const inputId = useId();
  const normalizedValue = normalizeTagName(value) || '';
  const suggestions = useMemo(() => existingTags
    .map((tag) => normalizeTagName(tag))
    .filter((tag): tag is string => !!tag && !tags.includes(tag) && (!normalizedValue || tag.includes(normalizedValue)))
    .slice(0, 8), [existingTags, normalizedValue, tags]);

  const add = (candidate: string) => {
    const normalized = normalizeTagName(candidate);
    if (!normalized || tags.includes(normalized)) return;
    onAddTag(normalized);
    setValue('');
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    add(value);
  };
  const remove = (tag: string) => {
    if (mobile && !window.confirm(`Xóa thẻ #${tag} khỏi ghi chú này?`)) return;
    onRemoveTag(tag);
  };

  return <div className={`tanooki-tag-manager${mobile ? ' is-mobile' : ''} ${className}`.trim()}>
    {tags.length > 0 ? <div className="tanooki-tag-chips" aria-label="Thẻ của ghi chú">
      {tags.map((tag) => <span className="tanooki-tag-chip" key={tag}>
        <button type="button" className="tanooki-tag-open" onClick={() => onOpenTag(tag)} aria-label={`Lọc theo thẻ ${tag}`}>#{tag}</button>
        <button type="button" className="tanooki-tag-remove" onClick={() => remove(tag)} aria-label={`Xóa thẻ ${tag}`}><X size={mobile ? 15 : 13} /></button>
      </span>)}
    </div> : <p className="tanooki-tag-empty">Chưa có thẻ trong ghi chú.</p>}
    <form className="tanooki-tag-form" onSubmit={submit}>
      <label className="sr-only" htmlFor={inputId}>Tìm hoặc tạo thẻ</label>
      <div className="tanooki-tag-entry">
        <Hash size={15} aria-hidden="true" />
        <input id={inputId} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Tìm hoặc tạo thẻ" autoComplete="off" />
        <button type="submit" disabled={!normalizedValue || tags.includes(normalizedValue)} aria-label="Thêm thẻ"><Plus size={17} /></button>
      </div>
      {suggestions.length > 0 && <div className="tanooki-tag-suggestions" aria-label="Thẻ đã dùng">
        {suggestions.map((tag) => <button type="button" key={tag} onClick={() => add(tag)}>#{tag}</button>)}
      </div>}
    </form>
  </div>;
}
