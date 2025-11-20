import React, { useEffect, useState } from 'react';
import log from 'electron-log';

interface OnePasswordBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (opReference: string) => void;
}

interface Vault {
  id: string;
  name: string;
}

interface Item {
  id: string;
  title: string;
}

interface Field {
  id: string;
  label: string;
  value?: string;
}

export const OnePasswordBrowserModal: React.FC<OnePasswordBrowserModalProps> = ({ isOpen, onClose, onSelect }) => {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [selectedVault, setSelectedVault] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadVaults();
    } else {
      // Reset state when modal closes
      setVaults([]);
      setSelectedVault(null);
      setItems([]);
      setSelectedItem(null);
      setFields([]);
      setSelectedField(null);
      setError(null);
    }
  }, [isOpen]);

  const loadVaults = async () => {
    setLoading(true);
    setError(null);
    try {
      const vaultsList = await window.api.get1PasswordVaults();
      setVaults(vaultsList);
      // Auto-select if only one vault
      if (vaultsList.length === 1) {
        // Don't set loading to false yet - let loadItems handle it
        await handleVaultSelect(vaultsList[0].id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      log.error('Failed to load 1Password vaults:', err);
      setError(err instanceof Error ? err.message : 'Failed to load vaults');
      setLoading(false);
    }
  };

  const loadItems = async (vaultId: string) => {
    setLoading(true);
    setError(null);
    try {
      const itemsList = await window.api.get1PasswordItems(vaultId);
      setItems(itemsList);
      // Auto-select if only one item
      if (itemsList.length === 1) {
        // Don't set loading to false yet - let loadFields handle it
        await handleItemSelect(vaultId, itemsList[0].id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      log.error('Failed to load 1Password items:', err);
      setError(err instanceof Error ? err.message : 'Failed to load items');
      setLoading(false);
    }
  };

  const loadFields = async (vaultId: string, itemId: string) => {
    setLoading(true);
    setError(null);
    try {
      const fieldsList = await window.api.get1PasswordItemFields(vaultId, itemId);
      setFields(fieldsList);
    } catch (err) {
      log.error('Failed to load 1Password fields:', err);
      setError(err instanceof Error ? err.message : 'Failed to load fields');
    } finally {
      setLoading(false);
    }
  };

  const handleVaultSelect = async (vaultId: string) => {
    setSelectedVault(vaultId);
    setSelectedItem(null);
    setSelectedField(null);
    setItems([]);
    setFields([]);
    await loadItems(vaultId);
  };

  const handleItemSelect = async (vaultId: string, itemId: string) => {
    setSelectedItem(itemId);
    setSelectedField(null);
    setFields([]);
    await loadFields(vaultId, itemId);
  };

  const handleFieldSelect = (fieldId: string) => {
    setSelectedField(fieldId);
  };

  const handleConfirm = () => {
    if (selectedVault && selectedItem && selectedField) {
      // Construct op:// reference: op://vault/item/field
      const field = fields.find(f => f.id === selectedField);
      if (field) {
        const vault = vaults.find(v => v.id === selectedVault);
        const item = items.find(i => i.id === selectedItem);
        if (vault && item) {
          // Use field label or id for the field part
          const fieldName = field.label || field.id;
          const opReference = `op://${vault.name}/${item.title}/${fieldName}`;
          onSelect(opReference);
          onClose();
        }
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        width: '600px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg role="img" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" height="24" width="24">
              <title>1Password</title>
              <path d="M36 0.021C16.119 0.021 0 16.128 0 35.997c0 19.872 16.119 35.982 36 35.982S72 55.869 72 36C72 16.128 55.881 0.021 36 0.021Zm-2.685 14.571000000000002h5.364c1.452 0 2.187 0.006 2.742 0.28800000000000003a2.58 2.58 0 0 1 1.131 1.131c0.28200000000000003 0.5549999999999999 0.28500000000000003 1.284 0.28500000000000003 2.736v18.048000000000002c0 0.36 0 0.546 -0.045 0.714a1.281 1.281 0 0 1 -0.201 0.41100000000000003 2.769 2.769 0 0 1 -0.522 0.486l-2.085 1.6919999999999997c-0.339 0.276 -0.51 0.41400000000000003 -0.573 0.5820000000000001a0.648 0.648 0 0 0 0 0.44999999999999996c0.06 0.165 0.23399999999999999 0.30300000000000005 0.573 0.579l2.085 1.6949999999999998c0.28200000000000003 0.22799999999999998 0.42000000000000004 0.34500000000000003 0.522 0.486 0.09 0.126 0.159 0.261 0.201 0.41100000000000003a2.8080000000000003 2.8080000000000003 0 0 1 0.045 0.714v8.238c0 1.452 -0.003 2.181 -0.28500000000000003 2.736a2.58 2.58 0 0 1 -1.131 1.131c-0.5549999999999999 0.28200000000000003 -1.29 0.28800000000000003 -2.742 0.28800000000000003h-5.364c-1.452 0 -2.178 -0.006 -2.736 -0.28800000000000003a2.58 2.58 0 0 1 -1.131 -1.131c-0.28200000000000003 -0.5549999999999999 -0.28500000000000003 -1.284 -0.28500000000000003 -2.736v-18.048000000000002c0 -0.36 0 -0.546 0.045 -0.714a1.311 1.311 0 0 1 0.201 -0.41700000000000004c0.10200000000000001 -0.14100000000000001 0.24 -0.249 0.522 -0.48l2.085 -1.6919999999999997c0.339 -0.276 0.51 -0.41400000000000003 0.573 -0.5820000000000001a0.648 0.648 0 0 0 0 -0.44999999999999996c-0.06 -0.165 -0.23399999999999999 -0.30300000000000005 -0.573 -0.579l-2.085 -1.6949999999999998a2.7600000000000002 2.7600000000000002 0 0 1 -0.522 -0.486 1.311 1.311 0 0 1 -0.201 -0.41700000000000004 2.7600000000000002 2.7600000000000002 0 0 1 -0.045 -0.708V18.75c0 -1.452 0.003 -2.181 0.28500000000000003 -2.736a2.58 2.58 0 0 1 1.131 -1.131c0.558 -0.28200000000000003 1.284 -0.28800000000000003 2.736 -0.28800000000000003z" fill="currentColor" strokeWidth="3"></path>
            </svg>
            <h2 style={{ margin: 0 }}>1Password: Select Value</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666'
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: '#fee',
            color: '#c33',
            borderRadius: '4px',
            marginBottom: '16px'
          }}>
            {error}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '16px',
          flex: 1,
          overflow: 'auto',
          marginBottom: '20px'
        }}>
          {/* Vaults */}
          <div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>Vaults</h3>
            {loading && !selectedVault ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Loading...</div>
            ) : (
              <div style={{
                border: '1px solid #ddd',
                borderRadius: '4px',
                maxHeight: '400px',
                overflowY: 'auto'
              }}>
                {vaults.map(vault => (
                  <div
                    key={vault.id}
                    onClick={() => handleVaultSelect(vault.id)}
                    style={{
                      padding: '12px',
                      cursor: 'pointer',
                      backgroundColor: selectedVault === vault.id ? '#e3f2fd' : 'white',
                      borderBottom: '1px solid #eee'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedVault !== vault.id) {
                        e.currentTarget.style.backgroundColor = '#f5f5f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedVault !== vault.id) {
                        e.currentTarget.style.backgroundColor = 'white';
                      }
                    }}
                  >
                    {vault.name}
                  </div>
                ))}
                {vaults.length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                    No vaults found
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Items */}
          <div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>Items</h3>
            {!selectedVault ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                Select a vault
              </div>
            ) : loading && items.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Loading...</div>
            ) : (
              <div style={{
                border: '1px solid #ddd',
                borderRadius: '4px',
                maxHeight: '400px',
                overflowY: 'auto'
              }}>
                {items.map(item => (
                  <div
                    key={item.id}
                    onClick={() => handleItemSelect(selectedVault!, item.id)}
                    style={{
                      padding: '12px',
                      cursor: 'pointer',
                      backgroundColor: selectedItem === item.id ? '#e3f2fd' : 'white',
                      borderBottom: '1px solid #eee'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedItem !== item.id) {
                        e.currentTarget.style.backgroundColor = '#f5f5f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedItem !== item.id) {
                        e.currentTarget.style.backgroundColor = 'white';
                      }
                    }}
                  >
                    {item.title}
                  </div>
                ))}
                {items.length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                    No items found
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fields */}
          <div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>Fields</h3>
            {!selectedItem ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                Select an item
              </div>
            ) : loading && fields.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Loading...</div>
            ) : (
              <div style={{
                border: '1px solid #ddd',
                borderRadius: '4px',
                maxHeight: '400px',
                overflowY: 'auto'
              }}>
                {fields.map(field => (
                  <div
                    key={field.id}
                    onClick={() => handleFieldSelect(field.id)}
                    style={{
                      padding: '12px',
                      cursor: 'pointer',
                      backgroundColor: selectedField === field.id ? '#e3f2fd' : 'white',
                      borderBottom: '1px solid #eee'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedField !== field.id) {
                        e.currentTarget.style.backgroundColor = '#f5f5f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedField !== field.id) {
                        e.currentTarget.style.backgroundColor = 'white';
                      }
                    }}
                  >
                    {field.label || field.id}
                  </div>
                ))}
                {fields.length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                    No fields found
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
          paddingTop: '16px',
          borderTop: '1px solid #eee'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              background: 'white',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedVault || !selectedItem || !selectedField}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              background: selectedVault && selectedItem && selectedField ? '#007bff' : '#ccc',
              color: 'white',
              cursor: selectedVault && selectedItem && selectedField ? 'pointer' : 'not-allowed'
            }}
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
};

