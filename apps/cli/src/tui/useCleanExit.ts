import { useState, useEffect } from 'react';
import { useApp } from 'ink';

/**
 * Custom hook that handles clean component exit with cursor cleanup.
 * Prevents blank lines from appearing when components unmount by moving
 * the cursor up one line and clearing it after exit() is called.
 * 
 * @param onFinished - Callback to invoke after clean exit
 * @returns Object with isExiting state and triggerExit function
 */
export function useCleanExit(onFinished: () => void) {
  const { exit } = useApp();
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (isExiting) {
      exit();
      // Move cursor up 1 line and clear it after exit to prevent blank line
      // This needs to happen after exit() but before the next render()
      setTimeout(() => {
        process.stdout.write('\u001b[1A\u001b[2K');
        onFinished();
      }, 0);
    }
  }, [isExiting, exit, onFinished]);

  return { isExiting, triggerExit: () => setIsExiting(true) };
}
