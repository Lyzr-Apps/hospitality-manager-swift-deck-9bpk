'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { RiDashboardLine, RiHotelLine } from 'react-icons/ri'
import { HiOutlineCalendarDays, HiOutlineUserGroup, HiOutlineCube, HiOutlineHeart, HiOutlineBanknotes, HiOutlineCog6Tooth } from 'react-icons/hi2'
import { FiSend, FiMenu, FiChevronLeft, FiCopy, FiTrash2, FiTrendingUp, FiTrendingDown, FiAlertTriangle, FiCheck, FiChevronDown, FiActivity, FiClock, FiUsers, FiDollarSign, FiCheckCircle, FiCircle, FiLoader } from 'react-icons/fi'

// ─── Constants ───────────────────────────────────────────────────────────────

const AGENT_IDS = {
  reservations: '699c96c3ef8ae6d0193d54e3',
  staffing: '699c96c4ef8ae6d0193d54e5',
  inventory: '699c96c42559b648e45127ab',
  customers: '699c96c4ef8ae6d0193d54e7',
  finance: '699c96c5b2047f2008d8c352',
  operations: '699c96c53146f0934746a35f',
} as const

type TabKey = 'dashboard' | 'reservations' | 'staffing' | 'inventory' | 'customers' | 'finance' | 'operations'

const NAV_ITEMS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <RiDashboardLine className="w-5 h-5" /> },
  { key: 'reservations', label: 'Reservations', icon: <HiOutlineCalendarDays className="w-5 h-5" /> },
  { key: 'staffing', label: 'Staffing', icon: <HiOutlineUserGroup className="w-5 h-5" /> },
  { key: 'inventory', label: 'Inventory', icon: <HiOutlineCube className="w-5 h-5" /> },
  { key: 'customers', label: 'Customers', icon: <HiOutlineHeart className="w-5 h-5" /> },
  { key: 'finance', label: 'Finance', icon: <HiOutlineBanknotes className="w-5 h-5" /> },
  { key: 'operations', label: 'Operations', icon: <HiOutlineCog6Tooth className="w-5 h-5" /> },
]

const PROPERTIES = ['Grand Heritage Hotel', 'The Coastal Resort', 'Downtown Bistro & Suites']

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'agent'
  text: string
  data?: any
  timestamp: string
}

interface BookingItem {
  id?: string
  guest_name?: string
  date?: string
  time?: string
  type?: string
  party_size?: string
  status?: string
  special_requests?: string
}

interface ShiftItem {
  staff_name?: string
  role?: string
  start_time?: string
  end_time?: string
  status?: string
}

interface ScheduleDay {
  day?: string
  shifts?: ShiftItem[]
}

interface InventoryItem {
  item_name?: string
  category?: string
  current_stock?: string
  par_level?: string
  status?: string
  action_needed?: string
}

interface RestockOrder {
  item_name?: string
  quantity?: string
  unit_cost?: string
  total_cost?: string
  priority?: string
}

interface GuestProfile {
  name?: string
  contact?: string
  vip_status?: string
  visit_count?: string
  preferences?: string
  last_visit?: string
  notes?: string
}

interface FinancialMetric {
  metric?: string
  value?: string
  trend?: string
  period?: string
  notes?: string
}

interface TaskItem {
  task?: string
  department?: string
  priority?: string
  deadline?: string
  status?: string
  assigned_to?: string
}

// ─── ErrorBoundary ───────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2 font-serif">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-sans">Try again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deepExtractAgentData(obj: any, depth: number = 0): any {
  if (depth > 6 || !obj) return obj
  if (typeof obj === 'string') {
    try {
      const p = JSON.parse(obj)
      if (typeof p === 'object' && p !== null) return deepExtractAgentData(p, depth + 1)
      return { message: obj, summary: '' }
    } catch {
      return { message: obj, summary: '' }
    }
  }
  if (typeof obj !== 'object' || obj === null) return { message: String(obj), summary: '' }

  // Check if this object itself has agent schema fields
  const agentKeys = ['message', 'bookings', 'schedule', 'inventory_items', 'guests', 'financial_data', 'tasks', 'summary', 'action_plan', 'warnings', 'restock_orders', 'recommendations']
  const hasAgentKey = agentKeys.some(k => k in obj && obj[k] !== undefined && obj[k] !== null)
  if (hasAgentKey && !('status' in obj && 'result' in obj)) {
    // This IS the agent data — return it, but also resolve any stringified fields
    const cleaned: any = { ...obj }
    for (const k of agentKeys) {
      if (typeof cleaned[k] === 'string' && (cleaned[k].startsWith('[') || cleaned[k].startsWith('{'))) {
        try { cleaned[k] = JSON.parse(cleaned[k]) } catch { /* keep string */ }
      }
    }
    return cleaned
  }

  // Unwrap common wrapper patterns
  // Pattern: { status: 'success', result: { ...agentData } }
  if (obj.status && typeof obj.result === 'object' && obj.result !== null) {
    return deepExtractAgentData(obj.result, depth + 1)
  }
  if (obj.status && typeof obj.result === 'string') {
    return deepExtractAgentData(obj.result, depth + 1)
  }

  // Pattern: { result: { ...agentData } } or { result: "jsonString" }
  if ('result' in obj) {
    return deepExtractAgentData(obj.result, depth + 1)
  }

  // Pattern: { response: { ... } }
  if ('response' in obj && typeof obj.response === 'object' && obj.response !== null) {
    return deepExtractAgentData(obj.response, depth + 1)
  }
  if ('response' in obj && typeof obj.response === 'string') {
    return deepExtractAgentData(obj.response, depth + 1)
  }

  // Pattern: { text: "jsonString" or "plain text" }
  if (typeof obj.text === 'string') {
    try {
      const tp = JSON.parse(obj.text)
      if (typeof tp === 'object' && tp !== null) return deepExtractAgentData(tp, depth + 1)
    } catch { /* plain text */ }
    return { message: obj.text, summary: '' }
  }

  // Pattern: { data: { ... } }
  if ('data' in obj && typeof obj.data === 'object' && obj.data !== null) {
    return deepExtractAgentData(obj.data, depth + 1)
  }

  // Pattern: { message: "..." } with no agent keys — treat message as text
  if (typeof obj.message === 'string' && !hasAgentKey) {
    return { message: obj.message, summary: obj.summary || '' }
  }

  return obj
}

function parseAgentResponse(data: any): any {
  if (!data) return { message: '', summary: '' }
  const extracted = deepExtractAgentData(data)
  if (!extracted || (typeof extracted === 'object' && Object.keys(extracted).length === 0)) {
    return { message: typeof data === 'string' ? data : JSON.stringify(data), summary: '' }
  }
  return extracted
}

function extractAgentText(parsed: any, rawData: any): string {
  // Try multiple paths to find a displayable message
  if (parsed?.message && typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message
  if (parsed?.summary && typeof parsed.summary === 'string' && parsed.summary.trim()) return parsed.summary
  if (parsed?.text && typeof parsed.text === 'string' && parsed.text.trim()) return parsed.text
  if (parsed?.response && typeof parsed.response === 'string' && parsed.response.trim()) return parsed.response
  if (parsed?.answer && typeof parsed.answer === 'string' && parsed.answer.trim()) return parsed.answer
  if (parsed?.content && typeof parsed.content === 'string' && parsed.content.trim()) return parsed.content
  // If the parsed object has structured data but no message, generate a summary
  if (parsed?.bookings && Array.isArray(parsed.bookings) && parsed.bookings.length > 0) return `Found ${parsed.bookings.length} booking(s). See details below.`
  if (parsed?.schedule && Array.isArray(parsed.schedule) && parsed.schedule.length > 0) return `Schedule generated for ${parsed.schedule.length} day(s). See details below.`
  if (parsed?.inventory_items && Array.isArray(parsed.inventory_items) && parsed.inventory_items.length > 0) return `Inventory report with ${parsed.inventory_items.length} item(s). See details below.`
  if (parsed?.guests && Array.isArray(parsed.guests) && parsed.guests.length > 0) return `Found ${parsed.guests.length} guest profile(s). See details below.`
  if (parsed?.financial_data && Array.isArray(parsed.financial_data) && parsed.financial_data.length > 0) return `Financial report with ${parsed.financial_data.length} metric(s). See details below.`
  if (parsed?.tasks && Array.isArray(parsed.tasks) && parsed.tasks.length > 0) return `${parsed.tasks.length} task(s) identified. See details below.`
  // Last resort
  if (typeof rawData === 'string' && rawData.trim()) return rawData
  return 'Agent response processed successfully.'
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1 font-serif">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-3 mb-1 font-serif">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-4 mb-2 font-serif">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm leading-relaxed">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm leading-relaxed">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm leading-relaxed">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part)
}

function getTimeStr(): string {
  const d = new Date()
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function statusColor(status: string | undefined): string {
  const s = (status ?? '').toLowerCase()
  if (s === 'ok' || s === 'confirmed' || s === 'active' || s === 'completed' || s === 'done') return 'bg-green-100 text-green-800 border-green-200'
  if (s === 'low' || s === 'pending' || s === 'in-progress' || s === 'in progress' || s === 'warning') return 'bg-amber-100 text-amber-800 border-amber-200'
  if (s === 'critical' || s === 'cancelled' || s === 'overdue' || s === 'out of stock') return 'bg-red-100 text-red-800 border-red-200'
  return 'bg-secondary text-secondary-foreground border-border'
}

function priorityColor(priority: string | undefined): string {
  const p = (priority ?? '').toLowerCase()
  if (p === 'critical') return 'bg-red-100 text-red-800 border-red-200'
  if (p === 'high') return 'bg-orange-100 text-orange-800 border-orange-200'
  if (p === 'medium') return 'bg-yellow-100 text-yellow-800 border-yellow-200'
  if (p === 'low') return 'bg-green-100 text-green-800 border-green-200'
  return 'bg-secondary text-secondary-foreground border-border'
}

// ─── Sample Data ─────────────────────────────────────────────────────────────

const SAMPLE_BOOKINGS: BookingItem[] = [
  { id: 'B001', guest_name: 'James Mitchell', date: '2025-02-24', time: '19:00', type: 'Dinner', party_size: '4', status: 'Confirmed', special_requests: 'Window seat, anniversary' },
  { id: 'B002', guest_name: 'Sarah Chen', date: '2025-02-24', time: '12:30', type: 'Lunch', party_size: '2', status: 'Confirmed', special_requests: 'Gluten-free menu' },
  { id: 'B003', guest_name: 'Robert Patel', date: '2025-02-24', time: '20:00', type: 'Hotel Check-in', party_size: '1', status: 'Pending', special_requests: 'Late check-in, Suite 401' },
  { id: 'B004', guest_name: 'Elena Vasquez', date: '2025-02-25', time: '18:30', type: 'Dinner', party_size: '6', status: 'Confirmed', special_requests: 'Birthday celebration' },
]

const SAMPLE_SCHEDULE: ScheduleDay[] = [
  { day: 'Monday', shifts: [
    { staff_name: 'Anna K.', role: 'Front Desk', start_time: '07:00', end_time: '15:00', status: 'Active' },
    { staff_name: 'Marco R.', role: 'Chef', start_time: '06:00', end_time: '14:00', status: 'Active' },
    { staff_name: 'Priya S.', role: 'Housekeeping', start_time: '08:00', end_time: '16:00', status: 'Active' },
  ]},
  { day: 'Tuesday', shifts: [
    { staff_name: 'David L.', role: 'Front Desk', start_time: '15:00', end_time: '23:00', status: 'Active' },
    { staff_name: 'Lisa M.', role: 'Server', start_time: '11:00', end_time: '19:00', status: 'Active' },
  ]},
  { day: 'Wednesday', shifts: [
    { staff_name: 'Anna K.', role: 'Front Desk', start_time: '07:00', end_time: '15:00', status: 'Active' },
    { staff_name: 'Marco R.', role: 'Chef', start_time: '06:00', end_time: '14:00', status: 'Active' },
  ]},
]

const SAMPLE_INVENTORY: InventoryItem[] = [
  { item_name: 'Fresh Salmon', category: 'Seafood', current_stock: '12 lbs', par_level: '20 lbs', status: 'Low', action_needed: 'Reorder today' },
  { item_name: 'Premium Olive Oil', category: 'Oils & Condiments', current_stock: '8 bottles', par_level: '6 bottles', status: 'OK', action_needed: 'None' },
  { item_name: 'Bath Towels', category: 'Linens', current_stock: '45', par_level: '100', status: 'Critical', action_needed: 'Urgent restock required' },
  { item_name: 'Champagne Brut', category: 'Beverages', current_stock: '18 bottles', par_level: '24 bottles', status: 'Low', action_needed: 'Order this week' },
  { item_name: 'Organic Eggs', category: 'Dairy & Eggs', current_stock: '120', par_level: '80', status: 'OK', action_needed: 'None' },
]

const SAMPLE_RESTOCK: RestockOrder[] = [
  { item_name: 'Fresh Salmon', quantity: '15 lbs', unit_cost: '$12.50', total_cost: '$187.50', priority: 'High' },
  { item_name: 'Bath Towels', quantity: '60 units', unit_cost: '$8.00', total_cost: '$480.00', priority: 'Critical' },
  { item_name: 'Champagne Brut', quantity: '12 bottles', unit_cost: '$35.00', total_cost: '$420.00', priority: 'Medium' },
]

const SAMPLE_GUESTS: GuestProfile[] = [
  { name: 'James Mitchell', contact: 'james@email.com', vip_status: 'Gold', visit_count: '12', preferences: 'Corner suite, hypoallergenic pillows, sparkling water', last_visit: '2025-02-10', notes: 'Anniversary on March 15th' },
  { name: 'Sarah Chen', contact: 'sarah.chen@email.com', vip_status: 'Platinum', visit_count: '28', preferences: 'Gluten-free meals, room 305, yoga schedule', last_visit: '2025-02-18', notes: 'Corporate account - TechCorp Inc.' },
]

const SAMPLE_FINANCE: FinancialMetric[] = [
  { metric: 'Total Revenue', value: '$42,350', trend: 'up', period: 'This Week', notes: '+8% vs last week' },
  { metric: 'Room Revenue', value: '$28,200', trend: 'up', period: 'This Week', notes: '85% occupancy' },
  { metric: 'F&B Revenue', value: '$11,150', trend: 'up', period: 'This Week', notes: 'Strong weekend dining' },
  { metric: 'Operating Costs', value: '$18,900', trend: 'down', period: 'This Week', notes: '-3% vs last week' },
  { metric: 'Profit Margin', value: '55.4%', trend: 'up', period: 'This Week', notes: 'Above target of 50%' },
  { metric: 'ADR (Avg Daily Rate)', value: '$189', trend: 'up', period: 'This Week', notes: '+$12 vs last month' },
]

const SAMPLE_TASKS: TaskItem[] = [
  { task: 'Inspect Suite 401 for VIP arrival', department: 'Housekeeping', priority: 'Critical', deadline: 'Today 14:00', status: 'Pending', assigned_to: 'Priya S.' },
  { task: 'Prepare farm-to-table menu for weekend', department: 'Kitchen', priority: 'High', deadline: 'Thu 17:00', status: 'In Progress', assigned_to: 'Marco R.' },
  { task: 'Update POS system software', department: 'IT', priority: 'Medium', deadline: 'Fri 12:00', status: 'Pending', assigned_to: 'Tech Team' },
  { task: 'Schedule deep clean for Pool area', department: 'Maintenance', priority: 'High', deadline: 'Wed 06:00', status: 'Pending', assigned_to: 'Maintenance Crew' },
  { task: 'Review Q1 marketing budget', department: 'Management', priority: 'Medium', deadline: 'Fri 17:00', status: 'In Progress', assigned_to: 'Elena V.' },
]

const SAMPLE_ACTIVITY = [
  { text: 'Suite 302 checked in - James Mitchell (VIP Gold)', time: '2 min ago', icon: 'checkin' },
  { text: 'Dinner reservation confirmed - party of 6', time: '15 min ago', icon: 'reservation' },
  { text: 'Low stock alert: Fresh Salmon below par level', time: '32 min ago', icon: 'alert' },
  { text: 'Staff schedule updated for next week', time: '1 hr ago', icon: 'schedule' },
  { text: 'Monthly revenue report generated', time: '2 hrs ago', icon: 'finance' },
  { text: 'New guest feedback received - 5 stars', time: '3 hrs ago', icon: 'feedback' },
]

// ─── Reusable Sub-Components ─────────────────────────────────────────────────

function ChatInterface({ agentId, agentLabel, ctaText, messages, setMessages, loading, setLoading, activeAgentId, setActiveAgentId, renderStructuredData }: {
  agentId: string
  agentLabel: string
  ctaText: string
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  loading: boolean
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  activeAgentId: string | null
  setActiveAgentId: React.Dispatch<React.SetStateAction<string | null>>
  renderStructuredData?: (data: any) => React.ReactNode
}) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    const userMsg: ChatMessage = { role: 'user', text: msg, timestamp: getTimeStr() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    setActiveAgentId(agentId)

    try {
      const result = await callAIAgent(msg, agentId)
      if (result.success) {
        // Try multiple access paths for the response data
        // The API route returns: { success, response: { status, result, message }, raw_response }
        const responseObj = result?.response
        const rawResult = responseObj?.result
        const rawMessage = responseObj?.message
        const rawResponse = result?.raw_response

        // Parse the agent's structured data from whatever nesting it comes in
        // Try result first, then the full response object, then raw_response
        let parsed = parseAgentResponse(rawResult)

        // If parseAgentResponse didn't find agent schema fields, try the whole response
        const hasAgentFields = parsed && typeof parsed === 'object' && (
          parsed.bookings || parsed.schedule || parsed.inventory_items ||
          parsed.guests || parsed.financial_data || parsed.tasks ||
          (parsed.message && parsed.message !== '')
        )

        if (!hasAgentFields) {
          // Try parsing the full response object
          const altParsed = parseAgentResponse(responseObj)
          const altHasFields = altParsed && typeof altParsed === 'object' && (
            altParsed.bookings || altParsed.schedule || altParsed.inventory_items ||
            altParsed.guests || altParsed.financial_data || altParsed.tasks ||
            (altParsed.message && altParsed.message !== '')
          )
          if (altHasFields) parsed = altParsed

          // Try parsing raw_response string
          if (!altHasFields && rawResponse) {
            const rawParsed = parseAgentResponse(rawResponse)
            const rawHasFields = rawParsed && typeof rawParsed === 'object' && (
              rawParsed.bookings || rawParsed.schedule || rawParsed.inventory_items ||
              rawParsed.guests || rawParsed.financial_data || rawParsed.tasks ||
              (rawParsed.message && rawParsed.message !== '')
            )
            if (rawHasFields) parsed = rawParsed
          }
        }

        const agentText = extractAgentText(parsed, rawMessage || rawResult)
        const agentMsg: ChatMessage = { role: 'agent', text: agentText, data: parsed, timestamp: getTimeStr() }
        setMessages(prev => [...prev, agentMsg])
      } else {
        const errText = result?.error || result?.response?.message || 'Something went wrong. Please try again.'
        setMessages(prev => [...prev, { role: 'agent', text: errText, timestamp: getTimeStr() }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'agent', text: 'Network error. Please check your connection.', timestamp: getTimeStr() }])
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }, [input, loading, agentId, setMessages, setLoading, setActiveAgentId])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm font-medium font-sans tracking-wide">{agentLabel}</span>
        </div>
        <button onClick={() => setMessages([])} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-secondary" title="Clear Chat">
          <FiTrash2 className="w-4 h-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <FiActivity className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground mb-1 font-sans">Ready to assist</p>
            <p className="text-xs text-muted-foreground/70 font-sans max-w-[240px]">Ask me anything about {agentLabel.toLowerCase()} or click the button below to get started.</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm', msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border/50')}>
              {msg.role === 'agent' ? renderMarkdown(msg.text) : <p className="leading-relaxed">{msg.text}</p>}
              {msg.role === 'agent' && msg.data && renderStructuredData && (
                <div className="mt-3 pt-3 border-t border-border/30">
                  {renderStructuredData(msg.data)}
                </div>
              )}
              <p className={cn('text-[10px] mt-1.5', msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground/60')}>{msg.timestamp}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-card border border-border/50 rounded-lg px-4 py-3 max-w-[85%]">
              <div className="flex items-center gap-2">
                <FiLoader className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground font-sans">Processing...</span>
              </div>
              <div className="mt-2 space-y-2">
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border/40">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
            placeholder={`Ask about ${agentLabel.toLowerCase()}...`}
            className="flex-1 bg-secondary/50 border border-border/40 rounded-lg px-3 py-2.5 text-sm font-sans placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
            disabled={loading}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()} className="bg-primary text-primary-foreground rounded-lg px-4 py-2.5 hover:bg-primary/90 disabled:opacity-40 transition-all flex items-center gap-1.5 text-sm font-medium">
            <FiSend className="w-4 h-4" />
          </button>
        </div>
        <button onClick={() => { setInput(ctaText); }} className="mt-2 text-xs text-primary hover:text-primary/80 font-medium font-sans transition-colors">
          {ctaText}
        </button>
      </div>
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors bg-secondary/60 hover:bg-secondary rounded-md px-2.5 py-1.5">
      {copied ? <FiCheck className="w-3.5 h-3.5 text-green-600" /> : <FiCopy className="w-3.5 h-3.5" />}
      <span>{copied ? 'Copied!' : (label || 'Copy')}</span>
    </button>
  )
}

function MetricCard({ icon, value, label, trend, trendText }: { icon: React.ReactNode; value: string; label: string; trend?: 'up' | 'down' | null; trendText?: string }) {
  return (
    <div className="bg-card rounded-lg p-4 border border-border/30 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">{icon}</div>
        {trend && (
          <div className={cn('flex items-center gap-0.5 text-xs font-medium', trend === 'up' ? 'text-green-600' : 'text-red-500')}>
            {trend === 'up' ? <FiTrendingUp className="w-3.5 h-3.5" /> : <FiTrendingDown className="w-3.5 h-3.5" />}
            {trendText && <span>{trendText}</span>}
          </div>
        )}
      </div>
      <p className="text-xl font-bold font-serif text-foreground tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground font-sans tracking-wide mt-0.5">{label}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string | undefined }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', statusColor(status))}>
      {status || 'Unknown'}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string | undefined }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', priorityColor(priority))}>
      {priority || 'Unknown'}
    </span>
  )
}

// ─── Dashboard Screen ────────────────────────────────────────────────────────

function DashboardScreen({ sampleData }: { sampleData: boolean }) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold font-serif tracking-tight mb-1">Property Overview</h2>
        <p className="text-sm text-muted-foreground font-sans">Real-time snapshot of your hospitality operations</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard icon={<HiOutlineCalendarDays className="w-5 h-5" />} value={sampleData ? '12' : '--'} label="Today's Reservations" trend={sampleData ? 'up' : null} trendText="+3" />
        <MetricCard icon={<RiHotelLine className="w-5 h-5" />} value={sampleData ? '78%' : '--'} label="Occupancy Rate" trend={sampleData ? 'up' : null} trendText="+5%" />
        <MetricCard icon={<FiAlertTriangle className="w-5 h-5" />} value={sampleData ? '3' : '--'} label="Low Stock Alerts" trend={sampleData ? 'down' : null} trendText="-2" />
        <MetricCard icon={<FiDollarSign className="w-5 h-5" />} value={sampleData ? '$8,450' : '--'} label="Daily Revenue" trend={sampleData ? 'up' : null} trendText="+8%" />
        <MetricCard icon={<FiCheckCircle className="w-5 h-5" />} value={sampleData ? '7' : '--'} label="Pending Tasks" trend={sampleData ? 'down' : null} trendText="-1" />
      </div>

      <div className="bg-card rounded-lg border border-border/30 shadow-sm">
        <div className="px-4 py-3 border-b border-border/30">
          <h3 className="text-base font-semibold font-serif tracking-tight">Recent Activity</h3>
        </div>
        <div className="divide-y divide-border/20">
          {sampleData ? SAMPLE_ACTIVITY.map((item, idx) => (
            <div key={idx} className="px-4 py-3 flex items-center gap-3 hover:bg-secondary/30 transition-colors">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                {item.icon === 'checkin' && <FiUsers className="w-4 h-4" />}
                {item.icon === 'reservation' && <HiOutlineCalendarDays className="w-4 h-4" />}
                {item.icon === 'alert' && <FiAlertTriangle className="w-4 h-4" />}
                {item.icon === 'schedule' && <FiClock className="w-4 h-4" />}
                {item.icon === 'finance' && <FiDollarSign className="w-4 h-4" />}
                {item.icon === 'feedback' && <HiOutlineHeart className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-sans text-foreground truncate">{item.text}</p>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">{item.time}</span>
            </div>
          )) : (
            <div className="px-4 py-12 text-center">
              <FiActivity className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground font-sans">No recent activity to display</p>
              <p className="text-xs text-muted-foreground/60 font-sans mt-1">Activity will appear here as operations occur</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Reservations Screen ─────────────────────────────────────────────────────

function ReservationsScreen({ sampleData, messages, setMessages, loading, setLoading, activeAgentId, setActiveAgentId }: {
  sampleData: boolean
  messages: ChatMessage[]; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  loading: boolean; setLoading: React.Dispatch<React.SetStateAction<boolean>>
  activeAgentId: string | null; setActiveAgentId: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const [agentBookings, setAgentBookings] = useState<BookingItem[]>([])

  const renderBookingData = (data: any) => {
    const bookings = Array.isArray(data?.bookings) ? data.bookings : []
    if (bookings.length > 0 && bookings !== agentBookings) {
      setTimeout(() => setAgentBookings(bookings), 0)
    }
    if (bookings.length === 0) return null
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Bookings Found</p>
        {bookings.map((b: BookingItem, i: number) => (
          <div key={i} className="bg-secondary/40 rounded-md p-2.5 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">{b?.guest_name ?? 'Guest'}</span>
              <StatusBadge status={b?.status} />
            </div>
            <div className="flex gap-3 text-muted-foreground">
              <span>{b?.date ?? ''}</span>
              <span>{b?.time ?? ''}</span>
              <span>{b?.type ?? ''}</span>
              <span>Party: {b?.party_size ?? '-'}</span>
            </div>
            {b?.special_requests && <p className="text-muted-foreground/80 italic">{b.special_requests}</p>}
          </div>
        ))}
      </div>
    )
  }

  const displayBookings = agentBookings.length > 0 ? agentBookings : (sampleData ? SAMPLE_BOOKINGS : [])

  return (
    <div className="flex h-full">
      <div className="w-[60%] border-r border-border/30 flex flex-col">
        <ChatInterface
          agentId={AGENT_IDS.reservations}
          agentLabel="Reservation Agent"
          ctaText="Show today's reservations"
          messages={messages}
          setMessages={setMessages}
          loading={loading}
          setLoading={setLoading}
          activeAgentId={activeAgentId}
          setActiveAgentId={setActiveAgentId}
          renderStructuredData={renderBookingData}
        />
      </div>
      <div className="w-[40%] flex flex-col">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-semibold font-serif tracking-tight">Booking Summary</h3>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold font-serif">{sampleData ? '12' : '--'}</p>
                <p className="text-[10px] text-muted-foreground font-sans">Today</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold font-serif">{sampleData ? '5' : '--'}</p>
                <p className="text-[10px] text-muted-foreground font-sans">Check-ins</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold font-serif">{sampleData ? '1' : '--'}</p>
                <p className="text-[10px] text-muted-foreground font-sans">Cancellations</p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Recent Bookings</h4>
              {displayBookings.length > 0 ? displayBookings.map((b, i) => (
                <div key={i} className="bg-card border border-border/30 rounded-lg p-3 mb-2 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium font-sans">{b?.guest_name ?? 'Guest'}</span>
                    <StatusBadge status={b?.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <span><span className="font-medium text-foreground/70">Date:</span> {b?.date ?? '-'}</span>
                    <span><span className="font-medium text-foreground/70">Time:</span> {b?.time ?? '-'}</span>
                    <span><span className="font-medium text-foreground/70">Type:</span> {b?.type ?? '-'}</span>
                    <span><span className="font-medium text-foreground/70">Party:</span> {b?.party_size ?? '-'}</span>
                  </div>
                  {b?.special_requests && (
                    <p className="text-xs text-muted-foreground/80 mt-1.5 italic border-t border-border/20 pt-1.5">{b.special_requests}</p>
                  )}
                </div>
              )) : (
                <div className="text-center py-8">
                  <HiOutlineCalendarDays className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No bookings to display</p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

// ─── Staffing Screen ─────────────────────────────────────────────────────────

function StaffingScreen({ sampleData, messages, setMessages, loading, setLoading, activeAgentId, setActiveAgentId }: {
  sampleData: boolean
  messages: ChatMessage[]; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  loading: boolean; setLoading: React.Dispatch<React.SetStateAction<boolean>>
  activeAgentId: string | null; setActiveAgentId: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const [agentSchedule, setAgentSchedule] = useState<ScheduleDay[]>([])
  const [agentWarnings, setAgentWarnings] = useState<string[]>([])

  const renderScheduleData = (data: any) => {
    const schedule = Array.isArray(data?.schedule) ? data.schedule : []
    const warnings = Array.isArray(data?.warnings) ? data.warnings : []
    if (schedule.length > 0) setTimeout(() => setAgentSchedule(schedule), 0)
    if (warnings.length > 0) setTimeout(() => setAgentWarnings(warnings), 0)
    return null
  }

  const displaySchedule = agentSchedule.length > 0 ? agentSchedule : (sampleData ? SAMPLE_SCHEDULE : [])
  const displayWarnings = agentWarnings.length > 0 ? agentWarnings : (sampleData ? ['Understaffed on Friday evening - 2 servers needed', 'Marco R. approaching overtime limit (38/40 hrs)'] : [])

  const scheduleText = displaySchedule.map(d => {
    const shifts = Array.isArray(d?.shifts) ? d.shifts : []
    return `${d?.day ?? ''}:\n${shifts.map(s => `  ${s?.staff_name ?? ''} - ${s?.role ?? ''} (${s?.start_time ?? ''} - ${s?.end_time ?? ''})`).join('\n')}`
  }).join('\n\n')

  return (
    <div className="flex h-full">
      <div className="w-[50%] border-r border-border/30 flex flex-col">
        <ChatInterface
          agentId={AGENT_IDS.staffing}
          agentLabel="Staff Scheduling Agent"
          ctaText="Show this week's schedule"
          messages={messages}
          setMessages={setMessages}
          loading={loading}
          setLoading={setLoading}
          activeAgentId={activeAgentId}
          setActiveAgentId={setActiveAgentId}
          renderStructuredData={renderScheduleData}
        />
      </div>
      <div className="w-[50%] flex flex-col">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <h3 className="text-sm font-semibold font-serif tracking-tight">Weekly Schedule</h3>
          {displaySchedule.length > 0 && <CopyButton text={scheduleText} label="Export" />}
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {displayWarnings.length > 0 && (
              <div className="space-y-2 mb-4">
                {displayWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <FiAlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-800">{w}</p>
                  </div>
                ))}
              </div>
            )}

            {displaySchedule.length > 0 ? displaySchedule.map((day, di) => (
              <div key={di} className="bg-card border border-border/30 rounded-lg overflow-hidden shadow-sm">
                <div className="bg-primary/5 px-3 py-2 border-b border-border/20">
                  <p className="text-sm font-semibold font-serif">{day?.day ?? 'Day'}</p>
                </div>
                <div className="divide-y divide-border/20">
                  {Array.isArray(day?.shifts) && day.shifts.map((shift, si) => (
                    <div key={si} className="px-3 py-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium font-sans">{shift?.staff_name ?? '-'}</p>
                        <p className="text-xs text-muted-foreground">{shift?.role ?? '-'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono text-foreground/80">{shift?.start_time ?? ''} - {shift?.end_time ?? ''}</p>
                        <StatusBadge status={shift?.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )) : (
              <div className="text-center py-12">
                <HiOutlineUserGroup className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No schedule data</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Ask the agent to generate a schedule</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

// ─── Inventory Screen ────────────────────────────────────────────────────────

function InventoryScreen({ sampleData, messages, setMessages, loading, setLoading, activeAgentId, setActiveAgentId }: {
  sampleData: boolean
  messages: ChatMessage[]; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  loading: boolean; setLoading: React.Dispatch<React.SetStateAction<boolean>>
  activeAgentId: string | null; setActiveAgentId: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const [agentInventory, setAgentInventory] = useState<InventoryItem[]>([])
  const [agentRestock, setAgentRestock] = useState<RestockOrder[]>([])

  const renderInvData = (data: any) => {
    const items = Array.isArray(data?.inventory_items) ? data.inventory_items : []
    const orders = Array.isArray(data?.restock_orders) ? data.restock_orders : []
    if (items.length > 0) setTimeout(() => setAgentInventory(items), 0)
    if (orders.length > 0) setTimeout(() => setAgentRestock(orders), 0)
    return null
  }

  const displayItems = agentInventory.length > 0 ? agentInventory : (sampleData ? SAMPLE_INVENTORY : [])
  const displayRestock = agentRestock.length > 0 ? agentRestock : (sampleData ? SAMPLE_RESTOCK : [])

  const restockText = displayRestock.map(r => `${r?.item_name ?? ''} | Qty: ${r?.quantity ?? ''} | Cost: ${r?.total_cost ?? ''} | Priority: ${r?.priority ?? ''}`).join('\n')

  return (
    <div className="flex h-full">
      <div className="w-[50%] border-r border-border/30 flex flex-col">
        <ChatInterface
          agentId={AGENT_IDS.inventory}
          agentLabel="Inventory Agent"
          ctaText="Check inventory status"
          messages={messages}
          setMessages={setMessages}
          loading={loading}
          setLoading={setLoading}
          activeAgentId={activeAgentId}
          setActiveAgentId={setActiveAgentId}
          renderStructuredData={renderInvData}
        />
      </div>
      <div className="w-[50%] flex flex-col">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-semibold font-serif tracking-tight">Inventory Status</h3>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {displayItems.length > 0 ? (
              <div className="bg-card border border-border/30 rounded-lg overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-primary/5 border-b border-border/20">
                        <th className="text-left px-3 py-2 font-semibold font-sans">Item</th>
                        <th className="text-left px-3 py-2 font-semibold font-sans">Category</th>
                        <th className="text-left px-3 py-2 font-semibold font-sans">Stock</th>
                        <th className="text-left px-3 py-2 font-semibold font-sans">Par</th>
                        <th className="text-left px-3 py-2 font-semibold font-sans">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {displayItems.map((item, i) => (
                        <tr key={i} className="hover:bg-secondary/30 transition-colors">
                          <td className="px-3 py-2.5 font-medium">{item?.item_name ?? '-'}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{item?.category ?? '-'}</td>
                          <td className="px-3 py-2.5">{item?.current_stock ?? '-'}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{item?.par_level ?? '-'}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={item?.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <HiOutlineCube className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No inventory data</p>
              </div>
            )}

            {displayRestock.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Restock Orders</h4>
                  <CopyButton text={restockText} label="Copy Order" />
                </div>
                <div className="space-y-2">
                  {displayRestock.map((order, i) => (
                    <div key={i} className="bg-card border border-border/30 rounded-lg p-3 shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium font-sans">{order?.item_name ?? '-'}</span>
                        <PriorityBadge priority={order?.priority} />
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Qty: {order?.quantity ?? '-'}</span>
                        <span>Unit: {order?.unit_cost ?? '-'}</span>
                        <span className="font-medium text-foreground">Total: {order?.total_cost ?? '-'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

// ─── Customers Screen ────────────────────────────────────────────────────────

function CustomersScreen({ sampleData, messages, setMessages, loading, setLoading, activeAgentId, setActiveAgentId }: {
  sampleData: boolean
  messages: ChatMessage[]; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  loading: boolean; setLoading: React.Dispatch<React.SetStateAction<boolean>>
  activeAgentId: string | null; setActiveAgentId: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const [agentGuests, setAgentGuests] = useState<GuestProfile[]>([])
  const [agentRecs, setAgentRecs] = useState<string[]>([])

  const renderGuestData = (data: any) => {
    const guests = Array.isArray(data?.guests) ? data.guests : []
    const recs = Array.isArray(data?.recommendations) ? data.recommendations : []
    if (guests.length > 0) setTimeout(() => setAgentGuests(guests), 0)
    if (recs.length > 0) setTimeout(() => setAgentRecs(recs), 0)
    return null
  }

  const displayGuests = agentGuests.length > 0 ? agentGuests : (sampleData ? SAMPLE_GUESTS : [])
  const displayRecs = agentRecs.length > 0 ? agentRecs : (sampleData ? ['Send personalized anniversary offer to James Mitchell', 'Prepare gluten-free welcome basket for Sarah Chen'] : [])

  return (
    <div className="flex h-full">
      <div className="w-[55%] border-r border-border/30 flex flex-col">
        <ChatInterface
          agentId={AGENT_IDS.customers}
          agentLabel="Guest CRM Agent"
          ctaText="Look up VIP guest profiles"
          messages={messages}
          setMessages={setMessages}
          loading={loading}
          setLoading={setLoading}
          activeAgentId={activeAgentId}
          setActiveAgentId={setActiveAgentId}
          renderStructuredData={renderGuestData}
        />
      </div>
      <div className="w-[45%] flex flex-col">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-semibold font-serif tracking-tight">Guest Profiles</h3>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {displayGuests.length > 0 ? displayGuests.map((guest, i) => (
              <div key={i} className="bg-card border border-border/30 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold font-serif">{guest?.name ?? 'Guest'}</h4>
                    <p className="text-xs text-muted-foreground">{guest?.contact ?? ''}</p>
                  </div>
                  {guest?.vip_status && (
                    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold', guest.vip_status === 'Platinum' ? 'bg-purple-100 text-purple-800 border-purple-200' : guest.vip_status === 'Gold' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-secondary text-secondary-foreground border-border')}>
                      {guest.vip_status}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Visits:</span>
                    <span className="ml-1 font-medium">{guest?.visit_count ?? '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last visit:</span>
                    <span className="ml-1 font-medium">{guest?.last_visit ?? '-'}</span>
                  </div>
                </div>
                {guest?.preferences && (
                  <div className="mt-2 pt-2 border-t border-border/20">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Preferences</p>
                    <p className="text-xs text-foreground/80">{guest.preferences}</p>
                  </div>
                )}
                {guest?.notes && (
                  <div className="mt-2 pt-2 border-t border-border/20">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Notes</p>
                    <p className="text-xs text-foreground/80 italic">{guest.notes}</p>
                  </div>
                )}
              </div>
            )) : (
              <div className="text-center py-12">
                <HiOutlineHeart className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No guest profiles</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Ask the agent to look up guests</p>
              </div>
            )}

            {displayRecs.length > 0 && (
              <div>
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Recommendations</h4>
                <div className="space-y-1.5">
                  {displayRecs.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2 bg-primary/5 rounded-lg p-2.5">
                      <FiCheckCircle className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-foreground/80">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

// ─── Finance Screen ──────────────────────────────────────────────────────────

function FinanceScreen({ sampleData, messages, setMessages, loading, setLoading, activeAgentId, setActiveAgentId }: {
  sampleData: boolean
  messages: ChatMessage[]; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  loading: boolean; setLoading: React.Dispatch<React.SetStateAction<boolean>>
  activeAgentId: string | null; setActiveAgentId: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const [agentFinance, setAgentFinance] = useState<FinancialMetric[]>([])
  const [agentRecs, setAgentRecs] = useState<string[]>([])

  const renderFinanceData = (data: any) => {
    const metrics = Array.isArray(data?.financial_data) ? data.financial_data : []
    const recs = Array.isArray(data?.recommendations) ? data.recommendations : []
    if (metrics.length > 0) setTimeout(() => setAgentFinance(metrics), 0)
    if (recs.length > 0) setTimeout(() => setAgentRecs(recs), 0)
    return null
  }

  const displayMetrics = agentFinance.length > 0 ? agentFinance : (sampleData ? SAMPLE_FINANCE : [])
  const displayRecs = agentRecs.length > 0 ? agentRecs : (sampleData ? ['Consider weekend brunch package to boost F&B revenue', 'Review laundry service costs - 12% above industry average'] : [])

  const reportText = displayMetrics.map(m => `${m?.metric ?? ''}: ${m?.value ?? ''} (${m?.trend ?? ''}) - ${m?.notes ?? ''}`).join('\n')

  return (
    <div className="flex h-full">
      <div className="w-[50%] border-r border-border/30 flex flex-col">
        <ChatInterface
          agentId={AGENT_IDS.finance}
          agentLabel="Financial Reporting Agent"
          ctaText="Generate weekly financial report"
          messages={messages}
          setMessages={setMessages}
          loading={loading}
          setLoading={setLoading}
          activeAgentId={activeAgentId}
          setActiveAgentId={setActiveAgentId}
          renderStructuredData={renderFinanceData}
        />
      </div>
      <div className="w-[50%] flex flex-col">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <h3 className="text-sm font-semibold font-serif tracking-tight">Financial Summary</h3>
          {displayMetrics.length > 0 && <CopyButton text={reportText} label="Export Report" />}
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {displayMetrics.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {displayMetrics.map((metric, i) => (
                  <div key={i} className="bg-card border border-border/30 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{metric?.period ?? ''}</span>
                      {metric?.trend && (
                        <span className={cn('flex items-center gap-0.5 text-xs font-medium', metric.trend === 'up' ? 'text-green-600' : 'text-red-500')}>
                          {metric.trend === 'up' ? <FiTrendingUp className="w-3 h-3" /> : <FiTrendingDown className="w-3 h-3" />}
                        </span>
                      )}
                    </div>
                    <p className="text-lg font-bold font-serif">{metric?.value ?? '-'}</p>
                    <p className="text-xs text-foreground/80 font-medium">{metric?.metric ?? ''}</p>
                    {metric?.notes && <p className="text-[10px] text-muted-foreground mt-1">{metric.notes}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <HiOutlineBanknotes className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No financial data</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Ask the agent to generate a report</p>
              </div>
            )}

            {displayRecs.length > 0 && (
              <div>
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Recommendations</h4>
                <div className="space-y-1.5">
                  {displayRecs.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2 bg-primary/5 rounded-lg p-2.5">
                      <FiTrendingUp className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-foreground/80">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

// ─── Operations Screen ───────────────────────────────────────────────────────

function OperationsScreen({ sampleData, messages, setMessages, loading, setLoading, activeAgentId, setActiveAgentId }: {
  sampleData: boolean
  messages: ChatMessage[]; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  loading: boolean; setLoading: React.Dispatch<React.SetStateAction<boolean>>
  activeAgentId: string | null; setActiveAgentId: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const [agentTasks, setAgentTasks] = useState<TaskItem[]>([])
  const [agentPlan, setAgentPlan] = useState<string[]>([])
  const [localStatuses, setLocalStatuses] = useState<Record<number, string>>({})

  const renderOpsData = (data: any) => {
    const tasks = Array.isArray(data?.tasks) ? data.tasks : []
    const plan = Array.isArray(data?.action_plan) ? data.action_plan : []
    if (tasks.length > 0) setTimeout(() => { setAgentTasks(tasks); setLocalStatuses({}) }, 0)
    if (plan.length > 0) setTimeout(() => setAgentPlan(plan), 0)
    return null
  }

  const displayTasks = agentTasks.length > 0 ? agentTasks : (sampleData ? SAMPLE_TASKS : [])
  const displayPlan = agentPlan.length > 0 ? agentPlan : (sampleData ? ['Complete VIP suite inspection by 14:00', 'Finalize weekend menu with kitchen team', 'Schedule pool maintenance for early morning'] : [])

  const toggleStatus = (idx: number) => {
    const currentStatus = localStatuses[idx] ?? displayTasks[idx]?.status ?? 'Pending'
    let nextStatus = 'Done'
    if (currentStatus.toLowerCase() === 'pending') nextStatus = 'In Progress'
    else if (currentStatus.toLowerCase() === 'in progress' || currentStatus.toLowerCase() === 'in-progress') nextStatus = 'Done'
    else nextStatus = 'Pending'
    setLocalStatuses(prev => ({ ...prev, [idx]: nextStatus }))
  }

  return (
    <div className="flex h-full">
      <div className="w-[50%] border-r border-border/30 flex flex-col">
        <ChatInterface
          agentId={AGENT_IDS.operations}
          agentLabel="Operations Coordinator"
          ctaText="Show today's operational tasks"
          messages={messages}
          setMessages={setMessages}
          loading={loading}
          setLoading={setLoading}
          activeAgentId={activeAgentId}
          setActiveAgentId={setActiveAgentId}
          renderStructuredData={renderOpsData}
        />
      </div>
      <div className="w-[50%] flex flex-col">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-semibold font-serif tracking-tight">Task Management</h3>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {displayTasks.length > 0 ? (
              <div className="space-y-2">
                {displayTasks.map((task, i) => {
                  const currentStatus = localStatuses[i] ?? task?.status ?? 'Pending'
                  const isDone = currentStatus.toLowerCase() === 'done' || currentStatus.toLowerCase() === 'completed'
                  return (
                    <div key={i} className={cn('bg-card border border-border/30 rounded-lg p-3 shadow-sm hover:shadow-md transition-all', isDone && 'opacity-60')}>
                      <div className="flex items-start gap-3">
                        <button onClick={() => toggleStatus(i)} className="mt-0.5 flex-shrink-0 transition-colors">
                          {isDone ? (
                            <FiCheckCircle className="w-4.5 h-4.5 text-green-600" />
                          ) : currentStatus.toLowerCase().includes('progress') ? (
                            <FiLoader className="w-4.5 h-4.5 text-amber-600" />
                          ) : (
                            <FiCircle className="w-4.5 h-4.5 text-muted-foreground" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm font-medium font-sans', isDone && 'line-through')}>{task?.task ?? '-'}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <PriorityBadge priority={task?.priority} />
                            <span className="text-[10px] text-muted-foreground">{task?.department ?? ''}</span>
                            {task?.assigned_to && <span className="text-[10px] text-muted-foreground">| {task.assigned_to}</span>}
                          </div>
                          {task?.deadline && (
                            <div className="flex items-center gap-1 mt-1">
                              <FiClock className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">{task.deadline}</span>
                            </div>
                          )}
                        </div>
                        <StatusBadge status={currentStatus} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <HiOutlineCog6Tooth className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No tasks to display</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Ask the agent for today's tasks</p>
              </div>
            )}

            {displayPlan.length > 0 && (
              <div>
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Action Plan</h4>
                <div className="space-y-1.5">
                  {displayPlan.map((step, i) => (
                    <div key={i} className="flex items-start gap-2 bg-primary/5 rounded-lg p-2.5">
                      <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full w-4.5 h-4.5 flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                      <p className="text-xs text-foreground/80">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

// ─── Agent Info Panel ────────────────────────────────────────────────────────

function AgentInfoPanel({ activeAgentId }: { activeAgentId: string | null }) {
  const agents = [
    { id: AGENT_IDS.reservations, name: 'Reservation Agent', purpose: 'Bookings & check-ins' },
    { id: AGENT_IDS.staffing, name: 'Staff Scheduler', purpose: 'Shifts & workforce' },
    { id: AGENT_IDS.inventory, name: 'Inventory Agent', purpose: 'Stock & supplies' },
    { id: AGENT_IDS.customers, name: 'Guest CRM Agent', purpose: 'Guest relationships' },
    { id: AGENT_IDS.finance, name: 'Finance Agent', purpose: 'Revenue & reports' },
    { id: AGENT_IDS.operations, name: 'Operations Coord.', purpose: 'Tasks & workflow' },
  ]

  return (
    <div className="bg-card border border-border/30 rounded-lg p-3 shadow-sm">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">AI Agents</h4>
      <div className="space-y-1.5">
        {agents.map(a => (
          <div key={a.id} className="flex items-center gap-2 py-1">
            <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', activeAgentId === a.id ? 'bg-amber-400 animate-pulse' : 'bg-green-500')} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium truncate">{a.name}</p>
            </div>
            <span className="text-[9px] text-muted-foreground/70 flex-shrink-0">{a.purpose}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedProperty, setSelectedProperty] = useState(PROPERTIES[0])
  const [propertyDropdown, setPropertyDropdown] = useState(false)
  const [sampleData, setSampleData] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  // Independent chat states for each agent tab
  const [resMessages, setResMessages] = useState<ChatMessage[]>([])
  const [resLoading, setResLoading] = useState(false)
  const [staffMessages, setStaffMessages] = useState<ChatMessage[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [invMessages, setInvMessages] = useState<ChatMessage[]>([])
  const [invLoading, setInvLoading] = useState(false)
  const [custMessages, setCustMessages] = useState<ChatMessage[]>([])
  const [custLoading, setCustLoading] = useState(false)
  const [finMessages, setFinMessages] = useState<ChatMessage[]>([])
  const [finLoading, setFinLoading] = useState(false)
  const [opsMessages, setOpsMessages] = useState<ChatMessage[]>([])
  const [opsLoading, setOpsLoading] = useState(false)

  const tabLabel = NAV_ITEMS.find(n => n.key === activeTab)?.label ?? 'Dashboard'

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground font-sans flex" style={{ letterSpacing: '0.01em', lineHeight: '1.65' }}>
        {/* Sidebar */}
        <aside className={cn('h-screen flex flex-col border-r border-border/30 bg-card transition-all duration-300 flex-shrink-0 sticky top-0', sidebarOpen ? 'w-[250px]' : 'w-[68px]')}>
          {/* Logo */}
          <div className="px-4 py-4 border-b border-border/30 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-serif text-sm flex-shrink-0">H</div>
            {sidebarOpen && <span className="text-base font-semibold font-serif tracking-tight whitespace-nowrap">HospitalityHub</span>}
          </div>

          {/* Property Selector */}
          {sidebarOpen && (
            <div className="px-3 py-3 border-b border-border/30">
              <div className="relative">
                <button onClick={() => setPropertyDropdown(!propertyDropdown)} className="w-full flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2 text-xs font-medium hover:bg-secondary transition-colors">
                  <span className="truncate">{selectedProperty}</span>
                  <FiChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', propertyDropdown && 'rotate-180')} />
                </button>
                {propertyDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border/40 rounded-lg shadow-lg z-50 overflow-hidden">
                    {PROPERTIES.map(p => (
                      <button key={p} onClick={() => { setSelectedProperty(p); setPropertyDropdown(false) }} className={cn('w-full text-left px-3 py-2 text-xs hover:bg-secondary/50 transition-colors', p === selectedProperty && 'bg-primary/10 text-primary font-medium')}>
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
            {NAV_ITEMS.map(item => (
              <button key={item.key} onClick={() => setActiveTab(item.key)} className={cn('w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all', activeTab === item.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/70 hover:bg-secondary hover:text-foreground')} title={item.label}>
                {item.icon}
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </button>
            ))}
          </nav>

          {/* Agent Info */}
          {sidebarOpen && (
            <div className="px-3 py-3 border-t border-border/30">
              <AgentInfoPanel activeAgentId={activeAgentId} />
            </div>
          )}

          {/* Collapse */}
          <div className="px-3 py-3 border-t border-border/30">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 rounded-lg hover:bg-secondary">
              {sidebarOpen ? <><FiChevronLeft className="w-4 h-4" /><span>Collapse</span></> : <FiMenu className="w-4 h-4" />}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
          {/* Header */}
          <header className="h-14 border-b border-border/30 bg-card flex items-center justify-between px-6 flex-shrink-0">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold font-serif tracking-tight">{tabLabel}</h1>
              <span className="text-xs text-muted-foreground font-sans hidden sm:inline">|</span>
              <span className="text-xs text-muted-foreground font-sans hidden sm:inline">{selectedProperty}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor="sample-toggle" className="text-xs text-muted-foreground font-sans cursor-pointer">Sample Data</label>
                <Switch id="sample-toggle" checked={sampleData} onCheckedChange={setSampleData} />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Manager</Badge>
            </div>
          </header>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'dashboard' && (
              <div className="h-full overflow-y-auto"><DashboardScreen sampleData={sampleData} /></div>
            )}
            {activeTab === 'reservations' && (
              <ReservationsScreen sampleData={sampleData} messages={resMessages} setMessages={setResMessages} loading={resLoading} setLoading={setResLoading} activeAgentId={activeAgentId} setActiveAgentId={setActiveAgentId} />
            )}
            {activeTab === 'staffing' && (
              <StaffingScreen sampleData={sampleData} messages={staffMessages} setMessages={setStaffMessages} loading={staffLoading} setLoading={setStaffLoading} activeAgentId={activeAgentId} setActiveAgentId={setActiveAgentId} />
            )}
            {activeTab === 'inventory' && (
              <InventoryScreen sampleData={sampleData} messages={invMessages} setMessages={setInvMessages} loading={invLoading} setLoading={setInvLoading} activeAgentId={activeAgentId} setActiveAgentId={setActiveAgentId} />
            )}
            {activeTab === 'customers' && (
              <CustomersScreen sampleData={sampleData} messages={custMessages} setMessages={setCustMessages} loading={custLoading} setLoading={setCustLoading} activeAgentId={activeAgentId} setActiveAgentId={setActiveAgentId} />
            )}
            {activeTab === 'finance' && (
              <FinanceScreen sampleData={sampleData} messages={finMessages} setMessages={setFinMessages} loading={finLoading} setLoading={setFinLoading} activeAgentId={activeAgentId} setActiveAgentId={setActiveAgentId} />
            )}
            {activeTab === 'operations' && (
              <OperationsScreen sampleData={sampleData} messages={opsMessages} setMessages={setOpsMessages} loading={opsLoading} setLoading={setOpsLoading} activeAgentId={activeAgentId} setActiveAgentId={setActiveAgentId} />
            )}
          </div>
        </main>
      </div>
    </ErrorBoundary>
  )
}
