import React from 'react';
import {H1, H4} from '@jetbrains/ring-ui-built/components/heading/heading';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import purpleShadow from '../assets/shadow-purple.svg';
import blueShadow from '../assets/shadow-blue.svg';
import '../styles/empty-state.css';

interface EmptyStateProps {
  canCreate: boolean;
  canAccessSettings: boolean;
  onAddRelease: () => void;
  onOpenSettings: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ canCreate, onAddRelease}) => {
  return (
    <div className="empty-state">
      <section className="empty-state-text">
        {/* Decorative shadows behind the text card */}
        <img src={purpleShadow} alt="" aria-hidden className="empty-state-purpleShadow"/>
        <img src={blueShadow} alt="" aria-hidden className="empty-state-blueShadow"/>

        <H1>Welcome to Release Manager</H1>
        <div className="empty-state-subtitle">
          Plan and track your product releases with confidence. Define versions, set feature‑freeze and release dates,
          monitor progress, and manage related issues — all in one place.
        </div>

        {canCreate && (
        <>
          <div className="empty-state-actions">
            <Button primary onClick={onAddRelease}>Create your first release version</Button>
          </div>
          <div className="empty-state-tips">
            <H4>Tips:</H4>
            <ul className="empty-state-tips-list">
              <li>Start in Settings to choose products and fields used to calculate progress.</li>
              <li>Create a release version and, if needed, a meta‑issue to group related work.</li>
              <li>Click a release row to open details and quick actions.</li>
            </ul>
          </div>
        </>
        )}



      </section>
    </div>
  );
};
