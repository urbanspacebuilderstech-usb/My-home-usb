import { useCallback } from 'react';
import { Input } from './ui/input';

/**
 * Format a number string with Indian comma separators (1,00,000)
 */
function formatIndian(val) {
  if (!val && val !== 0) return '';
  const str = String(val).replace(/,/g, '');
  const parts = str.split('.');
  let intPart = parts[0].replace(/[^0-9-]/g, '');
  if (!intPart || intPart === '-') return intPart || '';
  const isNeg = intPart.startsWith('-');
  if (isNeg) intPart = intPart.slice(1);
  if (intPart.length <= 3) {
    return (isNeg ? '-' : '') + intPart + (parts.length > 1 ? '.' + parts[1] : '');
  }
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  return (isNeg ? '-' : '') + formatted + (parts.length > 1 ? '.' + parts[1] : '');
}

/**
 * Strip formatting to get raw number
 */
function stripFormat(val) {
  if (!val) return '';
  return String(val).replace(/,/g, '');
}

/**
 * NumericInput - replaces type="number" inputs with:
 * - No spinner arrows
 * - Only numeric entry
 * - Auto Indian comma formatting (1,00,000)
 *
 * Props: same as Input, plus:
 * - value: raw number (string or number)
 * - onChange: receives synthetic event with raw (unformatted) value
 * - allowDecimal: allow decimal point (default true)
 */
export function NumericInput({ value, onChange, allowDecimal = true, className, ...props }) {
  const displayValue = formatIndian(value);

  const handleChange = useCallback((e) => {
    let raw = e.target.value.replace(/,/g, '');
    // Only allow digits, minus, and optionally decimal
    if (allowDecimal) {
      raw = raw.replace(/[^0-9.\-]/g, '');
      // Only one decimal point
      const dotIdx = raw.indexOf('.');
      if (dotIdx !== -1) {
        raw = raw.slice(0, dotIdx + 1) + raw.slice(dotIdx + 1).replace(/\./g, '');
      }
    } else {
      raw = raw.replace(/[^0-9\-]/g, '');
    }
    // Only one minus at start
    if (raw.indexOf('-') > 0) raw = raw.replace(/-/g, '');

    // Create a synthetic-like event
    const syntheticEvent = {
      target: { value: raw, name: e.target.name },
      preventDefault: () => {},
      stopPropagation: () => {},
    };
    if (onChange) onChange(syntheticEvent);
  }, [onChange, allowDecimal]);

  const handleKeyDown = useCallback((e) => {
    // Allow: backspace, delete, tab, escape, enter, arrows, home, end
    const allowed = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allowed.includes(e.key)) return;
    // Allow Ctrl/Cmd + A/C/V/X
    if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) return;
    // Allow minus at start
    if (e.key === '-' && e.target.selectionStart === 0) return;
    // Allow decimal
    if (allowDecimal && e.key === '.' && !e.target.value.includes('.')) return;
    // Allow digits
    if (/^[0-9]$/.test(e.key)) return;
    // Block everything else
    e.preventDefault();
  }, [allowDecimal]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      className={className}
    />
  );
}
