'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, Cpu, Timer } from 'lucide-react';

interface LocalModelStatus {
  name: string;
  baseUrl: string;
  healthCode: number;
  modelsCode: number;
  chatCode: number;
  chatLatencyMs: number;
  healthy: boolean;
  routeable: boolean;
}

interface LocalModelHealthResponse {
  checkedAt: string | null;
  models: LocalModelStatus[];
  error?: string;
}

async function fetchLocalModelHealth(): Promise<LocalModelHealthResponse> {
  const response = await fetch('/api/local-model-health');
  if (!response.ok) {
    throw new Error('Failed to fetch local model health');
  }
  return response.json();
}

export function LocalModelDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['local-model-health'],
    queryFn: fetchLocalModelHealth,
    refetchInterval: 30000,
  });

  const models = data?.models ?? [];
  const routeableCount = models.filter((model) => model.routeable).length;
  const averageLatency = models.length
    ? Math.round(models.reduce((sum, model) => sum + model.chatLatencyMs, 0) / models.length)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Local Models</h1>
        <p className="text-gray-400">Health, routing eligibility, and latency for always-hot local endpoints.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Routeable</span>
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </div>
          <div className="text-2xl font-bold text-white">{routeableCount}/{models.length}</div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Average Latency</span>
            <Timer className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">{averageLatency}ms</div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Last Check</span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-sm font-medium text-white">
            {data?.checkedAt ? new Date(data.checkedAt).toLocaleString() : 'No data'}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-gray-400">Loading local model health...</div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 text-red-300">
          Failed to load local model health.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {models.map((model) => (
          <div key={model.name} className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-lg font-semibold text-white">{model.name}</h2>
                </div>
                <p className="text-xs text-gray-500">{model.baseUrl}</p>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  model.routeable
                    ? 'bg-green-900/40 text-green-300 border border-green-700'
                    : 'bg-red-900/40 text-red-300 border border-red-700'
                }`}
              >
                {model.routeable ? 'Routeable' : 'Exclude from routing'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div className="bg-gray-900/60 rounded p-3">
                <div className="text-gray-400 mb-1">Health</div>
                <div className="text-white font-medium">{model.healthCode}</div>
              </div>
              <div className="bg-gray-900/60 rounded p-3">
                <div className="text-gray-400 mb-1">Models</div>
                <div className="text-white font-medium">{model.modelsCode}</div>
              </div>
              <div className="bg-gray-900/60 rounded p-3">
                <div className="text-gray-400 mb-1">Chat</div>
                <div className="text-white font-medium">{model.chatCode}</div>
              </div>
              <div className="bg-gray-900/60 rounded p-3">
                <div className="text-gray-400 mb-1">Latency</div>
                <div className="text-white font-medium">{model.chatLatencyMs}ms</div>
              </div>
            </div>

            {!model.routeable && (
              <div className="flex items-start gap-2 text-sm text-amber-300 bg-amber-900/10 border border-amber-700/40 rounded p-3">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Model is unhealthy or failing chat requests. Routing should avoid it until checks recover.</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
