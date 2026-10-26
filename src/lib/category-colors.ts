const CATEGORY_COLORS: Record<string, { tile: string; icon: string; chip: string }> = {
  restaurants: {
    tile: "bg-orange-500/[0.08]",
    icon: "bg-orange-500/15 text-orange-400",
    chip: "border-orange-400/30 bg-orange-500/10 text-orange-400",
  },
  sante: {
    tile: "bg-rose-500/[0.08]",
    icon: "bg-rose-500/15 text-rose-400",
    chip: "border-rose-400/30 bg-rose-500/10 text-rose-400",
  },
  transport: {
    tile: "bg-cyan-500/[0.08]",
    icon: "bg-cyan-500/15 text-cyan-400",
    chip: "border-cyan-400/30 bg-cyan-500/10 text-cyan-400",
  },
  droit: {
    tile: "bg-violet-500/[0.08]",
    icon: "bg-violet-500/15 text-violet-400",
    chip: "border-violet-400/30 bg-violet-500/10 text-violet-400",
  },
  artisans: {
    tile: "bg-amber-500/[0.08]",
    icon: "bg-amber-500/15 text-amber-400",
    chip: "border-amber-400/30 bg-amber-500/10 text-amber-400",
  },
  ecoles: {
    tile: "bg-blue-500/[0.08]",
    icon: "bg-blue-500/15 text-blue-400",
    chip: "border-blue-400/30 bg-blue-500/10 text-blue-400",
  },
  commerces: {
    tile: "bg-fuchsia-500/[0.08]",
    icon: "bg-fuchsia-500/15 text-fuchsia-400",
    chip: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-400",
  },
  hotels: {
    tile: "bg-teal-500/[0.08]",
    icon: "bg-teal-500/15 text-teal-400",
    chip: "border-teal-400/30 bg-teal-500/10 text-teal-400",
  },
  culture: {
    tile: "bg-purple-500/[0.08]",
    icon: "bg-purple-500/15 text-purple-400",
    chip: "border-purple-400/30 bg-purple-500/10 text-purple-400",
  },
  entreprises: {
    tile: "bg-indigo-500/[0.08]",
    icon: "bg-indigo-500/15 text-indigo-400",
    chip: "border-indigo-400/30 bg-indigo-500/10 text-indigo-400",
  },
  associations: {
    tile: "bg-emerald-500/[0.08]",
    icon: "bg-emerald-500/15 text-emerald-400",
    chip: "border-emerald-400/30 bg-emerald-500/10 text-emerald-400",
  },
  administrations: {
    tile: "bg-sky-500/[0.08]",
    icon: "bg-sky-500/15 text-sky-400",
    chip: "border-sky-400/30 bg-sky-500/10 text-sky-400",
  },
  "anciens-eleves": {
    tile: "bg-lime-500/[0.08]",
    icon: "bg-lime-500/15 text-lime-400",
    chip: "border-lime-400/30 bg-lime-500/10 text-lime-400",
  },
};

const DEFAULT_COLORS = {
  tile: "bg-primary/[0.08]",
  icon: "bg-primary/15 text-primary",
  chip: "border-primary/30 bg-primary/10 text-primary",
};

export function categoryColors(category: string) {
  return CATEGORY_COLORS[category] ?? DEFAULT_COLORS;
}
