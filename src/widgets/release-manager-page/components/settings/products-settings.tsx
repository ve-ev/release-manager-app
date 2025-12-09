import React from 'react';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';
import {H3} from '@jetbrains/ring-ui-built/components/heading/heading';
import {AppSettings} from '../../interfaces';
import {generateColorFromString} from '../../utils/helpers';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;

  // State lifted from parent to keep current behavior unchanged
  newProductName: string;
  setNewProductName: (value: string) => void;
  editProductId: string | null;
  editProductName: string;
  setEditProductId: (value: string | null) => void;
  setEditProductName: (value: string) => void;

  // Handlers from parent
  handleAddProduct: () => void;
  startEditProduct: (p: { id: string; name: string }) => void;
  handleSaveProduct: () => void;
  handleDeleteProduct: (id: string) => void;
}

/**
 * Products settings (independent component)
 */
export const ProductsSettings: React.FC<Props> = ({
  settings,
  setSettings,
  newProductName,
  setNewProductName,
  editProductId,
  editProductName,
  setEditProductId,
  setEditProductName,
  handleAddProduct,
  startEditProduct,
  handleSaveProduct,
  handleDeleteProduct
}) => {
  return (
    <div className="settings-field">
      <H3>Products</H3>
      {(settings.products || []).length === 0 ? (
        <div className="field-help">No products configured yet.</div>
      ) : (
        <div className="products-list">
          {(settings.products || []).map(p => (
            <div key={p.id} className="product-row">
              {editProductId === p.id ? (
                <>
                  <Input
                    value={editProductName}
                    onChange={(e) => setEditProductName(e.target.value)}
                    placeholder="Product name"
                  />
                  <input
                    className="product-color-input"
                    type="color"
                    value={p.color || generateColorFromString(p.name)}
                    title="Pick color"
                    onChange={(e) => {
                      const color = e.target.value;
                      setSettings(prev => ({
                        ...prev,
                        products: (prev.products || []).map(item => item.id === p.id ? { ...item, color } : item)
                      }));
                    }}
                  />
                  <Button onClick={handleSaveProduct} disabled={!editProductName.trim()}>Save</Button>
                  <Button onClick={() => { setEditProductId(null); setEditProductName(''); }}>Cancel</Button>
                </>
              ) : (
                <>
                  <Tag
                    readOnly
                    className="product-color-preview"
                    backgroundColor={p.color || generateColorFromString(p.name)}
                    textColor="#fff"
                    disabled
                  >
                    {p.name}
                  </Tag>
                  <Button onClick={() => startEditProduct(p)}>Edit</Button>
                  <Button onClick={() => handleDeleteProduct(p.id)}>Delete</Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="add-product">
        <Input
          value={newProductName}
          onChange={(e) => setNewProductName(e.target.value)}
          placeholder="New product name"
        />
        <Button onClick={handleAddProduct} disabled={!newProductName.trim()}>Add</Button>
      </div>
    </div>
  );
};

export default ProductsSettings;
