import React from 'react';
import {H1} from '@jetbrains/ring-ui-built/components/heading/heading';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import purpleShadow from '../assets/shadow-purple.svg';
import blueShadow from '../assets/shadow-blue.svg';
import '../styles/empty-state.css';

interface EmptyStateProps {
  canCreate: boolean;
  canAccessSettings: boolean;
  isConfigured: boolean;
  onAddRelease: () => void;
  onOpenSettings: () => void;
}

interface OnboardingStepProps {
  number: number;
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
  enabled: boolean;
  primary?: boolean;
  completed?: boolean;
}

const OnboardingStep: React.FC<OnboardingStepProps> = ({
  number,
  title,
  description,
  actionLabel,
  onClick,
  enabled,
  primary,
  completed,
}) => (
  <div className={`onboarding-step${enabled ? '' : ' onboarding-step--locked'}${completed ? ' onboarding-step--completed' : ''}`}>
    <div className="onboarding-step-badge">{completed ? '✓' : number}</div>
    <div className="onboarding-step-content">
      <div className="onboarding-step-title">{title}</div>
      <div className="onboarding-step-description">{description}</div>
    </div>
    <Button
      className="onboarding-step-action"
      onClick={onClick}
      disabled={!enabled}
      primary={primary && enabled}
    >
      {actionLabel}
    </Button>
  </div>
);

export const EmptyState: React.FC<EmptyStateProps> = ({
  canCreate,
  canAccessSettings,
  isConfigured,
  onAddRelease,
  onOpenSettings,
}) => {
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

        <div className="onboarding-steps">
          <OnboardingStep
            number={1}
            title="Setup the App"
            description="Choose products and configure progress tracking in Settings."
            actionLabel="Open Settings"
            onClick={onOpenSettings}
            enabled={canAccessSettings}
            completed={isConfigured}
          />
          <OnboardingStep
            number={2}
            title="Create your first release"
            description="Define a version, set dates, and start tracking."
            actionLabel="Create Release"
            onClick={onAddRelease}
            enabled={canCreate && isConfigured}
            primary
          />
        </div>
      </section>
    </div>
  );
};
