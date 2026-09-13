import {
  DemoHealthcareHub,
  DemoHealthcareCallFlow,
  DemoHealthcareChat,
  DemoHealthcareReminders,
  DemoHealthcareIntake,
} from './DemoHealthcare';
import {
  DemoManufacturingHub,
  DemoManufacturingSupplier,
  DemoManufacturingInventory,
  DemoManufacturingQc,
  DemoManufacturingLeadtime,
} from './DemoManufacturing';
import {
  DemoFreelancersHub,
  DemoFreelancersDiscovery,
  DemoFreelancersProposal,
  DemoFreelancersInvoice,
  DemoFreelancersFollowup,
} from './DemoFreelancers';
import {
  DemoRealEstateHub,
  DemoRealEstateListing,
  DemoRealEstateChat,
  DemoRealEstateViewings,
  DemoRealEstateFollowup,
} from './DemoRealEstate';
import {
  DemoEcommerceHub,
  DemoEcommerceOrders,
  DemoEcommerceSuppliers,
  DemoEcommerceSupport,
  DemoEcommerceReturns,
} from './DemoEcommerce';
import {
  DemoRestaurantsHub,
  DemoRestaurantsReservations,
  DemoRestaurantsHousekeeping,
  DemoRestaurantsRoomService,
  DemoRestaurantsPartners,
} from './DemoRestaurants';
import {
  DemoEducationHub,
  DemoEducationLessons,
  DemoEducationSummaries,
  DemoEducationPaths,
  DemoEducationKb,
} from './DemoEducation';
import {
  DemoLegalHub,
  DemoLegalContract,
  DemoLegalEcosystem,
  DemoLegalReports,
  DemoLegalJurisdiction,
  DemoLegalVault,
} from './DemoLegal';
import {
  DemoMarketingHub,
  DemoMarketingSmm,
  DemoMarketingContent,
  DemoMarketingMetrics,
  DemoMarketingPartners,
} from './DemoMarketing';
import {
  DemoCreatorsHub,
  DemoCreatorsCalendar,
  DemoCreatorsScripts,
  DemoCreatorsRepurpose,
  DemoCreatorsSponsors,
} from './DemoCreators';

export const SOLUTION_VISUALS_BY_SLUG = {
  healthcare: {
    Hero: DemoHealthcareHub,
    spotlights: [DemoHealthcareCallFlow, DemoHealthcareChat, DemoHealthcareReminders, DemoHealthcareIntake],
  },
  manufacturing: {
    Hero: DemoManufacturingHub,
    spotlights: [DemoManufacturingSupplier, DemoManufacturingInventory, DemoManufacturingQc, DemoManufacturingLeadtime],
  },
  freelancers: {
    Hero: DemoFreelancersHub,
    spotlights: [DemoFreelancersDiscovery, DemoFreelancersProposal, DemoFreelancersInvoice, DemoFreelancersFollowup],
  },
  'real-estate': {
    Hero: DemoRealEstateHub,
    spotlights: [DemoRealEstateListing, DemoRealEstateChat, DemoRealEstateViewings, DemoRealEstateFollowup],
  },
  ecommerce: {
    Hero: DemoEcommerceHub,
    spotlights: [DemoEcommerceOrders, DemoEcommerceSuppliers, DemoEcommerceSupport, DemoEcommerceReturns],
  },
  restaurants: {
    Hero: DemoRestaurantsHub,
    spotlights: [DemoRestaurantsReservations, DemoRestaurantsHousekeeping, DemoRestaurantsRoomService, DemoRestaurantsPartners],
  },
  education: {
    Hero: DemoEducationHub,
    spotlights: [DemoEducationLessons, DemoEducationSummaries, DemoEducationPaths, DemoEducationKb],
  },
  legal: {
    Hero: DemoLegalHub,
    spotlights: [DemoLegalEcosystem, DemoLegalReports, DemoLegalJurisdiction, DemoLegalVault],
  },
  marketing: {
    Hero: DemoMarketingHub,
    spotlights: [DemoMarketingSmm, DemoMarketingContent, DemoMarketingMetrics, DemoMarketingPartners],
  },
  creators: {
    Hero: DemoCreatorsHub,
    spotlights: [DemoCreatorsCalendar, DemoCreatorsScripts, DemoCreatorsRepurpose, DemoCreatorsSponsors],
  },
};
