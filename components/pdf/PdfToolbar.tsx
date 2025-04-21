import React, { useState, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons/icons";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import ZoomDropdown from './ZoomDropdown';
import { Input } from "@/components/ui/input"; 

interface PdfToolbarProps {
  currentPage: number;
  numPages: number;
  scale: number | string;
  onScaleChange: (scale: number | string) => void;
  onPageChange: (page: number) => void; 
  onRecompile: () => void;
  compiling: boolean;
}

export const PdfToolbar: React.FC<PdfToolbarProps> = ({
  currentPage,
  numPages,
  scale,
  onScaleChange,
  onPageChange,
  onRecompile,
  compiling
}) => {
  const [pageInput, setPageInput] = useState<string>(currentPage.toString());

  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

  const handlePageInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(event.target.value);
  };

  const handlePageInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const newPage = parseInt(pageInput, 10);
      if (!isNaN(newPage) && newPage >= 1 && newPage <= numPages) {
        onPageChange(newPage);
      } else {
        setPageInput(currentPage.toString());
      }
    }
  };

  const handlePageInputBlur = () => {
    const newPage = parseInt(pageInput, 10);
    if (isNaN(newPage) || newPage < 1 || newPage > numPages || newPage !== currentPage) {
      setPageInput(currentPage.toString());
    }
  };

  return (
    <Card className="flex items-center justify-between px-3 py-2 border-b rounded-none rounded-tl-lg shadow-sm bg-background/80 backdrop-blur-sm z-[100] relative">
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={onRecompile}
                disabled={compiling}
                aria-label="Recompile PDF"
              >
                {compiling ? (
                  <span className="animate-pulse">⟳</span>
                ) : (
                  <span>⟳</span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Recompile PDF</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Separator aria-orientation="vertical" />

      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                aria-label="Previous Page"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Previous Page</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="hidden sm:inline text-xs text-muted-foreground">Page</span>
        <Input
          type="text"
          value={pageInput}
          onChange={handlePageInputChange}
          onKeyDown={handlePageInputKeyDown}
          onBlur={handlePageInputBlur}
          className="w-12 h-8 text-center text-sm"
          disabled={numPages <= 0}
          aria-label="Page number"
        />
        <span className="hidden sm:inline text-xs text-muted-foreground">/ {numPages > 0 ? numPages : '-'}</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onPageChange(Math.min(numPages, currentPage + 1))}
                disabled={currentPage >= numPages}
                aria-label="Next Page"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next Page</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Separator aria-orientation="vertical" />

      <div className="flex items-center gap-2">
        <ZoomDropdown scale={scale} setScale={onScaleChange} />
      </div>
    </Card>
  );
};