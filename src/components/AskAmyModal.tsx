import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ArrowLeft,
  MessageSquare,
  Send,
  Paperclip,
  Mic,
  ArrowUp,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';

type SupportScreen = 'home' | 'messages' | 'chat';

interface AmyChatMessage {
  id: string;
  sender: 'amy' | 'user';
  text: string;
  timestamp: string;
  meta?: string;
}

const AMY_WAIT_MESSAGE = 'Please wait for a response after 30 mins. We are working on our system.';

const AmyAvatar: React.FC<{ size?: number }> = ({ size = 34 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    className="rounded-full shrink-0 border-2 border-white shadow-xs"
    aria-label="Amy support agent"
  >
    <rect width="40" height="40" rx="20" fill="#B6422C" />
    <circle cx="20" cy="14" r="9.5" fill="#2A1B16" />
    <circle cx="12" cy="13" r="4.5" fill="#2A1B16" />
    <circle cx="28" cy="13" r="4.5" fill="#2A1B16" />
    <path d="M9 39c0-6.5 4.9-11 11-11s11 4.5 11 11" fill="#1E293B" />
    <path d="M16 28.5l4 4.5 4-4.5" fill="#E2E8F0" />
    <circle cx="20" cy="17" r="6.8" fill="#8C5338" />
    <circle cx="17.5" cy="16.2" r="0.9" fill="#1E130D" />
    <circle cx="22.5" cy="16.2" r="0.9" fill="#1E130D" />
    <path d="M17.2 19.6c1.6 1.5 4 1.5 5.6 0" stroke="#F8FAFC" strokeWidth="1.3" strokeLinecap="round" fill="none" />
  </svg>
);

const AgentAvatarTwo: React.FC<{ size?: number }> = ({ size = 34 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    className="rounded-full shrink-0 border-2 border-white shadow-xs"
    aria-hidden="true"
  >
    <rect width="40" height="40" rx="20" fill="#D4D8DF" />
    <path d="M8 39c0-6.8 5.4-11 12-11s12 4.2 12 11" fill="#334155" />
    <circle cx="20" cy="16.5" r="7" fill="#D4A383" />
    <circle cx="17.5" cy="16.2" r="2.2" stroke="#1E293B" strokeWidth="1" fill="none" />
    <circle cx="22.5" cy="16.2" r="2.2" stroke="#1E293B" strokeWidth="1" fill="none" />
    <line x1="19.7" y1="16.2" x2="20.3" y2="16.2" stroke="#1E293B" strokeWidth="1" />
    <path d="M16.5 21c1.2 1.8 5.8 1.8 7 0" stroke="#475569" strokeWidth="1.2" fill="none" />
  </svg>
);

const AgentAvatarThree: React.FC<{ size?: number }> = ({ size = 34 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    className="rounded-full shrink-0 border-2 border-white shadow-xs"
    aria-hidden="true"
  >
    <rect width="40" height="40" rx="20" fill="#E5E7EB" />
    <path d="M12 15c0-6 16-6 16 0v9H12v-9z" fill="#1F2937" />
    <path d="M8 39c0-6.5 5.4-11 12-11s12 4.5 12 11" fill="#4B5563" />
    <circle cx="20" cy="16.5" r="6.4" fill="#F1C2A5" />
    <circle cx="17.8" cy="16" r="1.9" stroke="#1F2937" strokeWidth="0.9" fill="none" />
    <circle cx="22.2" cy="16" r="1.9" stroke="#1F2937" strokeWidth="0.9" fill="none" />
    <path d="M18 19.5c1.2 1 2.8 1 4 0" stroke="#7C2D12" strokeWidth="1" strokeLinecap="round" fill="none" />
  </svg>
);

export const AskAmyModal: React.FC = () => {
  const { amyOpen, setAmyOpen, user, showToast } = useApp();
  const [screen, setScreen] = useState<SupportScreen>('home');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<AmyChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const displayName = (user?.full_name || user?.email?.split('@')[0] || 'Trader').trim();
  const storageKey = `td_amy_messages_${user?.id || 'guest'}`;

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // ignore storage quota errors
    }
  }, [messages, storageKey]);

  useEffect(() => {
    if (!amyOpen) return;
    if (screen === 'chat' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [amyOpen, screen, messages, sending]);

  if (!amyOpen) return null;

  const userHasSpoken = messages.some((m) => m.sender === 'user');
  const greetingText = `Hello ${displayName}, how can I help you today?`;

  const sendMessageToAmy = async (rawText: string) => {
    const clean = rawText.trim();
    if (!clean || sending) return;

    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: AmyChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: clean,
      timestamp: nowTime,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setSending(true);

    try {
      const res = await apiFetch<{ ok?: boolean; status?: string; reply?: string }>('/api/support/amy', {
        method: 'POST',
        body: JSON.stringify({
          message: clean,
          displayName,
          history: nextHistory.slice(-8).map((m) => ({ sender: m.sender, text: m.text })),
        }),
      });
      const replyText = (res?.reply || '').trim() || AMY_WAIT_MESSAGE;
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now() + 1}`,
          sender: 'amy',
          text: replyText,
          timestamp: 'Just now',
          meta: 'Amy • Just now',
        },
      ]);
    } catch {
      // Graceful Claude / backend fallback: never display "Can't start conversation"
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now() + 1}`,
          sender: 'amy',
          text: AMY_WAIT_MESSAGE,
          timestamp: 'Just now',
          meta: 'Amy • Just now',
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleStartConversationPill = () => {
    setScreen('chat');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/45 sm:bg-black/25 flex items-end sm:items-end justify-end sm:p-5"
      onClick={() => setAmyOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full h-[100dvh] sm:w-[390px] sm:h-[640px] sm:max-h-[calc(100vh-40px)] bg-white text-[#111319] sm:rounded-[20px] shadow-2xl overflow-hidden flex flex-col font-sans"
      >
        {/* SCREEN 1: HUB (Matches Screenshot_20261128-083649_19b07453.png) */}
        {screen === 'home' && (
          <div className="flex-1 flex flex-col bg-white overflow-y-auto">
            <div className="bg-gradient-to-b from-[#FF5460] via-[#FF424E] to-[#FF767F] text-white px-5 pt-5 pb-14 relative">
              <div className="flex items-center justify-between">
                <span
                  className="text-[28px] font-bold italic tracking-[-0.04em] leading-none text-white select-none"
                  style={{ fontFamily: "'IBM Plex Sans', 'Ubuntu', sans-serif" }}
                >
                  deriv
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center -space-x-2">
                    <AmyAvatar size={32} />
                    <AgentAvatarTwo size={32} />
                    <AgentAvatarThree size={32} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setAmyOpen(false)}
                    aria-label="Close support"
                    className="p-1 text-white/95 hover:text-white cursor-pointer"
                  >
                    <X className="w-5 h-5" strokeWidth={2.2} />
                  </button>
                </div>
              </div>

              <div className="mt-7">
                <h2 className="text-[21px] font-bold leading-snug tracking-tight">
                  Hi {displayName} 👋
                </h2>
                <p className="text-[20px] font-bold leading-snug tracking-tight mt-0.5">
                  How can we help?
                </p>
              </div>
            </div>

            <div className="px-4 -mt-8 space-y-3 pb-6">
              <button
                type="button"
                onClick={() => setScreen('messages')}
                className="w-full bg-white rounded-[12px] px-4 py-4 shadow-[0_3px_14px_rgba(15,23,42,0.1)] border border-slate-100 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
              >
                <span className="text-[14px] font-semibold text-[#111319]">Messages</span>
                <span className="w-6 h-6 rounded-md flex items-center justify-center text-[#111319]">
                  <MessageSquare className="w-[18px] h-[18px] fill-[#111319]" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => setScreen('chat')}
                className="w-full bg-white rounded-[12px] px-4 py-4 shadow-[0_3px_14px_rgba(15,23,42,0.1)] border border-slate-100 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
              >
                <span className="text-[14px] font-semibold text-[#111319]">Send us a message</span>
                <span className="w-6 h-6 rounded-md flex items-center justify-center text-[#111319]">
                  <Send className="w-[17px] h-[17px] fill-[#111319]" />
                </span>
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 2: MESSAGES LIST / EMPTY STATE (Matches Screenshot_20261128-083701_c1c16586.png) */}
        {screen === 'messages' && (
          <div className="flex-1 flex flex-col bg-white">
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setScreen('home')}
                  aria-label="Back to support home"
                  className="p-1 text-[#111319] hover:bg-slate-100 rounded-full cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h3 className="text-[15px] font-semibold text-[#111319]">Messages</h3>
              </div>
              <button
                type="button"
                onClick={() => setAmyOpen(false)}
                aria-label="Close"
                className="p-1 text-slate-400 hover:text-[#111319] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                <div className="w-10 h-10 flex items-center justify-center text-[#111319] mb-3">
                  <MessageSquare className="w-7 h-7 fill-[#111319]" />
                </div>
                <p className="text-[15px] font-bold text-[#111319]">No messages</p>
                <p className="text-[13px] text-[#4B5563] mt-1">
                  Messages from the team will be shown here
                </p>
                <button
                  type="button"
                  onClick={() => setScreen('chat')}
                  className="mt-5 px-5 py-2.5 rounded-[10px] bg-[#434952] hover:bg-[#353A42] text-white text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <span>Send us a message</span>
                  <Send className="w-3.5 h-3.5 fill-white" />
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-between p-4">
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setScreen('chat')}
                    className="w-full p-3.5 rounded-[12px] border border-slate-200 hover:bg-slate-50 flex items-center gap-3 text-left cursor-pointer"
                  >
                    <AmyAvatar size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[13.5px] font-bold text-[#111319]">Amy</span>
                        <span className="text-[11px] text-slate-400">
                          {messages[messages.length - 1]?.timestamp || 'Just now'}
                        </span>
                      </div>
                      <p className="text-[12.5px] text-slate-600 truncate mt-0.5">
                        {messages[messages.length - 1]?.text}
                      </p>
                    </div>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setScreen('chat')}
                  className="w-full py-2.5 rounded-[10px] bg-[#434952] hover:bg-[#353A42] text-white text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Send us a message</span>
                  <Send className="w-3.5 h-3.5 fill-white" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* SCREEN 3: AMY CONVERSATION (Matches Screenshot_20261128-083655_b032c377.png) */}
        {screen === 'chat' && (
          <div className="flex-1 flex flex-col bg-white min-h-0">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setScreen('home')}
                  aria-label="Back to support home"
                  className="p-1 text-[#111319] hover:bg-slate-100 rounded-full cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <AmyAvatar size={36} />
                <span className="text-[15px] font-bold text-[#111319]">Amy</span>
              </div>
              <button
                type="button"
                onClick={() => setAmyOpen(false)}
                aria-label="Close"
                className="p-1 text-slate-400 hover:text-[#111319] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* Initial Amy greeting bubble */}
              <div>
                <div className="inline-block max-w-[85%] rounded-[16px] bg-[#F1F2F4] px-4 py-2.5 text-[13.5px] text-[#111319] leading-snug">
                  {greetingText}
                </div>
                <p className="text-[11px] text-[#6B7280] mt-1.5 pl-2">Amy • Just now</p>
              </div>

              {messages.map((m) =>
                m.sender === 'user' ? (
                  <div key={m.id} className="flex flex-col items-end">
                    <div className="inline-block max-w-[82%] rounded-[16px] bg-[#FF444F] text-white px-4 py-2.5 text-[13.5px] leading-snug shadow-xs">
                      {m.text}
                    </div>
                    <p className="text-[11px] text-[#9CA3AF] mt-1 pr-1">{m.timestamp}</p>
                  </div>
                ) : (
                  <div key={m.id} className="flex flex-col items-start">
                    <div className="inline-block max-w-[85%] rounded-[16px] bg-[#F1F2F4] text-[#111319] px-4 py-2.5 text-[13.5px] leading-snug">
                      {m.text}
                    </div>
                    <p className="text-[11px] text-[#6B7280] mt-1 pl-2">
                      {m.meta || `Amy • ${m.timestamp}`}
                    </p>
                  </div>
                )
              )}

              {sending && (
                <div className="flex flex-col items-start">
                  <div className="inline-flex items-center gap-1.5 rounded-[16px] bg-[#F1F2F4] px-4 py-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:120ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:240ms]" />
                  </div>
                </div>
              )}
            </div>

            <div className="px-3.5 pb-4 pt-2 shrink-0 space-y-3 bg-white">
              {!userHasSpoken && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleStartConversationPill}
                    className="px-4 py-2 rounded-full border border-[#E5E7EB] bg-white hover:bg-slate-50 text-[13px] font-medium text-[#111319] shadow-[0_1px_4px_rgba(15,23,42,0.06)] cursor-pointer"
                  >
                    Start a conversation
                  </button>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessageToAmy(input);
                }}
                className="rounded-[18px] border border-[#E5E7EB] bg-white px-4 pt-3 pb-2.5 shadow-[0_2px_10px_rgba(15,23,42,0.04)]"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Message..."
                  className="w-full text-[13.5px] text-[#111319] placeholder:text-[#6B7280] outline-none bg-transparent"
                />
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-3.5 text-[#7C828D]">
                    <button
                      type="button"
                      onClick={() => showToast('Attachments are queued during system work', 'info')}
                      aria-label="Attach file"
                      className="hover:text-[#111319] cursor-pointer"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.focus()}
                      aria-label="GIF"
                      className="px-1 py-0.5 border border-[#7C828D] rounded-[4px] text-[9px] font-bold leading-none hover:text-[#111319] hover:border-[#111319] cursor-pointer"
                    >
                      GIF
                    </button>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.focus()}
                      aria-label="Voice note"
                      className="hover:text-[#111319] cursor-pointer"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={!input.trim() || sending}
                    aria-label="Send message"
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                      input.trim() && !sending
                        ? 'bg-[#FF444F] text-white'
                        : 'bg-[#F1F2F4] text-[#9CA3AF]'
                    }`}
                  >
                    <ArrowUp className="w-4 h-4" strokeWidth={2.2} />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
