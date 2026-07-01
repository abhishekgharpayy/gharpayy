import React, { useState, useEffect } from 'react';

interface SearchBarProps {
  searchTerm: string;
  onSearch: (query: string) => void;
}

export function SearchBar({ searchTerm, onSearch }: SearchBarProps) {
  const [value, setValue] = useState(searchTerm);

  // Sync with external searchTerm changes
  useEffect(() => {
    setValue(searchTerm);
  }, [searchTerm]);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      onSearch(value.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [value, onSearch]);

  return (
    <input
      type="text"
      placeholder="Search zones..."
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm mb-4"
    />
  );
}
