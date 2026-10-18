import { content as current } from './alba-final.js';
import { content as previous } from './alba.js';
import { content as legacy } from './legacy.js';

export const defaultContent = current;

// Never migrate, regrade, or erase a saved run implicitly.
export function contentForRun(run) {
  if (run?.contentVersion === legacy.contentVersion) return legacy;
  if (run?.contentVersion === current.contentVersion) return current;
  if (run?.contentVersion === previous.contentVersion) return previous;
  throw new Error('この内容版の保存には対応していません。既存の保存は保持しています。');
}
