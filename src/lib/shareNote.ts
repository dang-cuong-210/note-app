export type ShareNoteResult = 'shared' | 'copied' | 'unsupported';

export async function shareNoteContent(title: string, text: string, platform: Pick<Navigator, 'share' | 'clipboard'> = navigator): Promise<ShareNoteResult> {
  if (platform.share) {
    await platform.share({ title, text });
    return 'shared';
  }
  if (platform.clipboard?.writeText) {
    await platform.clipboard.writeText(`${title}\n\n${text}`);
    return 'copied';
  }
  return 'unsupported';
}
