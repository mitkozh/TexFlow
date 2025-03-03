import React, { useState, useEffect } from 'react';

interface ZoomDropdownProps {
  scale: number;
  setScale: (scale: number) => void;
}

const zoomValues = [0.5, 0.75, 1, 1.5, 2, 4];

const ZoomDropdown: React.FC<ZoomDropdownProps> = ({ scale, setScale }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customValue, setCustomValue] = useState(`${Math.round(scale * 100)}%`);

  useEffect(() => {
    setCustomValue(`${Math.round(scale * 100)}%`);
  }, [scale]);

  const handleCustomZoom = (value: string) => {
    const numericValue = parseInt(value.replace('%', '')) / 100;
    if (numericValue >= 0.1 && numericValue <= 9.99) {
      setScale(numericValue);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-1 bg-gray-100 text-sm text-gray-700 border border-gray-300 rounded min-w-[80px] hover:bg-gray-200/80 focus:outline-none"
      >
        {`${Math.round(scale * 100)}%`}
      </button>
      
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg z-50">
          <div className="p-2">
            <input
              type="text"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value.replace(/[^0-9%]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCustomZoom(customValue);
                  setIsOpen(false);
                }
              }}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none"
            />
          </div>
          <hr className="my-1 border-gray-200" />
          <div className="max-h-48 overflow-y-auto">
            {zoomValues.map((value) => (
              <button
                key={value}
                onClick={() => {
                  setScale(value);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-1 text-left text-sm hover:bg-gray-100 focus:outline-none"
              >
                {`${value * 100}%`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ZoomDropdown;
