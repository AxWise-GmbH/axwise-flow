'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, Search, Play, MessageSquare, Check, Loader2, 
  Building2, Users, Target, ChevronRight, AlertCircle, 
  ThumbsUp, Sparkles, Globe, Activity, Eye, FileText, Phone,
  ExternalLink, Linkedin, BookOpen, Shield
} from 'lucide-react';

// Types matching the backend schemas
interface CompanyDiscoveryItem {
  id: string;
  name: string;
  industry: string;
  size: string;
  location: string;
  latitude: number;
  longitude: number;
  decision_makers: string[];
  estimated_pain_points: string[];
  insights?: string;
  website?: string;
  contact_phone?: string;
  linkedin_url?: string;
  xing_url?: string;
  email?: string;
  register_court?: string;
  register_number?: string;
  legal_form?: string;
  purpose?: string;
  pain_point_sources?: string[];
  decision_maker_details?: Array<{ role: string; name: string; type?: string; city?: string; since?: string }>;
}

interface Stakeholder {
  id: string;
  name: string;
  description: string;
  questions: string[];
}

interface SimulatedPerson {
  id: string;
  name: string;
  age: number;
  background: string;
  motivations: string[];
  pain_points: string[];
  communication_style: string;
  stakeholder_type: string;
  grounding_company?: string;
  grounding_sources?: string[];
}

interface InterviewResponse {
  question: string;
  response: string;
  sentiment: string;
  key_insights: string[];
}

interface SimulatedInterview {
  person_id: string;
  stakeholder_type: string;
  responses: InterviewResponse[];
  interview_duration_minutes: number;
  overall_sentiment: string;
  key_themes: string[];
}

interface SimulationInsights {
  overall_sentiment: string;
  key_themes: string[];
  stakeholder_priorities: Record<string, string[]>;
  potential_risks: string[];
  opportunities: string[];
  recommendations: string[];
}

interface ChatMessage {
  role: 'user' | 'persona';
  content: string;
  cognitive_steps?: string[];
}

export default function RegionalMapPage() {
  // Inputs
  const [location, setLocation] = useState('Munich');
  const [businessProblem, setBusinessProblem] = useState('Slow B2B procurement processes in manufacturing');
  const [targetUser, setTargetUser] = useState('Operations Managers & procurement specialists');
  const [businessIdea, setBusinessIdea] = useState('B2B dispatcher scheduling software');
  const [analyzingIdea, setAnalyzingIdea] = useState(false);
  const [suggestedProblems, setSuggestedProblems] = useState<string[]>([]);
  const [suggestedTargetGroups, setSuggestedTargetGroups] = useState<string[]>([]);
  const [lastAnalyzedIdea, setLastAnalyzedIdea] = useState('');

  // Load session context on mount to align with conversation routines
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedCurrent = localStorage.getItem('axwise_current_session');
      if (storedCurrent) {
        const session = JSON.parse(storedCurrent);
        if (session.business_idea) setBusinessIdea(session.business_idea);
        if (session.problem) setBusinessProblem(session.problem);
        if (session.target_customer) setTargetUser(session.target_customer);
        if (session.location) setLocation(session.location);
      }
    } catch (e) {
      console.error('Failed to load active research session:', e);
    }
  }, []);


  // Loading & State
  const [loading, setLoading] = useState(false);
  const [workflowStep, setWorkflowStep] = useState<number>(0); // 0 = idle, 1 = searching, 2 = stakeholders, 3 = personas, 4 = interviews, 5 = completed
  const [activeTab, setActiveTab] = useState<'map' | 'insights'>('map');
  const [showDensityMap, setShowDensityMap] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyDiscoveryItem | null>(null);

  // Default mock data for initial load to ensure a stunning visual first impression
  const defaultMockCompanies: CompanyDiscoveryItem[] = [
    {
      id: "lead-1",
      name: "Münchner Maschinenbau GmbH",
      industry: "Manufacturing & Industrial Equipment",
      size: "250-500 employees",
      location: "München (Sendling)",
      latitude: 48.1130,
      longitude: 11.5380,
      decision_makers: ["Dr. Thomas Wagner (Head of Procurement)", "Sarah Jenkins (COO)"],
      estimated_pain_points: [
        "Manual order-entry paper trail causing 5-day delays",
        "Lack of real-time supplier inventory syncing"
      ],
      insights: "Highly traditional tech stack. Supplier communication is handled via fax and email attachments. High willingness to pay for automation.",
      website: "https://www.muenchner-maschinenbau.de",
      contact_phone: "+49 89 4001923"
    },
    {
      id: "lead-2",
      name: "Bavarian Automotive Components",
      industry: "Automotive Supplier",
      size: "1,200 employees",
      location: "München (Milbertshofen)",
      latitude: 48.1820,
      longitude: 11.5650,
      decision_makers: ["Markus Weber (VP Supply Chain)", "Dieter Müller (Operations Director)"],
      estimated_pain_points: [
        "Just-in-time delivery coordination friction",
        "EDI transmission parsing errors costing €12k monthly"
      ],
      insights: "Uses SAP S/4HANA but struggles with custom integrations. Very strict compliance and security requirements.",
      website: "https://www.bavarian-automotive.com",
      contact_phone: "+49 89 9887711"
    },
    {
      id: "lead-3",
      name: "Isar Logistics & Warehousing",
      industry: "Logistics & Transport",
      size: "80 employees",
      location: "München (Riem)",
      latitude: 48.1360,
      longitude: 11.6850,
      decision_makers: ["Elena Petrova (Operations Manager)"],
      estimated_pain_points: [
        "Manual dispatcher scheduling taking 4 hours daily",
        "Fragmented carrier communication channels"
      ],
      insights: "Young management team eager to adopt SaaS tools. Prefers lightweight mobile-friendly interfaces.",
      website: "https://www.isar-logistics.de",
      contact_phone: "+49 89 2200330"
    }
  ];

  const defaultMockPersonas: SimulatedPerson[] = [
    {
      id: "persona-1",
      name: "Dr. Thomas Wagner",
      age: 52,
      background: "20+ years in procurement operations at mid-sized German manufacturing firms. Conservative, values reliability and vendor stability above flashy tech features.",
      motivations: [
        "Minimize supply chain disruptions",
        "Reduce operational overhead without adding headcount",
        "Adhere strictly to local compliance guidelines"
      ],
      pain_points: [
        "Overwhelmed by emails and manual paperwork",
        "Struggles to get real-time status updates from smaller sub-suppliers",
        "Skeptical of AI tools that don't have clear explanation traces"
      ],
      communication_style: "Formal, precise, detail-oriented",
      stakeholder_type: "Head of Procurement"
    },
    {
      id: "persona-2",
      name: "Elena Petrova",
      age: 34,
      background: "Operations manager who previously worked in modern tech startups. Eager to automate manual entry and dispatching tasks.",
      motivations: [
        "Eliminate spreadsheet-based tracking",
        "Enable real-time dashboard visibility for the dispatch team",
        "Fast adoption and integration"
      ],
      pain_points: [
        "Frustrated by outdated systems",
        "High employee turnover due to repetitive administrative tasks",
        "Difficulty training new staff on legacy terminal systems"
      ],
      communication_style: "Direct, pragmatist, casual",
      stakeholder_type: "Operations Manager"
    }
  ];

  // Workflow Results
  const [companies, setCompanies] = useState<CompanyDiscoveryItem[]>(defaultMockCompanies);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [people, setPeople] = useState<SimulatedPerson[]>(defaultMockPersonas);
  const [interviews, setInterviews] = useState<SimulatedInterview[]>([]);
  const [insights, setInsights] = useState<SimulationInsights | null>(null);

  // Live Chat Drawer
  const [selectedPersona, setSelectedPersona] = useState<SimulatedPerson | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);

  // SVG Map bounding box calculations
  const [mapCenter, setMapCenter] = useState({ lat: 48.1351, lon: 11.5820 });

  useEffect(() => {
    if (companies.length > 0) {
      // Re-center map around discovered companies
      const lats = companies.map(c => c.latitude);
      const lons = companies.map(c => c.longitude);
      const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
      const avgLon = lons.reduce((a, b) => a + b, 0) / lons.length;
      setMapCenter({ lat: avgLat, lon: avgLon });
    }
  }, [companies]);

  // Leaflet Interactive Map Initialization
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    const checkLeaflet = () => {
      if ((window as any).L) {
        setLeafletLoaded(true);
        return true;
      }
      return false;
    };

    if (checkLeaflet()) {
      return;
    }

    if (document.getElementById('leaflet-js')) {
      const interval = setInterval(() => {
        if (checkLeaflet()) {
          clearInterval(interval);
        }
      }, 100);
      return () => {
        clearInterval(interval);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    }

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.id = 'leaflet-css';
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.id = 'leaflet-js';
    script.async = true;
    script.onload = () => {
      setLeafletLoaded(true);
    };
    document.head.appendChild(script);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    if (mapInstanceRef.current) {
      return;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false
    }).setView([mapCenter.lat, mapCenter.lon], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    L.control.zoom({
      position: 'topright'
    }).addTo(map);

    mapInstanceRef.current = map;
  }, [leafletLoaded]);

  useEffect(() => {
    if (!leafletLoaded || !mapInstanceRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const map = mapInstanceRef.current;

    // Clear existing markers and overlays
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (companies.length === 0) return;

    map.setView([mapCenter.lat, mapCenter.lon], 12);

    companies.forEach(c => {
      const isSelected = selectedCompany?.id === c.id;

      if (showDensityMap) {
        const heatCircle = L.circle([c.latitude, c.longitude], {
          color: 'rgba(99, 102, 241, 0.2)',
          fillColor: 'rgba(99, 102, 241, 0.1)',
          fillOpacity: 0.5,
          radius: 800
        }).addTo(map);
        markersRef.current.push(heatCircle);
      }

      const markerColor = isSelected ? 'rgb(79, 70, 229)' : 'rgb(17, 24, 39)';
      const markerHtml = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;">
          <div style="position: absolute; width: ${isSelected ? '24px' : '16px'}; height: ${isSelected ? '24px' : '16px'}; border-radius: 50%; background-color: ${markerColor}; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.15); opacity: 0.4; ${isSelected ? 'animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;' : ''}"></div>
          <div style="position: relative; width: 12px; height: 12px; border-radius: 50%; background-color: ${markerColor}; border: 2px solid white; box-shadow: 0 2px 4px -1px rgba(0,0,0,0.1);"></div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-map-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([c.latitude, c.longitude], { icon: customIcon })
        .addTo(map)
        .bindTooltip(`
          <div style="font-family: sans-serif; font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 6px; border: 1px solid #E5E7EB; background: white; color: #111827; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05);">
            ${c.name}
          </div>
        `, { 
          direction: 'top', 
          offset: [0, -10],
          permanent: false,
          opacity: 0.9
        });

      marker.on('click', () => {
        setSelectedCompany(c);
      });

      markersRef.current.push(marker);
    });
  }, [companies, selectedCompany, showDensityMap, leafletLoaded, mapCenter]);

  // Parse idea & auto-fill inputs
  const handleAnalyzeIdea = async () => {
    if (!businessIdea.trim() || businessIdea === lastAnalyzedIdea) return;
    setAnalyzingIdea(true);
    try {
      const res = await fetch('/api/research/simulation-bridge/regional-map/analyze-idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_idea: businessIdea }),
      });
      const data = await res.json();
      if (data.success) {
        setLastAnalyzedIdea(businessIdea);
        if (data.suggested_problems) {
          setSuggestedProblems(data.suggested_problems);
          if (data.suggested_problems.length > 0) {
            setBusinessProblem(data.suggested_problems[0]);
          }
        }
        if (data.suggested_target_groups) {
          setSuggestedTargetGroups(data.suggested_target_groups);
          if (data.suggested_target_groups.length > 0) {
            setTargetUser(data.suggested_target_groups[0]);
          }
        }
      }
    } catch (err) {
      console.error('Error analyzing business idea:', err);
    } finally {
      setAnalyzingIdea(false);
    }
  };


  // E2E Workflow runner
  const handleRunWorkflow = async () => {
    setLoading(true);
    setWorkflowStep(1);
    setSelectedCompany(null);
    setCompanies([]);
    setStakeholders([]);
    setPeople([]);
    setInterviews([]);
    setInsights(null);

    try {
      // Step 1: Discovered Companies
      const searchRes = await fetch('/api/research/simulation-bridge/regional-map/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, business_problem: businessProblem, target_user: targetUser }),
      });
      const searchData = await searchRes.json();
      if (searchData.success && searchData.companies) {
        setCompanies(searchData.companies);
      }

      await new Promise(r => setTimeout(r, 2000)); // Smooth UX transition
      setWorkflowStep(2);

      // Step 2: Full simulation workflow on backend
      const flowRes = await fetch('/api/research/simulation-bridge/regional-map/run-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, business_problem: businessProblem, target_user: targetUser }),
      });
      const flowData = await flowRes.json();

      if (flowData.companies) setCompanies(flowData.companies);
      if (flowData.stakeholders) setStakeholders(flowData.stakeholders);
      setWorkflowStep(3);
      if (flowData.people) setPeople(flowData.people);
      
      await new Promise(r => setTimeout(r, 1500));
      setWorkflowStep(4);
      if (flowData.interviews) setInterviews(flowData.interviews);
      if (flowData.insights) setInsights(flowData.insights);

      await new Promise(r => setTimeout(r, 1500));
      setWorkflowStep(5);
    } catch (error) {
      console.error('Error running regional workflow:', error);
    } finally {
      setLoading(false);
    }
  };

  // Speak with Persona chat client
  const handleSendChatMessage = async () => {
    if (!userInput.trim() || !selectedPersona) return;

    const newMsg: ChatMessage = { role: 'user', content: userInput };
    setChatMessages(prev => [...prev, newMsg]);
    setUserInput('');
    setChatLoading(true);

    try {
      const response = await fetch('/api/research/simulation-bridge/regional-map/persona-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona_id: selectedPersona.id,
          message: userInput,
          chat_history: chatHistory,
          business_context: {
            business_idea: `B2B service addressing: ${businessProblem}`,
            target_customer: targetUser,
            problem: businessProblem,
            location: location
          }
        }),
      });
      const data = await response.json();

      const reply: ChatMessage = {
        role: 'persona',
        content: data.persona_response,
        cognitive_steps: data.cognitive_steps
      };

      setChatMessages(prev => [...prev, reply]);
      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: userInput },
        { role: 'assistant', content: data.persona_response }
      ]);
    } catch (error) {
      console.error('Error sending chat message:', error);
    } finally {
      setChatLoading(false);
    }
  };

  const openPersonaChat = (persona: SimulatedPerson) => {
    setSelectedPersona(persona);
    setChatMessages([
      {
        role: 'persona',
        content: `Hello, I'm ${persona.name}. As a ${persona.stakeholder_type}, I'm interested to discuss my requirements and how we might optimize these bottlenecks. What would you like to know?`,
        cognitive_steps: ['Initializing chat interface...', 'Loading persona context details...', 'Determining greeting style based on communication preferences...']
      }
    ]);
    setChatHistory([]);
  };

  return (
    <div className="space-y-8 bg-grid-paper min-h-screen p-1 relative">
      {/* Top Hero Pill Badges matching website styling */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-white border border-gray-100 text-gray-800 shadow-sm">
          <Sparkles className="h-3 w-3 text-indigo-500" /> AxWise Synthetic Market Engine
        </span>
        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-black text-white shadow-sm">
          <Globe className="h-3 w-3 text-emerald-400" /> Regional Lead Analytics
        </span>
      </div>

      {/* Main Grid: Control Panel vs Map / Stepper */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Form & Stepper */}
        <div className="space-y-6 lg:col-span-1">
          {/* Main Input Card */}
          <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
            <h2 className="text-xl font-bold tracking-tight text-gray-900">Define Market Scope</h2>
            <p className="text-xs text-gray-500">Specify geographic coordinates, local business profiles, and the pain points you are validating.</p>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Your Business Idea / Product Description
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={businessIdea}
                    onChange={(e) => setBusinessIdea(e.target.value)}
                    onBlur={handleAnalyzeIdea}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAnalyzeIdea();
                      }
                    }}
                    className="w-full pl-3 pr-24 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black bg-white/50"
                    placeholder="e.g., Automated freight dispatcher tool"
                  />
                  <button
                    type="button"
                    onClick={handleAnalyzeIdea}
                    disabled={analyzingIdea || !businessIdea.trim()}
                    className="absolute right-1.5 top-[5px] px-2.5 py-1 bg-black text-white hover:bg-gray-800 disabled:opacity-50 text-[10px] font-semibold rounded-lg flex items-center gap-1 shadow-xs transition-all"
                  >
                    {analyzingIdea ? (
                      <Loader2 className="h-3 w-3 animate-spin text-white" />
                    ) : (
                      <Sparkles className="h-3 w-3 text-amber-400" />
                    )}
                    Auto-Fill
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Target Location</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black bg-white/50"
                    placeholder="e.g., Munich"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Business Problem / Friction</label>
                <textarea
                  rows={2}
                  value={businessProblem}
                  onChange={(e) => setBusinessProblem(e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black bg-white/50"
                  placeholder="e.g., procurement speed bottlenecks"
                />
                {suggestedProblems.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {suggestedProblems.map((prob, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setBusinessProblem(prob)}
                        className={`text-[10px] px-2.5 py-0.5 rounded-full border transition-all ${
                          businessProblem === prob 
                            ? 'bg-black border-black text-white border-transparent' 
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {prob}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Target Persona Group</label>
                <input
                  type="text"
                  value={targetUser}
                  onChange={(e) => setTargetUser(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black bg-white/50"
                  placeholder="e.g., Purchasing Leads"
                />
                {suggestedTargetGroups.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {suggestedTargetGroups.map((group, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setTargetUser(group)}
                        className={`text-[10px] px-2.5 py-0.5 rounded-full border transition-all ${
                          targetUser === group 
                            ? 'bg-black border-black text-white border-transparent' 
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {group}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleRunWorkflow}
              disabled={loading || !location.trim()}
              className="w-full py-3 bg-black hover:bg-gray-900 text-white font-medium rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  Running E2E Simulation...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 text-white fill-white" />
                  Discover & Simulate
                </>
              )}
            </button>
          </div>

          {/* Stepper matching AxWise website dataset progress stepper */}
          {workflowStep > 0 && (
            <div className="bg-gray-950 text-white rounded-3xl overflow-hidden shadow-xl border border-gray-800">
              <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
                <div>
                  <h3 className="text-sm font-semibold tracking-wide uppercase text-gray-400">Workflow Progress</h3>
                  <p className="text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active Simulation
                  </p>
                </div>
                <span className="text-xs font-mono font-medium px-2 py-1 bg-gray-800 rounded border border-gray-700">
                  {workflowStep === 1 && '20%'}
                  {workflowStep === 2 && '40%'}
                  {workflowStep === 3 && '60%'}
                  {workflowStep === 4 && '80%'}
                  {workflowStep === 5 && '100%'}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1 bg-gray-800 relative">
                <div 
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-500 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                  style={{ 
                    width: `${
                      workflowStep === 1 ? 20 :
                      workflowStep === 2 ? 40 :
                      workflowStep === 3 ? 60 :
                      workflowStep === 4 ? 80 :
                      workflowStep === 5 ? 100 : 0
                    }%` 
                  }}
                />
              </div>

              <div className="p-5 space-y-4">
                {/* Step 1 */}
                <div className={`flex items-start gap-3 transition-opacity ${workflowStep >= 1 ? 'opacity-100' : 'opacity-40'}`}>
                  <div className="mt-0.5">
                    {workflowStep > 1 ? (
                      <span className="h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 text-xs">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : workflowStep === 1 ? (
                      <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
                    ) : (
                      <span className="h-5 w-5 rounded-full border border-gray-700 flex items-center justify-center text-[10px] text-gray-500 font-mono">1</span>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-100">B2B Business Discovery</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">Geolocated target search & coordinate plotting</p>
                    {companies.length > 0 && (
                      <span className="inline-block mt-1 text-[10px] px-2 py-0.5 bg-gray-850 rounded border border-gray-800 text-teal-300">
                        {companies.length} local leads located
                      </span>
                    )}
                  </div>
                </div>

                {/* Step 2 */}
                <div className={`flex items-start gap-3 transition-opacity ${workflowStep >= 2 ? 'opacity-100' : 'opacity-40'}`}>
                  <div className="mt-0.5">
                    {workflowStep > 2 ? (
                      <span className="h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 text-xs">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : workflowStep === 2 ? (
                      <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
                    ) : (
                      <span className="h-5 w-5 rounded-full border border-gray-700 flex items-center justify-center text-[10px] text-gray-500 font-mono">2</span>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-100">Stakeholder Structuring</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">Identifying target decision-makers & questionnaire validation</p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className={`flex items-start gap-3 transition-opacity ${workflowStep >= 3 ? 'opacity-100' : 'opacity-40'}`}>
                  <div className="mt-0.5">
                    {workflowStep > 3 ? (
                      <span className="h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 text-xs">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : workflowStep === 3 ? (
                      <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
                    ) : (
                      <span className="h-5 w-5 rounded-full border border-gray-700 flex items-center justify-center text-[10px] text-gray-500 font-mono">3</span>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-100">Persona Formulation</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">Generating synthetic personas with demographic constraints</p>
                    {people.length > 0 && (
                      <span className="inline-block mt-1 text-[10px] px-2 py-0.5 bg-gray-850 rounded border border-gray-800 text-teal-300">
                        {people.length} active personas formulated
                      </span>
                    )}
                  </div>
                </div>

                {/* Step 4 */}
                <div className={`flex items-start gap-3 transition-opacity ${workflowStep >= 4 ? 'opacity-100' : 'opacity-40'}`}>
                  <div className="mt-0.5">
                    {workflowStep > 4 ? (
                      <span className="h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 text-xs">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : workflowStep === 4 ? (
                      <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
                    ) : (
                      <span className="h-5 w-5 rounded-full border border-gray-700 flex items-center justify-center text-[10px] text-gray-500 font-mono">4</span>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-100">Parallel Interview Simulation</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">Conducting structured cognitive-interviews</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Columns: Map and Details tabs */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Mode Switcher */}
          <div className="flex justify-between items-center">
            <div className="inline-flex p-1 bg-white border border-gray-100 rounded-2xl shadow-sm">
              <button
                onClick={() => setActiveTab('map')}
                className={`px-4 py-2 text-xs font-medium rounded-xl transition-all ${
                  activeTab === 'map' ? 'bg-black text-white' : 'text-gray-600 hover:text-black'
                }`}
              >
                Interactive Map View
              </button>
              <button
                onClick={() => setActiveTab('insights')}
                className={`px-4 py-2 text-xs font-medium rounded-xl transition-all ${
                  activeTab === 'insights' ? 'bg-black text-white' : 'text-gray-600 hover:text-black'
                }`}
                disabled={workflowStep < 4}
              >
                Aggregated B2B Insights
              </button>
            </div>

            {activeTab === 'map' && companies.length > 0 && (
              <button
                onClick={() => setShowDensityMap(!showDensityMap)}
                className={`px-3 py-1.5 border text-xs rounded-xl flex items-center gap-1.5 font-medium transition-all ${
                  showDensityMap 
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Activity className="h-3.5 w-3.5" /> 
                {showDensityMap ? 'Hide Heat Overlay' : 'Show Pain Point Heatmap'}
              </button>
            )}
          </div>

          {/* Interactive Map View */}
          {activeTab === 'map' && (
            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm min-h-[500px] flex flex-col relative overflow-hidden">
              {companies.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
                  <div className="h-16 w-16 rounded-3xl bg-gray-50 flex items-center justify-center border border-gray-100 text-gray-400">
                    <Building2 className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">No Regional Lead Map Active</h3>
                    <p className="text-xs text-gray-500 max-w-sm mt-1">Specify a target city and B2B bottleneck, then hit Discover & Simulate to draw leads on a coordinate grid.</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col gap-8">
                  {/* Split Panel: Directory on left, Map on right */}
                  <div className="flex-1 flex flex-col lg:flex-row gap-6">
                    {/* Left panel: Company List Directory */}
                    <div className="w-full lg:w-1/3 flex flex-col space-y-3 max-h-[600px] overflow-y-auto pr-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Discovered Companies ({companies.length})</span>
                      </div>
                      {companies.map((c) => {
                        const isSelected = selectedCompany?.id === c.id;
                        return (
                          <div
                            key={c.id}
                            onClick={() => {
                              setSelectedCompany(c);
                              if (c.latitude && c.longitude) {
                                setMapCenter({ lat: c.latitude, lon: c.longitude });
                                if (mapInstanceRef.current) {
                                  mapInstanceRef.current.setView([c.latitude, c.longitude], 13);
                                }
                              }
                            }}
                            className={`p-4 rounded-2xl border text-left cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-black border-black text-white shadow-md'
                                : 'bg-gray-50/50 border-gray-100 hover:border-gray-300 text-gray-900 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <h4 className="text-xs font-bold truncate">{c.name}</h4>
                              {c.size && c.size.toLowerCase() !== 'unknown' && (
                                <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-full shrink-0 ${
                                  isSelected ? 'bg-white/20 text-white' : 'bg-gray-200/60 text-gray-700'
                                }`}>
                                  {c.size.split(' ')[0]}
                                </span>
                              )}
                            </div>
                            <p className={`text-[10px] mt-1 line-clamp-1 ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                              {c.industry}
                            </p>
                            <p className={`text-[10px] mt-0.5 font-medium ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                              📍 {c.location}
                            </p>
                            {c.website && (
                              <p className={`text-[10px] mt-0.5 truncate ${isSelected ? 'text-blue-300' : 'text-indigo-600'}`}>
                                🌐 {c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Right panel: Map + Details Card */}
                    <div className="flex-1 flex flex-col space-y-6">
                      {/* Real Leaflet Map Container */}
                      <div className="relative border border-gray-150 rounded-2xl bg-gray-50/50 min-h-[350px] overflow-hidden z-10">
                        <div 
                          ref={mapContainerRef} 
                          className="absolute inset-0 w-full h-full" 
                        />
                        
                        {!leafletLoaded && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50/90 text-center p-4 z-[999]">
                            <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-2" />
                            <p className="text-xs font-semibold text-gray-600">Loading interactive map...</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">Please check your connection or select companies from the left panel.</p>
                          </div>
                        )}

                        {/* Map Overlay info scale */}
                        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm border border-gray-150 rounded-lg px-2.5 py-1 text-[9px] font-mono text-gray-500 shadow-xs z-[1000]">
                          Center: {mapCenter.lat.toFixed(4)}°N, {mapCenter.lon.toFixed(4)}°E
                        </div>
                      </div>

                      {/* Selected Company details card */}
                      {selectedCompany && (
                        <div className="border border-gray-100 rounded-2xl p-5 bg-white shadow-xs animate-in fade-in duration-300 space-y-4">
                          {/* Header */}
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">{selectedCompany.industry}</span>
                                {selectedCompany.legal_form && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono">{selectedCompany.legal_form}</span>
                                )}
                              </div>
                              <h3 className="text-base font-bold text-gray-900 mt-0.5">{selectedCompany.name}</h3>
                              <p className="text-xs text-gray-500 mt-0.5">{selectedCompany.location} • {selectedCompany.size}</p>
                              
                              {/* Contact Links Row */}
                              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5">
                                {selectedCompany.website && (
                                  <a href={selectedCompany.website} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 font-medium">
                                    <Globe className="h-3.5 w-3.5" />
                                    {selectedCompany.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                                  </a>
                                )}
                                {selectedCompany.contact_phone && (
                                  <span className="text-xs text-gray-600 flex items-center gap-1">
                                    <Phone className="h-3.5 w-3.5 text-gray-400" />
                                    {selectedCompany.contact_phone}
                                  </span>
                                )}
                                {selectedCompany.email && (
                                  <a href={`mailto:${selectedCompany.email}`} className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 font-medium">
                                    📧 {selectedCompany.email}
                                  </a>
                                )}
                                {selectedCompany.linkedin_url && (
                                  <a href={selectedCompany.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 font-medium">
                                    <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                                  </a>
                                )}
                                {selectedCompany.xing_url && (
                                  <a href={selectedCompany.xing_url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-700 hover:text-emerald-900 hover:underline flex items-center gap-1 font-medium">
                                    <ExternalLink className="h-3.5 w-3.5" /> Xing
                                  </a>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5">
                              {selectedCompany.register_number && (
                                <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-700 font-mono rounded-full">
                                  <Shield className="h-2.5 w-2.5" /> {selectedCompany.register_number}
                                </span>
                              )}
                              {selectedCompany.register_court && (
                                <span className="text-[9px] text-gray-400 font-mono">{selectedCompany.register_court}</span>
                              )}
                            </div>
                          </div>

                          {/* Purpose */}
                          {selectedCompany.purpose && (
                            <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3 text-xs text-gray-600 italic">
                              <strong className="not-italic text-gray-700">Registered Purpose:</strong> {selectedCompany.purpose.length > 300 ? selectedCompany.purpose.slice(0, 300) + '...' : selectedCompany.purpose}
                            </div>
                          )}

                          {/* Decision Makers & Pain Points */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                            <div>
                              <h4 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Decision Makers</h4>
                              {selectedCompany.decision_maker_details && selectedCompany.decision_maker_details.length > 0 ? (
                                <ul className="mt-1.5 space-y-2">
                                  {selectedCompany.decision_maker_details.map((dm, idx) => (
                                    <li key={idx} className="text-xs text-gray-700">
                                      <div className="flex items-center gap-1.5">
                                        <Users className="h-3 w-3 text-gray-400 shrink-0" />
                                        <span className="font-semibold">{dm.name}</span>
                                      </div>
                                      <div className="ml-[18px] flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] text-gray-500">{dm.role}</span>
                                        {dm.since && <span className="text-[9px] text-gray-400">since {dm.since}</span>}
                                        {dm.type === 'natural_person' && <span className="text-[8px] px-1 py-0.5 bg-emerald-50 text-emerald-600 rounded font-semibold">VERIFIED</span>}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              ) : selectedCompany.decision_makers.length > 0 ? (
                                <ul className="mt-1.5 space-y-1">
                                  {selectedCompany.decision_makers.map((dm, idx) => (
                                    <li key={idx} className="text-xs text-gray-600 flex items-center gap-1.5">
                                      <Users className="h-3 w-3 text-gray-400" /> {dm}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1.5 text-[10px] text-gray-400 italic">No named individuals found in public sources. Run full workflow to enrich.</p>
                              )}
                            </div>
                            <div>
                              <h4 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Key Pain Points</h4>
                              <ul className="mt-1.5 space-y-1">
                                {selectedCompany.estimated_pain_points.length > 0 ? (
                                  selectedCompany.estimated_pain_points.map((pp, idx) => (
                                    <li key={idx} className="text-xs text-gray-600 flex items-start gap-1.5">
                                      <AlertCircle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" /> <span>{pp}</span>
                                    </li>
                                  ))
                                ) : (
                                  <li className="text-xs text-gray-400 italic">Searching for grounded evidence...</li>
                                )}
                              </ul>
                              {selectedCompany.pain_point_sources && selectedCompany.pain_point_sources.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-gray-50">
                                  <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Evidence Sources</span>
                                  <ul className="mt-1 space-y-0.5">
                                    {selectedCompany.pain_point_sources.map((src, idx) => {
                                      // Parse "title: https://..." format into clickable links
                                      const colonHttpIdx = src.indexOf(': http');
                                      if (colonHttpIdx > 0) {
                                        const title = src.slice(0, colonHttpIdx).trim();
                                        const url = src.slice(colonHttpIdx + 2).trim();
                                        return (
                                          <li key={idx} className="text-[10px] text-gray-500 flex items-center gap-1">
                                            <BookOpen className="h-2.5 w-2.5 text-gray-400 shrink-0" />
                                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 hover:underline truncate">
                                              {title}
                                            </a>
                                          </li>
                                        );
                                      }
                                      return (
                                        <li key={idx} className="text-[10px] text-gray-500 truncate flex items-center gap-1">
                                          <BookOpen className="h-2.5 w-2.5 text-gray-400 shrink-0" /> {src}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>

                          {selectedCompany.insights && (
                            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs text-gray-600">
                              <strong>Provenance:</strong> {selectedCompany.insights}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Formulated Personas Section inside Map View */}
                  {people.length > 0 && (
                    <div className="space-y-3 border-t border-gray-100 pt-6">
                      <div className="bg-amber-50/40 border border-amber-100/60 rounded-2xl p-4 mb-4">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-amber-600 animate-pulse" />
                          Synthetic Simulated Personas
                        </h3>
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                          Rather than using static mock profiles, our pipeline constructs <strong>dynamic simulated stakeholders</strong> representing roles found at {selectedCompany ? selectedCompany.name : 'discovered enterprises'}. While their names and backgrounds are synthetic to protect privacy, their mental models and communication habits are realistically synthesized based on <strong>grounded search directories</strong> and your target problem.
                        </p>
                      </div>
                      <p className="text-xs text-gray-500">Formulated stakeholders based on your business problem. Click to open an interactive session.</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {people.map((p) => (
                          <div 
                            key={p.id}
                            className="border border-gray-100 hover:border-black rounded-2xl p-4 bg-white hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                            onClick={() => openPersonaChat(p)}
                          >
                            <div>
                              <div className="flex justify-between items-start">
                                <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-semibold">{p.stakeholder_type}</span>
                                <span className="text-[10px] text-gray-400 font-mono">Age: {p.age}</span>
                              </div>
                              <h4 className="text-sm font-bold text-gray-900 mt-2">{p.name}</h4>
                              {p.grounding_company && (
                                <p className="text-[11px] text-indigo-700 font-semibold mt-1 flex items-center gap-1">
                                  <span>🏢</span> Simulating stakeholder at <strong className="underline decoration-indigo-200">{p.grounding_company}</strong>
                                </p>
                              )}
                              <p className="text-xs text-gray-500 line-clamp-2 mt-1.5">{p.background}</p>
                              
                              {p.grounding_sources && p.grounding_sources.length > 0 && (
                                <div className="mt-2.5 bg-gray-50/50 rounded-xl p-2.5 border border-gray-100/80">
                                  <span className="text-[9px] uppercase font-bold text-gray-400 block tracking-wider mb-1">Grounded On:</span>
                                  <ul className="space-y-1">
                                    {p.grounding_sources.map((src, sIdx) => (
                                      <li key={sIdx} className="text-[10px] text-gray-600 truncate flex items-center gap-1">
                                        <span className="h-1 w-1 rounded-full bg-indigo-400 shrink-0" />
                                        {src}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                            <div className="mt-4 flex items-center justify-between border-t border-gray-50 pt-3">
                              <span className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wide flex items-center gap-1">
                                <Activity className="h-3 w-3" /> {p.communication_style.split(',')[0]}
                              </span>
                              <button className="px-3 py-1 bg-black text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-gray-900">
                                <MessageSquare className="h-3.5 w-3.5" /> Speak
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          )}

          {/* Aggregated Insights view */}
          {activeTab === 'insights' && insights && (
            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-6 animate-in fade-in duration-300">
              <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Aggregated B2B Insights</h3>
                  <p className="text-xs text-gray-500">Consolidated findings from simulated persona interviews in {location}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500">Overall Sentiment:</span>
                  <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                    insights.overall_sentiment === 'positive' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    insights.overall_sentiment === 'negative' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                    'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {insights.overall_sentiment}
                  </span>
                </div>
              </div>

              {/* Insights metrics boxes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-gray-100 rounded-2xl p-5 space-y-3">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-rose-500" /> Potential Risks & Friction
                  </h4>
                  <ul className="space-y-2">
                    {insights.potential_risks.map((risk, idx) => (
                      <li key={idx} className="text-xs text-gray-600 flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border border-gray-100 rounded-2xl p-5 space-y-3">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
                    <ThumbsUp className="h-4 w-4 text-emerald-500" /> Core Opportunities
                  </h4>
                  <ul className="space-y-2">
                    {insights.opportunities.map((opp, idx) => (
                      <li key={idx} className="text-xs text-gray-600 flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        <span>{opp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Actionable recommendations */}
              <div className="border border-gray-100 rounded-2xl p-5 space-y-3 bg-gray-55/30">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-indigo-500" /> Strategic Recommendations
                </h4>
                <div className="space-y-3">
                  {insights.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex items-start gap-3 bg-white border border-gray-100 p-3 rounded-xl">
                      <span className="h-5 w-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-mono text-[10px] shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-xs text-gray-600 leading-relaxed">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Slide-out Persona Chat Drawer with Cognitive Console */}
      {selectedPersona && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-300">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 relative">
            
            {/* Drawer Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full font-bold uppercase">{selectedPersona.stakeholder_type}</span>
                <h3 className="text-base font-bold text-gray-900 mt-1.5">{selectedPersona.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Communication Style: {selectedPersona.communication_style}</p>
              </div>
              <button 
                onClick={() => setSelectedPersona(null)}
                className="text-gray-400 hover:text-black font-semibold text-xs border border-gray-200 px-3 py-1.5 rounded-xl bg-white hover:bg-gray-50 shadow-xs"
              >
                Close Chat
              </button>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {chatMessages.map((msg, index) => (
                <div key={index} className="space-y-3">
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-black text-white rounded-tr-none'
                        : 'bg-gray-100 text-gray-800 rounded-tl-none border border-gray-150'
                    }`}>
                      {msg.content}
                    </div>
                  </div>

                  {/* Cognitive steps console block for Assistant replies */}
                  {msg.role === 'persona' && msg.cognitive_steps && msg.cognitive_steps.length > 0 && (
                    <div className="bg-gray-950 text-white rounded-xl overflow-hidden border border-gray-800 shadow-lg mx-2">
                      <div className="px-3.5 py-2.5 border-b border-gray-800 flex justify-between items-center bg-gray-900/60">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                          <Activity className="h-3 w-3 animate-pulse" /> Cognitive Reasoning Console
                        </span>
                        <span className="text-[8px] font-mono text-gray-500">Trace #{index}</span>
                      </div>
                      <div className="p-3.5 space-y-1.5 font-mono text-[10px] text-gray-300">
                        {msg.cognitive_steps.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="text-emerald-400">{'>'}</span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-xs text-gray-500 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    <span>Persona is thinking...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="p-6 border-t border-gray-100 bg-white flex gap-3">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()}
                placeholder="Ask persona a question..."
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                disabled={chatLoading}
              />
              <button
                onClick={handleSendChatMessage}
                disabled={chatLoading || !userInput.trim()}
                className="px-4 py-2.5 bg-black hover:bg-gray-900 text-white text-xs font-semibold rounded-xl transition-all shadow-md disabled:opacity-50"
              >
                Send
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
