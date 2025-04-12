export interface TabProps {
  id: string;
  activeTabId: string | null;
  name: string;
  type: string;
  style?: React.CSSProperties;
} 