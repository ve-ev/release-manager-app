import React, {useMemo} from 'react';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';
import '../../styles/version-table.css';
import {generateColorFromString} from '../../utils/helpers';
import {AppSettings} from '../../interfaces';

/**
 * Component to render product as a tag with color
 * 
 * NOTE: settings prop is optional and passed from parent to avoid hook proliferation.
 * If settings are not provided, falls back to generating color from product name.
 */
export const ProductTag: React.FC<{ product: string; settings?: AppSettings }> = ({ product, settings }) => {
  const tagColor = useMemo(() => {
    if (!product) {
      return '#e0e0e0';
    }
    
    const list = settings?.products || [];
    const found = list.find(p => p.name === product);
    return found?.color || generateColorFromString(product);
  }, [product, settings]);

  if (!product) {
    return null;
  }

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

