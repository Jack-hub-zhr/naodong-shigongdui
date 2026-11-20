import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { Project } from '../types';
import { COPY } from '../copy';

export type ExportResult = 'downloaded' | 'copied' | 'shared';

function fileName(project: Project): string {
  const safe = project.title.replace(/[^\w\u4e00-\u9fa5-]/g, '').slice(0, 16) || 'naodong';
  return `${safe}-施工队成品.html`;
}

/** Web 下载成品 HTML；原生端复制完整源码 */
export async function exportArtifact(project: Project): Promise<ExportResult> {
  if (!project.artifact) return 'copied';
  if (Platform.OS === 'web') {
    const blob = new Blob([project.artifact.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName(project);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'downloaded';
  }
  await Clipboard.setStringAsync(project.artifact.html);
  return 'copied';
}

export async function copyArtifact(project: Project): Promise<void> {
  if (!project.artifact) return;
  await Clipboard.setStringAsync(project.artifact.html);
}

export function openArtifact(project: Project): void {
  if (Platform.OS !== 'web' || !project.artifact) return;
  const blob = new Blob([project.artifact.html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function shareArtifact(project: Project): Promise<void> {
  if (!project.artifact) return;
  const message = `【${COPY.brand.fullName}】${project.title}\n${COPY.brand.slogan}\n\n取悦声明：\n${(project.delight ?? [])
    .slice(0, 4)
    .map((item) => `· ${item.response}`)
    .join('\n')}`;
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav?.share) {
      try {
        await nav.share({ title: project.title, text: message });
        return;
      } catch {
        // 用户取消或浏览器不支持，退回复制
      }
    }
    await Clipboard.setStringAsync(message);
    return;
  }
  await Share.share({ message, title: project.title });
}
