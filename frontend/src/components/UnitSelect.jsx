import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

// Comprehensive list of units used in construction industry
export const CONSTRUCTION_UNITS = [
  // Quantity / Count
  { value: 'nos', label: 'Nos (Numbers)', category: 'Count' },
  { value: 'pcs', label: 'Pcs (Pieces)', category: 'Count' },
  { value: 'set', label: 'Set', category: 'Count' },
  { value: 'pair', label: 'Pair', category: 'Count' },
  { value: 'lot', label: 'Lot', category: 'Count' },
  { value: 'dozen', label: 'Dozen', category: 'Count' },
  
  // Weight
  { value: 'kg', label: 'Kg (Kilogram)', category: 'Weight' },
  { value: 'ton', label: 'Ton', category: 'Weight' },
  { value: 'quintal', label: 'Quintal', category: 'Weight' },
  { value: 'gram', label: 'Gram', category: 'Weight' },
  
  // Volume
  { value: 'litre', label: 'Litre', category: 'Volume' },
  { value: 'cft', label: 'CFT (Cubic Feet)', category: 'Volume' },
  { value: 'cum', label: 'Cum (Cubic Meter)', category: 'Volume' },
  { value: 'gallon', label: 'Gallon', category: 'Volume' },
  { value: 'barrel', label: 'Barrel', category: 'Volume' },
  
  // Area
  { value: 'sqft', label: 'Sqft (Square Feet)', category: 'Area' },
  { value: 'sqm', label: 'Sqm (Square Meter)', category: 'Area' },
  { value: 'sqyd', label: 'Sqyd (Square Yard)', category: 'Area' },
  { value: 'cent', label: 'Cent', category: 'Area' },
  { value: 'acre', label: 'Acre', category: 'Area' },
  
  // Length
  { value: 'rft', label: 'RFT (Running Feet)', category: 'Length' },
  { value: 'meter', label: 'Meter', category: 'Length' },
  { value: 'feet', label: 'Feet', category: 'Length' },
  { value: 'inch', label: 'Inch', category: 'Length' },
  { value: 'cm', label: 'CM (Centimeter)', category: 'Length' },
  { value: 'mm', label: 'MM (Millimeter)', category: 'Length' },
  { value: 'yard', label: 'Yard', category: 'Length' },
  
  // Packaging / Bulk
  { value: 'bag', label: 'Bag', category: 'Packaging' },
  { value: 'bundle', label: 'Bundle', category: 'Packaging' },
  { value: 'box', label: 'Box', category: 'Packaging' },
  { value: 'roll', label: 'Roll', category: 'Packaging' },
  { value: 'packet', label: 'Packet', category: 'Packaging' },
  { value: 'drum', label: 'Drum', category: 'Packaging' },
  { value: 'can', label: 'Can', category: 'Packaging' },
  { value: 'tin', label: 'Tin', category: 'Packaging' },
  { value: 'pallet', label: 'Pallet', category: 'Packaging' },
  { value: 'carton', label: 'Carton', category: 'Packaging' },
  
  // Transport / Load
  { value: 'load', label: 'Load', category: 'Transport' },
  { value: 'trip', label: 'Trip', category: 'Transport' },
  { value: 'truck', label: 'Truck Load', category: 'Transport' },
  
  // Construction Specific
  { value: 'brass', label: 'Brass (100 CFT)', category: 'Construction' },
  { value: 'unit', label: 'Unit', category: 'Construction' },
  { value: 'point', label: 'Point (Electrical)', category: 'Construction' },
  { value: 'joint', label: 'Joint', category: 'Construction' },
  { value: 'coat', label: 'Coat (Paint)', category: 'Construction' },
  { value: 'layer', label: 'Layer', category: 'Construction' },
  
  // Labour / Work
  { value: 'lumpsum', label: 'Lump Sum', category: 'Work' },
  { value: 'day', label: 'Day', category: 'Work' },
  { value: 'hour', label: 'Hour', category: 'Work' },
  { value: 'shift', label: 'Shift', category: 'Work' },
  { value: 'month', label: 'Month', category: 'Work' },
  { value: 'job', label: 'Job', category: 'Work' },
  { value: 'each', label: 'Each', category: 'Work' },
];

// Get display label for a unit value
export function getUnitLabel(value) {
  if (!value) return '';
  const found = CONSTRUCTION_UNITS.find(u => u.value === value.toLowerCase());
  return found ? found.label : value;
}

// Searchable Unit Select component
export function UnitSelect({ value, onChange, placeholder = 'Select unit', className = '', disabled = false, 'data-testid': testId }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const ref = useRef(null);
  const btnRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target) && dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 220),
      });
    }
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const filtered = CONSTRUCTION_UNITS.filter(u =>
    !search || u.label.toLowerCase().includes(search.toLowerCase()) ||
    u.value.toLowerCase().includes(search.toLowerCase()) ||
    u.category.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const grouped = {};
  filtered.forEach(u => {
    if (!grouped[u.category]) grouped[u.category] = [];
    grouped[u.category].push(u);
  });

  const displayValue = value ? (CONSTRUCTION_UNITS.find(u => u.value === value.toLowerCase())?.label || value) : '';
  const shortDisplay = value ? (CONSTRUCTION_UNITS.find(u => u.value === value.toLowerCase())?.value?.toUpperCase() || value) : '';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(!open); setSearch(''); }}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        data-testid={testId || 'unit-select'}
      >
        <span className={`truncate ${displayValue ? 'text-foreground' : 'text-muted-foreground'}`}>
          {displayValue || placeholder}
        </span>
        <svg className="h-4 w-4 opacity-50 flex-shrink-0 ml-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] rounded-md border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          {/* Search input */}
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search units..."
              className="w-full px-2 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              data-testid="unit-search-input"
            />
          </div>

          {/* Options */}
          <div className="max-h-[280px] overflow-y-auto p-1">
            {Object.keys(grouped).length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground text-center">No units found</div>
            ) : (
              Object.entries(grouped).map(([category, units]) => (
                <div key={category}>
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{category}</div>
                  {units.map(u => (
                    <button
                      key={u.value}
                      type="button"
                      onClick={() => { onChange(u.value); setOpen(false); setSearch(''); }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-sm rounded-sm cursor-pointer transition-colors ${
                        value === u.value ? 'bg-accent text-accent-foreground font-medium' : 'hover:bg-accent/50'
                      }`}
                      data-testid={`unit-option-${u.value}`}
                    >
                      <span>{u.label}</span>
                      {value === u.value && (
                        <svg className="h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
