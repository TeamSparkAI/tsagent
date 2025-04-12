import React from 'react';

interface ChatContextMenuProps {
  x: number;
  y: number;
  onCopy: () => void;
  onSelectAll: () => void;
  onClose: () => void;
}

export const ChatContextMenu: React.FC<ChatContextMenuProps> = ({ x, y, onCopy, onSelectAll, onClose }) => {
  return (
    <div 
      className="context-menu"
      style={{ 
        position: 'fixed',
        left: x,
        top: y,
      }}
    >
      <div className="menu-item" onClick={onCopy}>Copy</div>
      <div className="menu-separator" />
      <div className="menu-item" onClick={onSelectAll}>Select All</div>
    </div>
  );
}; 