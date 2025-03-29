export type TabMode = 'about' | 'item';

export interface TabState {
  mode: TabMode;
  selectedItemId?: string;  // Only set when mode is 'item'
}

export interface TabProps {
  id: string;
  activeTabId: string | null;
  name: string;
  type: string;
  style?: React.CSSProperties;
} 