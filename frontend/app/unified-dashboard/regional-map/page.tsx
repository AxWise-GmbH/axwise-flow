'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, Search, Play, MessageSquare, Check, Loader2, 
  Building2, Users, Target, ChevronRight, AlertCircle, 
  ThumbsUp, Sparkles, Globe, Activity, Eye, FileText, Phone,
  ExternalLink, Linkedin, BookOpen, Shield, X
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
  pain_point_sentences?: string[];
  decision_maker_details?: Array<{ role: string; name: string; type?: string; city?: string; since?: string }>;
}

interface Stakeholder {
  id: string;
  name: string;
  description: string;
  questions: string[];
}

interface DemographicDetails {
  age_range?: string;
  income_level?: string;
  education?: string;
  location?: string;
  industry_experience?: string;
  company_size?: string;
}

interface OCEANProfile {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  occupation_code?: string;
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
  grounding_company_id?: string;
  grounding_sources?: string[];
  demographic_details?: DemographicDetails;
  physical_description?: string;
  avatar_data_url?: string;  // base64 data:image/png;base64,... from Imagen 4 Fast
  ocean_profile?: OCEANProfile;
  cognitive_grounding?: Record<string, any>;
  tool_profile?: Record<string, any>;
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
  const [dataSource, setDataSource] = useState<'hybrid' | 'registry' | 'web'>('hybrid');
  const [showGuide, setShowGuide] = useState(true);
  const [showRawEvidence, setShowRawEvidence] = useState(false);

  const getCompanySourceBadge = (c: CompanyDiscoveryItem) => {
    if (c.register_number && c.pain_point_sources && c.pain_point_sources.length > 0) {
      return { label: 'Hybrid Source', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' };
    }
    if (c.register_number) {
      return { label: 'Registry data', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' };
    }
    return { label: 'Web Scrape', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' };
  };

  // Load session context on mount to align with conversation routines
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedCurrent = localStorage.getItem('axwise_current_session');
      let currentIdea = 'B2B dispatcher scheduling software';
      if (storedCurrent) {
        const session = JSON.parse(storedCurrent);
        if (session.business_idea) {
          setBusinessIdea(session.business_idea);
          currentIdea = session.business_idea;
        }
        if (session.problem) setBusinessProblem(session.problem);
        if (session.target_customer) setTargetUser(session.target_customer);
        if (session.location) setLocation(session.location);
      }
      // Silently analyze the business idea to pre-populate suggested options beneath fields
      if (currentIdea) {
        setTimeout(() => {
          handleAnalyzeIdea(currentIdea, false);
        }, 100);
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
      contact_phone: "+49 89 4001923",
      register_number: "HRB 99182",
      register_court: "Amtsgericht München",
      legal_form: "GmbH",
      purpose: "Herstellung und Vertrieb von Spezialmaschinen für die Automobil- und Luftfahrtindustrie.",
      pain_point_sentences: [
        "Traditional order-entry via physical fax and PDF email attachments incurs a standard 5-day cycle latency. (Source: Handelsregister Purpose & Review Audit)",
        "Absence of API integrations with key metal suppliers results in daily manual phone calls to sync raw stock levels. (Source: Supply Chain Tech Scan)",
        "Works Council restrictions limit deployment of cloud-based tracking software without on-premise data localization. (Source: Kununu employee logs)"
      ],
      pain_point_sources: [
        "Amtsgericht München - Handelsregister B 99182: http://www.unternehmensregister.de",
        "Münchner Maschinenbau Procurement Guidelines: https://www.muenchner-maschinenbau.de/procurement",
        "Kununu employee reviews for Münchner Maschinenbau: https://www.kununu.com/de/muenchner-maschinenbau"
      ]
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
      contact_phone: "+49 89 9887711",
      register_number: "HRB 200450",
      register_court: "Amtsgericht München",
      legal_form: "GmbH",
      purpose: "Herstellung und Zulieferung von präzisionsmechanischen Automobilkomponenten und Getriebeteilen.",
      pain_point_sentences: [
        "Strict JIT sequences are disrupted by frequent transport scheduling mismatches between warehousing and shipping yards. (Source: Operational review)",
        "Stale EDI messages require manual administrative reconciliation, resulting in €12k in monthly error processing overhead. (Source: IT architecture audit)",
        "TISAX security requirements prevent direct API access to smaller suppliers without custom gateway adapters. (Source: Compliance standards scan)"
      ],
      pain_point_sources: [
        "Amtsgericht München - Handelsregister B 200450: http://www.unternehmensregister.de",
        "Bavarian Automotive EDI Guidelines: https://www.bavarian-automotive.com/edi",
        "TISAX Automotive Security Assessment Catalogue"
      ]
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
      contact_phone: "+49 89 2200330",
      purpose: "Erbringung von Logistik- und Lagerhaltungsdienstleistungen sowie Transportabwicklung für Online-Händler.",
      pain_point_sentences: [
        "Dispatchers spend an average of 4 hours daily manually copying route planning updates into Excel tables. (Source: Kununu dispatcher feedback)",
        "Communication with external carrier pools is highly fragmented, relying on email threads, telephone calls, and SMS. (Source: Carrier feedback review)",
        "Lack of real-time shipment updates causes loading dock workers to stand idle during delayed truck arrivals. (Source: Warehouse feedback log)"
      ],
      pain_point_sources: [
        "Isar Logistics Careers & Feedback: https://www.isar-logistics.de/careers",
        "Google Maps business review audit for Isar Logistics"
      ]
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
      stakeholder_type: "Head of Procurement",
      grounding_company: "Münchner Maschinenbau GmbH",
      grounding_company_id: "lead-1",
      grounding_sources: ["German Handelsregister entry HRB 99182", "Company Website (procurement portal)", "Industry directory profile"]
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
      stakeholder_type: "Operations Manager",
      grounding_company: "Isar Logistics & Warehousing",
      grounding_company_id: "lead-3",
      grounding_sources: ["Local commercial registry lookup Munich", "Official company contact page", "LinkedIn Operations manager listing"]
    }
  ];

  // Workflow Results
  const [companies, setCompanies] = useState<CompanyDiscoveryItem[]>(defaultMockCompanies);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'registry' | 'web'>('all');

  const filteredCompanies = companies.filter(c => {
    if (sourceFilter === 'all') return true;
    if (sourceFilter === 'registry') return !!c.register_number;
    if (sourceFilter === 'web') return !c.register_number;
    return true;
  });

  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [people, setPeople] = useState<SimulatedPerson[]>(defaultMockPersonas);
  const [interviews, setInterviews] = useState<SimulatedInterview[]>([]);
  const [insights, setInsights] = useState<SimulationInsights | null>(null);
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState<'form' | 'companies'>('companies'); // Start on companies since we have default mock companies

  useEffect(() => {
    if (selectedCompany && !filteredCompanies.some(c => c.id === selectedCompany.id)) {
      setSelectedCompany(null);
    }
  }, [sourceFilter, companies]);

  // Live Chat Drawer
  const [selectedPersona, setSelectedPersona] = useState<SimulatedPerson | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);

  // Person Profile Drawer (separate from chat drawer)
  const [activePerson, setActivePerson] = useState<SimulatedPerson | null>(null);
  const personPinsRef = useRef<any[]>([]);

  // Avatar helper: returns data URL or inline initials SVG fallback
  const getPersonAvatar = (p: SimulatedPerson): string => {
    if (p.avatar_data_url) return p.avatar_data_url;
    const initials = p.name.split(' ').slice(0, 2).map((n: string) => n[0] || '').join('').toUpperCase();
    const colors = ['4f46e5','0891b2','059669','d97706','dc2626','7c3aed','db2777'];
    const color = colors[p.name.charCodeAt(0) % colors.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="%23${color}"/><text x="32" y="39" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="22" font-weight="700" fill="white">${initials}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  // Infer org hierarchy level from role title
  const getRoleLevel = (role: string): number => {
    const r = role.toLowerCase();
    if (r.includes('inhaber') || r.includes('ceo') || r.includes('vorstand') || r.includes('president')) return 0;
    if (r.includes('geschäftsführer') || r.includes('managing director') || r.includes('geschaeftsfuehrer')) return 0;
    if (r.includes('gesellschafter') || r.includes('prokurist') || r.includes('coo') || r.includes('cfo') || r.includes('cto')) return 1;
    if (r.includes('director') || r.includes('head of') || r.includes('leiter') || r.includes('vice president') || r.includes('vp')) return 2;
    if (r.includes('manager') || r.includes('lead') || r.includes('principal')) return 3;
    return 2; // default mid-level
  };

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

    // Clear existing company markers and overlays
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (filteredCompanies.length === 0) return;

    map.setView([mapCenter.lat, mapCenter.lon], 12);

    filteredCompanies.forEach(c => {
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
  }, [filteredCompanies, selectedCompany, showDensityMap, leafletLoaded, mapCenter]);

  // --- Person Pins Layer --- rendered on top of company pins ---
  useEffect(() => {
    if (!leafletLoaded || !mapInstanceRef.current) return;
    const L = (window as any).L;
    if (!L) return;
    const map = mapInstanceRef.current;

    // Remove old person pins
    personPinsRef.current.forEach(m => m.remove());
    personPinsRef.current = [];

    if (people.length === 0) return;

    // Group personas by company for even ring distribution
    const byCompany: Record<string, SimulatedPerson[]> = {};
    people.forEach(p => {
      const cid = p.grounding_company_id || '__none__';
      if (!byCompany[cid]) byCompany[cid] = [];
      byCompany[cid].push(p);
    });

    // For each company, place personas in a ring around the company pin
    filteredCompanies.forEach(company => {
      const compPersonas = byCompany[company.id] || [];
      if (compPersonas.length === 0) return;

      compPersonas.forEach((p, idx) => {
        const total = compPersonas.length;
        const angle = (idx / total) * 2 * Math.PI - Math.PI / 2; // start from top
        const radius = 0.0018; // ~200m offset
        const lat = company.latitude + radius * Math.cos(angle);
        const lng = company.longitude + radius * Math.sin(angle);

        const avatarUrl = getPersonAvatar(p);
        const isActivePin = activePerson?.id === p.id;
        const imgStyle = p.avatar_data_url ? 'transform: scale(3.3);' : '';

        const pinHtml = `
          <div style="
            width: 40px; height: 40px; border-radius: 50%;
            border: ${isActivePin ? '3px solid #4f46e5' : '2.5px solid white'};
            box-shadow: 0 3px 12px rgba(79,70,229,${isActivePin ? '0.6' : '0.25'});
            overflow: hidden; cursor: pointer;
            background: #4f46e5;
            transition: all 0.2s ease;
            ${isActivePin ? 'transform: scale(1.15);' : ''}
          ">
            <img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;${imgStyle}" />
          </div>
        `;

        const personIcon = L.divIcon({
          html: pinHtml,
          className: 'person-map-pin',
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        const personMarker = L.marker([lat, lng], { icon: personIcon, zIndexOffset: 100 })
          .addTo(map)
          .bindTooltip(`
            <div style="font-family:sans-serif;font-size:10px;padding:4px 8px;background:white;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.1);">
              <strong style="color:#111827">${p.name}</strong><br/>
              <span style="color:#6b7280">${p.stakeholder_type} · ${company.name}</span>
            </div>
          `, { direction: 'top', offset: [0, -22], opacity: 1 });

        personMarker.on('click', () => {
          setActivePerson(p);
          setSelectedCompany(company);
        });

        personPinsRef.current.push(personMarker);
      });
    });
  }, [people, filteredCompanies, activePerson, leafletLoaded]);

  // Parse idea & auto-fill inputs
  // Parse idea & auto-fill inputs
  const handleAnalyzeIdea = async (ideaToAnalyze?: string, forceOverwrite: boolean = true) => {
    const idea = ideaToAnalyze !== undefined ? ideaToAnalyze : businessIdea;
    if (!idea.trim() || idea === lastAnalyzedIdea) return;
    setAnalyzingIdea(true);
    try {
      const res = await fetch('/api/research/simulation-bridge/regional-map/analyze-idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_idea: idea }),
      });
      const data = await res.json();
      if (data.success) {
        setLastAnalyzedIdea(idea);
        if (data.suggested_problems) {
          setSuggestedProblems(data.suggested_problems);
          if (forceOverwrite && data.suggested_problems.length > 0) {
            setBusinessProblem(data.suggested_problems[0]);
          }
        }
        if (data.suggested_target_groups) {
          setSuggestedTargetGroups(data.suggested_target_groups);
          if (forceOverwrite && data.suggested_target_groups.length > 0) {
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
  // Step 1: Discover Leads Only
  const handleDiscoverLeads = async () => {
    setLoading(true);
    setWorkflowStep(1);
    setSelectedCompany(null);
    setCompanies([]);
    setStakeholders([]);
    setPeople([]);
    setInterviews([]);
    setInsights(null);
    setSimulationId(null);
    setLeftPanelTab('form');

    try {
      const searchRes = await fetch('/api/research/simulation-bridge/regional-map/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, business_problem: businessProblem, target_user: targetUser, data_source: dataSource }),
      });
      const searchData = await searchRes.json();
      if (searchData.success && searchData.companies) {
        setCompanies(searchData.companies);
        setLeftPanelTab('companies'); // Switch to directory tab once found
      }
    } catch (error) {
      console.error('Error discovering regional leads:', error);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Run Simulation on Discovered Leads
  const handleRunSimulationOnLeads = async () => {
    if (companies.length === 0) return;
    setLoading(true);
    setWorkflowStep(2);
    setLeftPanelTab('form'); // Switch back to form tab to show stepper progress

    try {
      const flowRes = await fetch('/api/research/simulation-bridge/regional-map/run-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          location, 
          business_problem: businessProblem, 
          target_user: targetUser, 
          data_source: dataSource,
          companies: companies // Pass pre-discovered leads to bypass search
        }),
      });
      const flowData = await flowRes.json();

      if (flowData.companies) {
        setCompanies(flowData.companies);
      }
      if (flowData.stakeholders) setStakeholders(flowData.stakeholders);
      if (flowData.simulation_id) setSimulationId(flowData.simulation_id);
      
      setWorkflowStep(3);
      if (flowData.people) setPeople(flowData.people);
      
      await new Promise(r => setTimeout(r, 1500));
      setWorkflowStep(4);
      if (flowData.interviews) setInterviews(flowData.interviews);
      if (flowData.insights) setInsights(flowData.insights);

      await new Promise(r => setTimeout(r, 1500));
      setWorkflowStep(5);
      setLeftPanelTab('companies'); // Back to companies directory once simulation finishes
    } catch (error) {
      console.error('Error running simulation on leads:', error);
    } finally {
      setLoading(false);
    }
  };

  // E2E Workflow runner (runs both sequentially)
  const handleRunWorkflow = async () => {
    setLoading(true);
    setWorkflowStep(1);
    setSelectedCompany(null);
    setCompanies([]);
    setStakeholders([]);
    setPeople([]);
    setInterviews([]);
    setInsights(null);
    setSimulationId(null);
    setLeftPanelTab('form');

    try {
      // Step 1: Discovered Companies
      const searchRes = await fetch('/api/research/simulation-bridge/regional-map/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, business_problem: businessProblem, target_user: targetUser, data_source: dataSource }),
      });
      const searchData = await searchRes.json();
      let currentCompanies = [];
      if (searchData.success && searchData.companies) {
        currentCompanies = searchData.companies;
        setCompanies(currentCompanies);
      }

      await new Promise(r => setTimeout(r, 2000));
      setWorkflowStep(2);

      // Step 2: Full simulation workflow on backend
      const flowRes = await fetch('/api/research/simulation-bridge/regional-map/run-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          location, 
          business_problem: businessProblem, 
          target_user: targetUser, 
          data_source: dataSource,
          companies: currentCompanies 
        }),
      });
      const flowData = await flowRes.json();

      if (flowData.companies) {
        setCompanies(flowData.companies);
        setLeftPanelTab('companies');
      }
      if (flowData.stakeholders) setStakeholders(flowData.stakeholders);
      if (flowData.simulation_id) setSimulationId(flowData.simulation_id);
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
          simulation_id: simulationId,
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
    <div className="relative w-full h-full min-h-screen lg:min-h-0 lg:h-screen overflow-hidden bg-gray-950 text-gray-900 dark:text-gray-100 font-sans selection:bg-indigo-500/30">
      {/* 1. Full-Screen Interactive Leaflet Map Background */}
      <div className="absolute inset-0 w-full h-full z-0">
        <div 
          ref={mapContainerRef} 
          className="w-full h-full" 
        />
        
        {!leafletLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50/90 dark:bg-gray-900/90 text-center p-4 z-[999]">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 animate-pulse">Loading intelligence grid...</p>
          </div>
        )}

        {/* B2B coordinates stamp */}
        {companies.length > 0 && (
          <div className="absolute bottom-4 left-4 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border border-gray-250/20 dark:border-white/5 rounded-xl px-3 py-1.5 text-[10px] font-mono text-gray-500 dark:text-gray-405 shadow-md z-10 select-none">
            Grid Focus: {mapCenter.lat.toFixed(4)}°N, {mapCenter.lon.toFixed(4)}°E
          </div>
        )}
      </div>

      {/* 2. Glassmorphic Top Brand & Navigation Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-4 p-4 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-2xl shadow-xl transition-all duration-300">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-black dark:bg-white flex items-center justify-center text-white dark:text-black shadow-md shrink-0">
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight text-gray-900 dark:text-white leading-none">AxWise Regional Map</h1>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Synthetic Market Engine & B2B Leads</p>
            </div>
          </div>
          <div className="hidden sm:flex flex-wrap items-center gap-2 border-l border-gray-205 dark:border-gray-800 pl-4">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="h-2.5 w-2.5 text-indigo-500" /> Active Grid
            </span>
            {companies.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <Check className="h-2.5 w-2.5" /> {companies.length} Targets Plotted
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View Toggle */}
          <div className="inline-flex p-0.5 bg-gray-100 dark:bg-black/40 border border-gray-250/20 dark:border-white/5 rounded-xl shadow-inner">
            <button
              onClick={() => setActiveTab('map')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'map' 
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' 
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              Interactive Map
            </button>
            <button
              onClick={() => setActiveTab('insights')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'insights' 
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' 
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-40'
              }`}
              disabled={companies.length === 0}
              title={companies.length === 0 ? "Discover leads to unlock insights" : "View synthesized B2B recommendations"}
            >
              Aggregated Insights
            </button>
          </div>

          {activeTab === 'map' && companies.length > 0 && (
            <button
              onClick={() => setShowDensityMap(!showDensityMap)}
              className={`px-3 py-1.5 border text-xs rounded-xl flex items-center gap-1.5 font-semibold transition-all ${
                showDensityMap 
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-600 dark:text-indigo-300' 
                  : 'bg-white dark:bg-gray-800 border-gray-250/20 dark:border-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm'
              }`}
            >
              <Activity className="h-3.5 w-3.5" /> 
              {showDensityMap ? 'Hide Heat Overlay' : 'Show Pain Point Heatmap'}
            </button>
          )}
        </div>
      </div>

      {/* 3. Left Panel (Discovery Form & Progress) */}
      {leftPanelCollapsed ? (
        <button
          onClick={() => setLeftPanelCollapsed(false)}
          className="absolute left-4 top-24 z-20 h-10 w-10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-xl flex items-center justify-center shadow-lg text-gray-700 dark:text-gray-300 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all duration-200"
          title="Show Discovery Panel"
        >
          <Search className="h-5 w-5" />
        </button>
      ) : (
        <div className="absolute left-4 top-24 bottom-4 w-96 max-w-[calc(100vw-2rem)] z-10 flex flex-col bg-white/85 dark:bg-gray-900/85 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-2xl shadow-2xl overflow-hidden transition-all duration-305">
          
          {/* Left Panel Tabs Header */}
          <div className="flex border-b border-gray-200/50 dark:border-gray-800/50 bg-gray-50/50 dark:bg-gray-950/20 px-3 pt-3 justify-between items-center shrink-0">
            <div className="flex gap-1">
              <button
                onClick={() => setLeftPanelTab('form')}
                className={`px-3 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
                  leftPanelTab === 'form' 
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                    : 'border-transparent text-gray-550 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Market Scope
              </button>
              <button
                onClick={() => setLeftPanelTab('companies')}
                disabled={companies.length === 0}
                className={`px-3 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
                  leftPanelTab === 'companies' 
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                    : 'border-transparent text-gray-550 hover:text-gray-900 dark:hover:text-white disabled:opacity-30'
                }`}
              >
                Directory ({companies.length})
              </button>
            </div>
            
            <button
              onClick={() => setLeftPanelCollapsed(true)}
              className="p-1.5 text-gray-400 hover:text-gray-605 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mb-2"
              title="Hide panel"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
          </div>

          {/* Tab Content Container */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {leftPanelTab === 'form' && (
              <div className="space-y-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-sm font-bold text-gray-950 dark:text-white">Define Target Segment</h2>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Identify local targets and validate B2B bottlenecks through simulation.</p>
                  </div>
                  {!showGuide && (
                    <button 
                      onClick={() => setShowGuide(true)} 
                      className="text-[9px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                    >
                      Help Guide
                    </button>
                  )}
                </div>

                {showGuide && (
                  <div className="bg-indigo-500/10 dark:bg-indigo-500/15 border border-indigo-500/20 dark:border-indigo-500/10 rounded-xl p-4 relative animate-in fade-in duration-300">
                    <button 
                      onClick={() => setShowGuide(false)}
                      className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
                      title="Dismiss guide"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> Synthetic B2B Discovery Console
                    </h3>
                    <p className="text-[10px] text-gray-600 dark:text-gray-300 mt-1.5 leading-relaxed">
                      <strong>Primary Intent:</strong> Map real local business prospects in your region, analyze their registered business purposes, and simulate conversations with their synthetic counterparts to validate pain points.
                    </p>
                    <div className="mt-2.5 pt-2 border-t border-indigo-500/10 space-y-1 text-[9px] text-gray-500 dark:text-gray-400 list-decimal list-inside">
                      <div className="flex items-start gap-1">
                        <span className="font-bold text-indigo-500 dark:text-indigo-400 shrink-0">1.</span>
                        <span>Use <strong>Step 1</strong> to source local leads from registries and web directories.</span>
                      </div>
                      <div className="flex items-start gap-1">
                        <span className="font-bold text-indigo-500 dark:text-indigo-400 shrink-0">2.</span>
                        <span>Use <strong>Step 2</strong> to trigger synthetic stakeholder interviews and extract aggregated insights.</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* STEP 1: LEAD DISCOVERY */}
                <div className="border border-indigo-500/20 dark:border-indigo-500/10 bg-indigo-500/5 dark:bg-indigo-500/5 rounded-2xl p-4 space-y-3.5 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-indigo-500/10 pb-1.5">
                    <span className="h-5 w-5 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-[10px]">1</span>
                    <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Lead Discovery</h3>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-indigo-500" />
                      Business Idea / Product Description
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={businessIdea}
                        onChange={(e) => setBusinessIdea(e.target.value)}
                        onBlur={() => handleAnalyzeIdea()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAnalyzeIdea();
                          }
                        }}
                        className="w-full pl-3 pr-20 py-2 rounded-xl border border-gray-200 dark:border-gray-800 text-xs focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white bg-white/50 dark:bg-black/30 text-gray-900 dark:text-white placeholder:text-gray-400"
                        placeholder="e.g., Automated freight dispatcher tool"
                      />
                      <button
                        type="button"
                        onClick={() => handleAnalyzeIdea()}
                        disabled={analyzingIdea || !businessIdea.trim()}
                        className="absolute right-1 top-[4px] bottom-[4px] px-2.5 bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 text-[10px] font-bold rounded-lg flex items-center gap-1 shadow-sm transition-all"
                      >
                        {analyzingIdea ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3 text-amber-500" />
                        )}
                        Auto-Fill
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 dark:text-gray-300 mb-1">Target Location</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-450" />
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-800 text-xs focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white bg-white/50 dark:bg-black/30 text-gray-900 dark:text-white placeholder:text-gray-405"
                        placeholder="e.g., Munich"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 dark:text-gray-300 mb-1">Target Data Source</label>
                    <div className="grid grid-cols-3 gap-1 p-0.5 bg-gray-100 dark:bg-black/40 border border-gray-200/50 dark:border-white/5 rounded-xl text-center select-none shadow-inner">
                      <button
                        type="button"
                        onClick={() => setDataSource('hybrid')}
                        className={`py-1.5 text-[9px] font-bold rounded-lg transition-all ${
                          dataSource === 'hybrid'
                            ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                        }`}
                      >
                        Auto (Hybrid)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDataSource('registry')}
                        className={`py-1.5 text-[9px] font-bold rounded-lg transition-all ${
                          dataSource === 'registry'
                            ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                        }`}
                      >
                        Registry
                      </button>
                      <button
                        type="button"
                        onClick={() => setDataSource('web')}
                        className={`py-1.5 text-[9px] font-bold rounded-lg transition-all ${
                          dataSource === 'web'
                            ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                        }`}
                      >
                        Web Search
                      </button>
                    </div>
                    
                    <div className="mt-2.5 space-y-1.5 bg-gray-50/50 dark:bg-black/20 p-2.5 rounded-xl border border-gray-150 dark:border-gray-800/40">
                      <span className="text-[8px] uppercase font-bold text-gray-405 dark:text-gray-500 tracking-wider block mb-0.5">Active Search Sources Checklist:</span>
                      <div className="space-y-1 text-[9px] text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={dataSource === 'hybrid' || dataSource === 'registry'} readOnly className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500 h-3 w-3 bg-white dark:bg-gray-850" />
                          <span>Handelsregister (German Commercial Registry)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={dataSource === 'hybrid' || dataSource === 'web'} readOnly className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500 h-3 w-3 bg-white dark:bg-gray-850" />
                          <span>Google Search Grounding (Web Directory)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={dataSource === 'hybrid' || dataSource === 'web'} readOnly className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500 h-3 w-3 bg-white dark:bg-gray-850" />
                          <span>Kununu Reviews & Employee Feedback</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleDiscoverLeads}
                    disabled={loading || !location.trim()}
                    className="w-full py-2 bg-gray-900 hover:bg-gray-850 border border-gray-700/60 dark:border-white/10 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 active:scale-98"
                  >
                    {loading && workflowStep === 1 ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                        Discovering Leads...
                      </>
                    ) : (
                      <>
                        <Search className="h-3.5 w-3.5 text-indigo-400" />
                        Discover Local Leads
                      </>
                    )}
                  </button>
                </div>

                {/* STEP 2: SIMULATION & DIALOGUE */}
                <div className={`border rounded-2xl p-4 space-y-3.5 shadow-sm transition-all duration-350 ${
                  companies.length === 0
                    ? 'border-gray-200/50 dark:border-white/5 bg-gray-50/20 dark:bg-black/5 opacity-55'
                    : 'border-indigo-500/20 dark:border-indigo-500/10 bg-indigo-500/5 dark:bg-indigo-500/5'
                }`}>
                  <div className="flex items-center gap-2 border-b border-indigo-500/10 pb-1.5">
                    <span className={`h-5 w-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                      companies.length === 0 ? 'bg-gray-300 text-gray-500 dark:bg-gray-800' : 'bg-indigo-500 text-white'
                    }`}>2</span>
                    <h3 className={`text-xs font-bold uppercase tracking-wider ${
                      companies.length === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-indigo-600 dark:text-indigo-400'
                    }`}>Simulation Analysis</h3>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 dark:text-gray-300 mb-1">Business Problem / Friction</label>
                    <textarea
                      rows={2}
                      value={businessProblem}
                      onChange={(e) => setBusinessProblem(e.target.value)}
                      disabled={companies.length === 0}
                      className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 text-xs focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white bg-white/50 dark:bg-black/30 text-gray-900 dark:text-white placeholder:text-gray-405 disabled:opacity-60"
                      placeholder="e.g., procurement speed bottlenecks"
                    />
                    {suggestedProblems.length > 0 && companies.length > 0 && (
                      <div className="mt-1.5">
                        <span className="text-[8px] uppercase font-bold text-gray-400 dark:text-gray-550 block mb-1">Suggested Problems (click to apply):</span>
                        <div className="flex flex-wrap gap-1">
                          {suggestedProblems.map((prob, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setBusinessProblem(prob)}
                              className={`text-[9px] text-left px-2 py-0.5 rounded-full border transition-all ${
                                businessProblem === prob 
                                  ? 'bg-indigo-500 border-indigo-500 text-white' 
                                  : 'bg-gray-100 dark:bg-gray-800 border-gray-205 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                              }`}
                            >
                              {prob}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 dark:text-gray-300 mb-1">Target Persona Group</label>
                    <input
                      type="text"
                      value={targetUser}
                      onChange={(e) => setTargetUser(e.target.value)}
                      disabled={companies.length === 0}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-800 text-xs focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white bg-white/50 dark:bg-black/30 text-gray-900 dark:text-white placeholder:text-gray-405 disabled:opacity-60"
                      placeholder="e.g., Purchasing Leads"
                    />
                    {suggestedTargetGroups.length > 0 && companies.length > 0 && (
                      <div className="mt-1.5">
                        <span className="text-[8px] uppercase font-bold text-gray-400 dark:text-gray-555 block mb-1">Suggested Target Roles (click to apply):</span>
                        <div className="flex flex-wrap gap-1">
                          {suggestedTargetGroups.map((group, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setTargetUser(group)}
                              className={`text-[9px] text-left px-2 py-0.5 rounded-full border transition-all ${
                                targetUser === group 
                                  ? 'bg-indigo-500 border-indigo-500 text-white' 
                                  : 'bg-gray-100 dark:bg-gray-800 border-gray-205 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                              }`}
                            >
                              {group}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <button
                      onClick={handleRunSimulationOnLeads}
                      disabled={loading || companies.length === 0}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 active:scale-98"
                    >
                      {loading && workflowStep > 1 ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                          Simulating (Step {workflowStep})...
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 text-white fill-white" />
                          Run Simulation & Analysis
                        </>
                      )}
                    </button>
                    {companies.length === 0 && (
                      <p className="text-[8px] text-gray-400 text-center italic mt-1">
                        * Discover leads first to unlock simulation and dialogue options.
                      </p>
                    )}
                  </div>
                </div>

                {/* Left Panel Stepper inside the Form tab when active */}
                {workflowStep > 0 && (
                  <div className="bg-gray-950 dark:bg-black/60 text-white rounded-xl overflow-hidden shadow-xl border border-gray-850 p-4 space-y-3">
                    <div className="flex justify-between items-center border-b border-gray-900 pb-2">
                      <div>
                        <h4 className="text-[10px] font-bold tracking-wider uppercase text-gray-400">Simulation Status</h4>
                        <p className="text-[9px] text-emerald-400 flex items-center gap-1 mt-0.5">
                          <span className="h-1 w-1 rounded-full bg-emerald-450 animate-pulse" /> E2E Active Pipeline
                        </p>
                      </div>
                      <span className="text-[9px] font-mono bg-gray-900 border border-gray-800 px-1.5 py-0.5 rounded">
                        {workflowStep === 1 && '20%'}
                        {workflowStep === 2 && '40%'}
                        {workflowStep === 3 && '60%'}
                        {workflowStep === 4 && '80%'}
                        {workflowStep === 5 && '100%'}
                      </span>
                    </div>

                    <div className="w-full h-1 bg-gray-900 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500"
                        style={{ 
                          width: `${
                            workflowStep === 1 ? 20 :
                            workflowStep === 2 ? 40 :
                            workflowStep === 3 ? 60 :
                            workflowStep === 4 ? 85 :
                            workflowStep === 5 ? 100 : 0
                          }%` 
                        }}
                      />
                    </div>

                    <div className="space-y-3 pt-1">
                      {/* Step 1 */}
                      <div className={`flex items-start gap-2.5 transition-opacity ${workflowStep >= 1 ? 'opacity-100' : 'opacity-30'}`}>
                        {workflowStep > 1 ? (
                          <span className="h-4.5 w-4.5 rounded-full bg-emerald-500/20 text-emerald-405 flex items-center justify-center border border-emerald-500/30 text-[9px] shrink-0">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        ) : workflowStep === 1 ? (
                          <Loader2 className="h-4.5 w-4.5 animate-spin text-indigo-400 shrink-0" />
                        ) : (
                          <span className="h-4.5 w-4.5 rounded-full border border-gray-800 flex items-center justify-center text-[8px] text-gray-500 font-mono shrink-0">1</span>
                        )}
                        <div>
                          <h4 className="text-[10px] font-bold text-gray-200">Enterprise Discovery</h4>
                          <p className="text-[9px] text-gray-400">Querying registry & web sources</p>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className={`flex items-start gap-2.5 transition-opacity ${workflowStep >= 2 ? 'opacity-100' : 'opacity-30'}`}>
                        {workflowStep > 2 ? (
                          <span className="h-4.5 w-4.5 rounded-full bg-emerald-500/20 text-emerald-450 flex items-center justify-center border border-emerald-500/30 text-[9px] shrink-0">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        ) : workflowStep === 2 ? (
                          <Loader2 className="h-4.5 w-4.5 animate-spin text-indigo-400 shrink-0" />
                        ) : (
                          <span className="h-4.5 w-4.5 rounded-full border border-gray-800 flex items-center justify-center text-[8px] text-gray-500 font-mono shrink-0">2</span>
                        )}
                        <div>
                          <h4 className="text-[10px] font-bold text-gray-200">Stakeholder Identification</h4>
                          <p className="text-[9px] text-gray-400">Extracting verified business officers</p>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className={`flex items-start gap-2.5 transition-opacity ${workflowStep >= 3 ? 'opacity-100' : 'opacity-30'}`}>
                        {workflowStep > 3 ? (
                          <span className="h-4.5 w-4.5 rounded-full bg-emerald-500/20 text-emerald-450 flex items-center justify-center border border-emerald-500/30 text-[9px] shrink-0">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        ) : workflowStep === 3 ? (
                          <Loader2 className="h-4.5 w-4.5 animate-spin text-indigo-400 shrink-0" />
                        ) : (
                          <span className="h-4.5 w-4.5 rounded-full border border-gray-800 flex items-center justify-center text-[8px] text-gray-500 font-mono shrink-0">3</span>
                        )}
                        <div>
                          <h4 className="text-[10px] font-bold text-gray-200">Synthetic Formulation</h4>
                          <p className="text-[9px] text-gray-400">Formulating cognitive stakeholder profiles</p>
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className={`flex items-start gap-2.5 transition-opacity ${workflowStep >= 4 ? 'opacity-100' : 'opacity-30'}`}>
                        {workflowStep > 4 ? (
                          <span className="h-4.5 w-4.5 rounded-full bg-emerald-500/20 text-emerald-450 flex items-center justify-center border border-emerald-500/30 text-[9px] shrink-0">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        ) : workflowStep === 4 ? (
                          <Loader2 className="h-4.5 w-4.5 animate-spin text-indigo-400 shrink-0" />
                        ) : (
                          <span className="h-4.5 w-4.5 rounded-full border border-gray-800 flex items-center justify-center text-[8px] text-gray-500 font-mono shrink-0">4</span>
                        )}
                        <div>
                          <h4 className="text-[10px] font-bold text-gray-200">Cognitive Interviewing</h4>
                          <p className="text-[9px] text-gray-400">Conducting parallel business simulations</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {leftPanelTab === 'companies' && (
              <div className="space-y-3.5">
                <div>
                  <h2 className="text-xs font-bold text-gray-400 dark:text-gray-550 uppercase tracking-wider">
                    Discovered Targets ({filteredCompanies.length} / {companies.length})
                  </h2>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Click a company card to highlight its coordinate pin and load its detailed profile.</p>
                </div>

                {/* Source Filter Pills Toggle */}
                <div className="flex p-0.5 bg-gray-100 dark:bg-black/40 border border-gray-200/50 dark:border-white/5 rounded-xl text-center select-none shadow-inner w-full">
                  <button
                    type="button"
                    onClick={() => setSourceFilter('all')}
                    className={`flex-1 py-1 text-[9px] font-bold rounded-lg transition-all ${
                      sourceFilter === 'all'
                        ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    }`}
                  >
                    All ({companies.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceFilter('registry')}
                    className={`flex-1 py-1 text-[9px] font-bold rounded-lg transition-all ${
                      sourceFilter === 'registry'
                        ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    }`}
                  >
                    Registry ({companies.filter(c => !!c.register_number).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceFilter('web')}
                    className={`flex-1 py-1 text-[9px] font-bold rounded-lg transition-all ${
                      sourceFilter === 'web'
                        ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    }`}
                  >
                    Web Scrape ({companies.filter(c => !c.register_number).length})
                  </button>
                </div>

                {interviews.length === 0 && (
                  <div className="p-3 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/10 dark:border-indigo-500/20 rounded-xl space-y-2 select-none">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-indigo-500 dark:text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-[10px] font-bold text-gray-900 dark:text-white">Simulation Inactive</h4>
                        <p className="text-[9px] text-gray-550 dark:text-gray-400 leading-normal">
                          Stakeholder interviews are currently locked. Run a simulation to chat with company decision makers.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleRunSimulationOnLeads}
                      disabled={loading || companies.length === 0}
                      className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-bold rounded-lg text-[9px] transition-all flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin text-white" />
                          Simulating...
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3 text-white fill-white" />
                          Run Simulation Analysis
                        </>
                      )}
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {filteredCompanies.map((c) => {
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
                        className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-indigo-600 dark:bg-indigo-500 border-indigo-600 text-white shadow-md'
                            : 'bg-white/40 dark:bg-white/5 border-gray-255 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/10 hover:bg-white/60 dark:hover:bg-white/10 text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="text-xs font-bold truncate">{c.name}</h4>
                          <div className="flex gap-1 shrink-0">
                            {c.size && c.size.toLowerCase() !== 'unknown' && (
                              <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-full ${
                                isSelected ? 'bg-white/20 text-white' : 'bg-gray-150 dark:bg-gray-800 text-gray-600 dark:text-gray-350'
                              }`}>
                                {c.size.split(' ')[0]}
                              </span>
                            )}
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                              isSelected ? 'bg-white/20 text-white border-transparent' : getCompanySourceBadge(c).color
                            }`}>
                              {getCompanySourceBadge(c).label}
                            </span>
                          </div>
                        </div>
                        <p className={`text-[10px] mt-1 line-clamp-1 ${isSelected ? 'text-indigo-100' : 'text-gray-500 dark:text-gray-405'}`}>
                          {c.industry}
                        </p>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10 text-[9px] font-medium opacity-80">
                          <span>📍 {c.location}</span>
                          {c.website && (
                            <span className="truncate max-w-[120px] text-right">
                              🌐 {c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Right Panel (Selected Company & Stakeholder Actions) */}
      {activeTab === 'map' && selectedCompany && (
        <div className="absolute right-4 top-24 bottom-4 w-96 max-w-[calc(100vw-2rem)] z-10 flex flex-col bg-white/85 dark:bg-gray-900/85 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 animate-in slide-in-from-right">
          {/* Header */}
          <div className="p-5 border-b border-gray-250/20 dark:border-white/5 bg-gray-50/50 dark:bg-gray-950/20 flex justify-between items-start shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] uppercase font-bold text-indigo-500 tracking-wider">{selectedCompany.industry}</span>
                {selectedCompany.legal_form && (
                  <span className="text-[8px] px-1 py-0.2 bg-gray-150 dark:bg-gray-800 text-gray-550 dark:text-gray-400 rounded font-mono">{selectedCompany.legal_form}</span>
                )}
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${getCompanySourceBadge(selectedCompany).color}`}>
                  {getCompanySourceBadge(selectedCompany).label}
                </span>
              </div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mt-1 truncate">{selectedCompany.name}</h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{selectedCompany.location} • {selectedCompany.size}</p>
            </div>
            <button 
              onClick={() => setSelectedCompany(null)}
              className="text-gray-450 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Deselect Company"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Details Scroll Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            
            {/* Contact Details Grid */}
            <div className="grid grid-cols-2 gap-2 text-[10px] border-b border-gray-100 dark:border-gray-800/50 pb-3">
              {selectedCompany.website && (
                <a href={selectedCompany.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 truncate font-semibold">
                  <Globe className="h-3.5 w-3.5 text-indigo-500" /> Website
                </a>
              )}
              {selectedCompany.contact_phone && (
                <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1 truncate">
                  <Phone className="h-3 w-3 text-gray-400 shrink-0" />
                  {selectedCompany.contact_phone}
                </span>
              )}
              {selectedCompany.email && (
                <a href={`mailto:${selectedCompany.email}`} className="text-indigo-650 dark:text-indigo-400 hover:underline flex items-center gap-1 truncate font-semibold">
                  <span>📧</span> Email
                </a>
              )}
              {selectedCompany.linkedin_url && (
                <a href={selectedCompany.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 truncate font-semibold">
                  <Linkedin className="h-3 w-3 shrink-0" />
                  LinkedIn
                </a>
              )}
            </div>

            {/* Registered Purpose */}
            {selectedCompany.purpose && (
              <div className="bg-gray-50/50 dark:bg-black/30 border border-gray-200/50 dark:border-white/5 rounded-xl p-3 text-[11px] text-gray-600 dark:text-gray-400 italic">
                <strong className="not-italic text-gray-700 dark:text-gray-300 block mb-0.5">Commercial Purpose:</strong> 
                {selectedCompany.purpose.length > 200 ? selectedCompany.purpose.slice(0, 200) + '...' : selectedCompany.purpose}
              </div>
            )}

            {/* Pain Points */}
            <div className="space-y-2">
              <div className="flex justify-between items-center mb-1">
                <h4 className="text-[10px] font-bold text-gray-550 dark:text-gray-405 uppercase tracking-wide">Key Friction Areas</h4>
                {selectedCompany.pain_point_sentences && selectedCompany.pain_point_sentences.length > 0 && (
                  <div className="inline-flex p-0.5 bg-gray-100 dark:bg-black/40 border border-gray-205 dark:border-white/5 rounded-lg select-none">
                    <button
                      onClick={() => setShowRawEvidence(false)}
                      className={`px-2 py-0.5 text-[8px] font-bold rounded transition-all ${
                        !showRawEvidence 
                          ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs' 
                          : 'text-gray-500 dark:text-gray-405'
                      }`}
                    >
                      Summary
                    </button>
                    <button
                      onClick={() => setShowRawEvidence(true)}
                      className={`px-2 py-0.5 text-[8px] font-bold rounded transition-all ${
                        showRawEvidence 
                          ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs' 
                          : 'text-gray-500 dark:text-gray-405'
                      }`}
                    >
                      Evidence Quotes
                    </button>
                  </div>
                )}
              </div>
              <ul className="space-y-1.5">
                {selectedCompany.estimated_pain_points.length > 0 ? (
                  showRawEvidence && selectedCompany.pain_point_sentences && selectedCompany.pain_point_sentences.length > 0 ? (
                    selectedCompany.pain_point_sentences.map((sentence, idx) => (
                      <li key={idx} className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-2 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/10 dark:border-indigo-500/20 p-2.5 rounded-xl font-sans italic leading-relaxed">
                        <span className="text-indigo-500 shrink-0 text-sm font-serif">“</span>
                        <span>{sentence}</span>
                      </li>
                    ))
                  ) : (
                    selectedCompany.estimated_pain_points.map((pp, idx) => (
                      <li key={idx} className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-2 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 dark:border-amber-500/20 p-2.5 rounded-xl">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" /> 
                        <span>{pp}</span>
                      </li>
                    ))
                  )
                ) : (
                  <li className="text-xs text-gray-400 italic">Searching pain point evidence...</li>
                )}
              </ul>
            </div>

            {/* Evidence Sources */}
            {selectedCompany.pain_point_sources && selectedCompany.pain_point_sources.length > 0 && (
              <div className="space-y-1.5 bg-gray-50/50 dark:bg-black/20 p-3 rounded-xl border border-gray-150 dark:border-gray-800/40">
                <span className="text-[9px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wider">Grounding Sources</span>
                <ul className="space-y-1.5">
                  {selectedCompany.pain_point_sources.map((src, idx) => {
                    const colonHttpIdx = src.indexOf(': http');
                    if (colonHttpIdx > 0) {
                      const title = src.slice(0, colonHttpIdx).trim();
                      const url = src.slice(colonHttpIdx + 2).trim();
                      return (
                        <li key={idx} className="text-[10px] flex items-center gap-1.5">
                          <BookOpen className="h-3 w-3 text-indigo-400 shrink-0" />
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline truncate">
                            {title}
                          </a>
                        </li>
                      );
                    }
                    return (
                      <li key={idx} className="text-[10px] text-gray-600 dark:text-gray-405 truncate flex items-center gap-1.5">
                        <BookOpen className="h-3 w-3 text-gray-400 shrink-0" /> {src}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Org Chart — Decision Makers + Linked Personas */}
            <div className="border-t border-gray-250/20 dark:border-white/5 pt-4 mt-2">
              <h4 className="text-[10px] font-bold text-gray-550 dark:text-gray-405 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                <Users className="h-3.5 w-3.5 text-indigo-500" /> Company Structure
              </h4>

              {/* Real decision makers from registry as org tree */}
              {selectedCompany.decision_maker_details && selectedCompany.decision_maker_details.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {[...selectedCompany.decision_maker_details]
                    .sort((a, b) => getRoleLevel(a.role) - getRoleLevel(b.role))
                    .map((dm, dmIdx) => {
                      const level = getRoleLevel(dm.role);
                      // Find all personas for this company
                      const companyPersonas = people.filter(p => p.grounding_company_id === selectedCompany.id);
                      // Match personas to this decision maker by name overlap
                      const matchedPersonas = companyPersonas.filter(p => {
                        const pName = p.name.toLowerCase();
                        const dmName = dm.name.toLowerCase();
                        return pName.includes(dmName) || dmName.includes(pName);
                      });
                      // If first node, also append any personas that don't match any DM name
                      const unmatchedPersonas = dmIdx === 0 ? companyPersonas.filter(p => {
                        return !selectedCompany.decision_maker_details!.some(otherDm => {
                          const pName = p.name.toLowerCase();
                          const oName = otherDm.name.toLowerCase();
                          return pName.includes(oName) || oName.includes(pName);
                        });
                      }) : [];
                      const assignedPersonas = [...matchedPersonas, ...unmatchedPersonas];

                      return (
                        <div key={dmIdx} style={{ marginLeft: `${level * 12}px` }}>
                          <div className="flex items-start gap-2.5 bg-white/50 dark:bg-black/20 border border-gray-200/60 dark:border-white/5 rounded-xl p-2.5">
                            <div className="h-7 w-7 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0">
                              <span className="text-[10px]">👤</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded font-bold uppercase tracking-wide">{dm.role}</span>
                                {dm.since && <span className="text-[8px] text-gray-400 font-mono">Since {dm.since.slice(0, 7)}</span>}
                              </div>
                              <p className="text-xs font-semibold text-gray-900 dark:text-white mt-0.5">{dm.name}</p>
                              {dm.city && <p className="text-[9px] text-gray-500 dark:text-gray-400">📍 {dm.city}</p>}
                            </div>
                          </div>

                          {/* Linked synthetic personas under first DM */}
                          {assignedPersonas.length > 0 && (
                            <div className="ml-5 mt-1.5 space-y-1.5">
                              {assignedPersonas.map((p) => (
                                <div
                                  key={p.id}
                                  className="flex items-center gap-2 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/10 dark:border-indigo-500/20 rounded-xl p-2 group cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all"
                                  onClick={() => setActivePerson(p)}
                                >
                                  <div className="h-7 w-7 rounded-full overflow-hidden shrink-0 border-2 border-indigo-300/30 dark:border-indigo-500/30">
                                    <img
                                      src={getPersonAvatar(p)}
                                      alt={p.name}
                                      className="w-full h-full object-cover"
                                      style={p.avatar_data_url ? { transform: 'scale(3.3)' } : undefined}
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[8px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1 py-0.2 rounded font-bold">🤖 Synthetic</span>
                                    </div>
                                    <p className="text-[10px] font-semibold text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                                    <p className="text-[9px] text-indigo-600 dark:text-indigo-400 truncate">{p.stakeholder_type}</p>
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setActivePerson(p); }}
                                      className="px-2 py-1 text-[8px] font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-lg hover:bg-indigo-500 hover:text-white transition-colors"
                                      title="View profile"
                                    >Profile</button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); openPersonaChat(p); }}
                                      className="px-2 py-1 text-[8px] font-bold bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-indigo-600 dark:hover:bg-indigo-500 hover:text-white transition-colors"
                                      title="Start conversation"
                                    >Talk →</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                /* Fallback: flat persona list when no decision_maker_details available */
                people.length > 0 && (() => {
                  const companyPersonas = people.filter(p =>
                    p.grounding_company_id && selectedCompany &&
                    p.grounding_company_id === selectedCompany.id
                  );
                  if (companyPersonas.length === 0) return (
                    <p className="text-[10px] text-gray-400 italic bg-gray-50 dark:bg-black/30 p-3 rounded-xl text-center">
                      No synthetic personas for this company. Run a full E2E workflow.
                    </p>
                  );
                  return (
                    <div className="space-y-2">
                      {companyPersonas.map((p) => (
                        <div
                          key={p.id}
                          className="border border-gray-200/60 dark:border-white/5 rounded-xl p-3 bg-white/40 dark:bg-black/20 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-all flex flex-col justify-between gap-3 group"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-full overflow-hidden shrink-0 border-2 border-white dark:border-gray-700 shadow-sm">
                              <img
                                src={getPersonAvatar(p)}
                                alt={p.name}
                                className="w-full h-full object-cover"
                                style={p.avatar_data_url ? { transform: 'scale(3.3)' } : undefined}
                              />
                            </div>
                            <div className="min-w-0">
                              <span className="text-[9px] px-1.5 py-0.2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-full font-bold uppercase">{p.stakeholder_type}</span>
                              <p className="text-xs font-bold text-gray-900 dark:text-white mt-0.5">{p.name}</p>
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            <button onClick={() => setActivePerson(p)} className="flex-1 py-1.5 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors">Profile</button>
                            <button onClick={() => openPersonaChat(p)} className="flex-1 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-bold flex items-center justify-center gap-1 group-hover:bg-indigo-600 dark:group-hover:bg-indigo-500 group-hover:text-white transition-all"><MessageSquare className="h-3 w-3" /> Talk</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}

              {/* Show persona count prompt when no simulation run yet */}
              {people.filter(p => p.grounding_company_id === selectedCompany.id).length === 0 && (
                !selectedCompany.decision_maker_details || selectedCompany.decision_maker_details.length === 0
              ) && (
                <p className="text-[10px] text-gray-400 italic bg-gray-50 dark:bg-black/30 p-3 rounded-xl text-center">
                  Formulate synthetic stakeholders by running E2E simulation.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Person Profile Drawer ===== */}
      {activePerson && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) setActivePerson(null); }}>
          <div className="w-full max-w-sm bg-white/98 dark:bg-gray-900/98 backdrop-blur-xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-white/20 dark:border-white/5">
            {/* Header */}
            <div className="p-5 border-b border-gray-200/50 dark:border-gray-800/50 flex gap-4 items-start bg-gray-50/50 dark:bg-gray-950/20 shrink-0">
              <div className="relative shrink-0">
                <div className="h-16 w-16 rounded-2xl overflow-hidden border-2 border-white dark:border-gray-700 shadow-lg">
                  <img
                    src={getPersonAvatar(activePerson)}
                    alt={activePerson.name}
                    className="w-full h-full object-cover"
                    style={activePerson.avatar_data_url ? { transform: 'scale(3.3)' } : undefined}
                  />
                </div>
                <span className="absolute -bottom-1 -right-1 text-[9px] bg-indigo-500 text-white px-1 py-0.5 rounded-full font-bold">AI</span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[9px] px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-full font-bold uppercase">{activePerson.stakeholder_type}</span>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mt-1 truncate">{activePerson.name}</h3>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Age {activePerson.age} · {activePerson.communication_style}</p>
                {activePerson.grounding_company && (
                  <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5 truncate">🏢 {activePerson.grounding_company}</p>
                )}
              </div>
              <button
                onClick={() => setActivePerson(null)}
                className="text-gray-500 hover:text-black dark:hover:text-white border border-gray-200 dark:border-gray-800 p-1.5 rounded-xl bg-white dark:bg-gray-800 transition-colors shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">

              {/* Background */}
              <div className="bg-gray-50/60 dark:bg-black/20 border border-gray-100 dark:border-gray-800/40 rounded-xl p-3">
                <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider mb-1">Background</p>
                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{activePerson.background}</p>
              </div>

              {/* Motivations */}
              {activePerson.motivations && activePerson.motivations.length > 0 && (
                <div>
                  <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider mb-1.5">🎯 Motivations</p>
                  <ul className="space-y-1">
                    {activePerson.motivations.map((m, i) => (
                      <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2">
                        <span className="text-emerald-500 shrink-0 font-bold">+</span>{m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pain Points */}
              {activePerson.pain_points && activePerson.pain_points.length > 0 && (
                <div>
                  <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider mb-1.5">⚡ Pain Points</p>
                  <ul className="space-y-1">
                    {activePerson.pain_points.map((pp, i) => (
                      <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-2 bg-amber-500/5 border border-amber-500/10 rounded-lg p-2">
                        <AlertCircle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />{pp}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Demographics */}
              {activePerson.demographic_details && (
                <div className="bg-gray-50/60 dark:bg-black/20 border border-gray-100 dark:border-gray-800/40 rounded-xl p-3 space-y-1.5">
                  <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">📋 Demographics</p>
                  {activePerson.demographic_details.industry_experience && (
                    <p className="text-[10px] text-gray-600 dark:text-gray-400"><span className="font-semibold text-gray-700 dark:text-gray-300">Experience:</span> {activePerson.demographic_details.industry_experience}</p>
                  )}
                  {activePerson.demographic_details.education && (
                    <p className="text-[10px] text-gray-600 dark:text-gray-400"><span className="font-semibold text-gray-700 dark:text-gray-300">Education:</span> {activePerson.demographic_details.education}</p>
                  )}
                  {activePerson.demographic_details.location && (
                    <p className="text-[10px] text-gray-600 dark:text-gray-400"><span className="font-semibold text-gray-700 dark:text-gray-300">Location:</span> {activePerson.demographic_details.location}</p>
                  )}
                  {activePerson.demographic_details.company_size && (
                    <p className="text-[10px] text-gray-600 dark:text-gray-400"><span className="font-semibold text-gray-700 dark:text-gray-300">Company size:</span> {activePerson.demographic_details.company_size}</p>
                  )}
                </div>
              )}

              {/* Grounding Sources */}
              {activePerson.grounding_sources && activePerson.grounding_sources.length > 0 && (
                <div>
                  <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider mb-1.5">🔗 Grounding Sources</p>
                  <ul className="space-y-1">
                    {activePerson.grounding_sources.map((src, i) => (
                      <li key={i} className="text-[10px] text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                        <BookOpen className="h-3 w-3 text-indigo-400 shrink-0" />
                        <span className="truncate">{src}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Interview Transcript */}
              {interviews.length > 0 && (() => {
                const personInterview = interviews.find(i => i.person_id === activePerson.id);
                if (!personInterview || personInterview.responses.length === 0) return null;
                return (
                  <div>
                    <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider mb-2">
                      🗣 Interview Transcript
                      <span className="ml-1 font-mono normal-case text-gray-300">~{personInterview.interview_duration_minutes}min · {personInterview.overall_sentiment}</span>
                    </p>
                    <div className="space-y-2">
                      {personInterview.responses.map((r, ri) => (
                        <div key={ri} className="bg-gray-50/60 dark:bg-black/20 border border-gray-100 dark:border-gray-800/40 rounded-xl p-3 space-y-1.5">
                          <p className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">{r.question}</p>
                          <p className="text-[10px] text-gray-600 dark:text-gray-400 leading-relaxed italic">"{r.response}"</p>
                          {r.key_insights && r.key_insights.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {r.key_insights.map((ki, ki_idx) => (
                                <span key={ki_idx} className="text-[8px] bg-indigo-500/8 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full border border-indigo-500/10">{ki}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* CTA Footer */}
            <div className="p-5 border-t border-gray-200/50 dark:border-gray-800/50 bg-white/50 dark:bg-gray-900/50 flex gap-2 shrink-0">
              <button
                onClick={() => { setActivePerson(null); openPersonaChat(activePerson); }}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all"
              >
                <MessageSquare className="h-4 w-4" />
                Start Conversation with {activePerson.name.split(' ')[0]}
              </button>
              <button
                onClick={() => setActivePerson(null)}
                className="px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      {/* 5. Aggregated Insights Full-Screen Overlay panel */}
      {activeTab === 'insights' && (
        <div className="absolute left-4 right-4 top-24 bottom-4 z-10 flex flex-col bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 animate-in fade-in">
          {interviews.length === 0 || !insights ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto space-y-6">
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500/25 blur-xl rounded-full animate-pulse" />
                <div className="relative h-16 w-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-500">
                  <Activity className="h-8 w-8 animate-pulse" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Simulated B2B Market Analysis</h3>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider">Stakeholder dialogue is currently inactive</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  AxWise has discovered <span className="font-bold text-gray-900 dark:text-white">{companies.length} targets</span> in {location}. Run a fully fledged simulation to generate cognitive stakeholder personas, conduct parallel AI diagnostic interviews, and extract aggregated strategic insights.
                </p>
              </div>

              <button
                onClick={handleRunSimulationOnLeads}
                disabled={loading || companies.length === 0}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 active:scale-98"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    Running Simulation (Step {workflowStep})...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 text-white fill-white" />
                    Launch Simulation Analysis
                  </>
                )}
              </button>

              <button 
                onClick={() => setActiveTab('map')}
                className="text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white font-semibold hover:underline"
              >
                Back to Map
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-5 border-b border-gray-250/20 dark:border-white/5 bg-gray-50/50 dark:bg-gray-950/20 flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-base font-bold text-gray-950 dark:text-white flex items-center gap-2">
                    <Target className="h-5 w-5 text-indigo-500" />
                    Aggregated B2B Market Insights
                  </h2>
                  <p className="text-[11px] text-gray-500 dark:text-gray-450 mt-0.5">Consolidated analytical outputs from simulated stakeholder dialogue in {location}.</p>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-black/40 border border-gray-200 dark:border-white/5 px-3 py-1 rounded-xl shadow-inner text-xs">
                    <span className="font-semibold text-gray-500">Grid Sentiment:</span>
                    <span className={`inline-flex items-center gap-1 font-bold uppercase text-[10px] px-1.5 py-0.5 rounded ${
                      insights.overall_sentiment === 'positive' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                      insights.overall_sentiment === 'negative' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' :
                      'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}>
                      {insights.overall_sentiment}
                    </span>
                  </div>

                  <button 
                    onClick={() => setActiveTab('map')}
                    className="text-xs bg-white dark:bg-gray-800 border border-gray-250/20 dark:border-white/5 px-3 py-1.5 rounded-xl font-bold shadow-sm text-gray-700 dark:text-gray-300 hover:bg-gray-55 dark:hover:bg-gray-700"
                  >
                    Back to Map
                  </button>
                </div>
              </div>

              {/* Insights Scroll Container */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Risks Column */}
                  <div className="bg-white/40 dark:bg-white/5 border border-gray-150 dark:border-white/5 rounded-2xl p-5 space-y-4">
                    <h3 className="text-xs font-bold text-gray-855 dark:text-gray-350 uppercase tracking-wide flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
                      <AlertCircle className="h-4.5 w-4.5 text-rose-500" /> Potential Barriers & Operational Risks
                    </h3>
                    <ul className="space-y-3">
                      {insights.potential_risks.map((risk, idx) => (
                        <li key={idx} className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-2.5 bg-rose-500/5 p-3 rounded-xl border border-rose-500/10">
                          <span className="h-4 w-4 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold text-[9px] shrink-0">!</span>
                          <span className="leading-relaxed">{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Opportunities Column */}
                  <div className="bg-white/40 dark:bg-white/5 border border-gray-150 dark:border-white/5 rounded-2xl p-5 space-y-4">
                    <h3 className="text-xs font-bold text-gray-855 dark:text-gray-350 uppercase tracking-wide flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
                      <ThumbsUp className="h-4.5 w-4.5 text-emerald-500" /> Core Integration Opportunities
                    </h3>
                    <ul className="space-y-3">
                      {insights.opportunities.map((opp, idx) => (
                        <li key={idx} className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-2.5 bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/10">
                          <span className="h-4 w-4 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-[9px] shrink-0">✓</span>
                          <span className="leading-relaxed">{opp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                </div>

                {/* Strategic Action Items */}
                <div className="bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/10 dark:border-indigo-500/20 rounded-2xl p-5 space-y-4">
                  <h3 className="text-xs font-bold text-gray-800 dark:text-gray-305 uppercase tracking-wide flex items-center gap-2 border-b border-indigo-500/10 pb-2">
                    <Target className="h-4.5 w-4.5 text-indigo-500 dark:text-indigo-400" /> Actionable Strategic Recommendations
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {insights.recommendations.map((rec, idx) => (
                      <div key={idx} className="flex items-start gap-3 bg-white/80 dark:bg-black/40 border border-gray-150 dark:border-white/5 p-3.5 rounded-xl shadow-xs">
                        <span className="h-6 w-6 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-mono text-xs font-bold shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <p className="text-xs text-gray-650 dark:text-gray-300 leading-relaxed">{rec}</p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </>
          )}
        </div>
      )}

      {/* 6. Compact Bottom Insights Summary Strip */}
      {activeTab === 'map' && companies.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 px-4 py-2.5 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-full shadow-lg text-xs select-none animate-in fade-in slide-in-from-bottom-2 duration-300">
          {interviews.length > 0 && insights ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-gray-700 dark:text-gray-300">Insights Ready:</span>
              </div>
              <div className="flex items-center gap-3 border-l border-gray-200 dark:border-gray-800 pl-3">
                <span className="text-gray-500 dark:text-gray-400">
                  ⚠️ {insights.potential_risks.length} Risks
                </span>
                <span className="text-gray-550 dark:text-gray-400">
                  💡 {insights.opportunities.length} Opportunities
                </span>
                <button
                  onClick={() => setActiveTab('insights')}
                  className="text-indigo-650 dark:text-indigo-400 font-bold hover:underline"
                >
                  Analyze Report →
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="font-semibold text-gray-700 dark:text-gray-300">Ready to Analyze:</span>
              </div>
              <div className="flex items-center gap-3 border-l border-gray-200 dark:border-gray-800 pl-3">
                <span className="text-gray-500 dark:text-gray-400 font-medium">
                  {companies.length} targets discovered in {location}
                </span>
                <button
                  onClick={() => setActiveTab('insights')}
                  className="text-indigo-650 dark:text-indigo-400 font-bold hover:underline"
                >
                  Run Simulation Analysis →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Slide-out Persona Chat Drawer with Cognitive Console */}
      {selectedPersona && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 relative border-l border-white/20 dark:border-white/5">
            
            {/* Drawer Header */}
            <div className="p-6 border-b border-gray-200/50 dark:border-gray-800/50 flex justify-between items-center bg-gray-50/50 dark:bg-gray-950/20 shrink-0">
              <div>
                <span className="text-[10px] px-2 py-0.5 bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 rounded-full font-bold uppercase">{selectedPersona.stakeholder_type}</span>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mt-1.5">{selectedPersona.name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Communication Style: {selectedPersona.communication_style}</p>
              </div>
              <button 
                onClick={() => setSelectedPersona(null)}
                className="text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white font-bold text-xs border border-gray-200 dark:border-gray-850 px-3 py-1.5 rounded-xl bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-colors"
              >
                Close Chat
              </button>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              <div className="bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/10 dark:border-indigo-500/20 rounded-xl p-3 text-[11px] text-gray-600 dark:text-gray-400">
                <span className="font-bold text-indigo-600 dark:text-indigo-400">Context:</span> You are talking with a simulated stakeholder at <strong className="underline">{selectedPersona.grounding_company}</strong>. Their background, motivations and answers are synthesized based on search directories and commercial records.
              </div>

              {chatMessages.map((msg, index) => (
                <div key={index} className="space-y-3">
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-500/10'
                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-none border border-gray-150 dark:border-gray-800'
                    }`}>
                      {msg.content}
                    </div>
                  </div>

                  {/* Cognitive steps console block for Assistant replies */}
                  {msg.role === 'persona' && msg.cognitive_steps && msg.cognitive_steps.length > 0 && (
                    <div className="bg-gray-950 dark:bg-black/80 text-white rounded-xl overflow-hidden border border-gray-800 dark:border-gray-850 shadow-lg mx-2">
                      <div className="px-3.5 py-2 border-b border-gray-800 dark:border-gray-850 flex justify-between items-center bg-gray-900/60 dark:bg-black/60">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                          <Activity className="h-3 w-3 animate-pulse" /> Cognitive Reasoning Trace
                        </span>
                        <span className="text-[8px] font-mono text-gray-500">Trace #{index}</span>
                      </div>
                      <div className="p-3.5 space-y-1.5 font-mono text-[9px] text-gray-300">
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
                  <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                    <span>Analyzing message context & generating character reply...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="p-6 border-t border-gray-250/20 dark:border-white/5 bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl flex gap-3 shrink-0">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()}
                placeholder={`Ask ${selectedPersona.name.split(' ')[0] || 'persona'} a question...`}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-800 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white/50 dark:bg-black/30 text-gray-900 dark:text-white"
                disabled={chatLoading}
              />
              <button
                onClick={handleSendChatMessage}
                disabled={chatLoading || !userInput.trim()}
                className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-xs font-bold rounded-xl transition-all shadow-md disabled:opacity-50"
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
