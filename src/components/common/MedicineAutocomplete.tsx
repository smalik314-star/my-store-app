import React, { useState, useEffect, useRef } from 'react';
import { Search, Tag } from 'lucide-react';
import { cn } from '../../utils/cn';
import { medicineMasterService, MasterMedicine } from '../../services/medicineMasterService';

interface MedicineAutocompleteProps {
  type: 'medicine' | 'brand';
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: MasterMedicine | string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  name?: string;
  icon?: React.ReactNode;
}

export function MedicineAutocomplete({
  type,
  value,
  onChange,
  onSelect,
  placeholder = 'Type to search...',
  className = '',
  required = false,
  name = '',
  icon
}: MedicineAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [debouncedValue, setDebouncedValue] = useState(value);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce the input value changes by 300ms
  useEffect(() => {
    if (value.trim().length >= 2 && value !== debouncedValue) {
      setLoading(true);
    }
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, 300);
    return () => clearTimeout(handler);
  }, [value, debouncedValue]);

  // Query master dataset based on autocomplete type
  useEffect(() => {
    if (debouncedValue.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let active = true;

    const searchPromise = type === 'medicine'
      ? medicineMasterService.search(debouncedValue)
      : medicineMasterService.searchBrands(debouncedValue);

    searchPromise
      .then(results => {
        if (active) {
          setSuggestions(results);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error(err);
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [debouncedValue, type]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selectedIdx = activeIndex >= 0 ? activeIndex : 0;
      if (suggestions[selectedIdx]) {
        handleSelection(suggestions[selectedIdx]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const handleSelection = (item: any) => {
    if (type === 'medicine') {
      onChange((item as MasterMedicine).name);
      onSelect(item as MasterMedicine);
    } else {
      onChange(item as string);
      onSelect(item as string);
    }
    setShowDropdown(false);
    setActiveIndex(-1);
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className={cn("relative w-full", className)}>
      <div className="relative">
        {icon ? (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text/20">
            {icon}
          </div>
        ) : type === 'medicine' ? (
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
        ) : (
          <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
        )}
        <input
          ref={inputRef}
          type="text"
          name={name}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowDropdown(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          required={required}
          className="w-full pl-10 pr-10 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-sm"
          placeholder={placeholder}
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-[100%] z-[100] mt-1 max-h-64 overflow-y-auto bg-surface border border-border rounded-xl shadow-lg">
          <div className="bg-background px-3 py-1.5 text-[8px] font-black uppercase tracking-widest text-text/30 border-b border-border/40">
            {type === 'medicine' ? 'Master Medicines (250k+ Dataset)' : 'Master Brands (250k+ Dataset)'}
          </div>
          <ul className="divide-y divide-border/50">
            {suggestions.map((item, idx) => (
              <li
                key={type === 'medicine' ? (item as MasterMedicine).id || idx : item}
                className={cn(
                  "px-4 py-2.5 cursor-pointer text-xs font-semibold transition-colors flex flex-col gap-0.5 text-left",
                  activeIndex === idx ? "bg-primary/10 text-primary" : "text-text hover:bg-background"
                )}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={() => handleSelection(item)}
              >
                {type === 'medicine' ? (
                  <>
                    <span className="font-bold text-text flex items-center gap-1.5">
                      {(item as MasterMedicine).name}
                      {(item as MasterMedicine).unit && (
                        <span className="text-[9px] font-bold text-primary/70 bg-primary/5 px-1.5 py-0.5 rounded-sm">
                          {(item as MasterMedicine).unit}
                        </span>
                      )}
                    </span>
                    <div className="text-[9.5px] text-text/40 font-medium flex flex-wrap gap-x-2 items-center mt-0.5">
                      {(item as MasterMedicine).brand && (
                        <span className="text-primary font-black bg-primary/5 px-1 rounded text-[8px] uppercase tracking-wide">
                          Brand: {(item as MasterMedicine).brand}
                        </span>
                      )}
                      {(item as MasterMedicine).genericName && (
                        <span>Gen: {(item as MasterMedicine).genericName}</span>
                      )}
                      {(item as MasterMedicine).manufacturer && (
                        <span>• Mfg: {(item as MasterMedicine).manufacturer}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between py-0.5">
                    <span className="font-bold text-text">{item}</span>
                    <span className="text-[8px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase tracking-wider">Brand</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
