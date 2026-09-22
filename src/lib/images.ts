import { supabase } from '@/lib/supabase';

const BUCKET = 'note-images';
const MAX_DIMENSION = 1920;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB before compression
const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export function isAcceptedImageType(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type.toLowerCase());
}

/**
 * Resize/compress an image file in-browser before upload.
 * Returns a JPEG blob capped at MAX_DIMENSION on the longest edge.
 * PNG and WEBP are preserved in their original format.
 */
export async function compressImage(file: File): Promise<Blob> {
  if (file.size <= MAX_FILE_SIZE && file.type === 'image/png') {
    // Small PNGs: keep as-is for transparency
    return file;
  }

  const img = await loadImage(file);
  let { width, height } = img;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  ctx.drawImage(img, 0, 0, width, height);

  // Preserve PNG format, compress others as JPEG quality 0.82
  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const quality = mime === 'image/png' ? undefined : 0.82;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Compression failed'))),
      mime,
      quality
    );
  });
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/**
 * Upload an image to Supabase Storage under the user's scoped path.
 * Returns the public URL of the uploaded image.
 */
export async function uploadNoteImage(
  noteId: string,
  file: File
): Promise<{ url: string; path: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const compressed = await compressImage(file);
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${user.id}/${noteId}/${fileName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    contentType: compressed.type,
    upsert: false,
  });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  // Get a signed URL since the bucket is private
  const { data: urlData } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10); // 10-year signed URL

  if (!urlData?.signedUrl) throw new Error('Failed to get image URL');

  return { url: urlData.signedUrl, path };
}

/**
 * Delete a single image from storage by its full path.
 */
export async function deleteNoteImage(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.warn('Image delete error:', error.message);
}

/**
 * Delete all images for a note (used when permanently deleting a note).
 */
export async function deleteAllNoteImages(noteId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const folderPath = `${user.id}/${noteId}/`;
  const { data: files, error } = await supabase.storage
    .from(BUCKET)
    .list(`${user.id}/${noteId}`);

  if (error || !files || files.length === 0) return;

  const pathsToRemove = files.map((f) => `${folderPath}${f.name}`);
  const { error: removeError } = await supabase.storage.from(BUCKET).remove(pathsToRemove);
  if (removeError) console.warn('Bulk image delete error:', removeError.message);
}

/**
 * Extract all storage paths from <img> tags in HTML content.
 * Used to identify which images belong to a note for cleanup.
 */
export function extractImagePaths(html: string): string[] {
  const div = document.createElement('div');
  div.innerHTML = html;
  const imgs = div.querySelectorAll('img[src]');
  const paths: string[] = [];
  imgs.forEach((img) => {
    const src = img.getAttribute('src') || '';
    // Extract the storage path from the signed URL
    const match = src.match(/\/note-images\/(.+?)(\?|$)/);
    if (match) {
      paths.push(decodeURIComponent(match[1]));
    }
  });
  return paths;
}
