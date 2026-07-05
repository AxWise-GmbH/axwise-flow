import { useEffect, useCallback } from 'react';

/**
 * Hook to handle mobile viewport changes and ensure input field visibility
 */
export const useMobileViewport = () => {
  const handleViewportChange = useCallback(() => {
    // Handle mobile viewport height changes (keyboard appearance)
    const setViewportHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    // Set initial viewport height
    setViewportHeight();

    // Handle resize events (keyboard show/hide)
    const handleResize = () => {
      setViewportHeight();

      // Ensure input field stays visible on mobile
      if (window.innerWidth <= 768) {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.classList.contains('chat-input')) {
          // Small delay to ensure keyboard is fully shown
          setTimeout(() => {
            activeElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          }, 300);
        }
      }
    };

    // Handle orientation changes
    const handleOrientationChange = () => {
      // Delay to ensure orientation change is complete
      setTimeout(() => {
        setViewportHeight();

        // Force scroll to bottom to ensure input visibility
        const chatContainer = document.querySelector('.chat-messages-area');
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      }, 500);
    };

    // Handle input focus to ensure visibility
    const handleInputFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (target && target.classList.contains('chat-input')) {
        // On mobile, ensure input is visible when focused
        if (window.innerWidth <= 768) {
          setTimeout(() => {
            target.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          }, 300);
        }
      }
    };

    // Add event listeners
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    document.addEventListener('focusin', handleInputFocus);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      document.removeEventListener('focusin', handleInputFocus);
    };
  }, []);

  useEffect(() => {
    const cleanup = handleViewportChange();
    return cleanup;
  }, [handleViewportChange]);

  // Utility function to scroll to input
  const scrollToInput = useCallback(() => {
    const inputElement = document.querySelector('.chat-input') as HTMLElement;
    if (inputElement) {
      inputElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }, []);

  // Utility function to ensure input is visible - MOBILE ONLY
  const ensureInputVisible = useCallback(() => {
    // Only run on mobile devices
    if (window.innerWidth <= 768) {
      const inputContainer = document.querySelector('.chat-input-container');
      const chatContainer = document.querySelector('.chat-container');

      if (inputContainer && chatContainer) {
        const containerRect = chatContainer.getBoundingClientRect();
        const inputRect = inputContainer.getBoundingClientRect();

        // Check if input is visible
        const isInputVisible = inputRect.bottom <= containerRect.bottom;

        if (!isInputVisible) {
          scrollToInput();
        }
      }
    }
    // On desktop, do nothing - let normal layout handle it
  }, [scrollToInput]);

  return {
    scrollToInput,
    ensureInputVisible
  };
};

/**
 * Hook specifically for chat interface mobile optimizations
 */
export const useChatMobileOptimization = () => {
  const { scrollToInput, ensureInputVisible } = useMobileViewport();

  // Handle message sending to ensure input stays visible
  const handleMessageSent = useCallback(() => {
    // After sending a message, ensure input is still visible
    setTimeout(() => {
      ensureInputVisible();
    }, 100);
  }, [ensureInputVisible]);

  // Handle new message received to scroll appropriately
  const handleNewMessage = useCallback(() => {
    // Scroll to bottom but keep input visible
    const chatMessages = document.querySelector('.chat-messages-area');
    if (chatMessages) {
      setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
        ensureInputVisible();
      }, 100);
    }
  }, [ensureInputVisible]);

  // Handle keyboard appearance
  const handleKeyboardShow = useCallback(() => {
    if (window.innerWidth <= 768) {
      // Ensure input is visible when keyboard appears
      setTimeout(() => {
        scrollToInput();
      }, 300);
    }
  }, [scrollToInput]);

  return {
    handleMessageSent,
    handleNewMessage,
    handleKeyboardShow,
    scrollToInput,
    ensureInputVisible
  };
};
