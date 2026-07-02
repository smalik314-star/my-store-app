import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AIState, AIResponse } from '../types/ai';
import { aiService } from '../services/aiService';

interface AIContextType extends AIState {
  toggleOpen: () => void;
  close: () => void;
  open: () => void;
  ask: (query: string) => Promise<void>;
  clearHistory: () => void;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

const STORAGE_KEY = 'pharmaflow_ai_history';

export function AIProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AIState>(() => {
    const savedHistory = localStorage.getItem(STORAGE_KEY);
    return {
      history: savedHistory ? JSON.parse(savedHistory) : [],
      isOpen: false,
      isLoading: false,
      lastContext: {}
    };
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history.slice(-10)));
  }, [state.history]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        toggleOpen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleOpen = () => setState(prev => ({ ...prev, isOpen: !prev.isOpen }));
  const close = () => setState(prev => ({ ...prev, isOpen: false }));
  const open = () => setState(prev => ({ ...prev, isOpen: true }));

  const ask = async (query: string) => {
    if (!query.trim()) return;

    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const response = await aiService.executeQuery(query);
      setState(prev => ({
        ...prev,
        history: [...prev.history, response].slice(-10),
        isLoading: false,
        lastContext: {
          lastQuery: query,
          lastModule: window.location.pathname
        }
      }));
    } catch (error) {
      console.error('AI Ask Error:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const clearHistory = () => setState(prev => ({ ...prev, history: [] }));

  return (
    <AIContext.Provider value={{ ...state, toggleOpen, close, open, ask, clearHistory }}>
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const context = useContext(AIContext);
  if (context === undefined) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
}
