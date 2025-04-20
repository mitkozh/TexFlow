import * as React from "react";

export function Separator({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="separator"
      className={
        "shrink-0 bg-border " +
        (props['aria-orientation'] === 'vertical'
          ? "w-px h-6 mx-2"
          : "h-px w-full my-2") +
        " " + className
      }
      {...props}
    />
  );
}
