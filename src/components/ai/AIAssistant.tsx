import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  X, 
  Send, 
  Trash2, 
  ChevronRight, 
  ArrowRight,
  TrendingUp,
  Package,
  Users,
  Clock,
  Keyboard
} from 'lucide-react';
import { useAI } from '../../context/AIContext';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { cn } from '../../utils/cn';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../utils/currency';

const SUGGESTIONS = [
  "What is today's revenue?",
  "Show low stock products",
  "Top selling products",
  "Customers with highest dues",
  "Profit last 7 days"
];

export function AIAssistant() {
  const { isOpen, open, close, ask, history, isLoading, clearHistory } = useAI();
  const [query, setQuery] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      ask(query);
      setQuery('');
    }
  };

  const handleAction = (path: string) => {
    navigate(path);
    close();
  };

  if (!isOpen) return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={open}
      className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-primary text-white shadow-2xl flex items-center justify-center z-50 group overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-tr from-primary via-primary to-accent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <Sparkles className="h-6 w-6 relative z-10 animate-pulse" />
      <div className="absolute -top-1 -right-1 h-3 w-3 bg-accent rounded-full border-2 border-white" />
    </motion.button>
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-end p-0 sm:p-6 bg-black/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.95 }}
          className="w-full sm:w-[450px] max-w-full bg-background sm:rounded-3xl shadow-2xl flex flex-col h-[100dvh] sm:h-[600px] border-l sm:border border-border relative overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 bg-primary text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <Sparkles className="h-32 w-32 rotate-12" />
            </div>
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-lg tracking-tight">AI Assistant</h3>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Active & Ready</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={clearHistory}
                  className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                  title="Clear History"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                <button 
                  onClick={close}
                  className="p-2 rounded-xl hover:bg-white/10 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Chat Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
            {history.length === 0 ? (
              <div className="space-y-8 py-4">
                <div className="text-center space-y-2">
                  <p className="text-sm font-bold text-text/40">Ask me anything about your pharmacy operations</p>
                  <div className="flex items-center justify-center gap-2 text-[10px] font-black text-text/20 uppercase tracking-[0.2em]">
                    <Keyboard className="h-3 w-3" />
                    <span>Ctrl + K to toggle</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <span className="text-[10px] font-black text-text/30 uppercase tracking-widest ml-1">Suggested Queries</span>
                  <div className="grid grid-cols-1 gap-2">
                    {SUGGESTIONS.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => ask(s)}
                        className="flex items-center justify-between p-4 rounded-2xl bg-secondary/5 border border-secondary/10 hover:border-primary/30 hover:bg-primary/5 transition-all group text-left"
                      >
                        <span className="text-sm font-bold text-text group-hover:text-primary transition-colors">{s}</span>
                        <ChevronRight className="h-4 w-4 text-text/20 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              history.map((resp) => (
                <div key={resp.id} className="space-y-4">
                  {/* User Query */}
                  <div className="flex justify-end">
                    <div className="max-w-[80%] bg-secondary/10 px-4 py-3 rounded-2xl rounded-tr-none">
                      <p className="text-sm font-bold text-text">{resp.query}</p>
                    </div>
                  </div>

                  {/* AI Response */}
                  <div className="flex justify-start">
                    <div className="max-w-[90%] space-y-3">
                      <div className="flex gap-3">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Sparkles className="h-4 w-4 text-primary" />
                        </div>
                        <div className="bg-background border border-border/50 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm">
                          <p className="text-sm font-bold text-text leading-relaxed">{resp.answer}</p>
                          
                          {/* Data Specific Rendering */}
                          {resp.type === 'list' && resp.data && Array.isArray(resp.data) && (
                            <div className="mt-4 space-y-2 border-t border-border pt-4">
                              {resp.data.slice(0, 3).map((item: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-lg bg-secondary/5">
                                  <span className="font-bold text-text truncate pr-4">{item.name}</span>
                                  {item.stockQuantity !== undefined ? (
                                    <span className={cn("font-black", item.stockQuantity === 0 ? "text-danger" : "text-warning")}>
                                      {item.stockQuantity} {item.unit}
                                    </span>
                                  ) : item.outstandingBalance !== undefined ? (
                                    <span className="font-black text-danger">{formatCurrency(item.outstandingBalance)}</span>
                                  ) : (
                                    <span className="font-black text-primary">{formatCurrency(item.totalPurchases)}</span>
                                  )}
                                </div>
                              ))}
                              {resp.data.length > 3 && (
                                <p className="text-[10px] font-bold text-text/30 text-center uppercase tracking-widest pt-1">
                                  + {resp.data.length - 3} more items
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      {resp.actions && resp.actions.length > 0 && (
                        <div className="flex flex-wrap gap-2 ml-11">
                          {resp.actions.map((action, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleAction(action.path)}
                              className="px-3 py-1.5 rounded-full bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-primary/80 transition-colors shadow-lg shadow-primary/20"
                            >
                              {action.label}
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4 text-primary animate-spin" />
                  </div>
                  <div className="bg-secondary/5 px-4 py-3 rounded-2xl rounded-tl-none border border-secondary/10">
                    <div className="flex gap-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" />
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce delay-75" />
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce delay-150" />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Footer Input */}
          <div className="p-6 bg-background border-t border-border">
            <form onSubmit={handleSubmit} className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask me about revenue, stock, or dues..."
                className="w-full bg-secondary/5 border border-border rounded-2xl pl-5 pr-14 py-4 text-sm font-bold text-text focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all placeholder:text-text/20"
              />
              <button
                type="submit"
                disabled={!query.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <div className="mt-4 flex items-center justify-center gap-6">
              <div className="flex items-center gap-2 text-[9px] font-black text-text/20 uppercase tracking-widest">
                <div className="h-1.5 w-1.5 rounded-full bg-success" />
                <span>Inventory Engine</span>
              </div>
              <div className="flex items-center gap-2 text-[9px] font-black text-text/20 uppercase tracking-widest">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span>Finance Layer</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
