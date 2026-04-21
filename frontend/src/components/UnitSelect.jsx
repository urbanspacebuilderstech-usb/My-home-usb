import React, { useState, useRef, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';

// Comprehensive list of units used in construction industry
export const CONSTRUCTION_UNITS = [
  // Quantity / Count
  { value: 'nos', label: 'Nos (Numbers)', category: 'Count' },
  { value: 'pcs', label: 'Pcs (Pieces)', category: 'Count' },
  { value: 'set', label: 'Set', category: 'Count' },
  { value: 'pair', label: 'Pair', category: 'Count' },
  { value: 'lot', label: 'Lot', category: 'Count' },
  { value: 'dozen', label: 'Dozen', category: 'Count' },
  { value: 'gross', label: 'Gross (144 Nos)', category: 'Count' },
  { value: 'unit', label: 'Unit', category: 'Count' },
  { value: 'each', label: 'Each (EA)', category: 'Count' },

  // Weight
  { value: 'kg', label: 'Kg (Kilogram)', category: 'Weight' },
  { value: 'gram', label: 'Gram', category: 'Weight' },
  { value: 'ton', label: 'Ton (Metric)', category: 'Weight' },
  { value: 'mton', label: 'MT (Metric Tonne)', category: 'Weight' },
  { value: 'quintal', label: 'Quintal (100 Kg)', category: 'Weight' },
  { value: 'lbs', label: 'Lbs (Pound)', category: 'Weight' },

  // Volume
  { value: 'cft', label: 'CFT (Cubic Feet)', category: 'Volume' },
  { value: 'cum', label: 'Cum (Cubic Meter)', category: 'Volume' },
  { value: 'cyd', label: 'Cu.Yd (Cubic Yard)', category: 'Volume' },
  { value: 'ltr', label: 'Ltr (Litre)', category: 'Volume' },
  { value: 'ml', label: 'ML (Millilitre)', category: 'Volume' },
  { value: 'gallon', label: 'Gallon', category: 'Volume' },
  { value: 'barrel', label: 'Barrel', category: 'Volume' },
  { value: 'kl', label: 'KL (Kilolitre)', category: 'Volume' },

  // Area
  { value: 'sqft', label: 'Sqft (Square Feet)', category: 'Area' },
  { value: 'sqm', label: 'Sqm (Square Meter)', category: 'Area' },
  { value: 'sqyd', label: 'Sqyd (Square Yard)', category: 'Area' },
  { value: 'sqin', label: 'Sq.In (Square Inch)', category: 'Area' },
  { value: 'sqcm', label: 'Sq.Cm (Square Centimeter)', category: 'Area' },
  { value: 'cent', label: 'Cent (435.6 Sqft)', category: 'Area' },
  { value: 'ground', label: 'Ground (2400 Sqft)', category: 'Area' },
  { value: 'acre', label: 'Acre (43560 Sqft)', category: 'Area' },
  { value: 'hectare', label: 'Hectare (10000 Sqm)', category: 'Area' },
  { value: 'guntha', label: 'Guntha (1089 Sqft)', category: 'Area' },
  { value: 'bigha', label: 'Bigha', category: 'Area' },

  // Length
  { value: 'rft', label: 'RFT (Running Feet)', category: 'Length' },
  { value: 'rmt', label: 'RMT (Running Meter)', category: 'Length' },
  { value: 'meter', label: 'Meter (m)', category: 'Length' },
  { value: 'feet', label: 'Feet (ft)', category: 'Length' },
  { value: 'inch', label: 'Inch (in)', category: 'Length' },
  { value: 'cm', label: 'CM (Centimeter)', category: 'Length' },
  { value: 'mm', label: 'MM (Millimeter)', category: 'Length' },
  { value: 'km', label: 'KM (Kilometer)', category: 'Length' },
  { value: 'yard', label: 'Yard (yd)', category: 'Length' },
  { value: 'mile', label: 'Mile', category: 'Length' },

  // Packaging / Bulk
  { value: 'bag', label: 'Bag (50 Kg Cement)', category: 'Packaging' },
  { value: 'bundle', label: 'Bundle', category: 'Packaging' },
  { value: 'box', label: 'Box', category: 'Packaging' },
  { value: 'roll', label: 'Roll', category: 'Packaging' },
  { value: 'coil', label: 'Coil', category: 'Packaging' },
  { value: 'packet', label: 'Packet', category: 'Packaging' },
  { value: 'drum', label: 'Drum', category: 'Packaging' },
  { value: 'can', label: 'Can', category: 'Packaging' },
  { value: 'tin', label: 'Tin', category: 'Packaging' },
  { value: 'pallet', label: 'Pallet', category: 'Packaging' },
  { value: 'carton', label: 'Carton', category: 'Packaging' },
  { value: 'jar', label: 'Jar', category: 'Packaging' },
  { value: 'sheet', label: 'Sheet', category: 'Packaging' },
  { value: 'strip', label: 'Strip', category: 'Packaging' },

  // Transport / Load
  { value: 'load', label: 'Load', category: 'Transport' },
  { value: 'trip', label: 'Trip', category: 'Transport' },
  { value: 'truck', label: 'Truck Load', category: 'Transport' },
  { value: 'tractor', label: 'Tractor Load', category: 'Transport' },
  { value: 'lorry', label: 'Lorry Load', category: 'Transport' },
  { value: 'dumper', label: 'Dumper Load', category: 'Transport' },

  // Construction Specific
  { value: 'brass', label: 'Brass (100 CFT Sand/Agg)', category: 'Construction' },
  { value: 'point', label: 'Point (Electrical)', category: 'Construction' },
  { value: 'joint', label: 'Joint', category: 'Construction' },
  { value: 'coat', label: 'Coat (Paint Layer)', category: 'Construction' },
  { value: 'layer', label: 'Layer', category: 'Construction' },
  { value: 'brick', label: 'Brick (1000 Nos)', category: 'Construction' },
  { value: 'tile', label: 'Tile', category: 'Construction' },
  { value: 'block', label: 'Block (AAC/Concrete)', category: 'Construction' },
  { value: 'slab', label: 'Slab', category: 'Construction' },
  { value: 'panel', label: 'Panel', category: 'Construction' },
  { value: 'window', label: 'Window', category: 'Construction' },
  { value: 'door', label: 'Door', category: 'Construction' },
  { value: 'riser', label: 'Riser (Stair)', category: 'Construction' },
  { value: 'tread', label: 'Tread (Stair)', category: 'Construction' },
  { value: 'floor', label: 'Floor (Level)', category: 'Construction' },
  { value: 'room', label: 'Room', category: 'Construction' },

  // Electrical & Plumbing
  { value: 'mtr_cable', label: 'Mtr (Cable)', category: 'Electrical' },
  { value: 'switch', label: 'Switch Point', category: 'Electrical' },
  { value: 'socket', label: 'Socket / Plug Point', category: 'Electrical' },
  { value: 'fan_point', label: 'Fan Point', category: 'Electrical' },
  { value: 'light_point', label: 'Light Point', category: 'Electrical' },
  { value: 'db', label: 'DB (Distribution Board)', category: 'Electrical' },
  { value: 'plumb_point', label: 'Plumbing Point', category: 'Plumbing' },
  { value: 'fitting', label: 'Fitting', category: 'Plumbing' },

  // Labour / Work
  { value: 'lumpsum', label: 'Lump Sum (LS)', category: 'Work' },
  { value: 'day', label: 'Day', category: 'Work' },
  { value: 'hour', label: 'Hour (Hr)', category: 'Work' },
  { value: 'shift', label: 'Shift (8 Hr)', category: 'Work' },
  { value: 'month', label: 'Month', category: 'Work' },
  { value: 'week', label: 'Week', category: 'Work' },
  { value: 'job', label: 'Job', category: 'Work' },
  { value: 'visit', label: 'Visit', category: 'Work' },
  { value: 'mandays', label: 'Man Days', category: 'Work' },
  { value: 'manhours', label: 'Man Hours', category: 'Work' },
  { value: 'contract', label: 'Contract', category: 'Work' },

  // Percentage / Misc
  { value: 'percent', label: 'Percent (%)', category: 'Misc' },
  { value: 'ratio', label: 'Ratio', category: 'Misc' },
];

// Get display label for a unit value
export function getUnitLabel(value) {
  if (!value) return '';
  const found = CONSTRUCTION_UNITS.find(u => u.value === value.toLowerCase());
  return found ? found.label : value;
}

// Searchable Unit Select component (Radix Popover - Dialog-aware)
export function UnitSelect({ value, onChange, placeholder = 'Select unit', className = '', disabled = false, 'data-testid': testId }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch('');
    }
  }, [open]);

  const filtered = CONSTRUCTION_UNITS.filter(u =>
    !search || u.label.toLowerCase().includes(search.toLowerCase()) ||
    u.value.toLowerCase().includes(search.toLowerCase()) ||
    u.category.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = {};
  filtered.forEach(u => {
    if (!grouped[u.category]) grouped[u.category] = [];
    grouped[u.category].push(u);
  });

  const displayValue = value ? (CONSTRUCTION_UNITS.find(u => u.value === value.toLowerCase())?.label || value) : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={`flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
          data-testid={testId || 'unit-select'}
        >
          <span className={`truncate ${displayValue ? 'text-foreground' : 'text-muted-foreground'}`}>
            {displayValue || placeholder}
          </span>
          <svg className="h-4 w-4 opacity-50 flex-shrink-0 ml-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[260px] max-h-[360px] overflow-hidden"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
      >
        <div className="p-2 border-b">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search units..."
            className="w-full px-2 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            data-testid="unit-search-input"
            autoComplete="off"
          />
        </div>
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
                    onClick={() => { onChange(u.value); setOpen(false); }}
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
      </PopoverContent>
    </Popover>
  );
}
