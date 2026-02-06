'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, RefreshCw, UserCircle2, Camera, Quote as QuoteIcon, Utensils, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

// Types matching the backend API
interface Persona {
    id: string;
    name: string;
    title?: string;
    archetype?: string;
    quote?: string;
    avatar_data_uri?: string;
    food_images?: { [key: string]: string };
    city_profile?: any; // Replace with proper type structure if needed
    berlin_profile?: any;
    structured_demographics?: any;
}

interface AnalysisResultItem {
    result_id: number;
    label: string;
    filename?: string;
    personas: { id: string; name: string }[];
}

export default function PerpetualPersonasPage() {
    const [results, setResults] = useState<AnalysisResultItem[]>([]);
    const [selectedResultId, setSelectedResultId] = useState<string>('');
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [loading, setLoading] = useState(false);
    const [useBackend, setUseBackend] = useState(false);
    const [token, setToken] = useState('dev_test_token_testuser123');
    const [baseUrl, setBaseUrl] = useState('http://localhost:8000');
    const [city, setCity] = useState('Berlin');
    const [viewImage, setViewImage] = useState<string | null>(null);

    const { toast } = useToast();

    useEffect(() => {
        // Initial load of available results if backend is enabled
        if (useBackend) {
            loadResults();
        }
    }, [useBackend, baseUrl, token]);

    const loadResults = async () => {
        try {
            const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/personas/results`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.items) {
                setResults(data.items);
            }
        } catch (err) {
            console.error('Failed to load results', err);
            toast({
                title: "Error loading results",
                description: "Could not fetch analysis results from backend.",
                variant: "destructive"
            });
        }
    };

    const loadPersonas = async (resultId: string) => {
        if (!resultId) return;
        setLoading(true);
        setSelectedResultId(resultId);
        try {
            // In a real app we might fetch full details, but here we reuse the list endpoint or fetch individually
            // For the prototype, we assume the list endpoint gave us enough or we fetch fresh
            // Since the list endpoint gives a preview, let's use that for now and hydrate more if needed
            // Actually the prototype calls the same endpoint and finds the item. 
            // Let's maximize reusability of the prototype logic:
            const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/personas/results`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const analysis = data.items?.find((i: any) => String(i.result_id) === resultId);

            if (analysis) {
                try {
                    const detailRes = await fetch(`${baseUrl.replace(/\/$/, '')}/api/analysis/${resultId}`, { // Correct endpoint for full result
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (detailRes.ok) {
                        const detailData = await detailRes.json();
                        // backend returns DetailedAnalysisResult, which has `personas` as a list
                        setPersonas(detailData.personas || []);
                    } else {
                        // Fallback to preview if detail fails
                        setPersonas(analysis.personas.map((p: any, i: number) => ({ ...p, id: p.id || String(i) })));
                    }
                } catch (e) {
                    setPersonas(analysis.personas.map((p: any, i: number) => ({ ...p, id: p.id || String(i) })));
                }
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Error", description: "Failed to load personas", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    // Mock data for static mode
    const mockPersonas: Persona[] = [
        { id: 'sarah', name: 'Sarah Chen', title: 'VP Strategy • Enterprise' },
        { id: 'dmitri', name: 'Dmitri Volkov', title: 'CTO • Mid-market' },
        { id: 'amira', name: 'Amira Hassan', title: 'Head of Procurement • Enterprise' }
    ];

    const displayPersonas = useBackend && selectedResultId ? personas : mockPersonas;


    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 font-sans">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* ... Header & Config Panel ... */}

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-cyan-500">
                            Perpetual Personas
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            High-fidelity persona generation with style consistency
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-background/50 backdrop-blur">
                            v2.0 Prototype
                        </Badge>
                    </div>
                </div>

                {/* Configuration Panel */}
                <Card className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-indigo-100/20 dark:border-indigo-900/20 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="useBackend"
                                    checked={useBackend}
                                    onCheckedChange={(c) => setUseBackend(!!c)}
                                />
                                <Label htmlFor="useBackend">Use Backend</Label>
                            </div>

                            {useBackend && (
                                <>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="resultSelect" className="text-xs">Analysis Result</Label>
                                        <Select value={selectedResultId} onValueChange={loadPersonas}>
                                            <SelectTrigger className="w-[280px] h-8 text-xs bg-background/60 [&>span]:truncate text-left">
                                                <SelectValue placeholder="Select analysis..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {results.map(r => (
                                                    <SelectItem key={r.result_id} value={String(r.result_id)}>
                                                        {r.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="city" className="text-xs">City Context</Label>
                                        <Input
                                            id="city"
                                            value={city}
                                            onChange={(e) => setCity(e.target.value)}
                                            className="w-[140px] h-8 text-xs bg-background/60"
                                        />
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => loadResults()}
                                        className="h-8 w-8 p-0"
                                        title="Refresh Results"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                    </Button>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Persona Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loading ? (
                        Array(3).fill(0).map((_, i) => (
                            <Card key={i} className="h-[400px] bg-white/20 dark:bg-slate-900/20 backdrop-blur-sm border-0 animate-pulse">
                                <CardHeader className="h-24 bg-muted/20" />
                                <CardContent className="h-full" />
                            </Card>
                        ))
                    ) : (
                        displayPersonas.map((persona) => (
                            <PersonaCard
                                key={persona.id}
                                persona={persona}
                                useBackend={useBackend}
                                config={{ baseUrl, token, resultId: selectedResultId, city }}
                                onViewImage={setViewImage}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* Image Lightbox */}
            <Dialog open={!!viewImage} onOpenChange={(open) => !open && setViewImage(null)}>
                <DialogContent className="max-w-3xl border-0 bg-transparent shadow-none p-0 flex justify-center items-center backdrop-blur-sm">
                    {viewImage && (
                        <div className="relative rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10">
                            <img src={viewImage} alt="Full view" className="max-h-[85vh] w-auto object-contain bg-black/50" />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 text-white/70 hover:text-white hover:bg-black/40 rounded-full"
                                onClick={() => setViewImage(null)}
                            >
                                <span className="sr-only">Close</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function PersonaCard({ persona, useBackend, config, onViewImage }: { persona: Persona, useBackend: boolean, config: any, onViewImage: (url: string) => void }) {
    // ... state ...
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [quote, setQuote] = useState<string | null>(null);
    const [cityProfile, setCityProfile] = useState<any>(null);
    const [foodImages, setFoodImages] = useState<{ [key: string]: string }>(persona.food_images || {});
    const [loadingAction, setLoadingAction] = useState<string | null>(null);

    // ... hooks ...
    const { toast } = useToast();

    useEffect(() => {
        if (persona.avatar_data_uri) setAvatarUrl(persona.avatar_data_uri);
        if (persona.quote) setQuote(persona.quote);
        if (persona.city_profile || persona.berlin_profile) setCityProfile(persona.city_profile || persona.berlin_profile);
        if (persona.food_images) setFoodImages(persona.food_images);
    }, [persona]);

    // ... handlers ...
    const handleGenerateAvatar = async () => { /* ... */
        if (!useBackend) return;
        setLoadingAction('avatar');
        try {
            const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/api/personas/${config.resultId}/${persona.id}/avatar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.token}`
                },
                body: JSON.stringify({
                    city: config.city,
                    style_pack: { name: persona.name, style_desc: 'distinctive editorial color grade, rim light, depth, characterful' }
                })
            });
            const data = await res.json();
            if (data.avatar_data_uri) {
                setAvatarUrl(data.avatar_data_uri);
                toast({ title: "Avatar Generated", description: `New look for ${persona.name}` });
            }
        } catch (e) {
            console.error(e);
            toast({ title: "Failed", description: "Avatar generation failed", variant: "destructive" });
        } finally {
            setLoadingAction(null);
        }
    };
    const handleGenerateQuote = async () => { /* ... */
        if (!useBackend) {
            setQuote("“We need 18‑month ROI visibility and vendor compliance early.”"); // Mock
            return;
        }
        setLoadingAction('quote');
        try {
            const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/api/personas/${config.resultId}/${persona.id}/quote`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.token}`
                },
                body: JSON.stringify({})
            });
            const data = await res.json();
            if (data.quote) {
                setQuote(data.quote);
                toast({ title: "Quote Extracted", description: "Fresh insight from analysis" });
            }
        } catch (e) {
            console.error(e);
            toast({ title: "Failed", description: "Quote extraction failed", variant: "destructive" });
        } finally {
            setLoadingAction(null);
        }
    };
    const handleGenerateProfile = async () => { /* ... */
        if (!useBackend) {
            // Mock profile
            setCityProfile({
                city: config.city,
                neighborhood: 'Mitte',
                district: 'Central',
                dining_context: { solo: 85, social: 40, business: 90 },
                food_beverage_preferences: ['Coffee', 'Vegan', 'Quick'],
                lunch: { nearby_recommendations: [{ name: 'Refuel', type: 'Cafe', typical_order: 'Avocado Toast', drink: 'Flat White' }] }
            });
            return;
        }
        setLoadingAction('profile');
        try {
            const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/api/personas/${config.resultId}/${persona.id}/city-profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.token}`
                },
                body: JSON.stringify({ city: config.city })
            });
            if (res.ok) {
                const data = await res.json();
                setCityProfile(data.city_profile || data.berlin_profile);
                toast({ title: "Profile Generated", description: `Context generated for ${config.city}` });
            }
        } catch (e) {
            console.error(e);
            toast({ title: "Failed", description: "Profile generation failed", variant: "destructive" });
        } finally {
            setLoadingAction(null);
        }
    };

    // ... helper ...
    const getFoodImageKey = (meal: string, restaurant: string, dish: string, drink: string) => {
        const slugify = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        return [meal, slugify(restaurant), slugify(dish), slugify(drink)].filter(Boolean).join('__');
    };

    return (
        <Card className="overflow-hidden border-0 shadow-lg bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/10 transition-all hover:scale-[1.01] hover:shadow-xl group flex flex-col h-full">
            {/* Header BG */}
            <div className="relative h-32 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 dark:from-indigo-500/20 dark:via-purple-500/20 dark:to-pink-500/20 flex-shrink-0">
                <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))]" />
            </div>

            <div className="px-6 relative flex-1 flex flex-col">
                <div className="absolute -top-12 left-6">
                    <div className="relative group/avatar cursor-pointer" onClick={() => avatarUrl && onViewImage(avatarUrl)}>
                        <Avatar className="h-24 w-24 border-4 border-white dark:border-slate-900 shadow-xl transition-transform duration-300 group-hover/avatar:scale-105">
                            {avatarUrl ? (
                                <AvatarImage src={avatarUrl} alt={persona.name} className="object-cover" />
                            ) : (
                                <AvatarFallback className="bg-slate-200 dark:bg-slate-800 text-slate-400">
                                    <UserCircle2 className="h-10 w-10" />
                                </AvatarFallback>
                            )}
                        </Avatar>
                        {useBackend && (
                            <div className="absolute bottom-0 right-0 p-1 bg-primary text-primary-foreground rounded-full shadow-lg opacity-0 group-hover/avatar:opacity-100 transition-opacity cursor-pointer" onClick={(e) => { e.stopPropagation(); handleGenerateAvatar(); }}>
                                {loadingAction === 'avatar' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            </div>
                        )}
                    </div>
                </div>

                {/* Name & Title */}
                <div className="mt-14 mb-4">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{persona.name}</h3>
                    <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{persona.title || persona.archetype || 'Persona'}</p>
                </div>

                {/* Quote */}
                {quote && (
                    <div className="relative mb-6 pl-4 border-l-2 border-indigo-500/30 dark:border-indigo-400/30 py-1">
                        <p className="text-sm italic text-muted-foreground leading-relaxed">
                            {quote}
                        </p>
                    </div>
                )}

                {/* City Profile content */}
                {cityProfile && (
                    <div className="mt-auto space-y-4 mb-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <span>📍 {cityProfile.city || config.city}</span>
                            {cityProfile.neighborhood && <span>• {cityProfile.neighborhood}</span>}
                        </div>

                        {/* Contexts */}
                        {(cityProfile.dining_context?.solo > 70 || cityProfile.dining_context?.business > 70) && (
                            <div className="flex flex-wrap gap-2 text-xs">
                                {cityProfile.dining_context?.solo > 70 && (
                                    <Badge variant="secondary" className="bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                                        Solo Dining ({cityProfile.dining_context.solo}%)
                                    </Badge>
                                )}
                                {cityProfile.dining_context?.business > 70 && (
                                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                                        Business Dining ({cityProfile.dining_context.business}%)
                                    </Badge>
                                )}
                            </div>
                        )}

                        {/* Recommendations List */}
                        <div className="space-y-3">
                            {['lunch', 'dinner'].map(meal => {
                                const recs = cityProfile[meal]?.nearby_recommendations || [];
                                if (recs.length === 0) return null;
                                const r = recs[0]; // Just show first for prototype
                                const imageKey = getFoodImageKey(meal, r.name, r.typical_order, r.drink);
                                const imageUrl = foodImages[imageKey];

                                return (
                                    <div key={meal} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <span className="text-xs font-bold uppercase text-muted-foreground block mb-0.5">{meal}</span>
                                                <p className="text-sm font-semibold">{r.name}</p>
                                                <p className="text-xs text-muted-foreground">{r.type} {r.area ? `• ${r.area}` : ''}</p>
                                            </div>
                                        </div>
                                        {(r.typical_order || r.drink) && (
                                            <div className="text-xs space-y-1 mb-2">
                                                {r.typical_order && <div className="flex items-start gap-1"><span className="opacity-70">🍽️</span> <span>{r.typical_order}</span></div>}
                                                {r.drink && <div className="flex items-start gap-1"><span className="opacity-70">🥤</span> <span>{r.drink}</span></div>}
                                            </div>
                                        )}

                                        {/* Food Image */}
                                        {useBackend && r.typical_order && (
                                            <FoodImage
                                                src={imageUrl}
                                                alt={r.typical_order}
                                                onView={() => imageUrl && onViewImage(imageUrl)}
                                                onGenerate={async () => {
                                                    try {
                                                        const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/api/personas/${config.resultId}/${persona.id}/food-image`, {
                                                            method: 'POST',
                                                            headers: {
                                                                'Content-Type': 'application/json',
                                                                'Authorization': `Bearer ${config.token}`
                                                            },
                                                            body: JSON.stringify({
                                                                meal_type: meal,
                                                                recommendation_index: 0,
                                                                dish: r.typical_order,
                                                                drink: r.drink
                                                            })
                                                        });
                                                        const d = await res.json();
                                                        if (d.image_data_uri) {
                                                            setFoodImages(prev => ({
                                                                ...prev,
                                                                [imageKey]: d.image_data_uri
                                                            }));
                                                            toast({ title: "Yum!", description: `Generated ${r.typical_order}` });
                                                        }
                                                    } catch (e) {
                                                        toast({ title: "Error", description: "Food image failed", variant: "destructive" });
                                                    }
                                                }}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}


                <div className="flex flex-wrap gap-2 mb-6 mt-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs bg-white/50 dark:bg-slate-800/50 backdrop-blur border-slate-200/60 dark:border-slate-700/60"
                        onClick={handleGenerateAvatar}
                        disabled={!useBackend || loadingAction === 'avatar'}
                    >
                        {loadingAction === 'avatar' ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Camera className="mr-2 h-3.5 w-3.5" />}
                        Avatar
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs bg-white/50 dark:bg-slate-800/50 backdrop-blur border-slate-200/60 dark:border-slate-700/60"
                        onClick={handleGenerateQuote}
                        disabled={loadingAction === 'quote'}
                    >
                        {loadingAction === 'quote' ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <QuoteIcon className="mr-2 h-3.5 w-3.5" />}
                        Quote
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs bg-white/50 dark:bg-slate-800/50 backdrop-blur border-slate-200/60 dark:border-slate-700/60"
                        onClick={handleGenerateProfile}
                        disabled={loadingAction === 'profile'}
                    >
                        {loadingAction === 'profile' ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Utensils className="mr-2 h-3.5 w-3.5" />}
                        Profile
                    </Button>
                </div>
            </div>

            <CardFooter className="px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/50 flex-shrink-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5" />
                    <span>{config.city} Profile active</span>
                </div>
            </CardFooter>
        </Card>
    );
}

function FoodImage({ src, alt, onGenerate, onView }: { src?: string, alt: string, onGenerate: () => void, onView?: () => void }) {
    const [loading, setLoading] = useState(false);

    if (src) {
        return (
            <div
                className="relative aspect-video rounded-md overflow-hidden group/food mt-2 border border-slate-200 dark:border-slate-700 cursor-zoom-in"
                onClick={onView}
            >
                <img src={src} alt={alt} className="w-full h-full object-cover transition-transform duration-500 group-hover/food:scale-105" />
                <div className="absolute inset-0 bg-black/0 group-hover/food:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover/food:opacity-100">
                    <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full opacity-0 translate-y-2 group-hover/food:opacity-100 group-hover/food:translate-y-0 transition-all duration-300" onClick={(e) => { e.stopPropagation(); onGenerate(); }}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        );
    }
    // ...
    return (
        <div
            className="mt-2 aspect-video rounded-md border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group/placeholder"
            onClick={async () => {
                setLoading(true);
                await onGenerate();
                setLoading(false);
            }}
        >
            {loading ? (
                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
            ) : (
                <>
                    <Camera className="h-5 w-5 text-muted-foreground group-hover/placeholder:text-primary transition-colors" />
                    <span className="text-[10px] font-medium text-muted-foreground group-hover/placeholder:text-primary transition-colors">Generate Food View</span>
                </>
            )}
        </div>
    );
}
