import React, {useEffect, useState} from 'react';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';
import '../styles/version-table.css';
import {api} from '../app';
import {AppSettings} from '../interfaces';

// Component to render product as a tag
export const ProductTag: React.FC<{ product: string }> = ({ product }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let mounted = true;
    api.getAppSettings().then(s => {
      if (mounted) {
        setSettings(s);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Re-fetch settings when settings are updated elsewhere (e.g., SettingsForm saved)
  useEffect(() => {
    const handler = () => {
      // Ensure we don't serve stale cached settings
      api.invalidateProgressSettingsCache();
      api.getAppSettings().then(s => {
        setSettings(s);
      }).catch(() => {});
    };
    window.addEventListener('settings-updated', handler as EventListener);
    return () => window.removeEventListener('settings-updated', handler as EventListener);
  }, []);

  if (!product) {
    return null;
  }

  // Generate a consistent color based on the product name
  const getFallbackColor = (name: string) => {
    // Simple hash function to generate a number from a string
    const SHIFT_FACTOR = 5; // Using a named constant instead of magic number
    const hash = name.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << SHIFT_FACTOR) - acc);
    }, 0);

    // List of predefined colors (similar to those used in YouTrack)
    const colors = [
      '#5cb85c', // green
      '#337ab7', // blue
      '#f0ad4e', // orange
      '#5bc0de', // light blue
      '#d9534f', // red
      '#9370db', // medium purple
      '#20b2aa', // light sea green
      '#ff7f50'  // coral
    ];

    // Use the hash to select a color
    const colorIndex = Math.abs(hash) % colors.length;
    return colors[colorIndex];
  };

  const configuredColor = (() => {
    const list = settings?.products || [];
    const found = list.find(p => p.name === product);
    return found?.color;
  })();

  const tagColor = configuredColor || getFallbackColor(product);

  return (
    <Tag
      readOnly
      className="product-tag"
      backgroundColor={tagColor}
      textColor="#fff"
      disabled
    >
      {product}
    </Tag>
  );
};