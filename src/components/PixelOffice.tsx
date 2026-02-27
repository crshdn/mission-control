'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentStatus } from '@/lib/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentData {
  id: string;
  name: string;
  status: AgentStatus;
  avatar_emoji: string;
  role: string;
}

interface AgentConfig {
  name: string;
  label: string;
  color: string;
  // Position of the agent character (center-bottom of sprite)
  seatX: number;
  seatY: number;
  // Desk position
  deskX: number;
  deskY: number;
  deskW: number;
  deskH: number;
  features: string[];
  emoji: string;
}

// ─── Agent desk layout ───────────────────────────────────────────────────────
//  Office is 860x560 SVG. Agents face "down" (toward viewer).
//  seatX/seatY = where the character's feet are. Head is above.

const AGENTS: AgentConfig[] = [
  {
    name: 'Monalisa',
    label: 'Artist',
    color: '#db61a2',
    seatX: 430, seatY: 135,
    deskX: 380, deskY: 52, deskW: 110, deskH: 40,
    features: ['art-supplies'],
    emoji: '🎨',
  },
  {
    name: 'Sherlock',
    label: 'CMO',
    color: '#3fb950',
    seatX: 160, seatY: 195,
    deskX: 100, deskY: 110, deskW: 120, deskH: 40,
    features: ['whiteboard'],
    emoji: '🔍',
  },
  {
    name: 'Dexter',
    label: 'CTO',
    color: '#58a6ff',
    seatX: 700, seatY: 195,
    deskX: 635, deskY: 110, deskW: 130, deskH: 40,
    features: ['multi-monitor'],
    emoji: '🤖',
  },
  {
    name: 'Eve',
    label: 'COO',
    color: '#a371f7',
    seatX: 430, seatY: 310,
    deskX: 360, deskY: 220, deskW: 140, deskH: 45,
    features: ['big-desk', 'nameplate'],
    emoji: '🧠',
  },
  {
    name: 'Shelby',
    label: 'Strategist',
    color: '#d29922',
    seatX: 160, seatY: 420,
    deskX: 100, deskY: 335, deskW: 120, deskH: 40,
    features: ['charts'],
    emoji: '📊',
  },
  {
    name: 'Bluma',
    label: 'CISO',
    color: '#f85149',
    seatX: 700, seatY: 420,
    deskX: 635, deskY: 335, deskW: 120, deskH: 40,
    features: ['security-monitor'],
    emoji: '🛡️',
  },
  {
    name: 'Goku',
    label: 'Trainer',
    color: '#ff8c00',
    seatX: 430, seatY: 500,
    deskX: 380, deskY: 415, deskW: 100, deskH: 38,
    features: ['small-energetic'],
    emoji: '⚡',
  },
];

const DOOR = { x: 420, y: 555 };

// ─── Pixel sizes ─────────────────────────────────────────────────────────────
const PX = 3; // each "pixel" is 3 SVG units
const CHAR_W = 14 * PX; // 42
const CHAR_H = 22 * PX; // 66

// ─── Draw a pixel-art character ──────────────────────────────────────────────
function Agent({
  cx,
  bottomY,
  color,
  status,
  name,
  isWalking,
  isMini,
}: {
  cx: number; // center x
  bottomY: number; // y of feet
  color: string;
  status: AgentStatus;
  name: string;
  isWalking: boolean;
  isMini?: boolean;
}) {
  const S = isMini ? 2 : PX;
  const w = 14 * S;
  const h = 22 * S;
  const x = cx - w / 2;
  const y = bottomY - h;
  const skin = '#ffd5b8';

  return (
    <g
      className={isWalking ? 'pixel-walk' : status === 'working' ? 'pixel-typing' : 'pixel-idle'}
    >
      {/* Colored glow behind character for visibility */}
      <ellipse cx={cx} cy={bottomY - h / 2} rx={w * 0.8} ry={h * 0.55} fill={color} opacity={0.12} filter="url(#glow)" />

      {/* Ground shadow */}
      <ellipse cx={cx} cy={bottomY + 2} rx={w * 0.4} ry={S * 1.5} fill="rgba(0,0,0,0.3)" />

      {/* ── Hair ── */}
      <rect x={x + 3 * S} y={y} width={8 * S} height={2 * S} fill={color} />
      <rect x={x + 2 * S} y={y + S} width={10 * S} height={2 * S} fill={color} />

      {/* ── Head ── */}
      <rect x={x + 3 * S} y={y + 2 * S} width={8 * S} height={7 * S} fill={skin} />
      {/* Eyes */}
      <rect x={x + 4 * S} y={y + 5 * S} width={2 * S} height={2 * S} fill="#222" className={status === 'working' ? 'pixel-blink' : ''} />
      <rect x={x + 8 * S} y={y + 5 * S} width={2 * S} height={2 * S} fill="#222" className={status === 'working' ? 'pixel-blink' : ''} />
      {/* Eye highlights */}
      <rect x={x + 4 * S} y={y + 5 * S} width={S} height={S} fill="rgba(255,255,255,0.5)" />
      <rect x={x + 8 * S} y={y + 5 * S} width={S} height={S} fill="rgba(255,255,255,0.5)" />
      {/* Mouth */}
      {status === 'working' ? (
        <rect x={x + 5 * S} y={y + 7.5 * S} width={4 * S} height={S} fill="#d4937a" rx={S * 0.3} />
      ) : (
        <rect x={x + 6 * S} y={y + 7.5 * S} width={2 * S} height={S * 0.6} fill="#c9846b" />
      )}

      {/* ── Body / Shirt ── */}
      <rect x={x + 2 * S} y={y + 9 * S} width={10 * S} height={7 * S} fill={color} />
      {/* Highlight */}
      <rect x={x + 3 * S} y={y + 9 * S} width={8 * S} height={S} fill="rgba(255,255,255,0.2)" />

      {/* ── Arms ── */}
      <rect x={x} y={y + 10 * S} width={2 * S} height={5 * S} fill={color}
        className={status === 'working' ? 'pixel-arm-left' : ''} />
      <rect x={x + 12 * S} y={y + 10 * S} width={2 * S} height={5 * S} fill={color}
        className={status === 'working' ? 'pixel-arm-right' : ''} />
      {/* Hands */}
      <rect x={x} y={y + 14 * S} width={2 * S} height={2 * S} fill={skin}
        className={status === 'working' ? 'pixel-arm-left' : ''} />
      <rect x={x + 12 * S} y={y + 14 * S} width={2 * S} height={2 * S} fill={skin}
        className={status === 'working' ? 'pixel-arm-right' : ''} />

      {/* ── Legs ── */}
      <rect x={x + 3 * S} y={y + 16 * S} width={3 * S} height={4 * S} fill="#3d4450"
        className={isWalking ? 'pixel-leg-left' : ''} />
      <rect x={x + 8 * S} y={y + 16 * S} width={3 * S} height={4 * S} fill="#3d4450"
        className={isWalking ? 'pixel-leg-right' : ''} />
      {/* Shoes */}
      <rect x={x + 2 * S} y={y + 20 * S} width={4 * S} height={2 * S} fill="#222"
        className={isWalking ? 'pixel-leg-left' : ''} />
      <rect x={x + 8 * S} y={y + 20 * S} width={4 * S} height={2 * S} fill="#222"
        className={isWalking ? 'pixel-leg-right' : ''} />

      {/* ── Name Badge ── */}
      {!isMini ? (
        <g>
          <rect x={cx - 34} y={y - 20} width={68} height={17} rx={4}
            fill="rgba(13,17,23,0.95)" stroke={color} strokeWidth={1.5} />
          <text x={cx} y={y - 8} textAnchor="middle" fill={color}
            fontSize={11} fontFamily="'JetBrains Mono', monospace" fontWeight="bold">
            {name}
          </text>
        </g>
      ) : (
        <g>
          <rect x={cx - 28} y={y - 14} width={56} height={13} rx={3}
            fill="rgba(13,17,23,0.95)" stroke="#39d353" strokeWidth={1} />
          <text x={cx} y={y - 4} textAnchor="middle" fill="#39d353"
            fontSize={8} fontFamily="'JetBrains Mono', monospace">
            sub-agent
          </text>
        </g>
      )}

      {/* ── Status Dot ── */}
      <circle cx={cx + w / 2 + 4} cy={y + 4} r={4.5}
        fill={status === 'working' ? '#3fb950' : status === 'standby' ? '#d29922' : '#f85149'}
        className={status === 'working' ? 'pixel-pulse' : ''} />
      {status === 'working' && (
        <circle cx={cx + w / 2 + 4} cy={y + 4} r={8}
          fill="none" stroke="#3fb950" strokeWidth={1} opacity={0.3}
          className="pixel-pulse" />
      )}
    </g>
  );
}

// ─── Desk + Chair + Decorations ──────────────────────────────────────────────
function Desk({ agent, status }: { agent: AgentConfig; status: AgentStatus }) {
  const { deskX: dx, deskY: dy, deskW: dw, deskH: dh, seatX, seatY, color, features } = agent;

  return (
    <g>
      {/* ── Desk surface ── */}
      <rect x={dx} y={dy} width={dw} height={dh} rx={3}
        fill="#3d3122" stroke="#5a4a32" strokeWidth={2} />
      <rect x={dx + 2} y={dy + 2} width={dw - 4} height={4}
        fill="#5a4a32" opacity={0.5} />
      {/* Legs */}
      <rect x={dx + 5} y={dy + dh} width={4} height={8} fill="#3d3122" />
      <rect x={dx + dw - 9} y={dy + dh} width={4} height={8} fill="#3d3122" />

      {/* ── Monitor(s) ── */}
      {features.includes('multi-monitor') ? (
        // Triple monitors for Dexter
        [0, 30, 60].map((off, i) => (
          <g key={i}>
            <rect x={dx + 10 + off} y={dy - 24} width={26} height={22} rx={2}
              fill="#161b22" stroke="#30363d" strokeWidth={1} />
            <rect x={dx + 12 + off} y={dy - 22} width={22} height={16}
              fill={status === 'working' ? '#0d3320' : '#0d1117'}
              className={status === 'working' ? 'pixel-screen-glow' : ''} />
            {status === 'working' && (
              <>
                <rect x={dx + 14 + off} y={dy - 20} width={14} height={1.5} fill="#3fb950" opacity={0.6} className="pixel-code-line" />
                <rect x={dx + 14 + off} y={dy - 17} width={9} height={1.5} fill="#58a6ff" opacity={0.4} className="pixel-code-line-2" />
                <rect x={dx + 14 + off} y={dy - 14} width={16} height={1.5} fill="#3fb950" opacity={0.5} className="pixel-code-line-3" />
              </>
            )}
            <rect x={dx + 21 + off} y={dy - 2} width={4} height={4} fill="#30363d" />
          </g>
        ))
      ) : (
        // Single monitor
        <g>
          <rect x={dx + dw / 2 - 18} y={dy - 26} width={36} height={24} rx={2}
            fill="#161b22" stroke="#30363d" strokeWidth={1} />
          <rect x={dx + dw / 2 - 16} y={dy - 24} width={32} height={18}
            fill={status === 'working' ? '#0d3320' : '#0d1117'}
            className={status === 'working' ? 'pixel-screen-glow' : ''} />
          {status === 'working' && (
            <>
              <rect x={dx + dw / 2 - 14} y={dy - 22} width={18} height={1.5} fill="#3fb950" opacity={0.6} className="pixel-code-line" />
              <rect x={dx + dw / 2 - 14} y={dy - 19} width={12} height={1.5} fill="#58a6ff" opacity={0.4} className="pixel-code-line-2" />
              <rect x={dx + dw / 2 - 14} y={dy - 16} width={22} height={1.5} fill="#3fb950" opacity={0.5} className="pixel-code-line-3" />
            </>
          )}
          <rect x={dx + dw / 2 - 3} y={dy - 2} width={6} height={4} fill="#30363d" />
        </g>
      )}

      {/* ── Feature decorations ── */}
      {features.includes('whiteboard') && (
        <g>
          <rect x={dx + dw + 10} y={dy - 16} width={32} height={42} rx={2} fill="#ececec" stroke="#ccc" strokeWidth={1} />
          <rect x={dx + dw + 14} y={dy - 10} width={20} height={1.5} fill="#aaa" />
          <rect x={dx + dw + 14} y={dy - 6} width={14} height={1.5} fill="#aaa" />
          <rect x={dx + dw + 14} y={dy - 2} width={22} height={1.5} fill={color} />
          <text x={dx + dw + 16} y={dy + 16} fill="#666" fontSize={7} fontFamily="monospace">TODO</text>
        </g>
      )}

      {features.includes('charts') && (
        <g>
          <rect x={dx + 8} y={dy + 8} width={24} height={18} rx={1} fill="#161b22" stroke="#30363d" strokeWidth={0.5} />
          <rect x={dx + 12} y={dy + 20} width={4} height={4} fill="#3fb950" />
          <rect x={dx + 18} y={dy + 16} width={4} height={8} fill="#58a6ff" />
          <rect x={dx + 24} y={dy + 18} width={4} height={6} fill="#d29922" />
        </g>
      )}

      {features.includes('security-monitor') && (
        <g>
          <rect x={dx + dw - 30} y={dy + 6} width={24} height={18} rx={1} fill="#0d1117" stroke="#f85149" strokeWidth={0.5} />
          <circle cx={dx + dw - 18} cy={dy + 15} r={5} fill="none" stroke="#f85149" strokeWidth={0.5} opacity={0.5} />
          <text x={dx + dw - 26} y={dy + 22} fill="#f85149" fontSize={5} fontFamily="monospace" className="pixel-blink">REC</text>
        </g>
      )}

      {features.includes('art-supplies') && (
        <g>
          <ellipse cx={dx + 22} cy={dy + 18} rx={11} ry={9} fill="#8B7355" />
          <circle cx={dx + 16} cy={dy + 15} r={3} fill="#ff6b6b" />
          <circle cx={dx + 24} cy={dy + 14} r={3} fill="#4ecdc4" />
          <circle cx={dx + 19} cy={dy + 22} r={3} fill="#ffe66d" />
          <circle cx={dx + 27} cy={dy + 20} r={3} fill="#a371f7" />
        </g>
      )}

      {features.includes('small-energetic') && (
        <g>
          <rect x={dx + dw - 14} y={dy + 6} width={8} height={12} rx={1} fill="#ff8c00" />
          <text x={dx + dw - 13} y={dy + 16} fill="#fff" fontSize={5} fontWeight="bold">⚡</text>
        </g>
      )}

      {features.includes('big-desk') && (
        <g>
          {/* Coffee mug */}
          <rect x={dx + dw - 18} y={dy + 8} width={10} height={12} rx={2} fill="#8b949e" />
          <rect x={dx + dw - 8} y={dy + 10} width={4} height={8} rx={2} fill="none" stroke="#8b949e" strokeWidth={1} />
          {/* Nameplate */}
          <rect x={dx + 8} y={dy + 8} width={34} height={12} rx={1} fill="#d4af37" />
          <text x={dx + 13} y={dy + 17} fill="#1a1a1a" fontSize={7} fontFamily="monospace" fontWeight="bold">EVE</text>
        </g>
      )}

      {/* ── Office chair ── */}
      <rect x={seatX - 14} y={seatY - 8} width={28} height={22} rx={5}
        fill="#21262d" stroke="#30363d" strokeWidth={1} />
      {/* Chair back */}
      <rect x={seatX - 12} y={seatY - 18} width={24} height={12} rx={4}
        fill="#282e36" stroke="#30363d" strokeWidth={1} />
      {/* Chair stem + wheels */}
      <rect x={seatX - 2} y={seatY + 14} width={4} height={6} fill="#30363d" />
      <circle cx={seatX - 8} cy={seatY + 22} r={2.5} fill="#30363d" />
      <circle cx={seatX + 8} cy={seatY + 22} r={2.5} fill="#30363d" />
    </g>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PixelOffice() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [positions, setPositions] = useState<Map<string, { cx: number; by: number }>>(new Map());
  const [walking, setWalking] = useState<Set<string>>(new Set());
  const [seated, setSeated] = useState<Set<string>>(new Set());
  const [hasSubagents, setHasSubagents] = useState(false);
  const [subPos, setSubPos] = useState({ cx: DOOR.x, by: DOOR.y });
  const [subWalking, setSubWalking] = useState(false);
  const animStarted = useRef(false);

  // Fetch
  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      if (res.ok) setAgents(await res.json());
    } catch {}
  }, []);

  const fetchSubagents = useCallback(async () => {
    try {
      const res = await fetch('/api/openclaw/sessions?session_type=subagent&status=active');
      if (res.ok) {
        const sessions = await res.json();
        setHasSubagents(sessions.some(
          (s: { label?: string }) => s.label?.includes('dexter')
        ));
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchSubagents();
    const iv = setInterval(() => { fetchAgents(); fetchSubagents(); }, 10000);
    return () => clearInterval(iv);
  }, [fetchAgents, fetchSubagents]);

  // Walk-in animation
  useEffect(() => {
    if (agents.length === 0 || animStarted.current) return;
    animStarted.current = true;

    // Start everyone at the door
    const init = new Map<string, { cx: number; by: number }>();
    const allWalk = new Set<string>();
    AGENTS.forEach(a => {
      init.set(a.name, { cx: DOOR.x, by: DOOR.y });
      allWalk.add(a.name);
    });
    setPositions(init);
    setWalking(allWalk);

    // Animate each agent to their seat with stagger
    AGENTS.forEach((agent, idx) => {
      const delay = idx * 350;
      const dur = 1800;
      const t0 = performance.now() + delay;
      const tx = agent.seatX;
      const ty = agent.seatY;

      const step = (now: number) => {
        const elapsed = now - t0;
        if (elapsed < 0) { requestAnimationFrame(step); return; }
        const p = Math.min(elapsed / dur, 1);
        const e = 1 - Math.pow(1 - p, 3); // ease-out

        setPositions(prev => {
          const next = new Map(prev);
          next.set(agent.name, {
            cx: DOOR.x + (tx - DOOR.x) * e,
            by: DOOR.y + (ty - DOOR.y) * e,
          });
          return next;
        });

        if (p < 1) {
          requestAnimationFrame(step);
        } else {
          setWalking(prev => { const n = new Set(prev); n.delete(agent.name); return n; });
          setSeated(prev => new Set(prev).add(agent.name));
        }
      };
      requestAnimationFrame(step);
    });
  }, [agents]);

  // Subagent walk-in
  useEffect(() => {
    if (!hasSubagents) { setSubWalking(false); return; }
    setSubWalking(true);
    setSubPos({ cx: DOOR.x, by: DOOR.y });

    const dexter = AGENTS.find(a => a.name === 'Dexter')!;
    const tx = dexter.seatX + 45;
    const ty = dexter.seatY + 5;
    const t0 = performance.now() + 500;
    const dur = 2000;

    const step = (now: number) => {
      const elapsed = now - t0;
      if (elapsed < 0) { requestAnimationFrame(step); return; }
      const p = Math.min(elapsed / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setSubPos({
        cx: DOOR.x + (tx - DOOR.x) * e,
        by: DOOR.y + (ty - DOOR.y) * e,
      });
      if (p < 1) requestAnimationFrame(step);
      else setSubWalking(false);
    };
    requestAnimationFrame(step);
  }, [hasSubagents]);

  const getStatus = (name: string): AgentStatus =>
    agents.find(a => a.name.toLowerCase() === name.toLowerCase())?.status || 'offline';

  return (
    <div className="relative w-full h-full min-h-screen bg-mc-bg flex flex-col items-center">
      {/* Header */}
      <div className="w-full flex items-center justify-between px-6 py-3 bg-mc-bg-secondary border-b border-mc-border">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏢</span>
          <h1 className="text-lg font-bold text-mc-text tracking-wider uppercase">Office View</h1>
          <span className="text-xs text-mc-text-secondary bg-mc-bg-tertiary px-2 py-0.5 rounded">8-BIT</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-mc-text-secondary">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-mc-accent-green animate-pulse" />Working</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-mc-accent-yellow" />Standby</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-mc-accent-red" />Offline</span>
          </div>
          <a href="/" className="text-sm text-mc-accent hover:text-mc-text transition-colors px-3 py-1 bg-mc-bg-tertiary rounded">
            ← Dashboard
          </a>
        </div>
      </div>

      {/* Office SVG */}
      <div className="flex-1 flex items-center justify-center p-4 w-full">
        <svg viewBox="0 0 860 580" className="w-full max-w-5xl border border-mc-border rounded-lg bg-[#0a0e14]"
          style={{ imageRendering: 'auto' }}>
          <defs>
            <pattern id="floor" width="40" height="40" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill="#141a22" />
              <rect x="0" y="0" width="20" height="20" fill="#161e28" />
              <rect x="20" y="20" width="20" height="20" fill="#161e28" />
            </pattern>
            <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>

          {/* Floor */}
          <rect width="860" height="580" fill="url(#floor)" />

          {/* Walls */}
          <rect width="860" height="6" fill="#30363d" />
          <rect width="6" height="580" fill="#30363d" />
          <rect x="854" width="6" height="580" fill="#30363d" />
          <rect y="574" width="860" height="6" fill="#30363d" />

          {/* Door */}
          <rect x={DOOR.x - 22} y="536" width="52" height="40" fill="#3d3122" rx={2} />
          <rect x={DOOR.x - 18} y="540" width="44" height="34" fill="#0d1117" />
          <circle cx={DOOR.x + 24} cy="557" r={2.5} fill="#d4af37" />
          <text x={DOOR.x} y="534" fill="#8b949e" fontSize={8} fontFamily="monospace" textAnchor="middle">ENTRANCE</text>

          {/* Company sign */}
          <rect x="340" y="10" width="180" height="26" rx={5} fill="#161b22" stroke="#58a6ff" strokeWidth={1.2} />
          <text x="430" y="28" textAnchor="middle" fill="#58a6ff" fontSize={12}
            fontFamily="'JetBrains Mono', monospace" fontWeight="bold" filter="url(#glow)">
            MAYAKATI HQ
          </text>

          {/* Ceiling lights */}
          {[160, 430, 700].map((lx, i) => (
            <g key={`l${i}`}>
              <rect x={lx - 16} y={8} width={32} height={4} rx={1} fill="#30363d" />
              <rect x={lx - 9} y={12} width={18} height={2} fill="#58a6ff" opacity={0.3} />
              <ellipse cx={lx} cy={24} rx={50} ry={18} fill="#58a6ff" opacity={0.025} />
            </g>
          ))}

          {/* Plants */}
          {[{x:30,y:45},{x:815,y:45},{x:30,y:490},{x:815,y:490}].map((p,i) => (
            <g key={`p${i}`}>
              <rect x={p.x-7} y={p.y+12} width={14} height={16} rx={2} fill="#5a3825" />
              <circle cx={p.x} cy={p.y+8} r={9} fill="#2d5a27" />
              <circle cx={p.x-4} cy={p.y+4} r={6} fill="#3fb950" opacity={0.5} />
              <circle cx={p.x+5} cy={p.y+2} r={7} fill="#2d5a27" />
            </g>
          ))}

          {/* Water cooler */}
          <rect x={785} y={250} width={18} height={32} rx={2} fill="#4a6fa5" />
          <rect x={787} y={240} width={14} height={12} rx={7} fill="#a8d0f0" opacity={0.5} />

          {/* ═══ LAYER 1: Desks + Chairs (behind agents) ═══ */}
          {AGENTS.map(a => <Desk key={`d-${a.name}`} agent={a} status={getStatus(a.name)} />)}

          {/* ═══ LAYER 2: Agent Characters (in front) ═══ */}
          {AGENTS.map(a => {
            const pos = positions.get(a.name);
            if (!pos) return null;
            return (
              <Agent key={a.name}
                cx={pos.cx} bottomY={pos.by}
                color={a.color} status={getStatus(a.name)}
                name={a.name} isWalking={walking.has(a.name)} />
            );
          })}

          {/* Subagent */}
          {hasSubagents && (
            <Agent cx={subPos.cx} bottomY={subPos.by}
              color="#39d353" status="working" name="helper"
              isWalking={subWalking} isMini />
          )}

          {/* ═══ LAYER 3: Status Indicators ═══ */}
          {AGENTS.map(a => {
            const st = getStatus(a.name);
            if (!seated.has(a.name)) return null;

            if (st === 'working') {
              return (
                <text key={`t-${a.name}`}
                  x={a.seatX + CHAR_W / 2 + 12} y={a.seatY - CHAR_H + 10}
                  fill={a.color} fontSize={9} fontFamily="monospace"
                  opacity={0.8} className="pixel-typing-indicator" filter="url(#glow)">
                  ⌨️ clack
                </text>
              );
            }
            if (st === 'standby') {
              return (
                <text key={`z-${a.name}`}
                  x={a.seatX + CHAR_W / 2 + 8} y={a.seatY - CHAR_H + 5}
                  fill="#8b949e" fontSize={16} className="pixel-zzz">
                  💤
                </text>
              );
            }
            return null;
          })}
        </svg>
      </div>

      {/* Bottom bar */}
      <div className="w-full px-6 py-2 bg-mc-bg-secondary border-t border-mc-border flex items-center justify-between text-xs text-mc-text-secondary">
        <div className="flex items-center gap-4">
          <span>👥 {agents.filter(a => a.status === 'working').length} working</span>
          <span>😴 {agents.filter(a => a.status === 'standby').length} standby</span>
          <span>⛔ {agents.filter(a => a.status === 'offline').length} offline</span>
          {hasSubagents && <span className="text-mc-accent-green">🤖 Dexter has active sub-agents</span>}
        </div>
        <span>Auto-refresh: 10s</span>
      </div>
    </div>
  );
}
