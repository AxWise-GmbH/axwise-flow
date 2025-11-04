// OSS Analytics shim (no Firebase). Safe no-ops that keep the API intact.

// Respect OSS analytics flag; only log to console when explicitly enabled
const analyticsEnabled = process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true';

// Button locations for categorizing events
export enum ButtonLocation {
  HEADER = 'header',
  HERO = 'hero',
  CTA = 'cta',
  DASHBOARD = 'dashboard',
  UPLOAD = 'upload',
  PRICING = 'pricing',
  ROADMAP = 'roadmap',
  FOOTER = 'footer',
  MOBILE_MENU = 'mobile_menu'
}

// Event types for better organization
export enum EventType {
  BUTTON_CLICK = 'button_click',
  NAVIGATION = 'navigation_click',
  UPLOAD = 'file_upload',
  ANALYSIS = 'analysis_action',
  CONVERSION = 'conversion_action'
}

// Safe analytics logging with error handling (console-only when enabled)
const logAnalyticsEvent = (
  eventName: string,
  parameters: Record<string, string | number | boolean | undefined>
): void => {
  try {
    if (!analyticsEnabled) return; // hard no-op unless enabled
    const cleanParameters = Object.fromEntries(
      Object.entries(parameters).filter(([_, value]) => value !== undefined)
    ) as Record<string, string | number | boolean>;
    // eslint-disable-next-line no-console
    console.log(`Analytics Event: ${eventName}`, cleanParameters);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Analytics error:', error);
  }
};

// Track button clicks with location context
export const trackButtonClick = (
  buttonText: string,
  location: ButtonLocation,
  destination?: string,
  additionalData?: Record<string, string | number | boolean>
): void => {
  logAnalyticsEvent(EventType.BUTTON_CLICK, {
    button_text: buttonText,
    button_location: location,
    destination_url: destination,
    timestamp: Date.now(),
    ...additionalData
  });
};

// Track navigation events
export const trackNavigation = (
  linkText: string,
  fromPage: string,
  toPage: string,
  location: ButtonLocation = ButtonLocation.HEADER
): void => {
  logAnalyticsEvent(EventType.NAVIGATION, {
    link_text: linkText,
    from_page: fromPage,
    to_page: toPage,
    link_location: location,
    timestamp: Date.now()
  });
};

// Track CTA button clicks (high-value conversion events)
export const trackCTAClick = (
  ctaText: string,
  location: ButtonLocation,
  ctaType: 'primary' | 'secondary' = 'primary'
): void => {
  logAnalyticsEvent(EventType.CONVERSION, {
    cta_text: ctaText,
    cta_location: location,
    cta_type: ctaType,
    timestamp: Date.now()
  });
};

// Track file upload events
export const trackFileUpload = (
  fileType: string,
  fileSize: number,
  uploadMethod: string = 'drag_drop'
): void => {
  logAnalyticsEvent(EventType.UPLOAD, {
    file_type: fileType,
    file_size_mb: Math.round((fileSize / (1024 * 1024)) * 100) / 100,
    upload_method: uploadMethod,
    timestamp: Date.now()
  });
};

// Track analysis actions
export const trackAnalysisAction = (
  action: 'start' | 'complete' | 'view' | 'export',
  analysisType?: string,
  duration?: number
): void => {
  logAnalyticsEvent(EventType.ANALYSIS, {
    analysis_action: action,
    analysis_type: analysisType,
    duration_seconds: duration,
    timestamp: Date.now()
  });
};

// Track pricing interactions
export const trackPricingInteraction = (
  action: 'view_plan' | 'select_plan' | 'upgrade',
  planName: string,
  planPrice?: string
): void => {
  logAnalyticsEvent('pricing_interaction', {
    pricing_action: action,
    plan_name: planName,
    plan_price: planPrice,
    timestamp: Date.now()
  });
};

// Track roadmap interactions
export const trackRoadmapInteraction = (
  action: 'view_phase' | 'navigate' | 'toggle_view',
  phaseNumber?: number,
  viewType?: 'timeline' | 'detail'
): void => {
  logAnalyticsEvent('roadmap_interaction', {
    roadmap_action: action,
    phase_number: phaseNumber,
    view_type: viewType,
    timestamp: Date.now()
  });
};

// Track page views
export const trackPageView = (
  pageName: string,
  pageCategory: 'marketing' | 'dashboard' | 'auth' | 'legal' = 'marketing'
): void => {
  logAnalyticsEvent('page_view', {
    page_name: pageName,
    page_category: pageCategory,
    timestamp: Date.now()
  });
};

// Track user engagement events
export const trackEngagement = (
  engagementType: 'scroll' | 'time_on_page' | 'interaction',
  value: number,
  context?: string
): void => {
  logAnalyticsEvent('user_engagement', {
    engagement_type: engagementType,
    engagement_value: value,
    engagement_context: context,
    timestamp: Date.now()
  });
};

// Export all tracking functions
export default {
  trackButtonClick,
  trackNavigation,
  trackCTAClick,
  trackFileUpload,
  trackAnalysisAction,
  trackPricingInteraction,
  trackRoadmapInteraction,
  trackPageView,
  trackEngagement,
};
