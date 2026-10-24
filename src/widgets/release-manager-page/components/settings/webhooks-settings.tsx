import React, {useCallback, useEffect, useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input, {Size} from '@jetbrains/ring-ui-built/components/input/input';
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Confirm from '@jetbrains/ring-ui-built/components/confirm/confirm';
import Tooltip from '@jetbrains/ring-ui-built/components/tooltip/tooltip';
import {H3} from '@jetbrains/ring-ui-built/components/heading/heading';
import chevronRightIcon from '@jetbrains/icons/chevron-right';
import {API} from '../../api';
import {Webhook, WebhookDelivery, WebhookInput} from '../../interfaces';
import {getBackendErrorMessage} from '../../utils/helpers';
import {generateClientId} from '../../utils/id-generator';

/** Event names come from the backend; labels and groups are for display only */
const EVENT_GROUPS: Array<{ title: string; events: Array<[string, string]> }> = [
  {title: 'Release', events: [['RELEASE_CREATED', 'Created'], ['RELEASE_DELETED', 'Deleted'], ['STATUS_CHANGED', 'Status changed'], ['RELEASE_COMPLETED', 'Released']]},
  {title: 'Feature freeze', events: [['FREEZE_CONFIRMED', 'Confirmed'], ['UNFROZEN', 'Unfrozen']]},
  {title: 'Content', events: [['PLANNED_ISSUES_CHANGED', 'Planned issues'], ['DESCRIPTION_CHANGED', 'Description']]},
  {title: 'Auto-attach', events: [['AUTO_ATTACHED', 'Issues attached'], ['AUTO_DETACHED', 'Issues detached']]}
];
const DEFAULT_EVENTS = ['RELEASE_COMPLETED'];
const MIN_SECRET_LENGTH = 32;
const MINUTE_MS = 60000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

function toggleIn(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) { next.delete(key); } else { next.add(key); }
  return next;
}

interface Draft extends WebhookInput {
  key: string;
  hasSecret: boolean;
  lastDelivery: WebhookDelivery | null;
}

function toDraft(w: Webhook): Draft {
  return {key: w.id, id: w.id, name: w.name, url: w.url, secret: '', hasSecret: w.hasSecret,
    events: w.events, enabled: w.enabled, lastDelivery: w.lastDelivery};
}

function toInput(d: Draft): WebhookInput {
  return {id: d.id, name: d.name, url: d.url, secret: d.secret, events: d.events, enabled: d.enabled};
}

function hostOf(url: string): string {
  const m = url.match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1] : '';
}

function relativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / MINUTE_MS);
  if (minutes < 1) { return 'just now'; }
  if (minutes < MINUTES_PER_HOUR) { return `${minutes} min ago`; }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) { return `${hours} h ago`; }
  return `${Math.floor(hours / HOURS_PER_DAY)} d ago`;
}

const DeliveryStatus: React.FC<{ delivery: WebhookDelivery | null }> = ({delivery}) => {
  if (!delivery) {
    return <span className="webhook-status">Not delivered yet</span>;
  }
  const ok = !delivery.error;
  return (
    <span className={`webhook-status ${ok ? 'ok' : 'failed'}`}>
      <span aria-hidden="true">{ok ? '●' : '✕'}</span>
      {' '}{ok ? 'Delivered' : 'Failed'}{delivery.code ? ` ${delivery.code}` : ''} · {relativeTime(delivery.at)}
    </span>
  );
};

const cardErrorId = (key: string) => `webhook-error-${key}`;

interface TestResult {
  text: string;
  ok: boolean;
}

interface CardProps {
  draft: Draft;
  index: number;
  isOpen: boolean;
  allowedEvents: string[];
  secretVisible: boolean;
  urlError: string;
  secretError: string;
  isTesting: boolean;
  canTest: boolean;
  /** Save error of this webhook, from the backend */
  error: string;
  testResult: TestResult | null;
  onToggle: () => void;
  onChange: (patch: Partial<Draft>) => void;
  onToggleSecret: () => void;
  onUrlBlur: (url: string) => void;
  onSecretBlur: (secret: string) => void;
  onTest: () => void;
  onDelete: () => void;
}

// eslint-disable-next-line complexity
const WebhookCard: React.FC<CardProps> = ({
  draft: d, index, isOpen, allowedEvents, secretVisible, urlError, secretError, isTesting, canTest, error, testResult,
  onToggle, onChange, onToggleSecret, onUrlBlur, onSecretBlur, onTest, onDelete
}) => {
  const bodyId = `webhook-body-${d.key}`;
  const title = d.name || hostOf(d.url) || `Webhook ${index + 1}`;
  return (
    <section className="webhook-card" aria-label={title}>
      <div className="webhook-card-header">
        <Button
          inline
          icon={chevronRightIcon}
          className={`webhook-card-toggle${isOpen ? ' open' : ''}`}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="webhook-card-title">{title}</span>
        </Button>
        {error && !isOpen && <span className="webhook-status failed">Not saved: error</span>}
        {!d.enabled && <span className="webhook-status">Disabled</span>}
        <DeliveryStatus delivery={d.lastDelivery}/>
      </div>

      {isOpen && (
        <div className="webhook-card-body" id={bodyId}>
          {error && (
            <div className="webhooks-error" role="alert" tabIndex={-1} id={cardErrorId(d.key)}>{error}</div>
          )}
          {d.lastDelivery && (
            <div className={`webhook-delivery-details${d.lastDelivery.error ? ' failed' : ''}`}>
              Last delivery: {new Date(d.lastDelivery.at).toLocaleString()}
              {d.lastDelivery.error ? ` — ${d.lastDelivery.error}` : `, HTTP ${d.lastDelivery.code}`}
            </div>
          )}
          <div className="webhook-fields">
            <Input
              label="Name"
              size={Size.FULL}
              value={d.name}
              maxLength={100}
              onChange={e => onChange({name: e.target.value})}
              placeholder="For example, CI pipeline"
            />
            <Input
              label="URL"
              size={Size.FULL}
              type="url"
              value={d.url}
              error={urlError || null}
              onChange={e => onChange({url: e.target.value})}
              onBlur={e => onUrlBlur(e.target.value)}
              placeholder="https://"
            />
            <Input
              label="Secret"
              size={Size.FULL}
              className="webhook-secret-input"
              type={secretVisible ? 'text' : 'password'}
              autoComplete="new-password"
              value={d.secret}
              error={secretError || null}
              onChange={e => onChange({secret: e.target.value})}
              onBlur={e => onSecretBlur(e.target.value)}
              placeholder={d.hasSecret ? 'Saved. Type a new value to replace it.' : `At least ${MIN_SECRET_LENGTH} characters`}
              help="Sent as “Authorization: Bearer <secret>”. You cannot see a saved secret again. When you change the URL, enter the secret again."
              afterInput={d.secret ? (
                <Button inline className="webhook-secret-toggle" onClick={onToggleSecret}>{secretVisible ? 'Hide' : 'Show'}</Button>
            ) : null}
            />
          </div>

          <fieldset className="webhook-events">
            <legend className="bold-label">Events</legend>
            {EVENT_GROUPS.map(group => {
              const events = group.events.filter(([name]) => allowedEvents.includes(name));
              if (events.length === 0) { return null; }
              return (
                <div key={group.title} className="webhook-event-group" role="group" aria-label={group.title}>
                  <span className="webhook-event-group-title">{group.title}</span>
                  <div className="webhook-event-options">
                    {events.map(([name, label]) => (
                      <Checkbox
                        key={name}
                        label={label}
                        checked={d.events.includes(name)}
                        onChange={e => onChange({
                          events: e.target.checked ? [...d.events, name] : d.events.filter(x => x !== name)
                        })}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </fieldset>

          <div className="webhook-card-actions">
            <Checkbox label="Enabled" checked={d.enabled} onChange={e => onChange({enabled: e.target.checked})}/>
            <span className="webhook-card-actions-spacer"/>
            {/* Next to the button it belongs to; always in the DOM, so screen readers announce the result */}
            <span className={`webhook-test-result${testResult && !testResult.ok ? ' failed' : ''}`} role="status" aria-live="polite">
              {isTesting && <LoaderInline/>}
              {!isTesting && testResult && (
                <><span aria-hidden="true">{testResult.ok ? '✓' : '✕'}</span> {testResult.text}</>
              )}
            </span>
            <Button onClick={onTest} disabled={!canTest}>Send test event</Button>
            <Button danger onClick={onDelete}>Delete</Button>
          </div>
        </div>
      )}
    </section>
  );
};

interface Props {
  api: API;
  onClose: () => void;
}

/**
 * Outbound webhooks of the project: a list of cards with their own Save, because webhooks use their own endpoint.
 */
// eslint-disable-next-line complexity
export const WebhooksSettings: React.FC<Props> = ({api, onClose}) => {
  const [saved, setSaved] = useState<Webhook[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [allowedEvents, setAllowedEvents] = useState<string[]>([]);
  const [maxWebhooks, setMaxWebhooks] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showSecret, setShowSecret] = useState<Set<string>>(new Set());
  const [urlErrors, setUrlErrors] = useState<Record<string, string>>({});
  const [secretErrors, setSecretErrors] = useState<Record<string, string>>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    api.getWebhooks()
      .then(res => {
        if (!mounted) { return; }
        setSaved(res.webhooks);
        setDrafts(res.webhooks.map(toDraft));
        setAllowedEvents(res.events);
        setMaxWebhooks(res.maxWebhooks);
      })
      .catch(e => { if (mounted) { setError(getBackendErrorMessage(e, 'Failed to load webhooks')); } })
      .finally(() => { if (mounted) { setIsLoading(false); } });
    return () => { mounted = false; };
  }, [api]);

  const isDirty = JSON.stringify(drafts.map(toInput)) !== JSON.stringify(saved.map(w => toInput(toDraft(w))));

  const update = useCallback((key: string, patch: Partial<Draft>) => {
    setDrafts(prev => prev.map(d => (d.key === key ? {...d, ...patch} : d)));
  }, []);

  const handleAdd = useCallback(() => {
    const key = generateClientId('webhook');
    setDrafts(prev => [...prev, {key, name: '', url: '', secret: '', hasSecret: false, events: DEFAULT_EVENTS, enabled: true, lastDelivery: null}]);
    setExpanded(prev => new Set(prev).add(key));
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setCardErrors({});
    try {
      await api.saveWebhooks(drafts.map(toInput));
      // Same as Save on the General tab: the settings close
      onClose();
    } catch (e) {
      const message = getBackendErrorMessage(e, 'Failed to save webhooks');
      const index = (e as { data?: { webhookIndex?: unknown } } | null)?.data?.webhookIndex;
      const failed = typeof index === 'number' ? drafts[index] : undefined;
      if (failed) {
        // Show the error in the card of that webhook and open the card
        setCardErrors({[failed.key]: message});
        setExpanded(prev => new Set(prev).add(failed.key));
        requestAnimationFrame(() => document.getElementById(cardErrorId(failed.key))?.focus());
      } else {
        setError(message);
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    } finally {
      setIsSaving(false);
    }
  }, [api, drafts, onClose]);

  const handleTest = useCallback(async (draft: Draft) => {
    setTestingKey(draft.key);
    setTestResults(prev => {
      const next = {...prev};
      delete next[draft.key];
      return next;
    });
    try {
      const {delivery, recorded} = await api.testWebhook(toInput(draft));
      if (recorded) {
        // A saved webhook with an unchanged URL: the backend stored the result as the last delivery
        setSaved(prev => prev.map(w => (w.id === draft.id ? {...w, lastDelivery: delivery} : w)));
        update(draft.key, {lastDelivery: delivery});
      }
      setTestResults(prev => ({...prev, [draft.key]: delivery.error
        ? {text: `Failed: ${delivery.error}`, ok: false}
        : {text: `Delivered, HTTP ${delivery.code}`, ok: true}}));
    } catch (e) {
      setTestResults(prev => ({...prev, [draft.key]: {text: getBackendErrorMessage(e, 'Failed to send the test event'), ok: false}}));
    } finally {
      setTestingKey(null);
    }
  }, [api, update]);

  const validateUrl = (key: string, url: string) => {
    setUrlErrors(prev => ({...prev, [key]: url && !/^https:\/\//i.test(url) ? 'Use an HTTPS URL' : ''}));
  };

  // Same rule as the backend; the backend error stays the final check
  const validateSecret = (draft: Draft, secret: string) => {
    let message = '';
    if (secret && secret.length < MIN_SECRET_LENGTH) {
      message = `Enter at least ${MIN_SECRET_LENGTH} characters`;
    } else if (!secret && !draft.hasSecret) {
      message = 'A secret is required';
    }
    setSecretErrors(prev => ({...prev, [draft.key]: message}));
  };

  if (isLoading) {
    return <div className="settings-loading"><LoaderInline/> Loading webhooks...</div>;
  }

  const deleting = drafts.find(d => d.key === confirmDeleteKey);

  return (
    <div className="webhooks-settings">
      <div className="settings-section-heading">
        <H3>Outbound Webhooks</H3>
        <Tooltip title="After a selected release event is saved, the app sends a POST request in the CloudEvents 1.0 format to the webhook URL. The secret is sent in the Authorization header as a Bearer token.">
          <span className="settings-help-icon">?</span>
        </Tooltip>
      </div>

      {error && (
        <div className="webhooks-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</div>
      )}

      {drafts.length === 0 ? (
        <div className="webhooks-empty">
          <p className="field-help">
            No webhooks yet. A webhook sends release changes to an HTTPS URL, for example to a CI pipeline or an n8n workflow.
          </p>
        </div>
      ) : (
        <div className="webhooks-list">
          {drafts.map((d, index) => (
            <WebhookCard
              key={d.key}
              draft={d}
              index={index}
              isOpen={expanded.has(d.key)}
              allowedEvents={allowedEvents}
              secretVisible={showSecret.has(d.key)}
              urlError={urlErrors[d.key] || ''}
              secretError={secretErrors[d.key] || ''}
              isTesting={testingKey === d.key}
              canTest={!!d.url && testingKey === null}
              error={cardErrors[d.key] || ''}
              testResult={testResults[d.key] || null}
              onToggle={() => setExpanded(prev => toggleIn(prev, d.key))}
              onChange={patch => update(d.key, patch)}
              onToggleSecret={() => setShowSecret(prev => toggleIn(prev, d.key))}
              onUrlBlur={url => validateUrl(d.key, url)}
              onSecretBlur={secret => validateSecret(d, secret)}
              onTest={() => handleTest(d)}
              onDelete={() => setConfirmDeleteKey(d.key)}
            />
          ))}
        </div>
      )}

      <div className="webhooks-add">
        <Button onClick={handleAdd} disabled={drafts.length >= maxWebhooks}>Add webhook</Button>
        <span className="webhooks-count">{drafts.length} of {maxWebhooks}</span>
      </div>

      <div className="settings-separator horizontal" role="separator" aria-orientation="horizontal"/>

      <div className="settings-actions">
        {/* Close when there is nothing to lose; Cancel when unsaved changes are dropped */}
        <Button onClick={onClose}>{isDirty ? 'Cancel' : 'Close'}</Button>
        <Button primary onClick={handleSave} disabled={isSaving || !isDirty}>
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {deleting && (
        <Confirm
          show
          onConfirm={() => {
            setDrafts(prev => prev.filter(x => x.key !== deleting.key));
            setConfirmDeleteKey(null);
          }}
          onReject={() => setConfirmDeleteKey(null)}
          confirmLabel="Delete"
          rejectLabel="Cancel"
          text={`Delete the webhook “${deleting.name || hostOf(deleting.url) || 'without a name'}”? The deletion is saved when you click Save.`}
        />
      )}
    </div>
  );
};

export default WebhooksSettings;
