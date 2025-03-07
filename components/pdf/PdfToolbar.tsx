import React from 'react';
import { Button } from "@/components/ui/button";
import ZoomDropdown from './ZoomDropdown';

interface PdfToolbarProps {
  currentPage: number;
  numPages: number;
  scale: number | string;
  onScaleChange: (scale: number | string) => void;
  onRecompile: () => void;
  compiling: boolean;
}

export const PdfToolbar: React.FC<PdfToolbarProps> = ({
  currentPage,
  numPages,
  scale,
  onScaleChange,
  onRecompile,
  compiling
}) => {
  return (
    <div className="flex items-center justify-between p-2 border-b">
      <Button 
        onClick={onRecompile}
        disabled={compiling}
      >
        {compiling ? 'Compiling...' : 'Recompile'}
      </Button>
      
      <div className="text-sm">
        Page: {currentPage} / {numPages}
      </div>
      
      <ZoomDropdown scale={scale} setScale={onScaleChange} />
    </div>
  );
};