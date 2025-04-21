import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"

interface ZoomDropdownProps {
  scale: number | string;
  setScale: (scale: number | string) => void;
}

const ZoomDropdown: React.FC<ZoomDropdownProps> = ({ scale, setScale }) => {
  // Predefined zoom options
  const numericZoomOptions = [50, 75, 100, 150, 200, 400].map(percentage => ({
    value: percentage / 100,
    label: `${percentage}%`
  }));
  
  const specialZoomOptions = [
    { value: 'auto', label: 'Automatic' },
    { value: 'page-fit', label: 'Page Fit' },
    { value: 'page-width', label: 'Page Width' },
    { value: 'page-height', label: 'Page Height' },
  ];

  // Get the display value for the current scale
  const getDisplayValue = () => {
    if (typeof scale === 'string') {
      const option = specialZoomOptions.find(opt => opt.value === scale);
      return option ? option.label : scale;
    } else {
      return `${Math.round(scale * 100)}%`;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          {getDisplayValue()}
          <ChevronDown className="hidden xs:inline ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Zoom Level</DropdownMenuLabel>
        
        {/* Numeric zoom options */}
        {numericZoomOptions.map(option => (
          <DropdownMenuItem 
            key={option.label}
            onClick={() => setScale(option.value)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        
        {/* Special zoom options */}
        {specialZoomOptions.map(option => (
          <DropdownMenuItem 
            key={option.value}
            onClick={() => setScale(option.value)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ZoomDropdown;
