export type Payment = "Cash" | "Airtel Money" | "M-Pesa" | "Orange Money" | "Carte";

export type Listing = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  description: string;
  address: string;
  commune: string;
  quartier: string;
  gps?: { lat: number; lng: number };
  phone: string;
  whatsapp: string;
  email?: string;
  website?: string;
  socials?: { facebook?: string; instagram?: string };
  hours: { day: string; open: string | null }[];
  openNow: boolean | null;
  languages: string[];
  payments: Payment[];
  services: { name: string; price?: string }[];
  rating: number;
  reviewsCount: number;
  reviews: { author: string; rating: number; date: string; text: string }[];
  source?: string;
  verified: boolean;
  verifiedAt?: string;
  isExample?: boolean;
  premium?: boolean;
  isNew?: boolean;
};

export const COMMUNES = [
  "Lubumbashi",
  "Kampemba",
  "Katuba",
  "Kenya",
  "Kamalondo",
  "Annexe",
  "Rwashi",
] as const;

export const CATEGORIES = [
  { id: "commerces", label: "Commerces et services" },
  { id: "restaurants", label: "Restaurants et sorties" },
  { id: "sante", label: "Santé" },
  { id: "droit", label: "Juridique et administratif" },
  { id: "artisans", label: "Artisans et métiers" },
  { id: "entreprises", label: "Entreprises par secteur" },
  { id: "ecoles", label: "Éducation" },
  { id: "associations", label: "Associations et organisations communautaires" },
  { id: "hotels", label: "Hôtels, logements et tourisme" },
  { id: "administrations", label: "Administrations et services publics" },
  { id: "culture", label: "Artistes et culture" },
  { id: "anciens-eleves", label: "Étudiants et anciens élèves" },
  { id: "transport", label: "Transport et mobilité" },
] as const;

export const LISTINGS: Listing[] = [];

export const getListing = (id: string) => LISTINGS.find((listing) => listing.id === id);
export const categoryLabel = (id: string) => CATEGORIES.find((category) => category.id === id)?.label ?? id;
