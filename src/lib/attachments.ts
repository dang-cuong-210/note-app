import { supabase } from '@/lib/supabase';
import type { Attachment } from '@/types';

const BUCKET = 'note-files';
const SIGNED_URL_EXPIRY = 60 * 60 * 24 * 365 * 10; // 10 years in seconds

interface AttachmentRow {
  id: string;
  note_id: string;
  name: string;
  type: string;
  size: number;
  storage_path: string;
  url: string | null;
  created_at: number;
}

function mapRow(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    noteId: row.note_id,
    name: row.name,
    type: row.type,
    size: Number(row.size),
    storagePath: row.storage_path,
    url: row.url,
    createdAt: Number(row.created_at),
  };
}

function mapAttachment(a: Attachment): AttachmentRow {
  return {
    id: a.id,
    note_id: a.noteId,
    name: a.name,
    type: a.type,
    size: a.size,
    storage_path: a.storagePath,
    url: a.url,
    created_at: a.createdAt,
  };
}

export async function uploadAttachment(
  noteId: string,
  file: File
): Promise<Attachment> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  const fileName = `${id}.${ext}`;
  const path = `${user.id}/${noteId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: urlData } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY);

  const url = urlData?.signedUrl || null;

  const row = {
    id,
    note_id: noteId,
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    storage_path: path,
    url,
    created_at: Date.now(),
  };

  const { data, error } = await supabase.from('attachments').insert(row).select().single();
  if (error) {
    // Try to clean up the uploaded file if the DB insert fails
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`Failed to save attachment: ${error.message}`);
  }

  return mapRow(data as AttachmentRow);
}

export async function deleteAttachment(id: string): Promise<void> {
  // Get the attachment to find its storage path
  const { data, error } = await supabase
    .from('attachments')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Failed to find attachment: ${error.message}`);
  if (!data) return;

  const path = (data as { storage_path: string }).storage_path;

  // Delete from DB first, then storage
  const { error: dbError } = await supabase.from('attachments').delete().eq('id', id);
  if (dbError) throw new Error(`Failed to delete attachment record: ${dbError.message}`);

  const { error: storageError } = await supabase.storage.from(BUCKET).remove([path]);
  if (storageError) console.warn('Storage delete error:', storageError.message);
}

export async function deleteAllAttachments(noteId: string): Promise<void> {
  const { data: rows, error } = await supabase
    .from('attachments')
    .select('id, storage_path')
    .eq('note_id', noteId);

  if (error || !rows || rows.length === 0) return;

  const paths = (rows as { id: string; storage_path: string }[]).map((r) => r.storage_path);
  const ids = (rows as { id: string; storage_path: string }[]).map((r) => r.id);

  // Delete DB records
  const { error: dbError } = await supabase.from('attachments').delete().in('id', ids);
  if (dbError) console.warn('Attachment DB delete error:', dbError.message);

  // Delete storage files
  const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths);
  if (storageError) console.warn('Attachment storage delete error:', storageError.message);
}

export async function loadAttachments(noteId: string): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('Failed to load attachments:', error.message);
    return [];
  }

  return (data as AttachmentRow[]).map(mapRow);
}

export async function loadAllAttachments(): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('Failed to load all attachments:', error.message);
    return [];
  }

  return (data as AttachmentRow[]).map(mapRow);
}

export async function refreshAttachmentUrl(storagePath: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);
  return data?.signedUrl || null;
}

export function getFileIcon(type: string, name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (type.startsWith('image/')) return 'image';
  if (ext === 'pdf' || type === 'application/pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'doc';
  if (['xls', 'xlsx'].includes(ext)) return 'xls';
  if (['ppt', 'pptx'].includes(ext)) return 'ppt';
  if (ext === 'zip' || type === 'application/zip') return 'zip';
  if (ext === 'txt' || type === 'text/plain') return 'txt';
  return 'file';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
