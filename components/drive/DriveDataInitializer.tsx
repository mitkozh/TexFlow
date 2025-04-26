import { useEffect } from "react";
import { useDrive } from "@/lib/contexts/DriveContext";

export function DriveDataInitializer() {
  const { refreshFileData } = useDrive();
  useEffect(() => {
    refreshFileData();
    // eslint-disable-next-line
  }, []);
  return null;
}
