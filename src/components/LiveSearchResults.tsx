import { useMemo } from 'react';
import { ArrowRight, FileText, Search } from 'lucide-react';
import type { Note } from '@/types';
import { buildSearchRecords, filterSearchRecords, getSearchSnippet, highlightSegments, normalizeSearchText, sortSearchNotes } from '@/lib/advancedSearch.js';

export function LiveSearchResults({ notes, query, onOpenNote, onShowAll }: {
  notes: Note[];
  query: string;
  onOpenNote: (noteId: string) => void;
  onShowAll: (query: string) => void;
}) {
  const records = useMemo(() => buildSearchRecords(notes), [notes]);
  const matchingNotes = useMemo(() => {
    const filtered = filterSearchRecords(records, { query }, { kind: 'all' }).map((record) => record.note);
    return sortSearchNotes(filtered, 'updated');
  }, [records, query]);
  const matches = matchingNotes.slice(0, 6);
  const recordsById = useMemo(() => new Map(records.map((record) => [record.note.id, record])), [records]);

  if (!normalizeSearchText(query)) return null;

  return <section className="tanooki-live-search-results" aria-live="polite" aria-label="Kết quả tìm kiếm">
    <div className="tanooki-live-search-heading">
      <h2><Search size={16} aria-hidden="true" /> Kết quả tìm kiếm</h2>
      <span>{matchingNotes.length} ghi chú</span>
    </div>
    {matches.length ? <div className="tanooki-live-search-list">
      {matches.map((note) => {
        const record = recordsById.get(note.id);
        const bodyMatched = Boolean(record?.bodyNormalized.includes(normalizeSearchText(query)));
        const preview = record?.bodyText
          ? bodyMatched ? getSearchSnippet(record.bodyText, query, 100) : record.bodyText.slice(0, 100)
          : 'Chưa có nội dung';
        return <button key={note.id} type="button" onClick={() => onOpenNote(note.id)} className="tanooki-live-search-result">
          <span className="tanooki-live-search-icon"><FileText size={19} aria-hidden="true" /></span>
          <span className="tanooki-live-search-copy">
            <strong>{note.title.trim() ? <HighlightedText text={note.title} query={query} /> : 'Chưa có tiêu đề'}</strong>
            <span>{record?.bodyText ? <HighlightedText text={preview} query={query} /> : 'Chưa có nội dung'}</span>
          </span>
        </button>;
      })}
    </div> : <p className="tanooki-live-search-empty">Không tìm thấy ghi chú phù hợp.</p>}
    {matches.length > 0 && <button type="button" className="tanooki-live-search-all" onClick={() => onShowAll(query.trim())}>Xem tất cả kết quả <ArrowRight size={15} aria-hidden="true" /></button>}
  </section>;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  return <>{highlightSegments(text, query).map((segment, index) => segment.match
    ? <mark key={index}>{segment.text}</mark>
    : <span key={index}>{segment.text}</span>)}</>;
}
