'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import GeneralTab from './settings/GeneralTab';
import IntegrationsTab from './settings/IntegrationsTab';
import AppearanceTab from './settings/AppearanceTab';
import AdminTab from './settings/AdminTab';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'general' | 'integrations' | 'appearance' | 'admin';

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('appearance');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const switchTab = useCallback((tab: Tab) => {
    setActiveTab(tab);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => closeButtonRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const modal = modalRef.current;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, activeTab]);

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string; adminOnly?: boolean }[] = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'general', label: 'General', adminOnly: true },
    { id: 'integrations', label: 'Integrations', adminOnly: true },
    { id: 'admin', label: 'Users', adminOnly: true },
  ];

  const visibleTabs = tabs.filter((tab) => !tab.adminOnly || isAdmin);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-decidarr-surface border border-decidarr-border rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="flex items-center justify-between p-6 border-b border-decidarr-border">
          <h2 id="settings-title" className="text-2xl font-bold text-decidarr-text">
            Settings
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-decidarr-text-muted hover:text-decidarr-text transition-colors focus:outline-none focus:ring-2 focus:ring-decidarr-primary rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-decidarr-border px-6" role="tablist" aria-label="Settings sections">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tab-panel-${tab.id}`}
              onClick={() => switchTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-decidarr-primary ${
                activeTab === tab.id
                  ? 'border-decidarr-primary text-decidarr-primary'
                  : 'border-transparent text-decidarr-text-muted hover:text-decidarr-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'general' && <GeneralTab />}
          {activeTab === 'integrations' && <IntegrationsTab />}
          {activeTab === 'admin' && <AdminTab />}
        </div>
      </div>
    </div>
  );
}
