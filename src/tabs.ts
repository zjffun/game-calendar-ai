/**
 * 页面 ID（App 与各页跳转间共享）。
 * 顶级导航：overview / todo / guide；settings 走侧边栏底部入口。
 */
export type TabId =
  | 'overview'
  | 'todo'
  | 'guide'
  | 'price'
  | 'ocr'
  | 'quiz'
  | 'admin'
  | 'settings'
