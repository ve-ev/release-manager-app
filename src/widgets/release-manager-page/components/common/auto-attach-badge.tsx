import React from 'react';
import Tooltip from '@jetbrains/ring-ui-built/components/tooltip/tooltip';

const TOOLTIP = 'Auto-attached: the release\'s auto-attach filter added this issue. ' +
  'The filter removes it when the issue stops matching. Issues added by hand are never removed.';

/** Small "A" marker for planned issues added by the auto-attach filter. */
export const AutoAttachBadge: React.FC = () => (
  <Tooltip title={TOOLTIP} className="auto-attach-badge-wrap">
    <span className="auto-attach-badge" aria-label="Auto-attached by filter">A</span>
  </Tooltip>
);
