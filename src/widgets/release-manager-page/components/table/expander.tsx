import React from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import chevronDown from '@jetbrains/icons/chevron-down';
import classNames from 'classnames';
import '../../styles/version-table.css';

// Tree View Controller component
interface ExpanderProps {
  treeState: 'leaf' | 'node';
  closed: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  buttonClassName?: string;
}

export const Expander: React.FC<ExpanderProps> = ({ treeState, closed, onClick, onDoubleClick, buttonClassName }) => {
  return treeState === 'node' ? (
    <Button
      className={classNames('tree-view-button', buttonClassName, closed && 'closed')}
      data-test="issue-tree-view-button"
      data-test-tree-expanded={!closed}
      onClick={onClick}
      icon={chevronDown}
      onDoubleClick={e => {
        e.stopPropagation();
        e.preventDefault();
        if (onDoubleClick) {
          onDoubleClick();
        }
      }}
    />
  ) : (
    <div className="folder-opener-placeholder"/>
  );
};