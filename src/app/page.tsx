'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { AgentsSidebar } from '@/components/AgentsSidebar';
import { MissionQueue } from '@/components/MissionQueue';
import { LiveFeed } from '@/components/LiveFeed';
import { ChatPanel } from '@/components/ChatPanel';
import { useMissionControl } from '@/lib/store';

export default function MissionControlPage() {
  const {
    setAgents,
    setTasks,
    setConversations,
    setEvents,
    setIsOnline,
    setIsLoading,
    isLoading,
  } = useMissionControl();

  const [showChat, setShowChat] = useState(false);

  // Initial data load
  useEffect(() => {
    async function loadData() {
      try {
        // Fetch all data in parallel
        const [agentsRes, tasksRes, conversationsRes, eventsRes] = await Promise.all([
          fetch('/api/agents'),
          fetch('/api/tasks'),
          fetch('/api/conversations'),
          fetch('/api/events'),
        ]);

        if (agentsRes.ok) setAgents(await agentsRes.json());
        if (tasksRes.ok) setTasks(await tasksRes.json());
        if (conversationsRes.ok) setConversations(await conversationsRes.json());
        if (eventsRes.ok) setEvents(await eventsRes.json());

        // Check OpenClaw connection
        try {
          const openclawRes = await fetch('/api/openclaw/status');
          if (openclawRes.ok) {
            const status = await openclawRes.json();
            setIsOnline(status.connected);
          }
        } catch {
          setIsOnline(false);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();

    // Poll for events every 5 seconds
    const eventPoll = setInterval(async () => {
      try {
        const res = await fetch('/api/events?limit=20');
        if (res.ok) {
          setEvents(await res.json());
        }
      } catch (error) {
        console.error('Failed to poll events:', error);
      }
    }, 5000);

    // Check OpenClaw connection every 30 seconds
    const connectionCheck = setInterval(async () => {
      try {
        const res = await fetch('/api/openclaw/status');
        if (res.ok) {
          const status = await res.json();
          setIsOnline(status.connected);
        }
      } catch {
        setIsOnline(false);
      }
    }, 30000);

    return () => {
      clearInterval(eventPoll);
      clearInterval(connectionCheck);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🦞</div>
          <p className="text-mc-text-secondary">Loading Mission Control...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-mc-bg overflow-hidden">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        {/* Agents Sidebar */}
        <AgentsSidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex">
          {/* Mission Queue */}
          <div className="flex-1 flex flex-col">
            <MissionQueue />

            {/* Chat Toggle */}
            {!showChat && (
              <button
                onClick={() => setShowChat(true)}
                className="fixed bottom-4 right-96 px-4 py-2 bg-mc-accent text-mc-bg rounded-full shadow-lg hover:bg-mc-accent/90 flex items-center gap-2"
              >
                💬 Open Chat
              </button>
            )}
          </div>

          {/* Chat Panel (conditionally shown) */}
          {showChat && (
            <div className="w-80 border-l border-mc-border relative">
              <button
                onClick={() => setShowChat(false)}
                className="absolute top-2 right-2 z-10 p-1 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
              >
                ✕
              </button>
              <ChatPanel />
            </div>
          )}
        </div>

        {/* Live Feed */}
        <LiveFeed />
      </div>
    </div>
  );
}
