/**
 * 页面 ID（App 与各页跳转间共享）。
 * 顶级导航：overview / todo / guide；settings 走侧边栏底部入口；
 * courtyard / dungeon / house 是从概览进入的子页。
 */
export type TabId =
  | 'overview'
  | 'todo'
  | 'courtyard'
  | 'dungeon'
  | 'house'
  | 'guide'
  | 'price'
  | 'synth'
  | 'ocr'
  | 'quiz'
  | 'admin'
  | 'settings'
